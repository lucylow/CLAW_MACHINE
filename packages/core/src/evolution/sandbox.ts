import crypto from "crypto";
import vm from "vm";
import ts from "typescript";
import type { SkillDefinitionLike, SkillExecutionContextLike } from "./types.js";

export interface SandboxOptions {
  timeoutMs?: number;
  memoryLimitHint?: number;
  allowConsole?: boolean;
}

export interface SandboxLoadResult {
  skill: SkillDefinitionLike;
  exports: Record<string, unknown>;
  js: string;
  diagnostics: string[];
}

export interface SafeRuntimeGlobals {
  console: Console;
  Math: Math;
  Date: DateConstructor;
  JSON: JSON;
  String: StringConstructor;
  Number: NumberConstructor;
  Boolean: BooleanConstructor;
  Array: ArrayConstructor;
  Object: ObjectConstructor;
  RegExp: RegExpConstructor;
  Error: ErrorConstructor;
  URL: typeof URL;
  URLSearchParams: typeof URLSearchParams;
  setTimeout: typeof setTimeout;
  clearTimeout: typeof clearTimeout;
  Buffer: typeof Buffer;
  crypto: typeof crypto;
}

const FORBIDDEN_PATTERNS = [
  /\brequire\s*\(/g,
  /\bimport\s+.*from\s+["'][^"']+["']/g,
  /\bimport\s*\(/g,
  /\bprocess\./g,
  /\bchild_process\b/g,
  /\bfs\b/g,
  /\bnet\b/g,
  /\bhttp\b/g,
  /\bhttps\b/g,
  /\bdgram\b/g,
  /\bworker_threads\b/g,
  /\bvm\b/g,
  /\bglobalThis\b/g,
  /\bglobal\b/g,
  /\bmodule\s*\.\s*exports\s*=\s*require/g,
];

export function transpileSkillSource(source: string): { js: string; diagnostics: string[] } {
  const output = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
      sourceMap: false,
      strict: true,
      skipLibCheck: true,
    },
    reportDiagnostics: true,
  });

  const diagnostics =
    output.diagnostics?.map((d) => {
      const message = ts.flattenDiagnosticMessageText(d.messageText, "\n");
      const pos = d.file && d.start !== undefined ? d.file.getLineAndCharacterOfPosition(d.start) : undefined;
      return pos ? `${pos.line + 1}:${pos.character + 1} ${message}` : message;
    }) ?? [];

  return {
    js: output.outputText,
    diagnostics,
  };
}

export function detectForbiddenSource(source: string): string[] {
  const violations: string[] = [];
  for (const pattern of FORBIDDEN_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(source)) violations.push(pattern.toString());
  }
  return violations;
}

export function loadSkillFromSource(source: string, options: SandboxOptions = {}): SandboxLoadResult {
  const violations = detectForbiddenSource(source);
  if (violations.length) {
    throw new Error(`Generated skill source contains forbidden patterns: ${violations.join(", ")}`);
  }

  const { js, diagnostics } = transpileSkillSource(source);
  const sandbox = createSandbox(options);

  const script = new vm.Script(js, {
    filename: "generated-skill.js",
  });

  const context = vm.createContext(sandbox, {
    name: "skill-sandbox",
    codeGeneration: {
      strings: false,
      wasm: false,
    },
  });

  script.runInContext(context, {
    timeout: options.timeoutMs ?? 1500,
    displayErrors: true,
  });

  const mod = (context.module as { exports?: Record<string, unknown> } | undefined)?.exports ?? {};
  const exported = (mod.default as unknown) ?? (mod.skill as unknown) ?? mod;
  const skill = validateSkill(exported);

  return {
    skill,
    exports: mod,
    js,
    diagnostics,
  };
}

export function validateSkill(candidate: unknown): SkillDefinitionLike {
  if (!candidate || typeof candidate !== "object") {
    throw new Error("Generated source did not export a skill object");
  }

  const skill = candidate as SkillDefinitionLike;

  if (typeof skill.id !== "string" || !skill.id.trim()) throw new Error("Skill is missing a valid id");
  if (typeof skill.name !== "string" || !skill.name.trim()) throw new Error("Skill is missing a valid name");
  if (typeof skill.description !== "string" || !skill.description.trim()) throw new Error("Skill is missing a valid description");
  if (typeof skill.run !== "function") throw new Error("Skill is missing a run() function");
  if (skill.canHandle && typeof skill.canHandle !== "function") throw new Error("skill.canHandle must be a function if present");

  return {
    ...skill,
    id: skill.id.trim(),
    name: skill.name.trim(),
    description: skill.description.trim(),
    tags: Array.isArray(skill.tags) ? skill.tags.map((t) => String(t).trim().toLowerCase()).filter(Boolean) : [],
    kind: skill.kind ?? "general",
    version: skill.version ?? "1.0.0",
    enabled: skill.enabled !== false,
    source: skill.source ?? "evolved",
  };
}

export function createSandbox(options: SandboxOptions = {}): Record<string, unknown> {
  const consoleProxy: Console =
    options.allowConsole === false
      ? (new Proxy(console, {
          get(target, prop) {
            if (prop === "log" || prop === "info" || prop === "warn" || prop === "error" || prop === "debug") {
              return () => undefined;
            }
            return Reflect.get(target, prop);
          },
        }) as unknown as Console)
      : console;

  const safeGlobals: SafeRuntimeGlobals = {
    console: consoleProxy,
    Math,
    Date,
    JSON,
    String,
    Number,
    Boolean,
    Array,
    Object,
    RegExp,
    Error,
    URL,
    URLSearchParams,
    setTimeout,
    clearTimeout,
    Buffer,
    crypto,
  };

  const module = { exports: {} as Record<string, unknown> };
  const exports = module.exports;

  return {
    ...safeGlobals,
    module,
    exports,
    defineSkill: (skill: SkillDefinitionLike) => skill,
    makeSkill: (skill: SkillDefinitionLike) => skill,
    require: () => {
      throw new Error("require() is disabled inside the skill sandbox");
    },
    global: undefined,
    globalThis: undefined,
    process: undefined,
  };
}

export async function runSkillInSandbox(
  source: string,
  ctx: SkillExecutionContextLike,
  options: SandboxOptions = {}
): Promise<{
  skill: SkillDefinitionLike;
  js: string;
  diagnostics: string[];
  output: unknown;
}> {
  const loaded = loadSkillFromSource(source, options);
  const output = await loaded.skill.run(ctx);
  return {
    skill: loaded.skill,
    js: loaded.js,
    diagnostics: loaded.diagnostics,
    output,
  };
}

export function hashSkillSource(source: string): string {
  return crypto.createHash("sha256").update(source).digest("hex");
}

export function extractSkillMetadata(source: string): { id?: string; name?: string; description?: string } {
  const id = source.match(/id\s*:\s*["'`]([^"'`]+)["'`]/)?.[1];
  const name = source.match(/name\s*:\s*["'`]([^"'`]+)["'`]/)?.[1];
  const description = source.match(/description\s*:\s*["'`]([^"'`]+)["'`]/)?.[1];
  return { id, name, description };
}
