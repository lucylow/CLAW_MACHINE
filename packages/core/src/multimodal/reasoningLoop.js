"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MultimodalReasoningLoop = void 0;
const computePrompts_js_1 = require("./computePrompts.js");
const preprocess_js_1 = require("./preprocess.js");
const utils_js_1 = require("./utils.js");
class MultimodalReasoningLoop {
    constructor(deps) {
        this.compute = deps.compute;
        this.storage = deps.storage;
        this.bus = deps.bus;
        this.preprocessor = new preprocess_js_1.MultimodalPreprocessor({
            compute: deps.compute,
            options: {
                allowMockFallback: deps.options?.allowMockFallback ?? true,
                maxAssets: deps.options?.maxAssets ?? 12,
                imageDetailLevel: deps.options?.imageDetailLevel ?? "medium",
                audioDetailLevel: deps.options?.audioDetailLevel ?? "medium",
            },
        });
    }
    async run(input) {
        const requestId = input.requestId || (0, utils_js_1.uuid)("req");
        const multimodal = await this.preprocessor.process({ ...input, requestId });
        const ctx = await this.preprocessor.createReasoningContext({ ...input, requestId });
        const prompt = (0, computePrompts_js_1.buildReasoningPrompt)(ctx);
        const answer = await this.compute.generate(prompt, {
            temperature: 0.2,
            maxTokens: 900,
            json: false,
            systemPrompt: [
                "You are CLAW MACHINE.",
                "Use multimodal grounding and memory when reasoning.",
                "Be concise and actionable.",
            ].join("\n"),
            modelHint: "multimodal-reasoning",
        });
        const reflection = await this.maybeGenerateReflection({
            sessionId: input.sessionId,
            walletAddress: input.walletAddress,
            requestId,
            userText: input.userText || "",
            multimodal,
            answerText: answer.text,
            context: input.context || {},
        });
        const warnings = [...multimodal.warnings];
        let busMessages;
        if (this.bus) {
            busMessages = await this.broadcastReasoningArtifacts({
                sessionId: input.sessionId,
                walletAddress: input.walletAddress,
                requestId,
                multimodal,
                answer: answer.text,
                reflection,
            });
        }
        return {
            ok: true,
            sessionId: input.sessionId,
            requestId,
            answer: answer.text,
            reflection,
            multimodal,
            busMessages,
            warnings,
        };
    }
    async maybeGenerateReflection(input) {
        const hasErrorSignals = input.multimodal.warnings.length > 0 ||
            /error|failed|exception|invalid|timeout|broken/i.test(input.userText) ||
            /error|failed|exception|invalid|timeout|broken/i.test(input.answerText);
        if (!hasErrorSignals && input.multimodal.confidence > 0.65)
            return undefined;
        const prompt = [
            "Generate a compact reflection for the multimodal reasoning run.",
            "Return JSON with: rootCause, mistakeSummary, correctiveAdvice, severity, confidence, nextBestAction, tags, relatedMemoryIds, summary, details.",
            `Session: ${input.sessionId}`,
            `Request: ${input.requestId}`,
            input.walletAddress ? `Wallet: ${input.walletAddress}` : "",
            `User text: ${input.userText}`,
            `Answer: ${input.answerText}`,
            `Descriptions: ${input.multimodal.descriptions.join(" | ")}`,
            `Warnings: ${input.multimodal.warnings.join(", ")}`,
            `Context: ${JSON.stringify(input.context || {})}`,
        ].join("\n");
        const result = await this.compute.generate(prompt, {
            temperature: 0.12,
            maxTokens: 520,
            json: true,
            modelHint: "multimodal-reflection",
            systemPrompt: "Return only JSON.",
        });
        const parsed = (0, utils_js_1.safeJsonParse)(result.text, {});
        const reflection = normalizeReflection(parsed, {
            sessionId: input.sessionId,
            walletAddress: input.walletAddress,
            requestId: input.requestId,
            userText: input.userText,
            answerText: input.answerText,
            descriptions: input.multimodal.descriptions,
            warnings: input.multimodal.warnings,
        });
        await this.persistReflection(input.sessionId, input.walletAddress, reflection);
        return reflection;
    }
    async persistReflection(sessionId, walletAddress, reflection) {
        await this.storage.put(`multimodal/reflections/${sessionId}/${Date.now()}.json`, reflection, {
            contentType: "application/json",
            compress: true,
            encrypt: false,
            ttlMs: 1000 * 60 * 60 * 24 * 180,
            metadata: { kind: "multimodal_reflection", sessionId, walletAddress: walletAddress || "" },
        });
    }
    async broadcastReasoningArtifacts(input) {
        if (!this.bus)
            return [];
        const messages = [];
        const payloadBase = {
            sessionId: input.sessionId,
            requestId: input.requestId,
            walletAddress: input.walletAddress,
            summary: input.multimodal.summary,
            descriptions: input.multimodal.descriptions,
            answer: input.answer,
            reflection: input.reflection || null,
        };
        if (input.multimodal.artifacts.length) {
            const msg = await this.bus.send({
                topic: "multimodal.artifact",
                fromAgent: "multimodal.reasoning",
                toAgent: "memory",
                sessionId: input.sessionId,
                requestId: input.requestId,
                walletAddress: input.walletAddress,
                priority: "normal",
                deliveryMode: "at_least_once",
                tags: ["multimodal", "artifact"],
                payload: { ...payloadBase, artifacts: input.multimodal.artifacts },
            });
            messages.push(msg);
        }
        const msg2 = await this.bus.send({
            topic: "multimodal.reasoning.complete",
            fromAgent: "multimodal.reasoning",
            toAgent: "agent.coordinator",
            sessionId: input.sessionId,
            requestId: input.requestId,
            walletAddress: input.walletAddress,
            priority: "high",
            deliveryMode: "at_least_once",
            tags: ["multimodal", "reasoning"],
            payload: payloadBase,
        });
        messages.push(msg2);
        return messages;
    }
}
exports.MultimodalReasoningLoop = MultimodalReasoningLoop;
function normalizeReflection(parsed, fallback) {
    return {
        sessionId: fallback.sessionId,
        walletAddress: fallback.walletAddress,
        sourceTurnId: fallback.requestId,
        taskType: "multimodal_reasoning",
        outcome: fallback.warnings.length ? "partial" : "success",
        rootCause: stringOrFallback(parsed.rootCause, "The multimodal pipeline did not have enough grounding."),
        mistakeSummary: stringOrFallback(parsed.mistakeSummary, "The run needs a more focused visual or audio description."),
        correctiveAdvice: stringOrFallback(parsed.correctiveAdvice, "Tighten preprocessing, extract clearer descriptions, and retry."),
        confidence: numberOrFallback(parsed.confidence, fallback.warnings.length ? 0.72 : 0.84),
        severity: stringOrFallback(parsed.severity, fallback.warnings.length ? "medium" : "low"),
        tags: Array.isArray(parsed.tags) ? parsed.tags.map(String) : ["multimodal", "reflection"],
        relatedMemoryIds: Array.isArray(parsed.relatedMemoryIds) ? parsed.relatedMemoryIds.map(String) : [],
        nextBestAction: stringOrFallback(parsed.nextBestAction, "Repeat preprocessing with stronger grounding."),
        summary: stringOrFallback(parsed.summary, "Multimodal reasoning reflection recorded."),
        details: stringOrFallback(parsed.details, `Descriptions: ${fallback.descriptions.join(" | ")}; Answer: ${fallback.answerText}`),
    };
}
function stringOrFallback(value, fallback) {
    return typeof value === "string" && value.trim() ? value.trim() : fallback;
}
function numberOrFallback(value, fallback) {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
