import { z } from "zod";
import type { PluginManifest, PluginRecord } from "./contracts.js";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/** Zod schema for OpenClaw-oriented manifests (extends native/bundle transport kind). */
export const OpenClawPluginManifestSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    kind: z.enum(["native", "bundle"]),
    entry: z.string().optional(),
    version: z.string().optional(),
    enabledByDefault: z.boolean().optional(),
    capabilities: z.array(z.string()).optional(),
    hooks: z.array(z.string()).optional(),
    commands: z.array(z.string()).optional(),
    tools: z.array(z.string()).optional(),
    routes: z.array(z.string()).optional(),
    surfaceKind: z.enum(["memory", "tool", "channel"]).optional(),
    manifestPath: z.string().optional(),
    workspaceOrigin: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.kind === "native" && !data.entry) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Native plugins require an entry file",
      });
    }
  });

export type ParsedOpenClawManifest = z.infer<typeof OpenClawPluginManifestSchema>;

export function validatePluginManifest(manifest: unknown) {
  return OpenClawPluginManifestSchema.safeParse(manifest);
}

export class PluginValidator {
  validate(manifest: PluginManifest): ValidationResult {
    const parsed = validatePluginManifest(manifest);
    if (!parsed.success) {
      const errors = parsed.error.issues.map((e) => e.message);
      return { valid: false, errors };
    }
    const errors: string[] = [];
    if (!manifest.manifestPath) errors.push("Missing manifest path");
    return { valid: errors.length === 0, errors };
  }

  attachValidation(record: PluginRecord): PluginRecord {
    const result = this.validate(record.manifest);
    if (!result.valid) {
      return {
        ...record,
        status: "invalid",
        diagnostics: [...record.diagnostics, ...result.errors],
      };
    }
    return record;
  }
}
