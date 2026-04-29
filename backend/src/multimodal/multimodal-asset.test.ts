import { MultimodalAssetNormalizer } from "./multimodal-reasoning";

const limits = {
  maxImageSizeBytes: 1024,
  maxAudioSizeBytes: 1024,
  maxAudioDurationMs: 60_000,
};

describe("MultimodalAssetNormalizer", () => {
  it("rejects mismatched image mime", () => {
    expect(() =>
      MultimodalAssetNormalizer.normalize(
        { kind: "image", filename: "x.png", mimeType: "audio/wav", buffer: Buffer.from("a") },
        limits,
      ),
    ).toThrow();
  });

  it("rejects oversized image", () => {
    expect(() =>
      MultimodalAssetNormalizer.normalize(
        { kind: "image", filename: "x.png", mimeType: "image/png", buffer: Buffer.alloc(2000) },
        limits,
      ),
    ).toThrow();
  });

  it("creates sha256 for normalized image", () => {
    const buf = Buffer.from("hello");
    const { asset, warnings } = MultimodalAssetNormalizer.normalize(
      { kind: "image", filename: "x.png", mimeType: "image/png", buffer: buf },
      limits,
    );
    expect(asset.sha256).toHaveLength(64);
    expect(asset.sizeBytes).toBe(5);
    expect(warnings.length).toBeGreaterThan(0);
  });
});
