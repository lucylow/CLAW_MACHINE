/**
 * @claw/react
 *
 * React hooks and context provider for embedding @claw/core agents
 * into any React application.
 *
 * @example
 * ```tsx
 * import { AgentProvider, useAgent, useAgentStream, useWallet } from "@claw/react";
 * import { AgentBuilder } from "@claw/core";
 * import { zeroGPlugin } from "@claw/plugin-0g";
 *
 * // Create agent once (outside component or via useMemo)
 * const agentPromise = new AgentBuilder()
 *   .setName("MyAgent")
 *   .use(zeroGPlugin({ rpc: "https://evmrpc-testnet.0g.ai" }))
 *   .build();
 *
 * function App() {
 *   return (
 *     <AgentProvider agentPromise={agentPromise}>
 *       <ChatWidget />
 *     </AgentProvider>
 *   );
 * }
 *
 * function ChatWidget() {
 *   const { run, isRunning, lastResult } = useAgent();
 *   const wallet = useWallet();
 *   return (
 *     <div>
 *       <button onClick={() => run({ message: "Hello!", walletAddress: wallet.account })}>
 *         {isRunning ? "Thinking..." : "Send"}
 *       </button>
 *       {lastResult && <p>{lastResult.output}</p>}
 *     </div>
 *   );
 * }
 * ```
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import type {
  AgentInstance,
  AgentTurnInput,
  AgentTurnResult,
  SkillManifest,
  Plan,
  WalletAddress,
} from "../../core/src/types.js";

// ── AgentContext ──────────────────────────────────────────────────────────────

interface AgentContextValue {
  agent: AgentInstance | null;
  isReady: boolean;
  error: Error | null;
}

const AgentContext = createContext<AgentContextValue>({
  agent: null,
  isReady: false,
  error: null,
});

// ── AgentProvider ─────────────────────────────────────────────────────────────

interface AgentProviderProps {
  agentPromise: Promise<AgentInstance>;
  children: ReactNode;
}

export function AgentProvider({ agentPromise, children }: AgentProviderProps) {
  const [agent, setAgent] = useState<AgentInstance | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    agentPromise
      .then((a) => {
        if (!cancelled) { setAgent(a); setIsReady(true); }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err : new Error(String(err)));
      });
    return () => { cancelled = true; };
  }, [agentPromise]);

  return (
    <AgentContext.Provider value={{ agent, isReady, error }}>
      {children}
    </AgentContext.Provider>
  );
}

// ── useAgent ──────────────────────────────────────────────────────────────────

interface UseAgentReturn {
  run(input: AgentTurnInput): Promise<AgentTurnResult | null>;
  plan(goal: string, walletAddress?: WalletAddress): Promise<Plan | null>;
  isRunning: boolean;
  isReady: boolean;
  lastResult: AgentTurnResult | null;
  lastPlan: Plan | null;
  error: Error | null;
  skills: SkillManifest[];
  setSkillEnabled(id: string, enabled: boolean): void;
  clearError(): void;
}

export function useAgent(): UseAgentReturn {
  const { agent, isReady } = useContext(AgentContext);
  const [isRunning, setIsRunning] = useState(false);
  const [lastResult, setLastResult] = useState<AgentTurnResult | null>(null);
  const [lastPlan, setLastPlan] = useState<Plan | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [skills, setSkills] = useState<SkillManifest[]>([]);

  useEffect(() => {
    if (agent) setSkills(agent.listSkills());
  }, [agent]);

  const run = useCallback(async (input: AgentTurnInput): Promise<AgentTurnResult | null> => {
    if (!agent) return null;
    setIsRunning(true);
    setError(null);
    try {
      const result = await agent.run(input);
      setLastResult(result);
      return result;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      return null;
    } finally {
      setIsRunning(false);
    }
  }, [agent]);

  const plan = useCallback(async (goal: string, walletAddress?: WalletAddress): Promise<Plan | null> => {
    if (!agent) return null;
    setIsRunning(true);
    setError(null);
    try {
      const p = await agent.plan(goal, walletAddress);
      setLastPlan(p);
      return p;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      return null;
    } finally {
      setIsRunning(false);
    }
  }, [agent]);

  const setSkillEnabled = useCallback((id: string, enabled: boolean) => {
    agent?.setSkillEnabled(id, enabled);
    if (agent) setSkills(agent.listSkills());
  }, [agent]);

  return {
    run,
    plan,
    isRunning,
    isReady,
    lastResult,
    lastPlan,
    error,
    skills,
    setSkillEnabled,
    clearError: () => setError(null),
  };
}

// ── useAgentStream ────────────────────────────────────────────────────────────

interface StreamPhase {
  phase: string;
  label: string;
  icon: string;
}

const PHASE_MAP: Record<string, StreamPhase> = {
  "memory.retrieve":  { phase: "memory.retrieve",  label: "Retrieving memory",  icon: "🧠" },
  "skill.select":     { phase: "skill.select",      label: "Selecting skill",    icon: "⚙️" },
  "skill.execute":    { phase: "skill.execute",     label: "Executing skill",    icon: "🔧" },
  "llm.complete":     { phase: "llm.complete",      label: "Generating response",icon: "✨" },
  "reflection":       { phase: "reflection",        label: "Reflecting",         icon: "🔍" },
  "done":             { phase: "done",              label: "Done",               icon: "✅" },
  "error":            { phase: "error",             label: "Error",              icon: "❌" },
};

interface UseAgentStreamReturn {
  stream(message: string, walletAddress?: WalletAddress, onResult?: (result: AgentTurnResult) => void): Promise<void>;
  abort(): void;
  isStreaming: boolean;
  currentPhase: StreamPhase | null;
  streamError: string | null;
}

export function useAgentStream(backendUrl = "/api/agent/stream"): UseAgentStreamReturn {
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentPhase, setCurrentPhase] = useState<StreamPhase | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const stream = useCallback(async (
    message: string,
    walletAddress?: WalletAddress,
    onResult?: (result: AgentTurnResult) => void,
  ) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setIsStreaming(true);
    setStreamError(null);
    setCurrentPhase(PHASE_MAP["memory.retrieve"] ?? null);

    try {
      const resp = await fetch(backendUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "text/event-stream" },
        body: JSON.stringify({ message, walletAddress }),
        signal: ctrl.signal,
      });

      if (!resp.ok || !resp.body) {
        throw new Error(`Stream request failed: ${resp.status}`);
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let currentEvent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("event:")) {
            currentEvent = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            const data = line.slice(5).trim();
            if (!data || data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data);
              if (currentEvent === "phase" || parsed.phase) {
                const p = PHASE_MAP[parsed.phase ?? currentEvent];
                if (p) setCurrentPhase(p);
              } else if (currentEvent === "result" || parsed.output !== undefined) {
                setCurrentPhase(PHASE_MAP["done"] ?? null);
                onResult?.(parsed as AgentTurnResult);
              } else if (currentEvent === "error" || parsed.error) {
                setStreamError(parsed.error ?? "Unknown stream error");
                setCurrentPhase(PHASE_MAP["error"] ?? null);
              }
            } catch { /* ignore parse errors */ }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setStreamError((err as Error).message);
        setCurrentPhase(PHASE_MAP["error"] ?? null);
      }
    } finally {
      setIsStreaming(false);
    }
  }, [backendUrl]);

  const abort = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
    setCurrentPhase(null);
  }, []);

  return { stream, abort, isStreaming, currentPhase, streamError };
}

