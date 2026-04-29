export type ZeroGConfig = {
  kvEndpoint: string;
  logEndpoint: string;
  blobEndpoint: string;
  computeEndpoint: string;
  chainId: number;
};

export type TEEAttestation = {
  providerSignature: string;
  model: string;
  nonce: string;
  verified: boolean;
};

export type InferenceModel = "qwen3.6-plus" | "GLM-5-FP8" | "DeepSeek-V3.1";
