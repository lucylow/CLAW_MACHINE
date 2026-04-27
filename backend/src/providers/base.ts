import type { ProviderConfig, ProviderHealth, ProviderInitResult } from "../schemas/provider";

export abstract class BaseProvider {
  protected config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  abstract init(): Promise<ProviderInitResult>;
  abstract health(): Promise<ProviderHealth>;
  abstract close(): Promise<void>;

  getName(): string {
    return this.config.name;
  }

  getKind(): string {
    return this.config.kind;
  }
}
