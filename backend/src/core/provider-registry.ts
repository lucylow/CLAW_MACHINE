import type { LlmProvider } from "../providers/llm/types";
import type { MemoryStorageProvider } from "../providers/storage/types";

export class ProviderRegistry {
  private llmProviders = new Map<string, LlmProvider>();
  private storageProviders = new Map<string, MemoryStorageProvider>();

  registerLlm(provider: LlmProvider): void {
    this.llmProviders.set(provider.name, provider);
  }

  registerStorage(provider: MemoryStorageProvider): void {
    this.storageProviders.set(provider.name, provider);
  }

  getLlm(name: string): LlmProvider {
    const provider = this.llmProviders.get(name);
    if (!provider) throw new Error(`LLM provider not found: ${name}`);
    return provider;
  }

  getStorage(name: string): MemoryStorageProvider {
    const provider = this.storageProviders.get(name);
    if (!provider) throw new Error(`Storage provider not found: ${name}`);
    return provider;
  }

  listLlm(): string[] {
    return [...this.llmProviders.keys()];
  }

  listStorage(): string[] {
    return [...this.storageProviders.keys()];
  }
}
