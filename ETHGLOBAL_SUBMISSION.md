# EthGlobal Submission — CLAW_MACHINE Framework

## Project Name

**CLAW_MACHINE** — A Self-Evolving Agent Framework for the 0G Ecosystem

## Short Description

CLAW_MACHINE is an open-source, production-ready agent framework that lets developers build, deploy, and evolve AI agents on 0G Network in minutes. It provides a modular SDK (`@claw/core`), first-party 0G plugins (`@claw/plugin-0g`, `@claw/plugin-openclaw`), a React integration library (`@claw/react`), a CLI scaffolding tool (`@claw/cli`), and a visual no-code agent builder — all backed by 0G Storage and 0G Compute.

The defining feature is the **Self-Evolving Skill Engine**: agents can autonomously generate, sandbox-test, and hot-register new TypeScript skills at runtime using 0G Compute inference, then persist them to 0G Storage so they survive restarts and can be shared via the on-chain `SkillRegistry.sol` contract.

## Track

**Best Agent Framework, Tooling & Core Extensions** — $7,500 prize pool

## Contract Deployment Addresses

| Contract | Network | Address |
|----------|---------|---------|
| `SkillRegistry.sol` | 0G Newton Testnet (chainId 16600) | `[deploy with: npx hardhat run contracts/deploy.ts --network zerog]` |

> The contract is ready to deploy. Run `npx hardhat run contracts/deploy.ts --network zerog` with a funded wallet and set `CONTRACT_ADDRESS` in `.env`.

## Public GitHub Repository

`https://github.com/[your-handle]/claw-machine`

### README includes:
- Architecture diagram
- 5-minute quick start
- Full API reference (30+ endpoints)
- CLI reference
- Working example agents
- 0G integration table
- OpenClaw bridge documentation

## Protocol Features and SDKs Used

| Feature | How CLAW_MACHINE Uses It |
|---------|--------------------------|
| **0G Storage KV** | Hot-tier agent session state — wallet configs, active plan state |
| **0G Storage Log** | Warm-tier ordered episode history — agent turn logs, reflection records, AgentBus message queues |
| **0G Storage Blob** | Cold-tier archive — compressed memory snapshots, evolved skill code |
| **0G Compute (qwen3.6-plus)** | Primary reasoning model for agent turns, hierarchical plan decomposition, skill evolution code generation |
| **0G Compute (GLM-5-FP8)** | TEE-verified inference for sensitive operations |
| **0G Compute (DeepSeek-V3.1)** | Reflection analysis and memory summarization |
| **0G Chain (chainId 16600)** | `SkillRegistry.sol` — on-chain skill publishing, versioning, endorsement |
| **0G Newton Testnet RPC** | ethers.js v6 wallet integration, transaction signing |

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         CLAW_MACHINE v6                                  │
│                                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────────┐  │
│  │  @claw/react  │  │  @claw/cli   │  │ Visual Builder│  │  REST API  │  │
│  │  useAgent     │  │  claw init   │  │  drag-drop    │  │  30 routes │  │
│  │  useWallet    │  │  claw skill  │  │  pipeline     │  │  SSE stream│  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └─────┬──────┘  │
│         └─────────────────┴─────────────────┴────────────────┘          │
│                                    │                                     │
│  ┌─────────────────────────────────▼──────────────────────────────────┐  │
│  │                         @claw/core SDK                              │  │
│  │  AgentBuilder  defineSkill  definePlugin  PluginManager             │  │
│  │  SkillRunner   PlanExecutor  HierarchicalPlanner                    │  │
│  │  SkillEvolutionEngine  MultiModalProcessor  AgentBus                │  │
│  └──────────────────────────┬──────────────────────────────────────────┘  │
│                             │                                            │
│  ┌──────────────────────────▼──────────────────────────────────────────┐  │
│  │                      Plugin Layer                                    │  │
│  │  @claw/plugin-0g          │  @claw/plugin-openclaw                  │  │
│  │  ZeroGStorageAdapter      │  OpenClawAdapter (bidirectional)         │  │
│  │  ZeroGComputeAdapter      │  AnyAgentTool ↔ ClawSkill               │  │
│  └──────────────────────────┬──────────────────────────────────────────┘  │
│                             │                                            │
│  ┌──────────────────────────▼──────────────────────────────────────────┐  │
│  │                      0G Network                                      │  │
│  │  0G Storage (KV/Log/Blob)  │  0G Compute (qwen3.6-plus, GLM-5-FP8) │  │
│  │  0G Chain SkillRegistry.sol│  0G Newton Testnet RPC                 │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

