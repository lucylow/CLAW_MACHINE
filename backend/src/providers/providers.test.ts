import { ComputeProvider } from "./ComputeProvider";
import { StorageProvider } from "./StorageProvider";
import { ValidationError } from "../errors/AppError";

describe("StorageProvider", () => {
  test("upload/download round trip keeps integrity", async () => {
    const storage = new StorageProvider("memory://test");
    const payload = Buffer.from(JSON.stringify({ hello: "world" }));
    const hash = await storage.upload(payload);
    const downloaded = await storage.download(hash);
    expect(downloaded.toString()).toBe(payload.toString());
  });

  test("rejects invalid hash format", async () => {
    const storage = new StorageProvider("memory://test");
    await expect(storage.download("bad-hash")).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("ComputeProvider", () => {
  test("returns structured inference response", async () => {
    const compute = new ComputeProvider(null, "mock");
    const res = await compute.infer("hello");
    expect(res.content).toContain("Fallback mock mode");
    expect(res.chatID).toBeTruthy();
  });

  test("rejects empty prompt", async () => {
    const compute = new ComputeProvider(null, "mock");
    await expect(compute.infer("")).rejects.toBeInstanceOf(ValidationError);
  });
});
