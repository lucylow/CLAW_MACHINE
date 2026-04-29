import { AppError } from "./AppError";

/** Legacy normalization to `AppError` for existing Express routes and agent runtime. */
export function normalizeAppError(
  input: unknown,
  context: {
    code?: string;
    category?: AppError["category"];
    operation?: string;
    statusCode?: number;
    details?: Record<string, unknown>;
    retryable?: boolean;
  } = {},
): AppError {
  if (input instanceof AppError) return input;
  if (input instanceof Error) {
    return new AppError({
      code: context.code ?? "INTERNAL_001_UNEXPECTED",
      message: input.message || "Unexpected error",
      category: context.category ?? "internal",
      statusCode: context.statusCode ?? 500,
      retryable: context.retryable ?? false,
      operation: context.operation,
      details: { ...(context.details || {}), name: input.name },
      cause: input,
    });
  }
  if (typeof input === "string") {
    return new AppError({
      code: context.code ?? "INTERNAL_001_UNEXPECTED",
      message: input,
      category: context.category ?? "internal",
      statusCode: context.statusCode ?? 500,
      retryable: context.retryable ?? false,
      operation: context.operation,
      details: context.details ?? {},
      cause: input,
    });
  }
  return new AppError({
    code: context.code ?? "INTERNAL_001_UNEXPECTED",
    message: "Unknown error payload",
    category: context.category ?? "internal",
    statusCode: context.statusCode ?? 500,
    retryable: context.retryable ?? false,
    operation: context.operation,
    details: { ...(context.details || {}), inputType: typeof input },
    cause: input,
  });
}

export function toApiErrorResponse(error: AppError, requestId?: string) {
  return {
    ok: false as const,
    error: {
      code: error.code,
      message: error.message,
      category: error.category,
      recoverable: error.recoverable,
      retryable: error.retryable,
      requestId: requestId || error.requestId,
      details: {
        ...error.details,
        operation: error.operation,
        sessionId: error.sessionId,
        walletAddress: error.walletAddress,
        skillId: error.skillId,
      },
      timestamp: error.timestamp,
    },
  };
}

export const isRecoverableError = (error: unknown): boolean => (error instanceof AppError ? error.recoverable : false);
export const isRetryableError = (error: unknown): boolean => (error instanceof AppError ? error.retryable : false);
export const isValidationError = (error: unknown): boolean =>
  error instanceof AppError ? error.category === "validation" : false;
export const isProviderError = (error: unknown): boolean =>
  error instanceof AppError ? ["storage", "compute", "chain", "external"].includes(error.category) : false;
export const isChainError = (error: unknown): boolean => (error instanceof AppError ? error.category === "chain" : false);
export const isStorageError = (error: unknown): boolean => (error instanceof AppError ? error.category === "storage" : false);
export const isSkillExecutionError = (error: unknown): boolean =>
  error instanceof AppError ? error.code === "SKILL_002_EXECUTION_FAILED" : false;
