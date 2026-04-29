import type { FrameworkKernel } from "./kernel";
import type { HttpLikeRequest, RateLimitPolicy, RequestContext } from "./types";
import { buildContextFromHeaders } from "./context";
import { FrameworkError } from "./errors";

export function createRequestGuards(kernel: FrameworkKernel) {
  return {
    async requireApiKey(req: HttpLikeRequest): Promise<void> {
      const key = String(req.headers["x-api-key"] ?? "");
      if (!key || !kernel.config.security.adminApiKeys.includes(key)) {
        throw new FrameworkError({
          category: "auth",
          code: "UNAUTHORIZED",
          message: "Invalid API key",
          retryable: false,
          statusCode: 401,
        });
      }
    },

    async requireRateLimit(req: HttpLikeRequest, policy: RateLimitPolicy): Promise<void> {
      const identifier = req.ip ?? String(req.headers["x-forwarded-for"] ?? "unknown");
      await kernel.withRateLimit(identifier, policy, async () => undefined);
    },

    async createContext(req: HttpLikeRequest, patch?: Partial<RequestContext>): Promise<RequestContext> {
      return kernel.createRequestContext({
        ...buildContextFromHeaders(req.headers),
        route: req.path,
        ...patch,
      });
    },
  };
}
