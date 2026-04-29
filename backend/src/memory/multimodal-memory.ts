import path from "node:path";
import fs from "node:fs/promises";
import type {
  MultimodalAsset,
  MultimodalObservation,
  MultimodalReflection,
  MultimodalMemoryStore,
  MultimodalTaskType,
} from "../multimodal/types";
import type { MultimodalLogger } from "../multimodal/types";
import { createId, nowIso, safeString } from "../multimodal/utils";
import { tokenize } from "../multimodal/utils";

export interface FileMultimodalMemoryStoreOptions {
  directory: string;
  logger?: MultimodalLogger;
}

interface MemoryRow {
  id: string;
  sessionId: string;
  turnId: string;
  requestId?: string | null;
  kind: "observation" | "turn" | "reflection";
  text: string;
  payload: unknown;
  createdAt: string;
}

export class FileMultimodalMemoryStore implements MultimodalMemoryStore {
  private readonly directory: string;
  private readonly logger?: MultimodalLogger;

  constructor(options: FileMultimodalMemoryStoreOptions) {
    this.directory = options.directory;
    this.logger = options.logger;
  }

  async saveObservation(input: {
    sessionId: string;
    turnId: string;
    requestId?: string | null;
    observation: MultimodalObservation;
  }): Promise<string> {
    const id = createId("obs");
    const row: MemoryRow = {
      id,
      sessionId: input.sessionId,
      turnId: input.turnId,
      requestId: input.requestId ?? null,
      kind: "observation",
      text: input.observation.summary,
      payload: input.observation,
      createdAt: nowIso(),
    };
    await this.appendRow(input.sessionId, row);
    return id;
  }

  async saveTurn(input: {
    sessionId: string;
    turnId: string;
    requestId?: string | null;
    taskType: MultimodalTaskType;
    summary: string;
    answer: string;
    assets: MultimodalAsset[];
    observations: MultimodalObservation[];
    reflection?: MultimodalReflection | null;
    warnings?: string[];
  }): Promise<string> {
    const id = createId("turn");
    const row: MemoryRow = {
      id,
      sessionId: input.sessionId,
      turnId: input.turnId,
      requestId: input.requestId ?? null,
      kind: "turn",
      text: input.summary,
      payload: input,
      createdAt: nowIso(),
    };
    await this.appendRow(input.sessionId, row);
    return id;
  }

  async saveReflection(input: {
    sessionId: string;
    turnId: string;
    requestId?: string | null;
    reflection: MultimodalReflection;
  }): Promise<string> {
    const id = input.reflection.reflectionId || createId("refl");
    const row: MemoryRow = {
      id,
      sessionId: input.sessionId,
      turnId: input.turnId,
      requestId: input.requestId ?? null,
      kind: "reflection",
      text: input.reflection.correctiveAdvice,
      payload: input.reflection,
      createdAt: nowIso(),
    };
    await this.appendRow(input.sessionId, row);
    return id;
  }

  async searchSimilar(input: {
    sessionId: string;
    query: string;
    limit?: number;
  }): Promise<Array<{ id: string; text: string; kind: string; score: number }>> {
    const rows = await this.readRows(input.sessionId);
    const queryTerms = tokenize(input.query);
    const scored = rows.map((row) => {
      const textTerms = tokenize(`${row.text} ${safeString(row.payload)}`);
      const overlap = queryTerms.filter((term) => textTerms.includes(term)).length;
      const score = queryTerms.length === 0 ? 0 : overlap / queryTerms.length;
      return { id: row.id, text: row.text, kind: row.kind, score };
    });

    return scored.sort((a, b) => b.score - a.score).slice(0, input.limit ?? 5);
  }

  private async appendRow(sessionId: string, row: MemoryRow): Promise<void> {
    await fs.mkdir(this.directory, { recursive: true });
    const file = path.join(this.directory, `multimodal-${sessionId}.jsonl`);
    await fs.appendFile(file, `${JSON.stringify(row)}\n`, "utf8");
  }

  private async readRows(sessionId: string): Promise<MemoryRow[]> {
    try {
      const file = path.join(this.directory, `multimodal-${sessionId}.jsonl`);
      const data = await fs.readFile(file, "utf8");
      return data
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => JSON.parse(line) as MemoryRow);
    } catch (error) {
      this.logger?.debug?.("No multimodal memory rows found yet", { sessionId, error: safeString(error) });
      return [];
    }
  }
}
