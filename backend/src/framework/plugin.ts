import type { FrameworkPlugin, ValidationIssue } from "./types";
import { nowIso } from "./util";

export function createPluginManifest(plugin: FrameworkPlugin): Record<string, unknown> {
  return {
    name: plugin.name,
    version: plugin.version,
    description: plugin.description ?? "",
    dependencies: plugin.dependencies ?? [],
    exportedAt: nowIso(),
  };
}

export function validatePluginDependencies(plugins: FrameworkPlugin[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const names = new Set(plugins.map((p) => p.name));
  for (const plugin of plugins) {
    for (const dep of plugin.dependencies ?? []) {
      if (!names.has(dep)) {
        issues.push({
          field: `plugins.${plugin.name}.dependencies`,
          code: "missing_dependency",
          message: `Plugin ${plugin.name} depends on ${dep}, which is not registered`,
          actual: dep,
        });
      }
    }
  }
  return issues;
}
