/**
 * MemoryOrchestrator
 *
 * Implements the three-tier persistent memory model described in the Claw Machine
 * design document. Coordinates between:
 *
 *   Hot KV  (ZeroGStorageAdapter.kvSet/kvGet)  — fast mutable session state
 *   Warm Log (ZeroGStorageAdapter.logAppend)   — append-only episode history
 *   Cold Archive (ZeroGStorageAdapter.uploadBlob) — compressed long-term storage
 *
 * Also owns the VectorIndex for semantic retrieval of past reflections.
 *
 * Memory lifecycle:
 *   new session state → HotKV
 *   HotKV read/write during task
 *   task completed → WarmLog
 *   WarmLog → Reflection (on failure or success signal)
 *   Reflection → HotKV (update guidance)
 *   WarmLog → ColdArchive (old episodes compressed)
 *   ColdArchive → Retrieval (similar task appears)
 *   Retrieval → HotKV (inject prior lessons)
 *
 * @see Claw Machine design doc — Memory Model section
 */

import { randomUUID } from "crypto";
import type { ZeroGStorageAdapter } from "../adapters/ZeroGStorageAdapter";
import type { ZeroGComputeAdapter } from "../adapters/ZeroGComputeAdapter";
import { VectorIndex } from "./VectorIndex";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Episode {
  id: string;
  sessionId: string;
  walletAddress?: string;
  userMessage: string;
  assistantMessage: string;
  selectedSkills: string[];
  toolCalls: Array<{ skillId: string; input: unknown; output: unknown; success: boolean }>;
  storageRefs: string[];
  reflectionRefs: string[];
  successScore: number; // 0–1
  timestamp: number;
  schemaVersion: string;
}

export interface Reflection {
  reflectionId: string;
  episodeId: string;
  sessionId: string;
  taskType: string;
  rootCause: string;
  mistakeSummary: string;
  correctiveAdvice: string;
  confidence: number;
  severity: "low" | "medium" | "high" | "critical";
  tags: string[];
  relatedMemoryIds: string[];
  timestamp: number;
  embedding?: number[];
  schemaVersion: string;
}

export interface MemorySearchResult {
  id: string;
  type: "reflection" | "episode" | "summary";
  text: string;
  score: number;
  similarity: number;
  timestamp: number;
  importance: number;
}

export interface MemoryStats {
  totalRecords: number;
  byType: Record<string, number>;
  avgImportance: number;
  pinnedCount: number;
  sessionCount: number;
  vectorIndexSize: number;
  storageStats: ReturnType<ZeroGStorageAdapter["getStats"]>;
}

// ── Orchestrator ──────────────────────────────────────────────────────────────

export class MemoryOrchestrator {
  private readonly storage: ZeroGStorageAdapter;
  private readonly compute: ZeroGComputeAdapter;
  private readonly vectorIndex: VectorIndex;
  private readonly SCHEMA_VERSION = "1.0.0";

  // In-process record store (mirrors what's in 0G Storage)
  private readonly records = new Map<
    string,
    {
      id: string;
      type: "reflection" | "episode" | "summary" | "lesson";
      text: string;
      importance: number;
      pinned: boolean;
      sessionId: string;
      walletAddress?: string;
      timestamp: number;
      tags: string[];
      data: unknown;
    }
  >();

  constructor(storage: ZeroGStorageAdapter, compute: ZeroGComputeAdapter) {
    this.storage = storage;
    this.compute = compute;
    this.vectorIndex = new VectorIndex();
  }

  // ── State (Hot KV) ────────────────────────────────────────────────────────

  async saveState(streamId: string, key: string, value: unknown): Promise<void> {
    await this.storage.kvSet(streamId, key, value);
  }

  async recallState(streamId: string, key: string): Promise<unknown | null> {
    return this.storage.kvGet(streamId, key);
  }

  // ── Episodes (Warm Log) ───────────────────────────────────────────────────

  async appendEpisode(episode: Omit<Episode, "id" | "timestamp" | "schemaVersion">): Promise<string> {
    const full: Episode = {
      ...episode,
      id: randomUUID(),
      timestamp: Date.now(),
      schemaVersion: this.SCHEMA_VERSION,
    };

    const rootHash = await this.storage.logAppend(episode.sessionId, "episode", full);

    // Index episode text for retrieval
    const text = `${episode.userMessage} ${episode.assistantMessage}`.slice(0, 500);
    const { embedding } = await this.compute.embed(text);

    const record = {
      id: full.id,
      type: "episode" as const,
      text,
      importance: episode.successScore,
      pinned: false,
      sessionId: episode.sessionId,
      walletAddress: episode.walletAddress,
      timestamp: full.timestamp,
      tags: episode.selectedSkills,
      data: full,
    };
    this.records.set(full.id, record);
    this.vectorIndex.upsert({ id: full.id, embedding, metadata: { ...record } });

    return rootHash;
  }

  // ── Reflections ───────────────────────────────────────────────────────────

