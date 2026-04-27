import { Agent, AgentConfig } from '../src/core/Agent';
import { UniswapSkill } from '../src/skills/UniswapSkill';

export class BasicAgent extends Agent {
    constructor(config: AgentConfig) {
        super(config);
        this.skills.registerSkill(new UniswapSkill());

        // Global Error Monitoring
        this.events.on('error', (err) => {
            console.error(`[Monitor] Critical Error in ${err.agent} during ${err.operation}: ${err.message}`);
        });

        this.events.on('stateSaved', (data) => {
            console.log(`[Monitor] State persistent at: ${data.hash} (v${data.version})`);
        });
    }

    async run(input: string): Promise<string> {
        console.log(`[${this.name}] Processing: "${input}"`);
        
        // 1. Domain-specific routing
        if (input.toLowerCase().includes("swap")) {
            const swapResult = await this.executeSkill("UniswapSwap", { 
                tokenIn: "ETH", 
                tokenOut: "USDC", 
                amount: 1 
            });
            return `Swap Success! TX: ${swapResult.transactionHash}`;
        }

        // 2. Verifiable Inference with automatic retries
        const response = await this.ask(input, { retries: 3 });
        
        // 3. Persistent Memory with Metadata
        await this.saveState({
            lastInput: input,
            lastOutput: response.content
        }, { 
            model: response.model,
            provider: response.providerAddress 
        });
        
        return response.content;
    }
}
