"use strict";
/**
 * SkillRunner
 *
 * Internal skill registry and executor used by createAgent.
 * Manages skill registration, enable/disable, and execution with
 * proper SkillContext injection.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SkillRunner = void 0;
const crypto_1 = require("crypto");
class SkillRunner {
    constructor(deps) {
        this.skills = new Map();
        this.deps = deps;
    }
    register(skill) {
        if (this.skills.has(skill.manifest.id)) {
            throw new Error(`[SkillRunner] Duplicate skill id: "${skill.manifest.id}"`);
        }
        this.skills.set(skill.manifest.id, {
            manifest: { ...skill.manifest, enabled: true },
            execute: skill.execute,
        });
    }
    has(id) {
        return this.skills.has(id);
    }
    list() {
        return [...this.skills.values()].map((e) => ({ ...e.manifest }));
    }
    listEnabled() {
        return this.list().filter((m) => m.enabled);
    }
    setEnabled(id, enabled) {
        const entry = this.skills.get(id);
        if (!entry)
            throw new Error(`[SkillRunner] Unknown skill: "${id}"`);
        entry.manifest.enabled = enabled;
    }
    async execute(id, input, turnCtx) {
        const entry = this.skills.get(id);
        if (!entry)
            throw new Error(`[SkillRunner] Unknown skill: "${id}"`);
        if (!entry.manifest.enabled)
            throw new Error(`[SkillRunner] Skill "${id}" is disabled`);
        const ctx = {
            walletAddress: input.walletAddress ?? turnCtx?.walletAddress,
            requestId: turnCtx?.requestId ?? (0, crypto_1.randomUUID)(),
            memory: this.deps.memory,
            compute: this.deps.compute,
            storage: this.deps.storage,
            emit: (event, payload) => {
                if (process.env.CLAW_DEBUG) {
                    console.debug(`[claw:skill:${id}] ${event}`, payload ?? "");
                }
            },
        };
        return entry.execute(input, ctx);
    }
}
exports.SkillRunner = SkillRunner;
