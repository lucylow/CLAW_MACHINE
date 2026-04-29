/**
 * CLAW MACHINE
 * Memory snapshot persistence with schema migration support
 *
 * Persist memory snapshots safely across backend restarts and schema changes,
 * with versioned migrations for old records.
 */

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export type SnapshotKind =
  | "session_state"
  | "conversation_turn"
  | "task_result"
  | "reflection"
  | "summary"
  | "artifact"
  | "skill_execution"
  | "error_event";

export type SnapshotStatus = "active" | "superseded" | "archived" | "deleted";

export interface SnapshotEnvelope<TPayload = unknown> {
  id: string;
  kind: SnapshotKind;
  schemaVersion: number;
  status: SnapshotStatus;
  sessionId: string;
  walletAddress?: string | null;
  userId?: string | null;
  turnId?: string | null;
  createdAt: string;
  updatedAt: string;
  checksum: string;
  payload: TPayload;
  tags: string[];
  metadata: SnapshotMetadata;
}

export interface SnapshotMetadata {
  source: "agent" | "reflection" | "tool" | "system" | "migration";
  sourceVersion?: string;
  sourceModel?: string;
  traceId?: string;
  requestId?: string;
  toolName?: string;
  parentSnapshotId?: string | null;
  lineage: string[];
  notes?: string[];
  validatedSchemaVersion?: number;
}

export interface SnapshotQuery {
  sessionId?: string;
  kind?: SnapshotKind;
  walletAddress?: string;
  userId?: string;
  status?: SnapshotStatus;
  tagsAnyOf?: string[];
  tagsAllOf?: string[];
  since?: string;
  until?: string;
  limit?: number;
}

export interface SnapshotWriteOptions {
  tags?: string[];
  walletAddress?: string | null;
  userId?: string | null;
  turnId?: string | null;
  source?: SnapshotMetadata["source"];
  sourceVersion?: string;
  sourceModel?: string;
  traceId?: string;
  requestId?: string;
  toolName?: string;
  parentSnapshotId?: string | null;
  notes?: string[];
}

export interface SnapshotMigrationContext {
  fromVersion: number;
  toVersion: number;
  kind: SnapshotKind;
}

export interface SnapshotMigration<TFrom = unknown, TTo = unknown> {
  readonly fromVersion: number;
  readonly toVersion: number;
  readonly kind: SnapshotKind | "any";
  readonly description: string;
  migrate(input: SnapshotEnvelope<TFrom>): SnapshotEnvelope<TTo>;
}

export interface SnapshotStore {
  init(): Promise<void>;
  write<TPayload>(snapshot: SnapshotEnvelope<TPayload>): Promise<void>;
  readById(id: string): Promise<SnapshotEnvelope | null>;
  query(query: SnapshotQuery): Promise<SnapshotEnvelope[]>;
  compact?(sessionId?: string): Promise<void>;
}

export interface SnapshotCodec {
  serialize(snapshot: SnapshotEnvelope): string;
  deserialize(input: string): SnapshotEnvelope;
}

export interface MigrationPlanResult {
  applied: string[];
  finalVersion: number;
  snapshot: SnapshotEnvelope;
}

export interface SnapshotValidationResult {
  ok: boolean;
  errors: string[];
}

// -----------------------------------------------------------------------------
// Utilities
// -----------------------------------------------------------------------------

function nowIso(): string {
  return new Date().toISOString();
}

function stableStringify(value: unknown): string {
  const seen = new WeakSet<object>();

  const sorter = (_key: string, val: unknown): unknown => {
    if (val && typeof val === "object") {
      if (seen.has(val as object)) {
        return "[Circular]";
      }
      seen.add(val as object);

      if (Array.isArray(val)) {
        return val;
      }

      return Object.keys(val as Record<string, unknown>)
        .sort()
        .reduce<Record<string, unknown>>((acc, key) => {
          acc[key] = (val as Record<string, unknown>)[key];
          return acc;
        }, {});
    }
    return val;
  };

  return JSON.stringify(value, sorter);
}

function checksumOf(snapshot: SnapshotEnvelope): string {
  const clone = {
    ...snapshot,
    checksum: "",
  };
  return crypto.createHash("sha256").update(stableStringify(clone)).digest("hex");
}

