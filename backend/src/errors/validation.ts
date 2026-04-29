import { stableJson } from "./logging";
import { ClawError, type ErrorContext } from "./shapes";

export interface ValidationIssue {
  field: string;
  code: string;
  message: string;
  expected?: string;
  actual?: unknown;
}

/** Structured validation failure (`ClawError`); use `AppError.ValidationError` for legacy API routes. */
export class ClawValidationError extends ClawError {
  readonly issues: ValidationIssue[];

  constructor(issues: ValidationIssue[], context?: ErrorContext) {
    super({
      code: "VALIDATION_FAILED",
      message: "Validation failed.",
      category: "validation",
      statusCode: 400,
      retryable: false,
      context,
      details: { issues },
    });
    this.name = "ClawValidationError";
    this.issues = issues;
  }
}

export function assert(condition: unknown, issue: ValidationIssue, context?: ErrorContext): asserts condition {
  if (!condition) {
    throw new ClawValidationError([issue], context);
  }
}

export function validateRequired<T extends object>(value: T, fields: Array<keyof T & string>, context?: ErrorContext): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const field of fields) {
    const current = (value as Record<string, unknown>)[field];
    if (current === undefined || current === null || current === "") {
      issues.push({ field, code: "required", message: `${field} is required` });
    }
  }
  return issues;
}

export function validateType(
  field: string,
  actual: unknown,
  expected: "string" | "number" | "boolean" | "object" | "array",
  allowNull = false,
): ValidationIssue | null {
  if (allowNull && (actual === null || actual === undefined)) return null;
  const ok =
    (expected === "array" && Array.isArray(actual)) || (expected !== "array" && typeof actual === expected);
  if (ok) return null;
  return {
    field,
    code: "invalid_type",
    message: `${field} must be of type ${expected}`,
    expected,
    actual,
  };
}

export function validateString(
  field: string,
  value: unknown,
  opts?: { minLength?: number; maxLength?: number; pattern?: RegExp; allowEmpty?: boolean },
): ValidationIssue | null {
  if (typeof value !== "string") {
    return { field, code: "invalid_type", message: `${field} must be a string`, expected: "string", actual: value };
  }
  if (!opts?.allowEmpty && value.trim().length === 0) {
    return { field, code: "empty", message: `${field} cannot be empty`, actual: value };
  }
  if (opts?.minLength !== undefined && value.length < opts.minLength) {
    return {
      field,
      code: "too_short",
      message: `${field} must be at least ${opts.minLength} characters`,
      expected: String(opts.minLength),
      actual: value.length,
    };
  }
  if (opts?.maxLength !== undefined && value.length > opts.maxLength) {
    return {
      field,
      code: "too_long",
      message: `${field} must be at most ${opts.maxLength} characters`,
      expected: String(opts.maxLength),
      actual: value.length,
    };
  }
  if (opts?.pattern && !opts.pattern.test(value)) {
    return { field, code: "pattern_mismatch", message: `${field} has invalid format`, expected: String(opts.pattern), actual: value };
  }
  return null;
}

export function validateNumber(
  field: string,
  value: unknown,
  opts?: { min?: number; max?: number; integer?: boolean; allowNaN?: boolean },
): ValidationIssue | null {
  if (typeof value !== "number" || (!opts?.allowNaN && Number.isNaN(value))) {
    return { field, code: "invalid_type", message: `${field} must be a number`, expected: "number", actual: value };
  }
  if (opts?.integer && !Number.isInteger(value)) {
    return { field, code: "not_integer", message: `${field} must be an integer`, actual: value };
  }
  if (opts?.min !== undefined && value < opts.min) {
    return { field, code: "too_small", message: `${field} must be >= ${opts.min}`, expected: String(opts.min), actual: value };
  }
  if (opts?.max !== undefined && value > opts.max) {
    return { field, code: "too_large", message: `${field} must be <= ${opts.max}`, expected: String(opts.max), actual: value };
  }
  return null;
}

export function validateObject(
  value: unknown,
  rules: Array<(obj: Record<string, unknown>) => ValidationIssue[] | ValidationIssue | null>,
): ValidationIssue[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [{ field: "root", code: "invalid_type", message: "Expected object" }];
  }
  const obj = value as Record<string, unknown>;
  const issues: ValidationIssue[] = [];
  for (const rule of rules) {
    const result = rule(obj);
    if (Array.isArray(result)) issues.push(...(result.filter(Boolean) as ValidationIssue[]));
    else if (result) issues.push(result);
  }
  return issues;
}

export function throwIfValidationIssues(issues: ValidationIssue[], context?: ErrorContext): void {
  if (issues.length > 0) {
    throw new ClawValidationError(issues, context);
  }
}

export function validateAgentRunInput(input: Record<string, unknown>, context?: ErrorContext): void {
  const issues: ValidationIssue[] = [];
  const promptIssue = validateString("prompt", input.prompt, { minLength: 1, maxLength: 20_000 });
  if (promptIssue) issues.push(promptIssue);
  const sessionIssue = validateString("sessionId", input.sessionId, { minLength: 1, maxLength: 200 });
  if (sessionIssue) issues.push(sessionIssue);
  const modeIssue = validateString("mode", input.mode, { minLength: 1, maxLength: 100, allowEmpty: false });
  if (modeIssue) issues.push(modeIssue);
  throwIfValidationIssues(issues, context);
}

export function validateManifest(manifest: Record<string, unknown>, context?: ErrorContext): void {
  const issues: ValidationIssue[] = [];
  const nameIssue = validateString("name", manifest.name, { minLength: 1, maxLength: 200 });
  if (nameIssue) issues.push(nameIssue);
  const versionIssue = validateString("version", manifest.version, { minLength: 1, maxLength: 100 });
  if (versionIssue) issues.push(versionIssue);
  const nodesIssue = validateType("nodes", manifest.nodes, "array");
  if (nodesIssue) issues.push(nodesIssue);
  const edgesIssue = validateType("edges", manifest.edges, "array");
  if (edgesIssue) issues.push(edgesIssue);
  throwIfValidationIssues(issues, context);
}

export function safeJsonParse<T = unknown>(text: string, context?: ErrorContext): T {
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    throw new ClawError({
      code: "VALIDATION_FAILED",
      message: "Invalid JSON payload.",
      category: "validation",
      statusCode: 400,
      retryable: false,
      context,
      cause: error,
    });
  }
}

export function safeJsonStringify(value: unknown, context?: ErrorContext): string {
  try {
    return stableJson(value);
  } catch (error) {
    throw new ClawError({
      code: "INTERNAL_ERROR",
      message: "Failed to serialize response.",
      category: "internal",
      statusCode: 500,
      retryable: false,
      context,
      cause: error,
    });
  }
}