// ── useWallet ─────────────────────────────────────────────────────────────────

interface WalletState {
  account: WalletAddress | null;
  chainId: number | null;
  balance: string | null;
  isConnecting: boolean;
  isConnected: boolean;
  error: string | null;
  connect(): Promise<void>;
  disconnect(): void;
  switchTo0GTestnet(): Promise<void>;
}

const ZERO_G_CHAIN = {
  chainId: "0x40D8",  // 16600
  chainName: "0G Newton Testnet",
  nativeCurrency: { name: "0G", symbol: "OG", decimals: 18 },
  rpcUrls: ["https://evmrpc-testnet.0g.ai"],
  blockExplorerUrls: ["https://chainscan-newton.0g.ai"],
};

export function useWallet(): WalletState {
  const [account, setAccount] = useState<WalletAddress | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const provider = typeof window !== "undefined" ? (window as unknown as { ethereum?: unknown }).ethereum : null;

  const fetchBalance = useCallback(async (addr: string) => {
    if (!provider) return;
    try {
      const bal = await (provider as { request: (args: { method: string; params: unknown[] }) => Promise<string> }).request({
        method: "eth_getBalance",
        params: [addr, "latest"],
      });
      const eth = (parseInt(bal, 16) / 1e18).toFixed(4);
      setBalance(eth);
    } catch { /* non-fatal */ }
  }, [provider]);

  const connect = useCallback(async () => {
    if (!provider) { setError("No wallet detected. Install MetaMask."); return; }
    setIsConnecting(true);
    setError(null);
    try {
      const eth = provider as { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };
      const accounts = await eth.request({ method: "eth_requestAccounts" }) as string[];
      const addr = accounts[0] as WalletAddress;
      const cid = await eth.request({ method: "eth_chainId" }) as string;
      setAccount(addr);
      setChainId(parseInt(cid, 16));
      await fetchBalance(addr);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsConnecting(false);
    }
  }, [provider, fetchBalance]);

  const disconnect = useCallback(() => {
    setAccount(null);
    setChainId(null);
    setBalance(null);
  }, []);

  const switchTo0GTestnet = useCallback(async () => {
    if (!provider) return;
    const eth = provider as { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };
    try {
      await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: ZERO_G_CHAIN.chainId }] });
    } catch {
      await eth.request({ method: "wallet_addEthereumChain", params: [ZERO_G_CHAIN] });
    }
  }, [provider]);

  useEffect(() => {
    if (!provider) return;
    const eth = provider as {
      on: (event: string, handler: (...args: unknown[]) => void) => void;
      removeListener: (event: string, handler: (...args: unknown[]) => void) => void;
    };
    const onAccounts = (accounts: unknown) => {
      const arr = accounts as string[];
      if (arr.length === 0) { disconnect(); return; }
      setAccount(arr[0] as WalletAddress);
      fetchBalance(arr[0]);
    };
    const onChain = (cid: unknown) => setChainId(parseInt(cid as string, 16));
    eth.on("accountsChanged", onAccounts);
    eth.on("chainChanged", onChain);
    return () => {
      eth.removeListener("accountsChanged", onAccounts);
      eth.removeListener("chainChanged", onChain);
    };
  }, [provider, disconnect, fetchBalance]);

  return {
    account,
    chainId,
    balance,
    isConnecting,
    isConnected: !!account,
    error,
    connect,
    disconnect,
    switchTo0GTestnet,
  };
}

// ── Re-export types ───────────────────────────────────────────────────────────
export type { AgentTurnInput, AgentTurnResult, SkillManifest, Plan, WalletAddress };
