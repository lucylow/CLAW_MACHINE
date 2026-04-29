import fs from "node:fs/promises";
import path from "node:path";
import type { FrameworkArtifactStore } from "./types";
import { stableJson } from "./util";

export class FileArtifactStore implements FrameworkArtifactStore {
  constructor(private readonly root: string) {}

  async writeJson(name: string, value: unknown): Promise<string> {
    const file = path.join(this.root, name);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, stableJson(value), "utf8");
    return file;
  }

  async readJson<T = unknown>(name: string): Promise<T | null> {
    try {
      const file = path.join(this.root, name);
      const content = await fs.readFile(file, "utf8");
      return JSON.parse(content) as T;
    } catch {
      return null;
    }
  }

  async writeText(name: string, text: string): Promise<string> {
    const file = path.join(this.root, name);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, text, "utf8");
    return file;
  }

  async readText(name: string): Promise<string | null> {
    try {
      const file = path.join(this.root, name);
      return await fs.readFile(file, "utf8");
    } catch {
      return null;
    }
  }

  async list(prefix?: string): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.root, { recursive: true });
      return entries.map(String).filter((item) => (prefix ? item.startsWith(prefix) : true));
    } catch {
      return [];
    }
  }
}
