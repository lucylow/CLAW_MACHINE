export type ErrorCategory =
  | "validation"
  | "authentication"
  | "authorization"
  | "rate-limit"
  | "quota"
  | "timeout"
  | "network"
  | "storage"
  | "compute"
  | "chain"
  | "queue"
  | "memory"
  | "plugin"
  | "config"
  | "dependency"
  | "internal"
  | "panic"
  | "not-found"
  | "conflict"
  | "unavailable";

export interface ErrorSpec {
  code: string;
  category: ErrorCategory;
  defaultMessage: string;
  httpStatus: number;
  retryable: boolean;
  exposeDetails: boolean;
}

export const ERROR_SPECS: Record<string, ErrorSpec> = {
  BAD_REQUEST: {
    code: "BAD_REQUEST",
    category: "validation",
    defaultMessage: "The request is invalid.",
    httpStatus: 400,
    retryable: false,
    exposeDetails: true,
  },
  VALIDATION_FAILED: {
    code: "VALIDATION_FAILED",
    category: "validation",
    defaultMessage: "Validation failed.",
    httpStatus: 400,
    retryable: false,
    exposeDetails: true,
  },
  UNAUTHORIZED: {
    code: "UNAUTHORIZED",
    category: "authentication",
    defaultMessage: "Authentication required.",
    httpStatus: 401,
    retryable: false,
    exposeDetails: false,
  },
  FORBIDDEN: {
    code: "FORBIDDEN",
    category: "authorization",
    defaultMessage: "You are not allowed to perform this action.",
    httpStatus: 403,
    retryable: false,
    exposeDetails: false,
  },
  NOT_FOUND: {
    code: "NOT_FOUND",
    category: "not-found",
    defaultMessage: "Resource not found.",
    httpStatus: 404,
    retryable: false,
    exposeDetails: true,
  },
  CONFLICT: {
    code: "CONFLICT",
    category: "conflict",
    defaultMessage: "The request conflicts with current state.",
    httpStatus: 409,
    retryable: false,
    exposeDetails: true,
  },
  RATE_LIMITED: {
    code: "RATE_LIMITED",
    category: "rate-limit",
    defaultMessage: "Too many requests.",
    httpStatus: 429,
    retryable: true,
    exposeDetails: true,
  },
  QUOTA_EXCEEDED: {
    code: "QUOTA_EXCEEDED",
    category: "quota",
    defaultMessage: "Quota exceeded.",
    httpStatus: 429,
    retryable: false,
    exposeDetails: true,
  },
  REQUEST_TIMEOUT: {
    code: "REQUEST_TIMEOUT",
    category: "timeout",
    defaultMessage: "The request timed out.",
    httpStatus: 504,
    retryable: true,
    exposeDetails: true,
  },
  NETWORK_UNAVAILABLE: {
    code: "NETWORK_UNAVAILABLE",
    category: "network",
    defaultMessage: "A network dependency is unavailable.",
    httpStatus: 503,
    retryable: true,
    exposeDetails: true,
  },
  STORAGE_FAILURE: {
    code: "STORAGE_FAILURE",
    category: "storage",
    defaultMessage: "Storage operation failed.",
    httpStatus: 503,
    retryable: true,
    exposeDetails: true,
  },
  COMPUTE_FAILURE: {
    code: "COMPUTE_FAILURE",
    category: "compute",
    defaultMessage: "Compute operation failed.",
    httpStatus: 503,
    retryable: true,
    exposeDetails: true,
  },
  CHAIN_FAILURE: {
    code: "CHAIN_FAILURE",
    category: "chain",
    defaultMessage: "Blockchain operation failed.",
    httpStatus: 503,
    retryable: true,
    exposeDetails: true,
  },
  QUEUE_FAILURE: {
    code: "QUEUE_FAILURE",
    category: "queue",
    defaultMessage: "Queue operation failed.",
    httpStatus: 503,
    retryable: true,
    exposeDetails: true,
  },
  MEMORY_FAILURE: {
    code: "MEMORY_FAILURE",
    category: "memory",
    defaultMessage: "Memory operation failed.",
    httpStatus: 503,
    retryable: true,
    exposeDetails: true,
  },
  PLUGIN_FAILURE: {
    code: "PLUGIN_FAILURE",
    category: "plugin",
    defaultMessage: "A plugin failed.",
    httpStatus: 500,
    retryable: false,
    exposeDetails: true,
  },
  CONFIG_INVALID: {
    code: "CONFIG_INVALID",
    category: "config",
    defaultMessage: "Configuration is invalid.",
    httpStatus: 500,
    retryable: false,
    exposeDetails: true,
  },
  DEPENDENCY_FAILURE: {
    code: "DEPENDENCY_FAILURE",
    category: "dependency",
    defaultMessage: "A dependency failed.",
    httpStatus: 503,
    retryable: true,
    exposeDetails: true,
  },
  INTERNAL_ERROR: {
    code: "INTERNAL_ERROR",
    category: "internal",
    defaultMessage: "An unexpected error occurred.",
    httpStatus: 500,
    retryable: false,
    exposeDetails: false,
  },
  PANIC: {
    code: "PANIC",
    category: "panic",
    defaultMessage: "A fatal error occurred.",
    httpStatus: 500,
    retryable: false,
    exposeDetails: false,
  },
  SERVICE_UNAVAILABLE: {
    code: "SERVICE_UNAVAILABLE",
    category: "unavailable",
    defaultMessage: "The service is temporarily unavailable.",
    httpStatus: 503,
    retryable: true,
    exposeDetails: true,
  },
};

export type ErrorCode = keyof typeof ERROR_SPECS;
