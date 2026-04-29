import { ZeroGStorage } from "./storage";
import { ZeroGCompute } from "./compute";
import { ZeroGChain } from "./chain";

export class ZeroGManager {
  storage = new ZeroGStorage();
  compute = new ZeroGCompute();
  chain = new ZeroGChain();

  async syncAgentSession(agentId: string, wallet: string, state: unknown) {
    await this.storage.putKV(wallet, `agent_state_${agentId}`, state);
    await this.storage.appendLog(agentId, { type: "STATE_SYNC", state });
  }
}

export const zeroG = new ZeroGManager();
