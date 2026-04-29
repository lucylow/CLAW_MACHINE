export interface CapabilityRegistry {
  providers: Map<string, unknown>;
  channels: Map<string, unknown>;
  tools: Map<string, unknown>;
  hooks: Map<string, unknown[]>;
  services: Map<string, unknown>;
  commands: Map<string, unknown>;
  routes: Map<string, unknown>;
}

import type { PluginApi, RegistrationMode } from "./runtime.js";

export function createCapabilityRegistry(): CapabilityRegistry {
  return {
    providers: new Map(),
    channels: new Map(),
    tools: new Map(),
    hooks: new Map(),
    services: new Map(),
    commands: new Map(),
    routes: new Map(),
  };
}

export class CapabilityRegistrar {
  constructor(private readonly registry: CapabilityRegistry) {}

  registerProvider(id: string, spec: unknown) {
    if (this.registry.providers.has(id)) throw new Error(`provider already registered: ${id}`);
    this.registry.providers.set(id, spec);
  }

  registerChannel(id: string, spec: unknown) {
    if (this.registry.channels.has(id)) throw new Error(`channel already registered: ${id}`);
    this.registry.channels.set(id, spec);
  }

  registerTool(name: string, spec: unknown) {
    if (this.registry.tools.has(name)) throw new Error(`tool already registered: ${name}`);
    this.registry.tools.set(name, spec);
  }

  registerHook(name: string, spec: unknown) {
    const hooks = this.registry.hooks.get(name) ?? [];
    hooks.push(spec);
    this.registry.hooks.set(name, hooks);
  }

  registerService(id: string, spec: unknown) {
    if (this.registry.services.has(id)) throw new Error(`service already registered: ${id}`);
    this.registry.services.set(id, spec);
  }

  registerCommand(id: string, spec: unknown) {
    if (this.registry.commands.has(id)) throw new Error(`command already registered: ${id}`);
    this.registry.commands.set(id, spec);
  }

  registerHttpRoute(id: string, spec: unknown) {
    if (this.registry.routes.has(id)) throw new Error(`route already registered: ${id}`);
    this.registry.routes.set(id, spec);
  }
}

/** Builds a PluginApi backed by a registrar; registrationMode is set on the api object. */
export function createPluginApiFromRegistry(
  registry: CapabilityRegistry,
  mode: RegistrationMode,
  config?: Record<string, unknown>
): PluginApi {
  const registrar = new CapabilityRegistrar(registry);
  return {
    registrationMode: mode,
    config,
    registerProvider: (spec) => {
      const s = spec as { id?: string; kind?: string };
      const id = s.id ?? `provider:${registry.providers.size}`;
      registrar.registerProvider(id, spec);
    },
    registerChannel: (spec) => {
      const s = spec as { id?: string };
      const id = s.id ?? `channel:${registry.channels.size}`;
      registrar.registerChannel(id, spec);
    },
    registerTool: (spec) => {
      const s = spec as { name?: string };
      const name = s.name ?? `tool:${registry.tools.size}`;
      registrar.registerTool(name, spec);
    },
    registerHook: (spec) => {
      const s = spec as { name?: string };
      const name = s.name ?? `hook:${registry.hooks.size}`;
      registrar.registerHook(name, spec);
    },
    registerService: (spec) => {
      const s = spec as { id?: string };
      const id = s.id ?? `service:${registry.services.size}`;
      registrar.registerService(id, spec);
    },
    registerCommand: (spec) => {
      const s = spec as { id?: string };
      const id = s.id ?? `command:${registry.commands.size}`;
      registrar.registerCommand(id, spec);
    },
    registerHttpRoute: (spec) => {
      const s = spec as { id?: string; path?: string };
      const id = s.id ?? s.path ?? `route:${registry.routes.size}`;
      registrar.registerHttpRoute(id, spec);
    },
  };
}
