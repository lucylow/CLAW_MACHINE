import crypto from "crypto";
import type {
  AgentRuntimeLike,
  FrameworkContext,
  FrameworkMiddleware,
  FrameworkPlugin,
  PluginManifest,
} from "./types.js";

export interface PluginDefinition extends Omit<FrameworkPlugin, "manifest"> {
  manifest: PluginManifest;
}

export function definePlugin(plugin: PluginDefinition): FrameworkPlugin {
  return {
    ...plugin,
    manifest: {
      ...plugin.manifest,
      id: plugin.manifest.id.trim(),
      name: plugin.manifest.name.trim(),
      version: plugin.manifest.version.trim(),
      capabilities: plugin.manifest.capabilities ?? [],
      tags: plugin.manifest.tags ?? [],
    },
  };
}

export function pluginFingerprint(plugin: FrameworkPlugin): string {
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        manifest: plugin.manifest,
        middlewareCount: plugin.middleware?.length ?? 0,
      })
    )
    .digest("hex");
}

export async function installPlugin(
  runtime: AgentRuntimeLike,
  plugin: FrameworkPlugin,
  ctx: FrameworkContext
): Promise<void> {
  runtime.plugins = runtime.plugins ?? [];
  runtime.plugins.push(plugin);
  if (plugin.setup) await plugin.setup(runtime, ctx);
}

export async function uninstallPlugin(
  runtime: AgentRuntimeLike,
  plugin: FrameworkPlugin,
  ctx: FrameworkContext
): Promise<void> {
  if (plugin.teardown) await plugin.teardown(runtime, ctx);
  if (runtime.plugins) runtime.plugins = runtime.plugins.filter((p) => p !== plugin);
}

export async function runMiddleware(
  middleware: FrameworkMiddleware[] | undefined,
  phase: Parameters<FrameworkMiddleware>[0],
  args: Parameters<FrameworkMiddleware>[1]
): Promise<void> {
  if (!middleware?.length) return;
  for (const fn of middleware) {
    await Promise.resolve(fn(phase, args));
  }
}
