export type ErrorCategory =
  | "validation"
  | "configuration"
  | "authentication"
  | "authorization"
  | "wallet"
  | "chain"
  | "storage"
  | "compute"
  | "agent"
  | "skill"
  | "reflection"
  | "memory"
  | "event"
  | "external"
  | "rate_limit"
  | "not_found"
  | "conflict"
  | "internal";

export interface AppErrorParams {
  code: string;
  message: string;
  statusCode?: number;
  category: ErrorCategory;
  recoverable?: boolean;
  retryable?: boolean;
  details?: Record<string, unknown>;
  cause?: unknown;
  operation?: string;
  requestId?: string;
  sessionId?: string;
  walletAddress?: string;
  skillId?: string;
}

export class AppError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly category: ErrorCategory;
  readonly recoverable: boolean;
  readonly retryable: boolean;
  readonly details: Record<string, unknown>;
  readonly operation?: string;
  readonly requestId?: string;
  readonly sessionId?: string;
  readonly walletAddress?: string;
  readonly skillId?: string;
  readonly timestamp: number;

  constructor(params: AppErrorParams) {
    super(params.message);
    this.name = "AppError";
    this.code = params.code;
    this.statusCode = params.statusCode ?? 500;
    this.category = params.category;
    this.recoverable = params.recoverable ?? this.statusCode < 500;
    this.retryable = params.retryable ?? false;
    this.details = params.details ?? {};
    this.operation = params.operation;
    this.requestId = params.requestId;
    this.sessionId = params.sessionId;
    this.walletAddress = params.walletAddress;
    this.skillId = params.skillId;
    this.timestamp = Date.now();
    if (params.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = params.cause;
    }
  }
}

export class ValidationError extends AppError {
  constructor(message: string, code = "API_001_INVALID_REQUEST", details: Record<string, unknown> = {}) {
    super({ code, message, statusCode: 400, category: "validation", recoverable: true, retryable: false, details });
    this.name = "ValidationError";
  }
}

export class ConfigurationError extends AppError {
  constructor(message: string, details: Record<string, unknown> = {}) {
    super({ code: "CFG_001_INVALID_ENV", message, statusCode: 500, category: "configuration", recoverable: false, retryable: false, details });
    this.name = "ConfigurationError";
  }
}

export class NotFoundError extends AppError {
  constructor(message: string, code = "API_404_NOT_FOUND", details: Record<string, unknown> = {}) {
    super({ code, message, statusCode: 404, category: "not_found", recoverable: true, details });
    this.name = "NotFoundError";
  }
}

export class StorageError extends AppError {
  constructor(message: string, code: string, details: Record<string, unknown> = {}, retryable = true) {
    super({ code, message, statusCode: 502, category: "storage", recoverable: true, retryable, details });
    this.name = "StorageError";
  }
}

export class StorageIntegrityError extends AppError {
  constructor(message: string, details: Record<string, unknown> = {}) {
    super({ code: "STORAGE_003_HASH_MISMATCH", message, statusCode: 502, category: "storage", recoverable: false, retryable: false, details });
    this.name = "StorageIntegrityError";
  }
}

export class ComputeError extends AppError {
  constructor(message: string, code: string, details: Record<string, unknown> = {}, retryable = true) {
    super({ code, message, statusCode: 502, category: "compute", recoverable: true, retryable, details });
    this.name = "ComputeError";
  }
}

export class SkillNotFoundError extends AppError {
  constructor(skillId: string) {
    super({
      code: "SKILL_001_NOT_FOUND",
      message: `Skill "${skillId}" not found`,
      statusCode: 404,
      category: "skill",
      recoverable: true,
      retryable: false,
      skillId,
    });
    this.name = "SkillNotFoundError";
  }
}

export class SkillExecutionError extends AppError {
  constructor(skillId: string, message: string, details: Record<string, unknown> = {}, cause?: unknown) {
    super({
      code: "SKILL_002_EXECUTION_FAILED",
      message,
      statusCode: 400,
      category: "skill",
      recoverable: true,
      retryable: false,
      skillId,
      details,
      cause,
    });
    this.name = "SkillExecutionError";
  }
}
