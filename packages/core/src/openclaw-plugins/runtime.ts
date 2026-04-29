export type RegistrationMode = "full" | "discovery" | "setup-only" | "setup-runtime" | "cli-metadata";

export interface PluginApi {
  registrationMode: RegistrationMode;
  config?: Record<string, unknown>;
  registerProvider(spec: unknown): void;
  registerChannel(spec: unknown): void;
  registerTool(spec: unknown): void;
  registerHook(spec: unknown): void;
  registerService(spec: unknown): void;
  registerCommand(spec: unknown): void;
  registerHttpRoute(spec: unknown): void;
}

export interface PluginEntry {
  id: string;
  name: string;
  register(api: PluginApi): void | Promise<void>;
}

export class PluginRuntime {
  constructor(private readonly apiFactory: (mode: RegistrationMode) => PluginApi) {}

  async load(entry: PluginEntry, mode: RegistrationMode): Promise<void> {
    const api = this.apiFactory(mode);
    await entry.register(api);
  }
}
