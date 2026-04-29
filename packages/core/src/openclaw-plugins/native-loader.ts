import type { PluginEntry, PluginApi, RegistrationMode } from "./runtime.js";
import type { PluginRecord } from "./contracts.js";

export interface LoadedPlugin {
  record: PluginRecord;
  entry: PluginEntry;
}

export class NativePluginLoader {
  constructor(private readonly apiFactory: (mode: RegistrationMode) => PluginApi) {}

  async discover(entry: PluginEntry, record: PluginRecord): Promise<LoadedPlugin> {
    const api = this.apiFactory("discovery");
    await entry.register(api);
    return { entry, record };
  }

  async activate(entry: PluginEntry, record: PluginRecord): Promise<LoadedPlugin> {
    const api = this.apiFactory("full");
    await entry.register(api);
    return { entry, record };
  }
}
