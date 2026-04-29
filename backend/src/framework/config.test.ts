import { ConfigLoader, ConfigValidationError } from "./config";

describe("ConfigLoader", () => {
  it("parses env values and paths", () => {
    const config = ConfigLoader.parse({
      NODE_ENV: "test",
      APP_NAME: "Test App",
      APP_VERSION: "1.0.0",
      PORT: "3000",
      HOST: "127.0.0.1",
      BASE_URL: "http://127.0.0.1:3000",
      DATA_DIR: "/tmp/claw-data",
    });
    expect(config.appName).toBe("Test App");
    expect(config.port).toBe(3000);
    expect(config.paths.data).toContain("claw-data");
    expect(config.integrations.a2aQueueBackend).toBe("file");
  });

  it("validates port and URL", () => {
    const bad = ConfigLoader.parse({
      PORT: "99999",
      BASE_URL: "not-a-url",
      NODE_ENV: "development",
    });
    const issues = ConfigLoader.validate(bad);
    expect(issues.some((i) => i.field === "port")).toBe(true);
    expect(issues.some((i) => i.field === "baseUrl")).toBe(true);
  });

  it("requires storage namespace for 0g-storage queue backend", () => {
    const cfg = ConfigLoader.parse({
      A2A_QUEUE_BACKEND: "0g-storage",
      NODE_ENV: "development",
      BASE_URL: "http://localhost:3000",
    });
    const issues = ConfigLoader.validate(cfg);
    expect(issues.some((i) => i.field === "zeroG.storageNamespace")).toBe(true);
  });

  it("mergeEnvs overlays later keys", () => {
    const merged = ConfigLoader.mergeEnvs({ A: "1", B: "2" }, { B: "3" });
    expect(merged).toEqual({ A: "1", B: "3" });
  });
});

describe("ConfigValidationError", () => {
  it("exposes issues", () => {
    const err = new ConfigValidationError([{ field: "x", code: "y", message: "z" }]);
    expect(err.issues).toHaveLength(1);
    expect(err.name).toBe("ConfigValidationError");
  });
});