function createId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(12).toString("hex")}`;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function inRange(iso: string, since?: string, until?: string): boolean {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return false;
  if (since && ts < Date.parse(since)) return false;
  if (until && ts > Date.parse(until)) return false;
  return true;
}

// -----------------------------------------------------------------------------
// Snapshot payload schemas
// -----------------------------------------------------------------------------

export interface SessionStatePayloadV1 {
  currentMode: string;
  lastMessage?: string;
  preferences?: Record<string, unknown>;
  counters?: Record<string, number>;
}

export interface ConversationTurnPayloadV1 {
  prompt: string;
  response: string;
  selectedSkills: string[];
  toolCalls: Array<{
    toolName: string;
    status: "success" | "failure";
    input: Record<string, unknown>;
    output?: Record<string, unknown>;
    error?: string;
  }>;
  summary?: string;
}

export interface ReflectionPayloadV1 {
  rootCause: string;
  mistakeSummary: string;
  correctiveAdvice: string;
  severity: "low" | "medium" | "high";
  confidence?: number;
  relatedSnapshotIds: string[];
  lessonTags: string[];
}

export interface TaskResultPayloadV1 {
  taskType: string;
  success: boolean;
  resultSummary: string;
  resultData?: Record<string, unknown>;
  errorMessage?: string;
}

export interface SnapshotPayloadV2Base {
  title?: string;
  summary?: string;
  sourcePrompt?: string;
  sourceResponse?: string;
  importance?: number;
}

export interface SessionStatePayloadV2 extends SnapshotPayloadV2Base {
  currentMode: string;
  lastMessage?: string;
  preferences?: Record<string, unknown>;
  counters?: Record<string, number>;
  activeWorkflowId?: string | null;
  pinnedMemoryIds?: string[];
}

export interface ConversationTurnPayloadV2 extends SnapshotPayloadV2Base {
  prompt: string;
  response: string;
  selectedSkills: string[];
  toolCalls: Array<{
    toolName: string;
    status: "success" | "failure";
    input: Record<string, unknown>;
    output?: Record<string, unknown>;
    error?: string;
    latencyMs?: number;
  }>;
  memoryRefs: string[];
  reflectionRefs: string[];
}

export interface ReflectionPayloadV2 extends SnapshotPayloadV2Base {
  rootCause: string;
  mistakeSummary: string;
  correctiveAdvice: string;
  severity: "low" | "medium" | "high";
  confidence?: number;
  relatedSnapshotIds: string[];
  lessonTags: string[];
  nextBestAction?: string;
  failureMode?: string;
}

export interface TaskResultPayloadV2 extends SnapshotPayloadV2Base {
  taskType: string;
  success: boolean;
  resultSummary: string;
  resultData?: Record<string, unknown>;
  errorMessage?: string;
  retryable?: boolean;
  durationMs?: number;
}

export interface ErrorEventPayloadV1 {
  code: string;
  message: string;
  category: string;
  recoverable: boolean;
  retryable: boolean;
  stack?: string;
  context?: Record<string, unknown>;
}

// -----------------------------------------------------------------------------
// Validation
// -----------------------------------------------------------------------------

export class SnapshotValidator {
  static validate(snapshot: SnapshotEnvelope): SnapshotValidationResult {
    const errors: string[] = [];

    if (!isNonEmptyString(snapshot.id)) errors.push("id is required");
    if (!isNonEmptyString(snapshot.kind)) errors.push("kind is required");
    if (!Number.isInteger(snapshot.schemaVersion) || snapshot.schemaVersion < 1) {
      errors.push("schemaVersion must be a positive integer");
    }
    if (!isNonEmptyString(snapshot.sessionId)) errors.push("sessionId is required");
    if (!isNonEmptyString(snapshot.createdAt)) errors.push("createdAt is required");
    if (!isNonEmptyString(snapshot.updatedAt)) errors.push("updatedAt is required");
    if (!isNonEmptyString(snapshot.checksum)) errors.push("checksum is required");
    if (!snapshot.metadata || typeof snapshot.metadata !== "object") {
      errors.push("metadata is required");
    }
    if (!Array.isArray(snapshot.tags)) errors.push("tags must be an array");
    if (!snapshot.payload || typeof snapshot.payload !== "object") {
      errors.push("payload must be an object");
    }

    return { ok: errors.length === 0, errors };
  }

  static validateKindPayload(snapshot: SnapshotEnvelope): SnapshotValidationResult {
    const errors: string[] = [];

    switch (snapshot.kind) {
      case "session_state": {
        const p = snapshot.payload as Partial<SessionStatePayloadV1 & SessionStatePayloadV2>;
        if (!isNonEmptyString(p.currentMode)) errors.push("session_state.currentMode is required");
        break;
      }
      case "conversation_turn": {
        const p = snapshot.payload as Partial<ConversationTurnPayloadV1 & ConversationTurnPayloadV2>;
        if (!isNonEmptyString(p.prompt)) errors.push("conversation_turn.prompt is required");
        if (!isNonEmptyString(p.response)) errors.push("conversation_turn.response is required");
        if (!Array.isArray(p.selectedSkills)) errors.push("conversation_turn.selectedSkills must be an array");
        break;
      }
      case "reflection": {
        const p = snapshot.payload as Partial<ReflectionPayloadV1 & ReflectionPayloadV2>;
        if (!isNonEmptyString(p.rootCause)) errors.push("reflection.rootCause is required");
        if (!isNonEmptyString(p.mistakeSummary)) errors.push("reflection.mistakeSummary is required");
        if (!isNonEmptyString(p.correctiveAdvice)) errors.push("reflection.correctiveAdvice is required");
        break;
      }
      case "task_result": {
        const p = snapshot.payload as Partial<TaskResultPayloadV1 & TaskResultPayloadV2>;
        if (!isNonEmptyString(p.taskType)) errors.push("task_result.taskType is required");
        if (!isNonEmptyString(p.resultSummary)) errors.push("task_result.resultSummary is required");
        break;
      }
      default:
        break;
    }

    return { ok: errors.length === 0, errors };
  }
}

// -----------------------------------------------------------------------------
// Migration Registry
// -----------------------------------------------------------------------------

export class SnapshotMigrationRegistry {
  private migrations = new Map<string, SnapshotMigration>();
  private latestByKind = new Map<SnapshotKind | "any", number>();

  register(migration: SnapshotMigration): void {
    const key = this.keyOf(migration.kind, migration.fromVersion, migration.toVersion);
    if (this.migrations.has(key)) {
      throw new Error(`Duplicate migration registered: ${key}`);
    }

    this.migrations.set(key, migration);

    const currentLatest = this.latestByKind.get(migration.kind as SnapshotKind | "any") ?? 0;
    this.latestByKind.set(migration.kind as SnapshotKind | "any", Math.max(currentLatest, migration.toVersion));
  }

  getLatestVersion(kind: SnapshotKind | "any"): number {
    return this.latestByKind.get(kind) ?? 1;
  }

  migrate(snapshot: SnapshotEnvelope, targetVersion?: number): MigrationPlanResult {
    const applied: string[] = [];
    const desiredVersion = targetVersion ?? this.getLatestVersion(snapshot.kind);

    if (snapshot.schemaVersion > desiredVersion) {
      return {
        applied,
        finalVersion: snapshot.schemaVersion,
        snapshot,
      };
    }

    let current = snapshot;
    const safetyCounter = 25;
    let iterations = 0;

    while (current.schemaVersion < desiredVersion) {
      iterations += 1;
      if (iterations > safetyCounter) {
        throw new Error(
          `Migration loop exceeded safety limit for snapshot ${snapshot.id} at version ${current.schemaVersion}`,
        );
      }

      const next = this.findMigration(current.kind, current.schemaVersion);
      if (!next) {
        throw new Error(
          `Missing migration for kind=${current.kind} fromVersion=${current.schemaVersion} to target=${desiredVersion}`,
        );
      }

      current = next.migrate(current);
      current.metadata = {
        ...current.metadata,
        source: "migration",
        notes: [...(current.metadata.notes ?? []), `Applied migration ${next.fromVersion} -> ${next.toVersion}`],
        validatedSchemaVersion: current.schemaVersion,
      };
      current.checksum = checksumOf(current);
      applied.push(`${next.fromVersion}->${next.toVersion}`);
    }

    return {
      applied,
      finalVersion: current.schemaVersion,
      snapshot: current,
    };
  }

  private findMigration(kind: SnapshotKind, fromVersion: number): SnapshotMigration | undefined {
    const exact = this.migrations.get(this.keyOf(kind, fromVersion, fromVersion + 1));
    if (exact) return exact;

    const anyKind = this.migrations.get(this.keyOf("any", fromVersion, fromVersion + 1));
    if (anyKind) return anyKind;

    for (const migration of this.migrations.values()) {
      if ((migration.kind === kind || migration.kind === "any") && migration.fromVersion === fromVersion) {
        return migration;
      }
    }

    return undefined;
  }

  private keyOf(kind: SnapshotKind | "any", fromVersion: number, toVersion: number): string {
    return `${kind}:${fromVersion}->${toVersion}`;
  }
}

// -----------------------------------------------------------------------------
// Built-in migrations
// -----------------------------------------------------------------------------

export const conversationTurnV1ToV2: SnapshotMigration<ConversationTurnPayloadV1, ConversationTurnPayloadV2> = {
  fromVersion: 1,
  toVersion: 2,
  kind: "conversation_turn",
  description: "Add memoryRefs, reflectionRefs, and operational metadata to conversation turns",
  migrate(input: SnapshotEnvelope<ConversationTurnPayloadV1>): SnapshotEnvelope<ConversationTurnPayloadV2> {
    return {
      ...input,
      schemaVersion: 2,
      updatedAt: nowIso(),
      payload: {
        title: input.payload.summary ?? "Conversation turn",
        summary: input.payload.summary ?? input.payload.prompt.slice(0, 160),
        sourcePrompt: input.payload.prompt,
        sourceResponse: input.payload.response,
        importance: 0.5,
        prompt: input.payload.prompt,
        response: input.payload.response,
        selectedSkills: input.payload.selectedSkills,
        toolCalls: input.payload.toolCalls.map((toolCall) => ({
          ...toolCall,
          latencyMs: 0,
        })),
        memoryRefs: [],
        reflectionRefs: [],
      },
      metadata: {
        ...input.metadata,
        source: "migration",
        notes: [...(input.metadata.notes ?? []), "conversation_turn migrated to v2"],
      },
    };
  },
};

export const reflectionV1ToV2: SnapshotMigration<ReflectionPayloadV1, ReflectionPayloadV2> = {
  fromVersion: 1,
  toVersion: 2,
  kind: "reflection",
  description: "Add nextBestAction and failureMode to reflection snapshots",
  migrate(input: SnapshotEnvelope<ReflectionPayloadV1>): SnapshotEnvelope<ReflectionPayloadV2> {
    const inferredFailureMode = input.payload.severity === "high" ? "high-severity-failure" : "baseline-learning";

    return {
      ...input,
      schemaVersion: 2,
      updatedAt: nowIso(),
      payload: {
        title: input.payload.mistakeSummary,
        summary: input.payload.correctiveAdvice,
        sourcePrompt: input.metadata.sourceModel ?? undefined,
        sourceResponse: input.payload.rootCause,
        importance: input.payload.severity === "high" ? 0.9 : 0.6,
        rootCause: input.payload.rootCause,
        mistakeSummary: input.payload.mistakeSummary,
        correctiveAdvice: input.payload.correctiveAdvice,
        severity: input.payload.severity,
        confidence: input.payload.confidence,
        relatedSnapshotIds: input.payload.relatedSnapshotIds,
        lessonTags: input.payload.lessonTags,
        nextBestAction: input.payload.correctiveAdvice,
        failureMode: inferredFailureMode,
      },
      metadata: {
        ...input.metadata,
        source: "migration",
        notes: [...(input.metadata.notes ?? []), "reflection migrated to v2"],
      },
    };
  },
};

export const taskResultV1ToV2: SnapshotMigration<TaskResultPayloadV1, TaskResultPayloadV2> = {
  fromVersion: 1,
  toVersion: 2,
  kind: "task_result",
  description: "Add retryability and duration tracking to task result snapshots",
  migrate(input: SnapshotEnvelope<TaskResultPayloadV1>): SnapshotEnvelope<TaskResultPayloadV2> {
    return {
      ...input,
      schemaVersion: 2,
      updatedAt: nowIso(),
      payload: {
        title: input.payload.taskType,
        summary: input.payload.resultSummary,
        sourcePrompt: input.metadata.traceId,
        sourceResponse: input.payload.resultSummary,
        importance: input.payload.success ? 0.4 : 0.8,
        taskType: input.payload.taskType,
        success: input.payload.success,
        resultSummary: input.payload.resultSummary,
        resultData: input.payload.resultData,
        errorMessage: input.payload.errorMessage,
        retryable: !input.payload.success,
        durationMs: undefined,
      },
      metadata: {
        ...input.metadata,
        source: "migration",
        notes: [...(input.metadata.notes ?? []), "task_result migrated to v2"],
      },
    };
  },
};

export const sessionStateV1ToV2: SnapshotMigration<SessionStatePayloadV1, SessionStatePayloadV2> = {
  fromVersion: 1,
  toVersion: 2,
  kind: "session_state",
  description: "Add workflow and pinned memory metadata to session state",
  migrate(input: SnapshotEnvelope<SessionStatePayloadV1>): SnapshotEnvelope<SessionStatePayloadV2> {
    return {
      ...input,
      schemaVersion: 2,
      updatedAt: nowIso(),
      payload: {
        title: `Session state: ${input.sessionId}`,
        summary: input.payload.currentMode,
        sourcePrompt: input.metadata.requestId,
        sourceResponse: input.payload.lastMessage,
        importance: 0.7,
        currentMode: input.payload.currentMode,
        lastMessage: input.payload.lastMessage,
        preferences: input.payload.preferences ?? {},
        counters: input.payload.counters ?? {},
        activeWorkflowId: null,
        pinnedMemoryIds: [],
      },
      metadata: {
        ...input.metadata,
        source: "migration",
        notes: [...(input.metadata.notes ?? []), "session_state migrated to v2"],
      },
    };
  },
};

// -----------------------------------------------------------------------------
// Snapshot factory helpers
// -----------------------------------------------------------------------------

export class SnapshotFactory {
  static create<TPayload>(args: {
    kind: SnapshotKind;
    sessionId: string;
    payload: TPayload;
    schemaVersion?: number;
    walletAddress?: string | null;
    userId?: string | null;
    turnId?: string | null;
    tags?: string[];
    source?: SnapshotMetadata["source"];
    sourceVersion?: string;
    sourceModel?: string;
    requestId?: string;
    traceId?: string;
    toolName?: string;
    parentSnapshotId?: string | null;
    notes?: string[];
  }): SnapshotEnvelope<TPayload> {
    const createdAt = nowIso();
    const schemaVersion = args.schemaVersion ?? 1;
    const snapshot: SnapshotEnvelope<TPayload> = {
      id: createId(`snap_${args.kind}`),
      kind: args.kind,
      schemaVersion,
      status: "active",
      sessionId: args.sessionId,
      walletAddress: args.walletAddress ?? null,
      userId: args.userId ?? null,
      turnId: args.turnId ?? null,
      createdAt,
      updatedAt: createdAt,
      checksum: "",
      payload: args.payload,
      tags: args.tags ?? [],
      metadata: {
        source: args.source ?? "agent",
        sourceVersion: args.sourceVersion,
        sourceModel: args.sourceModel,
        traceId: args.traceId,
        requestId: args.requestId,
        toolName: args.toolName,
        parentSnapshotId: args.parentSnapshotId ?? null,
        lineage: [args.parentSnapshotId].filter(Boolean) as string[],
        notes: args.notes ?? [],
        validatedSchemaVersion: schemaVersion,
      },
    };
    snapshot.checksum = checksumOf(snapshot);
    return snapshot;
  }
}

// -----------------------------------------------------------------------------
// File-backed snapshot store
// -----------------------------------------------------------------------------

export interface FileSnapshotStoreOptions {
  directory: string;
  registry: SnapshotMigrationRegistry;
  latestSchemaByKind?: Partial<Record<SnapshotKind, number>>;
  filenamePrefix?: string;
}

export class FileSnapshotStore implements SnapshotStore {
  private readonly directory: string;
  private readonly registry: SnapshotMigrationRegistry;
  private readonly latestSchemaByKind: Partial<Record<SnapshotKind, number>>;
  private readonly filenamePrefix: string;
  private initialized = false;

  constructor(options: FileSnapshotStoreOptions) {
    this.directory = options.directory;
    this.registry = options.registry;
    this.latestSchemaByKind = options.latestSchemaByKind ?? {};
    this.filenamePrefix = options.filenamePrefix ?? "memory-snapshots";
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    await fs.mkdir(this.directory, { recursive: true });
    this.initialized = true;
  }

  private filePathForSession(sessionId: string): string {
    return path.join(this.directory, `${this.filenamePrefix}-${sessionId}.jsonl`);
  }

  private filePathForIndex(): string {
    return path.join(this.directory, `${this.filenamePrefix}-index.json`);
  }

  async write<TPayload>(snapshot: SnapshotEnvelope<TPayload>): Promise<void> {
    await this.init();

    const migrated = this.migrateToLatest(snapshot);
    const validation = SnapshotValidator.validate(migrated.snapshot);
    if (!validation.ok) {
      throw new Error(`Invalid snapshot: ${validation.errors.join(", ")}`);
    }

    const kindValidation = SnapshotValidator.validateKindPayload(migrated.snapshot);
    if (!kindValidation.ok) {
      throw new Error(`Invalid snapshot payload: ${kindValidation.errors.join(", ")}`);
    }

    const finalSnapshot = migrated.snapshot;
    finalSnapshot.checksum = checksumOf(finalSnapshot);

    const line = `${JSON.stringify(finalSnapshot)}\n`;
    const filePath = this.filePathForSession(finalSnapshot.sessionId);
    await fs.appendFile(filePath, line, "utf8");

    await this.updateIndex(finalSnapshot.id, filePath, finalSnapshot);
  }

  async readById(id: string): Promise<SnapshotEnvelope | null> {
    await this.init();

    const index = await this.readIndex();
    const hit = index.entries[id];
    if (!hit) return null;

    const raw = await this.readSnapshotFromFile(hit.filePath, id);
    if (!raw) return null;

    return this.migrateToLatest(raw).snapshot;
  }

  async query(query: SnapshotQuery): Promise<SnapshotEnvelope[]> {
    await this.init();

    const sessions = await this.listSessionFiles();
    const results: SnapshotEnvelope[] = [];

    for (const filePath of sessions) {
      const snapshots = await this.readAllFromFile(filePath);
      for (const raw of snapshots) {
        const migrated = this.migrateToLatest(raw).snapshot;
        if (this.matchesQuery(migrated, query)) {
          results.push(migrated);
        }
      }
    }

    results.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    return typeof query.limit === "number" ? results.slice(0, query.limit) : results;
  }

  async compact(sessionId?: string): Promise<void> {
    await this.init();

    const sessions = sessionId ? [this.filePathForSession(sessionId)] : await this.listSessionFiles();
    for (const filePath of sessions) {
      const snapshots = await this.readAllFromFile(filePath);
      const migratedSnapshots = snapshots.map((s) => this.migrateToLatest(s).snapshot);
      const deduped = this.dedupeSnapshots(migratedSnapshots);
      const serialized = deduped.map((s) => `${JSON.stringify(s)}\n`).join("");
      await fs.writeFile(filePath, serialized, "utf8");
    }
  }

  private migrateToLatest(snapshot: SnapshotEnvelope): MigrationPlanResult {
    const target = this.latestSchemaByKind[snapshot.kind] ?? this.registry.getLatestVersion(snapshot.kind);
    const plan = this.registry.migrate(snapshot, target);
    return plan;
  }

  private matchesQuery(snapshot: SnapshotEnvelope, query: SnapshotQuery): boolean {
    if (query.sessionId && snapshot.sessionId !== query.sessionId) return false;
    if (query.kind && snapshot.kind !== query.kind) return false;
    if (query.walletAddress && snapshot.walletAddress !== query.walletAddress) return false;
    if (query.userId && snapshot.userId !== query.userId) return false;
    if (query.status && snapshot.status !== query.status) return false;

    if (query.since || query.until) {
      if (!inRange(snapshot.createdAt, query.since, query.until)) return false;
    }

    const tags = new Set(snapshot.tags);
    if (query.tagsAnyOf && query.tagsAnyOf.length > 0) {
      const any = query.tagsAnyOf.some((tag) => tags.has(tag));
      if (!any) return false;
    }

    if (query.tagsAllOf && query.tagsAllOf.length > 0) {
      const all = query.tagsAllOf.every((tag) => tags.has(tag));
      if (!all) return false;
    }

    return true;
  }

  private async listSessionFiles(): Promise<string[]> {
    const entries = await fs.readdir(this.directory);
    return entries
      .filter((name) => name.startsWith(this.filenamePrefix) && name.endsWith(".jsonl"))
      .map((name) => path.join(this.directory, name));
  }

  private async readAllFromFile(filePath: string): Promise<SnapshotEnvelope[]> {
    try {
      const content = await fs.readFile(filePath, "utf8");
      return content
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => JSON.parse(line) as SnapshotEnvelope);
    } catch {
      return [];
    }
  }

  private async readSnapshotFromFile(filePath: string, id: string): Promise<SnapshotEnvelope | null> {
    const content = await fs.readFile(filePath, "utf8");
    const lines = content.split("\n").map((line) => line.trim()).filter(Boolean);

    for (const line of lines) {
      const snap = JSON.parse(line) as SnapshotEnvelope;
      if (snap.id === id) {
        return snap;
      }
    }

    return null;
  }

  private dedupeSnapshots(snapshots: SnapshotEnvelope[]): SnapshotEnvelope[] {
    const map = new Map<string, SnapshotEnvelope>();
    for (const snapshot of snapshots) {
      map.set(snapshot.id, snapshot);
    }
    return [...map.values()].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  }

  private async readIndex(): Promise<{ entries: Record<string, { filePath: string; sessionId: string }> }> {
    try {
      const raw = await fs.readFile(this.filePathForIndex(), "utf8");
      return JSON.parse(raw) as { entries: Record<string, { filePath: string; sessionId: string }> };
    } catch {
      return { entries: {} };
    }
  }

  private async updateIndex(snapshotId: string, filePath: string, snapshot: SnapshotEnvelope): Promise<void> {
    const index = await this.readIndex();
    index.entries[snapshotId] = {
      filePath,
      sessionId: snapshot.sessionId,
    };
    await fs.writeFile(this.filePathForIndex(), JSON.stringify(index, null, 2), "utf8");
  }
}

// -----------------------------------------------------------------------------
// Memory snapshot service
// -----------------------------------------------------------------------------

export interface MemorySnapshotServiceOptions {
  store: SnapshotStore;
  registry: SnapshotMigrationRegistry;
}

export class MemorySnapshotService {
  private readonly store: SnapshotStore;
  private readonly registry: SnapshotMigrationRegistry;

  constructor(options: MemorySnapshotServiceOptions) {
    this.store = options.store;
    this.registry = options.registry;
  }

  async init(): Promise<void> {
    await this.store.init();
  }

  async saveSessionState(input: {
    sessionId: string;
    payload: SessionStatePayloadV1 | SessionStatePayloadV2;
    options?: SnapshotWriteOptions;
  }): Promise<SnapshotEnvelope> {
    const snapshot = SnapshotFactory.create({
      kind: "session_state",
      sessionId: input.sessionId,
      payload: input.payload,
      schemaVersion: 1,
      walletAddress: input.options?.walletAddress ?? null,
      userId: input.options?.userId ?? null,
      turnId: input.options?.turnId ?? null,
      tags: input.options?.tags ?? ["session", "state"],
      source: input.options?.source ?? "agent",
      sourceVersion: input.options?.sourceVersion,
      sourceModel: input.options?.sourceModel,
      requestId: input.options?.requestId,
      traceId: input.options?.traceId,
      toolName: input.options?.toolName,
      parentSnapshotId: input.options?.parentSnapshotId ?? null,
      notes: input.options?.notes,
    });

    await this.store.write(snapshot);
    return snapshot;
  }

  async saveConversationTurn(input: {
    sessionId: string;
    prompt: string;
    response: string;
    selectedSkills: string[];
    toolCalls: ConversationTurnPayloadV1["toolCalls"];
    options?: SnapshotWriteOptions;
  }): Promise<SnapshotEnvelope> {
    const payload: ConversationTurnPayloadV1 = {
      prompt: input.prompt,
      response: input.response,
      selectedSkills: input.selectedSkills,
      toolCalls: input.toolCalls,
      summary: input.response.slice(0, 180),
    };

    const snapshot = SnapshotFactory.create({
      kind: "conversation_turn",
      sessionId: input.sessionId,
      payload,
      schemaVersion: 1,
      walletAddress: input.options?.walletAddress ?? null,
      userId: input.options?.userId ?? null,
      turnId: input.options?.turnId ?? null,
      tags: input.options?.tags ?? ["conversation", "turn"],
      source: input.options?.source ?? "agent",
      sourceVersion: input.options?.sourceVersion,
      sourceModel: input.options?.sourceModel,
      requestId: input.options?.requestId,
      traceId: input.options?.traceId,
      toolName: input.options?.toolName,
      parentSnapshotId: input.options?.parentSnapshotId ?? null,
      notes: input.options?.notes,
    });

    await this.store.write(snapshot);
    return snapshot;
  }

  async saveReflection(input: {
    sessionId: string;
    payload: ReflectionPayloadV1 | ReflectionPayloadV2;
    options?: SnapshotWriteOptions;
  }): Promise<SnapshotEnvelope> {
    const snapshot = SnapshotFactory.create({
      kind: "reflection",
      sessionId: input.sessionId,
      payload: input.payload,
      schemaVersion: 1,
      walletAddress: input.options?.walletAddress ?? null,
      userId: input.options?.userId ?? null,
      turnId: input.options?.turnId ?? null,
      tags: input.options?.tags ?? ["reflection", "lesson"],
      source: input.options?.source ?? "reflection",
      sourceVersion: input.options?.sourceVersion,
      sourceModel: input.options?.sourceModel,
      requestId: input.options?.requestId,
      traceId: input.options?.traceId,
      toolName: input.options?.toolName,
      parentSnapshotId: input.options?.parentSnapshotId ?? null,
      notes: input.options?.notes,
    });

    await this.store.write(snapshot);
    return snapshot;
  }

  async saveTaskResult(input: {
    sessionId: string;
    payload: TaskResultPayloadV1 | TaskResultPayloadV2;
    options?: SnapshotWriteOptions;
  }): Promise<SnapshotEnvelope> {
    const snapshot = SnapshotFactory.create({
      kind: "task_result",
      sessionId: input.sessionId,
      payload: input.payload,
      schemaVersion: 1,
      walletAddress: input.options?.walletAddress ?? null,
      userId: input.options?.userId ?? null,
      turnId: input.options?.turnId ?? null,
      tags: input.options?.tags ?? ["task", "result"],
      source: input.options?.source ?? "tool",
      sourceVersion: input.options?.sourceVersion,
      sourceModel: input.options?.sourceModel,
      requestId: input.options?.requestId,
      traceId: input.options?.traceId,
      toolName: input.options?.toolName,
      parentSnapshotId: input.options?.parentSnapshotId ?? null,
      notes: input.options?.notes,
    });

    await this.store.write(snapshot);
    return snapshot;
  }

  async saveErrorEvent(input: {
    sessionId: string;
    payload: ErrorEventPayloadV1;
    options?: SnapshotWriteOptions;
  }): Promise<SnapshotEnvelope> {
    const snapshot = SnapshotFactory.create({
      kind: "error_event",
      sessionId: input.sessionId,
      payload: input.payload,
      schemaVersion: 1,
      walletAddress: input.options?.walletAddress ?? null,
      userId: input.options?.userId ?? null,
      turnId: input.options?.turnId ?? null,
      tags: input.options?.tags ?? ["error", "event"],
      source: input.options?.source ?? "system",
      sourceVersion: input.options?.sourceVersion,
      sourceModel: input.options?.sourceModel,
      requestId: input.options?.requestId,
      traceId: input.options?.traceId,
      toolName: input.options?.toolName,
      parentSnapshotId: input.options?.parentSnapshotId ?? null,
      notes: input.options?.notes,
    });

    await this.store.write(snapshot);
    return snapshot;
  }

  async getLatestSessionSnapshot(sessionId: string, kind?: SnapshotKind): Promise<SnapshotEnvelope | null> {
    const items = await this.store.query({
      sessionId,
      kind,
      status: "active",
      limit: 1,
    });
    return items[0] ?? null;
  }

  async getSnapshotsForSession(sessionId: string): Promise<SnapshotEnvelope[]> {
    return this.store.query({ sessionId });
  }

  async getReflectionsForSession(sessionId: string): Promise<SnapshotEnvelope[]> {
    return this.store.query({ sessionId, kind: "reflection" });
  }

  async getConversationTurnsForSession(sessionId: string): Promise<SnapshotEnvelope[]> {
    return this.store.query({ sessionId, kind: "conversation_turn" });
  }

  async getTaskResultsForSession(sessionId: string): Promise<SnapshotEnvelope[]> {
    return this.store.query({ sessionId, kind: "task_result" });
  }

  async summarizeSession(sessionId: string): Promise<SnapshotEnvelope | null> {
    const turns = await this.getConversationTurnsForSession(sessionId);
    const reflections = await this.getReflectionsForSession(sessionId);
    const taskResults = await this.getTaskResultsForSession(sessionId);

    if (turns.length === 0 && reflections.length === 0 && taskResults.length === 0) {
      return null;
    }

    const summaryText = [
      `Session ${sessionId} summary`,
      `Turns: ${turns.length}`,
      `Reflections: ${reflections.length}`,
      `Task results: ${taskResults.length}`,
      `Latest turn: ${turns[0] ? JSON.stringify(turns[0].payload).slice(0, 240) : "none"}`,
      `Latest reflection: ${reflections[0] ? JSON.stringify(reflections[0].payload).slice(0, 240) : "none"}`,
    ].join("\n");

    const summaryPayload = {
      title: `Summary for ${sessionId}`,
      summary: summaryText,
      sourcePrompt: turns[0]?.id,
      sourceResponse: reflections[0]?.id,
      importance: 0.8,
      summaryText,
      itemCount: turns.length + reflections.length + taskResults.length,
      categories: {
        turns: turns.length,
        reflections: reflections.length,
        taskResults: taskResults.length,
      },
    };

    const snapshot = SnapshotFactory.create({
      kind: "summary",
      sessionId,
      payload: summaryPayload,
      schemaVersion: 1,
      tags: ["summary", "session"],
      source: "system",
      notes: ["Generated session summary from stored snapshots"],
    });

    await this.store.write(snapshot);
    return snapshot;
  }

  async migrateAllSnapshots(sessionId?: string): Promise<{ migrated: number; compacted: boolean }> {
    const records = sessionId ? await this.store.query({ sessionId }) : await this.store.query({});

    let migrated = 0;
    for (const snapshot of records) {
      const latestVersion = this.registry.getLatestVersion(snapshot.kind);
      if (snapshot.schemaVersion < latestVersion) {
        await this.store.write(snapshot);
        migrated += 1;
      }
    }

    if (this.store.compact) {
      await this.store.compact(sessionId);
      return { migrated, compacted: true };
    }

    return { migrated, compacted: false };
  }
}

// -----------------------------------------------------------------------------
// Default wiring
// -----------------------------------------------------------------------------

export function createDefaultSnapshotRegistry(): SnapshotMigrationRegistry {
  const registry = new SnapshotMigrationRegistry();
  registry.register(sessionStateV1ToV2);
  registry.register(conversationTurnV1ToV2);
  registry.register(reflectionV1ToV2);
  registry.register(taskResultV1ToV2);
  return registry;
}

export function createDefaultSnapshotService(options: { directory: string }): MemorySnapshotService {
  const registry = createDefaultSnapshotRegistry();
  const store = new FileSnapshotStore({
    directory: options.directory,
    registry,
    latestSchemaByKind: {
      session_state: 2,
      conversation_turn: 2,
      reflection: 2,
      task_result: 2,
    },
  });

  return new MemorySnapshotService({ store, registry });
}

// -----------------------------------------------------------------------------
// Agent runtime adapter
// -----------------------------------------------------------------------------

export interface AgentMemoryContext {
  sessionId: string;
  walletAddress?: string | null;
  userId?: string | null;
  requestId?: string | null;
  traceId?: string | null;
}

export interface AgentTurnArtifacts {
  turnSnapshot: SnapshotEnvelope<ConversationTurnPayloadV2>;
  reflectionSnapshot?: SnapshotEnvelope<ReflectionPayloadV2> | null;
  summarySnapshot?: SnapshotEnvelope | null;
}

export class AgentMemorySnapshotAdapter {
  constructor(private readonly snapshots: MemorySnapshotService) {}

  async saveTurn(args: {
    context: AgentMemoryContext;
    prompt: string;
    response: string;
    selectedSkills: string[];
    toolCalls: ConversationTurnPayloadV1["toolCalls"];
    parentSnapshotId?: string | null;
  }): Promise<SnapshotEnvelope> {
    return this.snapshots.saveConversationTurn({
      sessionId: args.context.sessionId,
      prompt: args.prompt,
      response: args.response,
      selectedSkills: args.selectedSkills,
      toolCalls: args.toolCalls,
      options: {
        walletAddress: args.context.walletAddress ?? null,
        userId: args.context.userId ?? null,
        requestId: args.context.requestId ?? undefined,
        traceId: args.context.traceId ?? undefined,
        parentSnapshotId: args.parentSnapshotId ?? null,
        tags: ["agent", "turn", "memory"],
        source: "agent",
      },
    });
  }

  async saveReflection(args: {
    context: AgentMemoryContext;
    turnId: string;
    reflection: ReflectionPayloadV1 | ReflectionPayloadV2;
    parentSnapshotId?: string | null;
  }): Promise<SnapshotEnvelope> {
    return this.snapshots.saveReflection({
      sessionId: args.context.sessionId,
      payload: args.reflection,
      options: {
        walletAddress: args.context.walletAddress ?? null,
        userId: args.context.userId ?? null,
        turnId: args.turnId,
        requestId: args.context.requestId ?? undefined,
        traceId: args.context.traceId ?? undefined,
        parentSnapshotId: args.parentSnapshotId ?? null,
        tags: ["agent", "reflection", "lesson"],
        source: "reflection",
      },
    });
  }

  async saveSessionState(args: {
    context: AgentMemoryContext;
    payload: SessionStatePayloadV1 | SessionStatePayloadV2;
  }): Promise<SnapshotEnvelope> {
    return this.snapshots.saveSessionState({
      sessionId: args.context.sessionId,
      payload: args.payload,
      options: {
        walletAddress: args.context.walletAddress ?? null,
        userId: args.context.userId ?? null,
        requestId: args.context.requestId ?? undefined,
        traceId: args.context.traceId ?? undefined,
        tags: ["agent", "session", "state"],
        source: "agent",
      },
    });
  }

  async saveErrorEvent(args: {
    context: AgentMemoryContext;
    payload: ErrorEventPayloadV1;
    parentSnapshotId?: string | null;
  }): Promise<SnapshotEnvelope> {
    return this.snapshots.saveErrorEvent({
      sessionId: args.context.sessionId,
      payload: args.payload,
      options: {
        walletAddress: args.context.walletAddress ?? null,
        userId: args.context.userId ?? null,
        requestId: args.context.requestId ?? undefined,
        traceId: args.context.traceId ?? undefined,
        parentSnapshotId: args.parentSnapshotId ?? null,
        tags: ["agent", "error"],
        source: "system",
      },
    });
  }

  async loadSessionHistory(sessionId: string): Promise<SnapshotEnvelope[]> {
    return this.snapshots.getSnapshotsForSession(sessionId);
  }

  async loadReflections(sessionId: string): Promise<SnapshotEnvelope[]> {
    return this.snapshots.getReflectionsForSession(sessionId);
  }

  async createSessionSummary(sessionId: string): Promise<SnapshotEnvelope | null> {
    return this.snapshots.summarizeSession(sessionId);
  }
}

// -----------------------------------------------------------------------------
// Test / utility helpers
// -----------------------------------------------------------------------------

export function assertSnapshotChecksum(snapshot: SnapshotEnvelope): boolean {
  return snapshot.checksum === checksumOf(snapshot);
}

export function isMigratedSnapshot(snapshot: SnapshotEnvelope): boolean {
  return snapshot.metadata.source === "migration" || (snapshot.metadata.notes ?? []).some((n) => n.includes("migrated"));
}

export function inferSnapshotImportance(snapshot: SnapshotEnvelope): number {
  if (snapshot.kind === "reflection") {
    const payload = snapshot.payload as Partial<ReflectionPayloadV2>;
    if (payload.severity === "high") return 0.95;
    if (payload.severity === "medium") return 0.75;
    return 0.6;
  }

  if (snapshot.kind === "task_result") {
    const payload = snapshot.payload as Partial<TaskResultPayloadV2>;
    return payload.success ? 0.4 : 0.85;
  }

  if (snapshot.kind === "conversation_turn") return 0.5;
  if (snapshot.kind === "session_state") return 0.7;
  if (snapshot.kind === "summary") return 0.8;
  return 0.45;
}

export function buildSnapshotLineage(snapshot: SnapshotEnvelope): string[] {
  const lineage = new Set<string>(snapshot.metadata.lineage);
  if (snapshot.metadata.parentSnapshotId) lineage.add(snapshot.metadata.parentSnapshotId);
  if (snapshot.id) lineage.add(snapshot.id);
  return [...lineage];
}

export function normalizeLegacyPayload<T extends Record<string, unknown>>(kind: SnapshotKind, payload: T): T {
  if (kind === "reflection") {
    const p = payload as Partial<ReflectionPayloadV2 & ReflectionPayloadV1>;
    return {
      ...payload,
      nextBestAction: p.nextBestAction ?? p.correctiveAdvice,
      failureMode: p.failureMode ?? (p.severity === "high" ? "high-severity-failure" : "baseline-learning"),
    } as T;
  }

  if (kind === "conversation_turn") {
    const p = payload as Partial<ConversationTurnPayloadV2 & ConversationTurnPayloadV1>;
    return {
      ...payload,
      memoryRefs: p.memoryRefs ?? [],
      reflectionRefs: p.reflectionRefs ?? [],
      title: p.title ?? p.summary ?? "Conversation turn",
      summary: p.summary ?? p.prompt?.slice(0, 160) ?? "",
      sourcePrompt: p.sourcePrompt ?? p.prompt ?? "",
      sourceResponse: p.sourceResponse ?? p.response ?? "",
      importance: p.importance ?? 0.5,
    } as T;
  }

  if (kind === "task_result") {
    const p = payload as Partial<TaskResultPayloadV2 & TaskResultPayloadV1>;
    return {
      ...payload,
      retryable: p.retryable ?? !p.success,
      durationMs: p.durationMs ?? undefined,
      title: p.title ?? p.taskType ?? "Task result",
      summary: p.summary ?? p.resultSummary ?? "",
      sourcePrompt: p.sourcePrompt ?? "",
      sourceResponse: p.sourceResponse ?? p.resultSummary ?? "",
      importance: p.importance ?? (p.success ? 0.4 : 0.8),
    } as T;
  }

  return payload;
}

export function buildExampleV1Reflection(sessionId: string): SnapshotEnvelope<ReflectionPayloadV1> {
  return SnapshotFactory.create({
    kind: "reflection",
    sessionId,
    schemaVersion: 1,
    payload: {
      rootCause: "Example root cause",
      mistakeSummary: "Example mistake",
      correctiveAdvice: "Example advice",
      severity: "high",
      confidence: 0.9,
      relatedSnapshotIds: [],
      lessonTags: ["example"],
    },
    tags: ["example", "reflection"],
    source: "reflection",
  });
}

export function buildExampleV1Conversation(sessionId: string): SnapshotEnvelope<ConversationTurnPayloadV1> {
  return SnapshotFactory.create({
    kind: "conversation_turn",
    sessionId,
    schemaVersion: 1,
    payload: {
      prompt: "Hello",
      response: "Hi there",
      selectedSkills: ["MemorySearch"],
      toolCalls: [],
      summary: "Greeting exchange",
    },
    tags: ["example", "conversation"],
    source: "agent",
  });
}

export function buildExampleV1SessionState(sessionId: string): SnapshotEnvelope<SessionStatePayloadV1> {
  return SnapshotFactory.create({
    kind: "session_state",
    sessionId,
    schemaVersion: 1,
    payload: {
      currentMode: "idle",
      lastMessage: "Ready",
      preferences: { theme: "dark" },
      counters: { turns: 1 },
    },
    tags: ["example", "session"],
    source: "system",
  });
}

export function buildExampleTaskResult(sessionId: string): SnapshotEnvelope<TaskResultPayloadV1> {
  return SnapshotFactory.create({
    kind: "task_result",
    sessionId,
    schemaVersion: 1,
    payload: {
      taskType: "UniswapSwap",
      success: false,
      resultSummary: "Swap failed due to slippage",
      errorMessage: "Slippage exceeded threshold",
    },
    tags: ["example", "task"],
    source: "tool",
  });
}
