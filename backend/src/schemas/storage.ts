export interface MemoryRecord<T = unknown> {
  id: string;
  streamId: string;
  key: string;
  value: T;
  createdAt: string;
  updatedAt?: string;
  tier?: "hot" | "warm" | "cold";
  tags?: Record<string, string>;
  embedding?: number[];
}

export interface LogEntry {
  id: string;
  streamId: string;
  type: string;
  payload: unknown;
  createdAt: string;
  hash?: string;
}

export interface StorageQuery {
  streamId?: string;
  key?: string;
  limit?: number;
  cursor?: string;
}

export interface StorageWriteResult {
  ok: boolean;
  id: string;
  hash?: string;
}
