"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentBus = void 0;
const utils_js_1 = require("./utils.js");
class AgentBus {
    constructor(deps) {
        this.queue = new Map();
        this.dedupe = new Map();
        this.events = [];
        this.statsState = {
            topics: 0,
            messages: 0,
            queued: 0,
            leased: 0,
            acked: 0,
            nacked: 0,
            deadLettered: 0,
            expired: 0,
            deduped: 0,
            byTopic: {},
            lastUpdatedAt: undefined,
        };
        this.storage = deps.storage;
        this.opts = {
            prefix: deps.options?.prefix ?? "agentbus",
            leaseMs: deps.options?.leaseMs ?? 30000,
            defaultMaxAttempts: deps.options?.defaultMaxAttempts ?? 5,
            deadLetterAfterAttempts: deps.options?.deadLetterAfterAttempts ?? 5,
            dedupeTtlMs: deps.options?.dedupeTtlMs ?? 1000 * 60 * 10,
            storageTtlMs: deps.options?.storageTtlMs ?? 1000 * 60 * 60 * 24 * 30,
        };
    }
    async init() {
        await this.syncFromStorage();
        this.recomputeStats();
    }
    async send(input) {
        const messageId = (0, utils_js_1.uuid)("msg");
        const createdAt = (0, utils_js_1.now)();
        const availableAt = input.availableAt ?? createdAt;
        const expiresAt = input.expiresAt ?? createdAt + this.opts.storageTtlMs;
        const dedupeKey = input.dedupeKey || this.computeDedupeKey(input);
        if (this.isDuplicate(dedupeKey)) {
            const existing = this.findByDedupeKey(dedupeKey);
            this.statsState.deduped++;
            this.logEvent("dedupe", existing?.id || messageId, { dedupeKey });
            return (existing || this.queue.get(messageId));
        }
        this.dedupe.set(dedupeKey, createdAt + this.opts.dedupeTtlMs);
        const envelope = {
            id: messageId,
            topic: input.topic,
            fromAgent: input.fromAgent,
            toAgent: input.toAgent,
            sessionId: input.sessionId,
            requestId: input.requestId,
            walletAddress: input.walletAddress,
            priority: input.priority ?? "normal",
            deliveryMode: input.deliveryMode ?? "at_least_once",
            status: "queued",
            createdAt,
            updatedAt: createdAt,
            availableAt,
            expiresAt,
            attempts: 0,
            maxAttempts: input.maxAttempts ?? this.opts.defaultMaxAttempts,
            correlationId: input.correlationId,
            replyTo: input.replyTo,
            dedupeKey,
            tags: (0, utils_js_1.normalizeTags)(input.tags || []),
            payload: input.payload,
            metadata: input.metadata || {},
        };
        this.queue.set(envelope.id, envelope);
        await this.persistEnvelope(envelope);
        this.recomputeStats();
        this.logEvent("send", envelope.id, {
            topic: envelope.topic,
            fromAgent: envelope.fromAgent,
            toAgent: envelope.toAgent,
            priority: envelope.priority,
        });
        return envelope;
    }
    async receive(options = {}) {
        const limit = options.limit ?? 10;
        const leaseMs = options.leaseMs ?? this.opts.leaseMs;
        const nowTs = (0, utils_js_1.now)();
        const eligible = this.filterEnvelopes({
            topic: options.topic,
            agent: options.agent,
            sessionId: options.sessionId,
            tags: options.tags,
            status: "queued",
            limit: 10000,
            offset: 0,
        })
            .filter((msg) => msg.availableAt <= nowTs)
            .sort((a, b) => this.priorityWeight(b.priority) - this.priorityWeight(a.priority) || a.createdAt - b.createdAt)
            .slice(0, limit);
        const leased = [];
        for (const msg of eligible) {
            const next = {
                ...msg,
                status: "leased",
                attempts: msg.attempts + 1,
                leaseUntil: nowTs + leaseMs,
                updatedAt: nowTs,
            };
            this.queue.set(next.id, next);
            await this.persistEnvelope(next);
            leased.push(next);
            this.logEvent("lease", next.id, { topic: next.topic, leaseUntil: next.leaseUntil, attempts: next.attempts });
        }
        this.recomputeStats();
        this.logEvent("receive", "batch", { count: leased.length });
        return leased;
    }
    async ack(input) {
        const msg = this.queue.get(input.id);
        if (!msg)
            return false;
        const next = { ...msg, status: "acked", updatedAt: (0, utils_js_1.now)(), leaseUntil: undefined };
        this.queue.set(next.id, next);
        await this.persistEnvelope(next);
        this.recomputeStats();
        this.logEvent("ack", next.id, { topic: input.topic || next.topic, agent: input.agent, metadata: input.metadata || {} });
        return true;
    }
    async nack(input) {
        const msg = this.queue.get(input.id);
        if (!msg)
            return false;
        const nextAttempts = msg.attempts + 1;
        const retryDelayMs = input.retryDelayMs ?? 5000;
        const overLimit = nextAttempts >= (msg.maxAttempts || this.opts.deadLetterAfterAttempts);
        const t = (0, utils_js_1.now)();
        const next = {
            ...msg,
            attempts: nextAttempts,
            updatedAt: t,
            leaseUntil: undefined,
            status: overLimit ? "dead_lettered" : "nacked",
            availableAt: overLimit ? t : t + retryDelayMs,
            metadata: { ...(msg.metadata || {}), lastNackReason: input.reason || "nack", ...(input.metadata || {}) },
        };
        this.queue.set(next.id, next);
        await this.persistEnvelope(next);
        this.recomputeStats();
        this.logEvent(overLimit ? "dead_letter" : "nack", next.id, {
            topic: input.topic || next.topic,
            agent: input.agent,
            reason: input.reason || "nack",
            retryDelayMs,
            attempts: nextAttempts,
            deadLettered: overLimit,
        });
        return true;
    }
    async list(options = {}) {
        return this.filterEnvelopes(options).sort((a, b) => b.createdAt - a.createdAt);
    }
    stats() {
        this.recomputeStats();
        return { ...this.statsState, byTopic: { ...this.statsState.byTopic } };
    }
    async syncFromStorage() {
        const items = await this.storage.list(`${this.opts.prefix}/messages/`);
        let loaded = 0;
        for (const item of items) {
            const msg = await this.storage.get(item.key);
            if (!msg)
                continue;
            this.queue.set(msg.id, msg);
            loaded++;
        }
        this.recomputeStats();
        this.logEvent("sync", "sync", { loaded });
        return loaded;
    }
    async snapshot() {
        return {
            version: "agentbus.v1",
            createdAt: (0, utils_js_1.now)(),
            updatedAt: (0, utils_js_1.now)(),
            messages: [...this.queue.values()].sort((a, b) => a.createdAt - b.createdAt),
            stats: this.stats(),
        };
    }
    filterEnvelopes(options) {
        const rows = [...this.queue.values()];
        const filtered = rows.filter((msg) => {
            if (options.topic && msg.topic !== options.topic)
                return false;
            if (options.agent && msg.toAgent !== options.agent && msg.fromAgent !== options.agent)
                return false;
            if (options.sessionId && msg.sessionId !== options.sessionId)
                return false;
            if (options.status && msg.status !== options.status)
                return false;
            if (options.tags?.length && !options.tags.every((tag) => msg.tags.includes(tag.toLowerCase())))
                return false;
            return true;
        });
        const offset = options.offset ?? 0;
        const limit = options.limit ?? 100;
        return filtered.sort((a, b) => b.createdAt - a.createdAt).slice(offset, offset + limit);
    }
    priorityWeight(priority) {
        switch (priority) {
            case "critical":
                return 4;
            case "high":
                return 3;
            case "normal":
                return 2;
            default:
                return 1;
        }
    }
    messageKey(id) {
        return `${this.opts.prefix}/messages/${id}.json`;
    }
    async persistEnvelope(msg) {
        await this.storage.put(this.messageKey(msg.id), msg, {
            contentType: "application/json",
            compress: true,
            encrypt: false,
            ttlMs: msg.expiresAt ? Math.max(0, msg.expiresAt - (0, utils_js_1.now)()) : this.opts.storageTtlMs,
            metadata: {
                kind: "agent_bus_message",
                topic: msg.topic,
                fromAgent: msg.fromAgent,
                toAgent: msg.toAgent || "",
                status: msg.status,
                sessionId: msg.sessionId,
                priority: msg.priority,
            },
        });
    }
    recomputeStats() {
        const messages = [...this.queue.values()];
        const byTopic = {};
        let queued = 0;
        let leased = 0;
        let acked = 0;
        let nacked = 0;
        let deadLettered = 0;
        let expired = 0;
        for (const msg of messages) {
            byTopic[msg.topic] = (byTopic[msg.topic] || 0) + 1;
            if (msg.status === "queued")
                queued++;
            else if (msg.status === "leased")
                leased++;
            else if (msg.status === "acked")
                acked++;
            else if (msg.status === "nacked")
                nacked++;
            else if (msg.status === "dead_lettered")
                deadLettered++;
            else if (msg.status === "expired")
                expired++;
        }
        this.statsState = {
            topics: Object.keys(byTopic).length,
            messages: messages.length,
            queued,
            leased,
            acked,
            nacked,
            deadLettered,
            expired,
            deduped: this.statsState.deduped,
            byTopic,
            lastUpdatedAt: (0, utils_js_1.now)(),
        };
    }
    computeDedupeKey(input) {
        return (0, utils_js_1.sha256)(JSON.stringify({
            topic: input.topic,
            fromAgent: input.fromAgent,
            toAgent: input.toAgent || "",
            sessionId: input.sessionId,
            requestId: input.requestId || "",
            payload: input.payload,
            tags: (0, utils_js_1.normalizeTags)(input.tags || []),
            correlationId: input.correlationId || "",
        }));
    }
    isDuplicate(dedupeKey) {
        const t = (0, utils_js_1.now)();
        const expiresAt = this.dedupe.get(dedupeKey);
        if (!expiresAt)
            return false;
        if (expiresAt <= t) {
            this.dedupe.delete(dedupeKey);
            return false;
        }
        return true;
    }
    findByDedupeKey(dedupeKey) {
        for (const msg of this.queue.values()) {
            if (msg.dedupeKey === dedupeKey)
                return msg;
        }
        return undefined;
    }
    logEvent(type, messageId, data) {
        this.events.push({ type, messageId, createdAt: (0, utils_js_1.now)(), data });
        if (this.events.length > 1000)
            this.events.splice(0, this.events.length - 1000);
    }
}
exports.AgentBus = AgentBus;
