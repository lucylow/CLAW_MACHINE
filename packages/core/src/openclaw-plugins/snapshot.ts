import type { PluginRecord } from "./contracts.js";

export interface PluginSnapshot {
  createdAt: string;
  records: PluginRecord[];
}

export class SnapshotCache {
  private current: PluginSnapshot | null = null;

  set(records: PluginRecord[]) {
    this.current = {
      createdAt: new Date().toISOString(),
      records,
    };
  }

  get(): PluginSnapshot | null {
    return this.current;
  }

  clear() {
    this.current = null;
  }
}
