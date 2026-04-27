import { StorageProvider } from '../providers/StorageProvider';
import { ComputeProvider, InferenceResponse } from '../providers/ComputeProvider';
import { SkillManager } from './Skill';
import { EventEmitter } from '../utils/EventEmitter';

export interface AgentConfig {
    name: string;
    description: string;
    storageProvider: StorageProvider;
    computeProvider: ComputeProvider;
    skillManager: SkillManager;
    eventEmitter: EventEmitter;
}

export interface AgentState<T = any> {
    version: string;
    timestamp: number;
    data: T;
    metadata: Record<string, any>;
}

export abstract class Agent {
    protected readonly name: string;
    protected readonly description: string;
    protected readonly storage: StorageProvider;
    protected readonly compute: ComputeProvider;
    protected readonly skills: SkillManager;
    protected readonly events: EventEmitter;
    private static readonly STATE_VERSION = "1.1.0";

    constructor(config: AgentConfig) {
        this.name = config.name;
        this.description = config.description;
        this.storage = config.storageProvider;
        this.compute = config.computeProvider;
        this.skills = config.skillManager;
        this.events = config.eventEmitter;
    }

    abstract run(input: string): Promise<string>;

    /**
     * Standardized error handling wrapper for agent operations.
     */
    protected async handleError(operation: string, error: any): Promise<never> {
        const message = error instanceof Error ? error.message : String(error);
        const errorContext = { agent: this.name, operation, message, timestamp: Date.now() };
        await this.events.emit('error', errorContext);
        console.error(`[Agent:${this.name}] Error during ${operation}:`, message);
        throw new Error(`[${operation} Failed] ${message}`);
    }

    /**
     * Saves versioned agent state to decentralized storage.
     */
    async saveState<T>(data: T, metadata: Record<string, any> = {}): Promise<string> {
        try {
            const state: AgentState<T> = {
                version: Agent.STATE_VERSION,
                timestamp: Date.now(),
                data,
                metadata
            };
            const buffer = Buffer.from(JSON.stringify(state));
            const rootHash = await this.storage.upload(buffer);
            
            await this.events.emit('stateSaved', { agent: this.name, hash: rootHash, version: Agent.STATE_VERSION });
            return rootHash;
        } catch (error) {
            return this.handleError('saveState', error);
        }
    }

    /**
     * Loads and validates agent state from decentralized storage.
     */
    async loadState<T>(rootHash: string): Promise<AgentState<T>> {
        try {
            const buffer = await this.storage.download(rootHash);
            const state = JSON.parse(buffer.toString()) as AgentState<T>;
            
            if (state.version !== Agent.STATE_VERSION) {
                console.warn(`[Agent:${this.name}] State version mismatch: ${state.version} vs ${Agent.STATE_VERSION}`);
            }

            await this.events.emit('stateLoaded', { agent: this.name, hash: rootHash, state });
            return state;
        } catch (error) {
            return this.handleError('loadState', error);
        }
    }

    /**
     * Performs verifiable inference with retry logic.
     */
    protected async ask(prompt: string, options: { retries?: number } = {}): Promise<InferenceResponse> {
        const { retries = 2 } = options;
        let lastError: any;

        for (let i = 0; i <= retries; i++) {
            try {
                const response = await this.compute.infer(prompt);
                const isValid = await this.compute.verifyResponse(response);
                
                if (!isValid) throw new Error("Inference verification failed");
                return response;
            } catch (error) {
                lastError = error;
                if (i < retries) console.warn(`[Agent:${this.name}] Inference failed, retrying (${i + 1}/${retries})...`);
            }
        }
        return this.handleError('inference', lastError);
    }

    /**
     * Executes a skill with standardized lifecycle events.
     */
    protected async executeSkill(skillName: string, input: any): Promise<any> {
        const skill = this.skills.getSkill(skillName);
        if (!skill) return this.handleError('executeSkill', `Skill ${skillName} not found`);

        await this.events.emit('skillExecuting', { agent: this.name, skill: skillName, input });

        try {
            const result = await skill.execute(input);
            await this.events.emit('skillExecuted', { agent: this.name, skill: skillName, result });
            return result;
        } catch (error) {
            return this.handleError(`skill:${skillName}`, error);
        }
    }
}
