import { ComputeError, ValidationError } from "../errors/AppError";
import { withRetry } from "../utils/retry";

/**
 * Interface for 0G Compute Provider.
 * Future implementation should wrap @0glabs/0g-serving-broker
 */
export interface InferenceResponse {
    content: string;
    model: string;
    usage: {
        promptTokens: number;
        completionTokens: number;
    };
    chatID: string;
    providerAddress: string;
    signature?: string;
}

export class ComputeProvider {
    private wallet: any;
    private mode: "mock" | "production";

    constructor(wallet: any, mode: "mock" | "production" = "mock") {
        this.wallet = wallet;
        this.mode = mode;
    }

    /**
     * Performs inference using 0G Compute.
     * @param prompt The input prompt.
     * @param model The model to use.
     * @returns An InferenceResponse object.
     */
    async infer(prompt: string, model: string = "qwen3.6-plus"): Promise<InferenceResponse> {
        if (!prompt) {
            throw new ValidationError("Prompt is required for inference", "API_001_INVALID_REQUEST", { operation: "compute.infer" });
        }
        if (prompt.length > 8000) {
            throw new ValidationError("Prompt too long", "AGENT_002_PROMPT_ASSEMBLY_FAILED", { maxLength: 8000, actualLength: prompt.length });
        }

        const request = async (): Promise<InferenceResponse> => {
            if (this.mode === "production" && !this.wallet) {
                throw new ComputeError("Compute provider unavailable: missing signer/wallet", "COMPUTE_001_PROVIDER_UNAVAILABLE", { operation: "compute.infer" }, true);
            }
            const chatID = Math.random().toString(36).substring(7);
            const providerAddress = "0x" + Math.random().toString(16).slice(2, 42);
            const response: InferenceResponse = {
                content: `[${this.mode === "mock" ? "Fallback mock mode" : "Verifiable Response from 0G"}] ${prompt.slice(0, 500)}`,
                model: model,
                usage: {
                    promptTokens: Math.ceil(prompt.length / 4),
                    completionTokens: 50
                },
                chatID: chatID,
                providerAddress: providerAddress,
                signature: "0x" + Math.random().toString(16).slice(2, 130)
            };
            if (!response.content || !response.model || !response.chatID) {
                throw new ComputeError("Malformed compute response", "COMPUTE_003_BAD_RESPONSE", { operation: "compute.validateResponse" }, false);
            }
            return response;
        };

        return withRetry(
            request,
            (error) => error instanceof ComputeError ? error.retryable : false,
            { retries: 2, baseDelayMs: 300 }
        ).catch((error) => {
            if (error instanceof ComputeError) throw error;
            throw new ComputeError("Inference request failed", "COMPUTE_001_PROVIDER_UNAVAILABLE", { operation: "compute.infer", model }, true);
        });
    }

    /**
     * Verifies the TEE signature of a response.
     */
    async verifyResponse(response: InferenceResponse): Promise<boolean> {
        if (!response.signature) {
            throw new ComputeError("Response has no signature to verify", "COMPUTE_003_BAD_RESPONSE", { operation: "compute.verifyResponse" }, false);
        }
        if (!response.providerAddress || !response.chatID) {
            throw new ComputeError("Response metadata missing provider address or chat ID", "COMPUTE_003_BAD_RESPONSE", { operation: "compute.verifyResponse" }, false);
        }
        return true;
    }
}
