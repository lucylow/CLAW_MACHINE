/**
 * Integration tests for POST /api/agent/run and the reflection loop.
 *
 * Contract matches production (see server.ts): body uses `input` and optional
 * `walletAddress` (session key). Responses use `data.output`, `meta.degraded`, etc.
 */

import { ComputeProvider } from "../providers/ComputeProvider";
import type { InferenceResponse } from "../providers/ComputeProvider";
import { StorageProvider } from "../providers/StorageProvider";
import { StorageError } from "../errors/AppError";
import { createAgentRunTestApp, type AgentRunTestContext } from "../test/agentRunTestApp";
import { postJson } from "../test/httpRequest";
import type { AgentTurnResult, ReflectionRecord } from "../types/runtime";

type AgentRunSuccessBody = {
  ok: true;
  data: AgentTurnResult;
  meta: { degraded?: boolean; timestamp?: number };
};

type ApiErrorBody = {
  ok: false;
  error: {
    code: string;
    message: string;
    category: string;
    recoverable: boolean;
    retryable: boolean;
    requestId?: string;
    details?: Record<string, unknown>;
  };
};

class MockComputeProvider extends ComputeProvider {
  responseBehavior: "success" | "fail" = "success";
  lastInferPrompt: string | null = null;

  constructor() {
    super(null, "mock");
  }

  override async infer(prompt: string, model?: string): Promise<InferenceResponse> {
    this.lastInferPrompt = prompt;
    if (this.responseBehavior === "fail") {
      throw new Error("Compute provider unavailable");
    }
    const usesContext = prompt.includes("Recent Context") && !prompt.includes("No memory stored yet");
    const suffix = usesContext ? " I used prior context and memory." : "";
    const content = `Mock agent response for prompt tail.${suffix}`;
    return {
      content,
      model: model ?? "mock-model",
      usage: { promptTokens: 100, completionTokens: 50 },
      chatID: "mock-chat",
      providerAddress: "0x" + "0".repeat(40),
    };
  }
}

class FailingStorageProvider extends StorageProvider {
  constructor() {
    super("memory://failing");
  }
  override async upload(_data: Buffer): Promise<string> {
    throw new StorageError("upload failed", "STORAGE_001_UPLOAD_FAILED", { operation: "storage.upload" }, true);
  }
}

async function postAgentRun(app: AgentRunTestContext["app"], body: Record<string, unknown>) {
  return postJson(app, "/api/agent/run", body);
}

function expectValidSuccessShape(body: unknown): asserts body is AgentRunSuccessBody {
  expect(body).toBeTruthy();
  expect(typeof body).toBe("object");
  const b = body as AgentRunSuccessBody;
  expect(b.ok).toBe(true);
  expect(b.data).toBeDefined();
  expect(typeof b.data.output).toBe("string");
  expect(typeof b.data.turnId).toBe("string");
  expect(Array.isArray(b.data.memoryIds)).toBe(true);
  expect(Array.isArray(b.data.reflections)).toBe(true);
}

function expectValidErrorShape(body: unknown, code: string): asserts body is ApiErrorBody {
  expect(body).toBeTruthy();
  expect(typeof body).toBe("object");
  const b = body as ApiErrorBody;
  expect(b.ok).toBe(false);
  expect(b.error).toBeDefined();
  expect(b.error.code).toBe(code);
  expect(typeof b.error.message).toBe("string");
  expect(typeof b.error.category).toBe("string");
  expect(typeof b.error.recoverable).toBe("boolean");
  expect(typeof b.error.retryable).toBe("boolean");
}

/** Neutral phrasing — avoid skill-routing keywords (swap, wallet, price, …). */
const CHAT_INPUT = "Summarize this onchain workflow and remember it for next time.";