  /**
   * Generate a structured reflection from a task outcome using 0G Compute,
   * then persist it to 0G Storage and index it for future retrieval.
   *
   * This is the core of the Claw Machine reflection loop.
   */
  async reflectTask(
    task: { input: string; sessionId: string; walletAddress?: string; selectedSkills?: string[] },
    outcome: { success: boolean; output: string; errorCode?: string },
  ): Promise<Reflection> {
    const { REFLECTION_SYSTEM, buildReflectionPrompt } = await import("../prompts/templates");

    const prompt = buildReflectionPrompt(task.input, outcome.output, outcome.success);
    const response = await this.compute.infer({
      messages: [
        { role: "system", content: REFLECTION_SYSTEM },
        { role: "user", content: prompt },
      ],
      verifiable: true, // Request TEE-verifiable reflection
    });

    let parsed: Partial<Reflection>;
    try {
      parsed = JSON.parse(response.content);
    } catch {
      parsed = {
        taskType: "general",
        rootCause: "Parse error — raw response stored",
        mistakeSummary: response.content.slice(0, 200),
        correctiveAdvice: "Review raw response for details",
        confidence: 0.5,
        severity: "low",
        tags: [],
      };
    }

    const reflection: Reflection = {
      reflectionId: randomUUID(),
      episodeId: "",
      sessionId: task.sessionId,
      taskType: parsed.taskType ?? "general",
      rootCause: parsed.rootCause ?? "",
      mistakeSummary: parsed.mistakeSummary ?? "",
      correctiveAdvice: parsed.correctiveAdvice ?? "",
      confidence: parsed.confidence ?? 0.5,
      severity: parsed.severity ?? "medium",
      tags: parsed.tags ?? task.selectedSkills ?? [],
      relatedMemoryIds: [],
      timestamp: Date.now(),
      schemaVersion: this.SCHEMA_VERSION,
    };

    // Embed reflection for retrieval
    const embedText = `${reflection.rootCause} ${reflection.correctiveAdvice}`;
    const { embedding } = await this.compute.embed(embedText);
    reflection.embedding = embedding;

    // Persist to 0G Storage log
    await this.storage.logAppend(task.sessionId, "reflection", reflection);

    // Index in vector store
    const importance = outcome.success ? 0.4 : 0.8; // failures are more important to remember
    const record = {
      id: reflection.reflectionId,
      type: "reflection" as const,
      text: embedText,
      importance,
      pinned: false,
      sessionId: task.sessionId,
      walletAddress: task.walletAddress,
      timestamp: reflection.timestamp,
      tags: reflection.tags,
      data: reflection,
    };
    this.records.set(reflection.reflectionId, record);
    this.vectorIndex.upsert({ id: reflection.reflectionId, embedding, metadata: { ...record } });

    // Update hot KV with latest reflection guidance for this session
    await this.storage.kvSet(task.sessionId, "latest_reflection", {
      advice: reflection.correctiveAdvice,
      severity: reflection.severity,
      timestamp: reflection.timestamp,
    });

    return reflection;
  }

  // ── Retrieval ─────────────────────────────────────────────────────────────

  /**
   * Retrieve the most relevant past lessons for a given query.
   * Uses semantic similarity + recency + importance weighting.
   */
  async retrieveLessons(
    query: string,
    options?: {
      limit?: number;
      type?: "reflection" | "episode" | "summary";
      walletAddress?: string;
      minSimilarity?: number;
    },
  ): Promise<MemorySearchResult[]> {
    const { embedding } = await this.compute.embed(query);
    const results = this.vectorIndex.search(embedding, {
      k: options?.limit ?? 5,
      type: options?.type,
      walletAddress: options?.walletAddress,
      minSimilarity: options?.minSimilarity ?? 0.1,
    });

    return results.map((r) => ({
      id: r.id,
      type: r.metadata.type as MemorySearchResult["type"],
      text: r.metadata.text,
      score: r.score,
      similarity: r.similarity,
      timestamp: r.metadata.timestamp,
      importance: r.metadata.importance,
    }));
  }

  /**
   * Build a context string from retrieved lessons to inject into the agent prompt.
   */
  async buildLessonContext(query: string, walletAddress?: string): Promise<string> {
    const lessons = await this.retrieveLessons(query, { limit: 3, walletAddress });
    if (lessons.length === 0) return "";

    const lines = lessons.map((l, i) => {
      const record = this.records.get(l.id);
      if (!record) return "";
      if (record.type === "reflection") {
        const r = record.data as Reflection;
        return `[Lesson ${i + 1}] ${r.correctiveAdvice} (confidence: ${r.confidence.toFixed(2)})`;
      }
      return `[Context ${i + 1}] ${l.text.slice(0, 150)}`;
    });

    return `Prior lessons from memory:\n${lines.filter(Boolean).join("\n")}`;
  }

  // ── Pinning ───────────────────────────────────────────────────────────────

  pin(id: string): boolean {
    const record = this.records.get(id);
    if (!record) return false;
    record.pinned = true;
    record.importance = Math.min(1, record.importance + 0.2);
    return true;
  }

  softDelete(id: string): boolean {
    const record = this.records.get(id);
    if (!record) return false;
    record.importance = 0;
    this.vectorIndex.delete(id);
    return true;
  }

  // ── Stats ─────────────────────────────────────────────────────────────────

  getStats(): MemoryStats {
    const all = Array.from(this.records.values());
    const byType: Record<string, number> = {};
    let importanceSum = 0;
    let pinnedCount = 0;
    const sessions = new Set<string>();

    for (const r of all) {
      byType[r.type] = (byType[r.type] ?? 0) + 1;
      importanceSum += r.importance;
      if (r.pinned) pinnedCount++;
      sessions.add(r.sessionId);
    }

    return {
      totalRecords: all.length,
      byType,
      avgImportance: all.length > 0 ? importanceSum / all.length : 0,
      pinnedCount,
      sessionCount: sessions.size,
      vectorIndexSize: this.vectorIndex.size,
      storageStats: this.storage.getStats(),
    };
  }

  getRecords(limit = 50): Array<ReturnType<typeof this.records.get>> {
    return Array.from(this.records.values())
      .sort((a, b) => (b?.timestamp ?? 0) - (a?.timestamp ?? 0))
      .slice(0, limit);
  }
}
