export class ProviderError extends Error {
  code: string;
  provider: string;
  details?: unknown;

  constructor(message: string, code: string, provider: string, details?: unknown) {
    super(message);
    this.name = "ProviderError";
    this.code = code;
    this.provider = provider;
    this.details = details;
  }
}

export class ProviderTimeoutError extends ProviderError {
  constructor(provider: string, timeoutMs: number) {
    super(`Provider timed out after ${timeoutMs}ms`, "PROVIDER_TIMEOUT", provider);
    this.name = "ProviderTimeoutError";
  }
}

export class ProviderUnavailableError extends ProviderError {
  constructor(provider: string, details?: unknown) {
    super("Provider is unavailable", "PROVIDER_UNAVAILABLE", provider, details);
    this.name = "ProviderUnavailableError";
  }
}
