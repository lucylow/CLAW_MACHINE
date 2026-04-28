/**
 * Lightweight request validation helpers.
 * Uses Zod schemas defined in src/schemas/.
 */
import type { Request, Response, NextFunction } from "express";
import { z, ZodSchema } from "zod";
import { ValidationError } from "../errors/AppError";

export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const issues = result.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
      throw new ValidationError(`Request body validation failed: ${issues}`, "API_001_INVALID_REQUEST", {
        issues: result.error.issues,
      });
    }
    req.body = result.data;
    next();
  };
}

export function validateQuery<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      const issues = result.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
      throw new ValidationError(`Query validation failed: ${issues}`, "API_001_INVALID_REQUEST", {
        issues: result.error.issues,
      });
    }
    (req as Request & { validatedQuery: T }).validatedQuery = result.data;
    next();
  };
}

// ── Common schemas ─────────────────────────────────────────────────────────

export const AgentRunSchema = z.object({
  input: z.string().min(1).max(2000),
  walletAddress: z.string().optional(),
  sessionId: z.string().optional(),
  skillHint: z.string().optional(),
});

export const WalletRegisterSchema = z.object({
  walletAddress: z.string().min(10).max(200),
  signature: z.string().min(1).max(500),
  message: z.string().min(1).max(500),
});

export const StorageUploadSchema = z.object({
  data: z.unknown(),
  metadata: z.record(z.unknown()).optional(),
});

export const MemorySearchSchema = z.object({
  sessionId: z.string().optional(),
  walletAddress: z.string().optional(),
  type: z.enum(["conversation_turn", "reflection", "artifact", "skill_result"]).optional(),
  tags: z.array(z.string()).optional(),
  query: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