describe("POST /api/agent/run integration", () => {
  let ctx: AgentRunTestContext;
  let mockCompute: MockComputeProvider;

  beforeEach(() => {
    mockCompute = new MockComputeProvider();
    ctx = createAgentRunTestApp({ compute: mockCompute });
  });

  it("returns 400 when input is missing", async () => {
    const res = await postAgentRun(ctx.app, {});
    expect(res.status).toBe(400);
    expectValidErrorShape(res.body, "API_001_INVALID_REQUEST");
    expect(res.body.error.details).toMatchObject({ field: "input" });
  });

  it("returns 400 when input is whitespace only", async () => {
    const res = await postAgentRun(ctx.app, { input: "   " });
    expect(res.status).toBe(400);
    expectValidErrorShape(res.body, "API_001_INVALID_REQUEST");
  });

  it("happy path: conversation + reflection + artifact memories", async () => {
    const wallet = "0xsession_alpha";
    const res = await postAgentRun(ctx.app, {
      input: CHAT_INPUT,
      walletAddress: wallet,
    });

    expect(res.status).toBe(200);
    expectValidSuccessShape(res.body);
    expect(res.body.meta.degraded).toBe(false);
    expect(res.body.data.reflections.length).toBe(1);

    const memories = ctx.memory.listBySession(wallet);
    const types = memories.map((m) => m.type).sort();
    expect(types).toEqual(["artifact", "conversation_turn", "reflection"].sort());

    const typesSeen = new Set(memories.map((m) => m.type));
    expect(typesSeen.has("conversation_turn")).toBe(true);
    expect(typesSeen.has("reflection")).toBe(true);
  });

  it("hydrates compute prompt with prior session memory", async () => {
    const wallet = "0xsession_bravo";
    ctx.memory.store({
      type: "conversation_turn",
      sessionId: wallet,
      summary: "User asked about refund policy classification",
      content: { topic: "refund policy", note: "missing classification step" },
      tags: ["prior", "lesson"],
      importance: 0.85,
      storageRefs: [],
      chainRefs: [],
      reflectionRefs: [],
    });

    const res = await postAgentRun(ctx.app, {
      input: "What do I remember about refund policy mistakes?",
      walletAddress: wallet,
    });

    expect(res.status).toBe(200);
    expect(mockCompute.lastInferPrompt).toBeTruthy();
    expect(mockCompute.lastInferPrompt).toContain("refund");
    expect(res.body.data.output).toContain("I used prior context and memory");
  });

  it("compute failure: fallback output and degraded meta (still 200)", async () => {
    mockCompute.responseBehavior = "fail";
    const wallet = "0xfail_compute";
    const res = await postAgentRun(ctx.app, {
      input: "Run a task that will fail in compute.",
      walletAddress: wallet,
    });

    expect(res.status).toBe(200);
    expectValidSuccessShape(res.body);
    expect(res.body.meta.degraded).toBe(true);
    expect(res.body.data.output).toMatch(/execution issue/i);

    const ev = ctx.events.recent(20).map((e) => e.type);
    expect(ev).toContain("fallback.activated");
  });

  it("storage failure: turn completes but degraded", async () => {
    const bad = createAgentRunTestApp({ compute: mockCompute, storage: new FailingStorageProvider() });
    const wallet = "0xbad_storage";
    const res = await postAgentRun(bad.app, { input: CHAT_INPUT, walletAddress: wallet });
    expect(res.status).toBe(200);
    expect(res.body.meta.degraded).toBe(true);
  });

  it("emits lifecycle events in order on success", async () => {
    const wallet = "0xsession_events";
    await postAgentRun(ctx.app, { input: "Validate event lifecycle order.", walletAddress: wallet });

    const types = ctx.events.recent(25).map((e) => e.type);
    const started = types.indexOf("message.received");
    const hydrated = types.indexOf("memory.hydrated");
    const crStart = types.indexOf("compute.request.started");
    const crDone = types.indexOf("compute.request.completed");
    const refl = types.indexOf("reflection.generated");

    expect(started).toBeGreaterThanOrEqual(0);
    expect(hydrated).toBeGreaterThan(started);
    expect(crStart).toBeGreaterThan(hydrated);
    expect(crDone).toBeGreaterThan(crStart);
    expect(refl).toBeGreaterThan(crDone);
  });

  it("isolates sessions by walletAddress", async () => {
    const a = await postAgentRun(ctx.app, { input: "Session A turn.", walletAddress: "0xsessA" });
    const b = await postAgentRun(ctx.app, { input: "Session B turn.", walletAddress: "0xsessB" });
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(ctx.memory.listBySession("0xsessA").length).toBeGreaterThanOrEqual(3);
    expect(ctx.memory.listBySession("0xsessB").length).toBeGreaterThanOrEqual(3);
    expect(ctx.memory.listBySession("0xsessA").every((m) => m.sessionId === "0xsessA")).toBe(true);
    expect(ctx.memory.listBySession("0xsessB").every((m) => m.sessionId === "0xsessB")).toBe(true);
  });

  it("second turn in same session increases memory count", async () => {
    const wallet = "0xsession_repeat";
    await postAgentRun(ctx.app, { input: "First turn creates memory.", walletAddress: wallet });
    await postAgentRun(ctx.app, { input: "Second turn uses prior context.", walletAddress: wallet });
    expect(ctx.memory.listBySession(wallet).length).toBeGreaterThanOrEqual(6);
  });
});

describe("Reflection loop (integration)", () => {
  let ctx: AgentRunTestContext;
  let mockCompute: MockComputeProvider;

  beforeEach(() => {
    mockCompute = new MockComputeProvider();
    ctx = createAgentRunTestApp({ compute: mockCompute });
  });

  it("reflection record has learning fields", async () => {
    const res = await postAgentRun(ctx.app, {
      input: "Generate a reflection for the system to learn from.",
      walletAddress: "0xlearning",
    });
    expect(res.status).toBe(200);
    const r = res.body.data.reflections[0] as ReflectionRecord;
    expect(r.reflectionId).toBeTruthy();
    expect(r.sourceTurnId).toBe(res.body.data.turnId);
    expect(typeof r.rootCause).toBe("string");
    expect(typeof r.mistakeSummary).toBe("string");
    expect(typeof r.correctiveAdvice).toBe("string");
    expect(["low", "medium", "high"]).toContain(r.severity);
    expect(Array.isArray(r.tags)).toBe(true);
    expect(typeof r.createdAt).toBe("number");
  });

  it("persists reflection memory after conversation turn", async () => {
    const wallet = "0xordering";
    await postAgentRun(ctx.app, { input: "Confirm memory ordering.", walletAddress: wallet });
    const list = ctx.memory.listBySession(wallet);
    const conv = list.filter((m) => m.type === "conversation_turn");
    const refl = list.filter((m) => m.type === "reflection");
    expect(conv).toHaveLength(1);
    expect(refl).toHaveLength(1);
    expect(refl[0]!.createdAt).toBeGreaterThanOrEqual(conv[0]!.createdAt);
  });

  it("retrieves reflection lessons into the next compute prompt", async () => {
    const wallet = "0xprompt_check";
    ctx.memory.store({
      type: "reflection",
      sessionId: wallet,
      summary: "Always classify before acting",
      content: {
        rootCause: "Missing classification",
        correctiveAdvice: "Always classify before acting",
      },
      tags: ["failure", "lesson"],
      importance: 0.9,
      storageRefs: [],
      chainRefs: [],
      reflectionRefs: [],
    });

    const res = await postAgentRun(ctx.app, {
      input: "Classify the request before doing anything else.",
      walletAddress: wallet,
    });
    expect(res.status).toBe(200);
    expect(mockCompute.lastInferPrompt).toContain("classify");
  });
});
