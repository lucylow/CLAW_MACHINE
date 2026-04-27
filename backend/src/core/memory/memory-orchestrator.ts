import { randomUUID } from "crypto";
import type { LlmProvider } from "../../providers/llm/types";
import type { MemoryStorageProvider } from "../../providers/storage/types";

export class MemoryOrchestrator {
  constructor(
    private storage: MemoryStorageProvider,
    private llm: LlmProvider,
  ) {}

  async saveWorkingMemory(streamId: string, key: string, value: unknown) {
    return this.storage.saveRecord({
      id: randomUUID(),
      streamId,
      key,
      value,
      createdAt: new Date().toISOString(),
      tier: "hot",
    });
  }

  async recallWorkingMemory<T>(streamId: string, key: string): Promise<T | null> {
    const record = await this.storage.getRecord<T>(streamId, key);
    return record?.value ?? null;
  }

  async appendEpisode(streamId: string, type: string, payload: unknown) {
    return this.storage.appendLog({
      id: randomUUID(),
      streamId,
      type,
      payload,
      createdAt: new Date().toISOString(),
    });
  }

  async summarize(streamId: string): Promise<string> {
    const records = await this.storage.listRecords({ streamId, limit: 20 });
    if (!records.length) return "No memory available.";

    const summaryPrompt = records
      .map((record) => `${record.key}: ${JSON.stringify(record.value).slice(0, 220)}`)
      .join("\n");

    const response = await this.llm.chat({
      messages: [
        { role: "system", content: "Summarize memory state in 3 concise bullet points." },
        { role: "user", content: summaryPrompt },
      ],
      temperature: 0.1,
      maxTokens: 200,
    });

    return response.text;
  }
}
