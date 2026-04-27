import { ProviderRegistry } from "./provider-registry";
import { MockLlmAdapter } from "../adapters/mock/mock-llm.adapter";
import type { MemoryStorageProvider } from "../providers/storage/types";

describe("ProviderRegistry", () => {
  test("registers and lists providers", () => {
    const registry = new ProviderRegistry();
    const llm = new MockLlmAdapter();

    registry.registerLlm(llm);
    expect(registry.listLlm()).toContain("mock-llm");
    expect(registry.getLlm("mock-llm")).toBe(llm);
  });

  test("throws when provider is missing", () => {
    const registry = new ProviderRegistry();
    expect(() => registry.getLlm("missing")).toThrow("LLM provider not found");
  });

  test("storage registration accepts provider shape", () => {
    const registry = new ProviderRegistry();
    const fake = {
      name: "fake-storage",
      saveRecord: jest.fn(),
      getRecord: jest.fn(),
      listRecords: jest.fn(),
      appendLog: jest.fn(),
      getLog: jest.fn(),
    } as unknown as MemoryStorageProvider;

    registry.registerStorage(fake);
    expect(registry.listStorage()).toEqual(["fake-storage"]);
  });
});
