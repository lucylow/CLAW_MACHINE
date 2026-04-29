/**
 * CLAW MACHINE structured errors (`ClawError`) and HTTP/runtime helpers.
 * Legacy `AppError` path: `normalizeAppError` / `toApiErrorResponse` from this barrel or `./appNormalize`.
 */
export * from "./AppError";
export {
  normalizeAppError,
  toApiErrorResponse,
  isRecoverableError,
  isRetryableError,
  isValidationError,
  isProviderError,
  isChainError,
  isStorageError,
  isSkillExecutionError,
} from "./appNormalize";
export * from "./boundary";
export * from "./codes";
export * from "./factory";
export * from "./guards";
export * from "./http";
export * from "./logging";
export * from "./metrics";
export * from "./normalize";
export * from "./panic";
export * from "./recovery";
export * from "./retry";
export * from "./shapes";
export * from "./validation";
