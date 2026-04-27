import type { LogEntry, MemoryRecord, StorageQuery, StorageWriteResult } from "../../schemas/storage";

export interface MemoryStorageProvider {
  name: string;
  saveRecord<T>(record: MemoryRecord<T>): Promise<StorageWriteResult>;
  getRecord<T>(streamId: string, key: string): Promise<MemoryRecord<T> | null>;
  listRecords(query: StorageQuery): Promise<MemoryRecord[]>;
  appendLog(entry: LogEntry): Promise<StorageWriteResult>;
  getLog(streamId: string, limit?: number): Promise<LogEntry[]>;
}
