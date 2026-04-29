import type { PluginRecord } from "./contracts.js";

export interface SecurityPolicy {
  allowWorkspacePlugins: boolean;
  allowUnknownPlugins: boolean;
  requireSignedManifests: boolean;
}

export function securityCheck(record: PluginRecord, policy: SecurityPolicy): string[] {
  const issues: string[] = [];

  if (!policy.allowWorkspacePlugins && record.manifest.workspaceOrigin) {
    issues.push(`workspace plugin blocked: ${record.manifest.id}`);
  }

  if (!policy.allowUnknownPlugins && record.status === "missing") {
    issues.push(`missing plugin blocked: ${record.manifest.id}`);
  }

  if (policy.requireSignedManifests && !record.manifest.signature) {
    issues.push(`unsigned manifest: ${record.manifest.id}`);
  }

  return issues;
}

export function attachSecurityDiagnostics(
  records: PluginRecord[],
  policy: SecurityPolicy
): PluginRecord[] {
  return records.map((record) => {
    const issues = securityCheck(record, policy);
    if (!issues.length) return record;
    const blocked = record.status === "enabled" || record.status === "disabled";
    return {
      ...record,
      status: blocked ? "blocked" : record.status,
      diagnostics: [...record.diagnostics, ...issues],
    };
  });
}
