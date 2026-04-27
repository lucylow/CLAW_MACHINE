import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3001;

// ── Middleware ─────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-wallet-address'],
}));
app.use(express.json({ limit: '1mb' }));

// Request logger
app.use((req: Request, _res: Response, next: NextFunction) => {
  const wallet = req.headers['x-wallet-address'] || 'anonymous';
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} wallet=${wallet}`);
  next();
});

// ── In-memory state (replace with 0G Storage in production) ───────────────
const agentSessions: Map<string, { history: any[]; config: any }> = new Map();
const walletRegistry: Map<string, { registeredAt: number; signature: string }> = new Map();

function getSession(wallet: string) {
  if (!agentSessions.has(wallet)) {
    agentSessions.set(wallet, { history: [], config: { model: 'qwen3.6-plus', maxHistory: 50 } });
  }
  return agentSessions.get(wallet)!;
}

// ── Available skills registry ──────────────────────────────────────────────
const SKILLS = [
  { name: 'UniswapSwap',    description: 'Swap tokens via Uniswap V3',              enabled: true },
  { name: '0GStorage',      description: 'Store and retrieve data on 0G Storage',   enabled: true },
  { name: '0GCompute',      description: 'Run AI inference on 0G Compute Network',  enabled: true },
  { name: 'ENSLookup',      description: 'Resolve ENS names to wallet addresses',   enabled: true },
  { name: 'PriceOracle',    description: 'Fetch live token prices',                 enabled: true },
  { name: 'WalletAnalysis', description: 'Analyze wallet portfolio and history',    enabled: true },
];

// ── Agent logic (mock — replace with real 0G Compute calls) ───────────────
async function runAgentLogic(input: string, walletAddress?: string): Promise<{
  output: string;
  txHash?: string;
  skillUsed?: string;
}> {
  const lower = input.toLowerCase();

  if (walletAddress) {
    if (lower.includes('balance') || lower.includes('wallet')) {
      return {
        output: `Checking wallet ${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)} on 0G Testnet. Your balance query has been submitted to 0G Compute for verification. In production this fetches live on-chain data via the 0G RPC endpoint.`,
        skillUsed: 'WalletAnalysis',
      };
    }
  }

  if (lower.includes('swap') || lower.includes('uniswap')) {
    const mockTx = '0x' + Math.random().toString(16).slice(2, 66).padEnd(64, '0');
    return {
      output: `Uniswap swap initiated! The agent constructed and signed the swap transaction via 0G Compute sealed inference. Transaction submitted to the network.`,
      txHash: mockTx,
      skillUsed: 'UniswapSwap',
    };
  }

  if (lower.includes('store') || lower.includes('storage') || lower.includes('0g storage')) {
    const mockHash = '0x' + Math.random().toString(16).slice(2, 66).padEnd(64, '0');
    return {
      output: `Data stored on 0G decentralized storage! Root hash: ${mockHash.slice(0, 20)}... Your data is now replicated across the 0G Storage network with cryptographic proofs.`,
      skillUsed: '0GStorage',
    };
  }

  if (lower.includes('skill') || lower.includes('capabilit') || lower.includes('what can')) {
    const skillList = SKILLS.filter(s => s.enabled).map(s => `- ${s.name}: ${s.description}`).join('\n');
    return {
      output: `I am an OpenAgents AI agent running on 0G Labs infrastructure. Available skills:\n\n${skillList}\n\nConnect your wallet to unlock on-chain operations!`,
    };
  }

  if (lower.includes('ens') || lower.includes('.eth')) {
    return {
      output: `ENS resolution requested. In production, this resolves the .eth name to a wallet address using the ENS registry on Ethereum mainnet, then bridges the result to 0G Chain.`,
      skillUsed: 'ENSLookup',
    };
  }

  if (lower.includes('price') || lower.includes('eth') || lower.includes('btc')) {
    return {
      output: `Price oracle query received. The 0G Compute network fetches verified price data from multiple decentralized oracles and returns a consensus price with cryptographic proof of correctness.`,
      skillUsed: 'PriceOracle',
    };
  }

  return {
    output: `I received: "${input}". As an autonomous agent on 0G Labs, I process requests using sealed AI inference on the 0G Compute Network. My responses are verifiable on-chain. How can I assist you further?`,
  };
}

// ── Routes ─────────────────────────────────────────────────────────────────

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

app.get('/api/agent/status', (_req: Request, res: Response) => {
  res.json({
    status: 'idle',
    agent: 'OpenAgents v2.0',
    network: '0G Newton Testnet',
    model: 'qwen3.6-plus',
    storage: '0G Decentralized Storage',
    compute: '0G Compute Network',
    version: '2.0.0',
    chainId: 16600,
    rpc: 'https://evmrpc-testnet.0g.ai',
    uptime: process.uptime(),
  });
});

app.post('/api/agent/run', async (req: Request, res: Response) => {
  const { input, walletAddress } = req.body;

  if (!input || typeof input !== 'string' || input.trim().length === 0) {
    return res.status(400).json({ error: 'input is required and must be a non-empty string' });
  }
  if (input.length > 2000) {
    return res.status(400).json({ error: 'input exceeds maximum length of 2000 characters' });
  }

  try {
    const result = await runAgentLogic(input.trim(), walletAddress);

    if (walletAddress) {
      const session = getSession(walletAddress);
      session.history.push(
        { role: 'user',  content: input,         timestamp: Date.now() },
        { role: 'agent', content: result.output, timestamp: Date.now(), txHash: result.txHash },
      );
      if (session.history.length > session.config.maxHistory * 2) {
        session.history = session.history.slice(-session.config.maxHistory * 2);
      }
    }

    res.json({
      output: result.output,
      txHash: result.txHash,
      skillUsed: result.skillUsed,
      timestamp: Date.now(),
    });
  } catch (err: any) {
    console.error('[agent/run] Error:', err);
    res.status(500).json({ error: err.message || 'Agent execution failed' });
  }
});

app.get('/api/agent/skills', (_req: Request, res: Response) => {
  res.json({ skills: SKILLS });
});

app.post('/api/agent/skills/execute', async (req: Request, res: Response) => {
  const { skill, params } = req.body;
  const found = SKILLS.find(s => s.name === skill);
  if (!found) return res.status(404).json({ error: `Skill "${skill}" not found` });
  if (!found.enabled) return res.status(400).json({ error: `Skill "${skill}" is disabled` });
  res.json({ skill, result: { status: 'executed', params, mock: true }, timestamp: Date.now() });
});

app.get('/api/agent/history', (req: Request, res: Response) => {
  const wallet = req.query.wallet as string;
  if (!wallet) return res.status(400).json({ error: 'wallet query param required' });
  const session = getSession(wallet);
  res.json({ history: session.history, count: session.history.length });
});

app.delete('/api/agent/history', (req: Request, res: Response) => {
  const { walletAddress } = req.body;
  if (!walletAddress) return res.status(400).json({ error: 'walletAddress required' });
  const session = getSession(walletAddress);
  session.history = [];
  res.json({ cleared: true });
});

app.post('/api/storage/upload', async (req: Request, res: Response) => {
  const { data, metadata } = req.body;
  if (!data) return res.status(400).json({ error: 'data is required' });
  const rootHash = '0x' + Buffer.from(JSON.stringify(data)).toString('hex').slice(0, 64).padEnd(64, '0');
  res.json({ rootHash, metadata, timestamp: Date.now(), network: '0G Storage' });
});

app.get('/api/storage/download/:rootHash', (req: Request, res: Response) => {
  const { rootHash } = req.params;
  res.json({ rootHash, data: null, message: 'Connect to 0G Storage node for real data retrieval' });
});

app.get('/api/storage/list', (req: Request, res: Response) => {
  const wallet = req.query.wallet as string;
  res.json({ items: [], wallet, message: 'Storage listing requires 0G Storage node connection' });
});

app.post('/api/wallet/register', (req: Request, res: Response) => {
  const { walletAddress, signature, message } = req.body;
  if (!walletAddress || !signature) {
    return res.status(400).json({ error: 'walletAddress and signature required' });
  }
  walletRegistry.set(walletAddress.toLowerCase(), { registeredAt: Date.now(), signature });
  console.log(`[wallet/register] Registered: ${walletAddress}`);
  res.json({ registered: true, walletAddress, timestamp: Date.now() });
});

app.get('/api/wallet/:address/config', (req: Request, res: Response) => {
  const { address } = req.params;
  const session = getSession(address);
  res.json({ walletAddress: address, config: session.config });
});

app.put('/api/wallet/:address/config', (req: Request, res: Response) => {
  const { address } = req.params;
  const session = getSession(address);
  session.config = { ...session.config, ...req.body };
  res.json({ walletAddress: address, config: session.config });
});

// 404
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[server error]', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`\n🚀 OpenAgents Backend v2.0 running on http://localhost:${PORT}`);
  console.log(`   Network: 0G Newton Testnet (chainId: 16600)`);
  console.log(`   Skills:  ${SKILLS.filter(s => s.enabled).length} enabled\n`);
});

export default app;
