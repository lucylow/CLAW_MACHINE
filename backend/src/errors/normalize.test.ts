import { AppError, ValidationError } from "./AppError";
import { normalizeError, toApiErrorResponse } from "./normalize";

describe("normalizeError", () => {
  test("preserves AppError instance", () => {
    const err = new ValidationError("Bad request");
    const out = normalizeError(err);
    expect(out).toBe(err);
  });

  test("normalizes native Error", () => {
    const out = normalizeError(new Error("boom"), { code: "X_001", category: "internal" });
    expect(out).toBeInstanceOf(AppError);
    expect(out.code).toBe("X_001");
    expect(out.message).toBe("boom");
  });

  test("normalizes string throw", () => {
    const out = normalizeError("oops", { code: "X_002", category: "validation", statusCode: 400 });
    expect(out.code).toBe("X_002");
    expect(out.statusCode).toBe(400);
  });
});

describe("toApiErrorResponse", () => {
  test("returns stable response shape", () => {
    const err = new ValidationError("Invalid payload");
    const response = toApiErrorResponse(err, "req_123");
    expect(response.ok).toBe(false);
    expect(response.error.code).toBe("API_001_INVALID_REQUEST");
    expect(response.error.requestId).toBe("req_123");
  });
});