## Working Example Agents

### 1. Framework Demo (`examples/frameworkDemo.ts`)
Exercises every framework API: `AgentBuilder`, `defineSkill`, `definePlugin`, `zeroGPlugin`, `openClawPlugin`, `agent.run()`, `agent.plan()`, `agent.memory.search()`. Runs in mock mode without credentials.

```bash
npx tsx examples/frameworkDemo.ts
```

### 2. Support Agent (`examples/supportAgent.ts`)
A 3-turn customer support agent with memory accumulation, hierarchical planning, and full stats output.

```bash
npx tsx examples/supportAgent.ts
```

### 3. Self-Evolving Agent (via API)
```bash
curl -X POST http://localhost:3001/api/evolution/evolve \
  -H "Content-Type: application/json" \
  -d '{"description": "Fetch ETH price from CoinGecko and return in USD", "tags": ["defi", "price"]}'
```

### 4. Visual Builder
Open the app → click "🏗️ Build" tab → drag nodes → click "Deploy to 0G".

## Key Differentiators

**1. Self-Evolving Skills** — The only agent framework where agents can write their own tools. Describe a skill in English, and the framework generates TypeScript code, tests it in a VM sandbox, scores it, and hot-registers it — all via 0G Compute. Evolved skills are persisted to 0G Storage and published to the on-chain registry.

**2. On-Chain Skill Registry** — `SkillRegistry.sol` on 0G Chain creates a decentralized marketplace for agent skills. Skills have content hashes (stored on 0G Storage), version history, author attribution, and community endorsements. Any agent can load skills from the chain.

**3. Three-Tier Memory** — Hot (0G KV), Warm (0G Log), Cold (0G Blob Archive) with automatic promotion/demotion, cosine-similarity semantic search, and configurable pruning. Memory persists across restarts and is wallet-scoped.

**4. Visual No-Code Builder** — Non-developers can assemble agents by dragging skill nodes, compute nodes, memory nodes, and evolve nodes onto a canvas, connecting them, and clicking "Deploy to 0G". Generates and previews TypeScript code.

**5. Agent-to-Agent Messaging** — `AgentBus` uses 0G Storage Log streams as message queues. Agents can send tasks, receive results, and broadcast to channels. Enables orchestrator/worker multi-agent architectures.

**6. Multi-Modal Reasoning** — `MultiModalProcessor` handles image and audio inputs by extracting descriptions via 0G Compute vision models, enriching the text context for the reasoning loop.

**7. OpenClaw Bidirectional Bridge** — `@claw/plugin-openclaw` converts any OpenClaw `AnyAgentTool` into a CLAW_MACHINE skill, and exports all skills back as OpenClaw tools. Full interoperability with the OpenClaw ecosystem.

**8. SSE Streaming** — Real-time agent phase updates via Server-Sent Events. The frontend shows a live progress bar as the agent moves through: planning → skill selection → execution → reflection → response.

## Team

| Name | Role | Telegram | X (Twitter) |
|------|------|----------|-------------|
| [Your Name] | Lead Developer | @[handle] | @[handle] |

## Demo

- **Live Demo:** `http://localhost:3001` (run `npm run dev` from project root)
- **Demo Video:** [Under 3 minutes — link to be added]

## Setup Instructions

```bash
# Clone
git clone https://github.com/[your-handle]/claw-machine
cd claw-machine

# Install
npm install

# Configure
cp .env.example .env
# Edit .env with your 0G credentials

# Start
npm run dev

# Deploy contract (optional, for on-chain registry)
npx hardhat run contracts/deploy.ts --network zerog
```

## Environment Variables

```env
# 0G Network
EVM_RPC=https://evmrpc-testnet.0g.ai
PRIVATE_KEY=your_private_key_here
CONTRACT_ADDRESS=deployed_skill_registry_address
OG_STORAGE_RPC=https://rpc-storage-testnet.0g.ai
OG_COMPUTE_ENDPOINT=https://api.compute.0g.ai

# LLM Fallback
OPENAI_API_KEY=your_openai_key

# Server
PORT=3001
NODE_ENV=development
```
