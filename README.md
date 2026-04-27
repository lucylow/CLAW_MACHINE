# OpenAgents v2.0

**Decentralized AI Agent Framework on 0G Labs** — ETHGlobal Open Agents Hackathon

> Build autonomous AI agents that live on-chain, powered by 0G Compute Network for sealed inference and 0G Storage for persistent decentralized memory.

---

## Architecture

```
Browser (React DApp)
  WalletPanel (MetaMask / EIP-1193)
  AgentChat (messages, suggestions)
  AgentStatus (skills, info, tx history)
  useWallet hook + api.js service
        |
        | HTTP /api/*
        v
Express Backend (Node.js)
  /api/agent/run  /api/agent/skills  /api/agent/history
  /api/storage/*  /api/wallet/*
        |
        v
  Agent Core (TypeScript)
  Agent.ts + Skill.ts + StorageProvider + ComputeProvider
        |
   _____|_____________________
  |           |               |
  v           v               v
0G Compute  0G Storage    0G Chain (EVM)
(inference) (KV + Log)    chainId: 16600
```

---

## Quick Start

### Prerequisites

- Node.js 18+
- MetaMask or any EIP-1193 wallet
- (Optional) 0G Testnet tokens from the 0G Faucet

### Setup

```bash
# 1. Install dependencies
npm run install-all

# 2. Configure environment
cp .env.example .env
# Edit .env with your 0G RPC URL and agent private key

# 3. Start development servers
npm run dev
# Frontend: http://localhost:3000
# Backend:  http://localhost:3001
```

### Build for Production

```bash
npm run build
# Frontend output: frontend/dist/
# Backend output:  backend/dist/
```

---

## Wallet Integration

The frontend uses a custom `useWallet` hook built on **ethers.js v6**:

- Auto-reconnect on page reload
- Network switching to 0G Testnet (chainId: 16600) with one click
- Real-time balance display
- Message signing for wallet-based authentication
- Account/chain change listeners

```js
import { useWallet } from './hooks/useWallet';
const { account, balance, connect, switchTo0G, signMessage } = useWallet();
```

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET  | /api/agent/status | Agent health and configuration |
| POST | /api/agent/run | Run agent with a prompt |
| GET  | /api/agent/skills | List available skills |
| POST | /api/agent/skills/execute | Execute a specific skill |
| GET  | /api/agent/history | Get conversation history |
| DELETE | /api/agent/history | Clear conversation history |
| POST | /api/storage/upload | Upload to 0G Storage |
| GET  | /api/storage/download/:hash | Download from 0G Storage |
| POST | /api/wallet/register | Register wallet with signature |
| GET  | /api/wallet/:addr/config | Get wallet agent config |
| PUT  | /api/wallet/:addr/config | Update wallet agent config |

All requests support `x-wallet-address` header for wallet-specific behavior.

---

## Skills

| Skill | Description |
|-------|-------------|
| UniswapSwap | Token swaps via Uniswap V3 |
| 0GStorage | Decentralized data storage on 0G |
| 0GCompute | AI inference via 0G Compute Network |
| ENSLookup | ENS name resolution |
| PriceOracle | Live token price feeds |
| WalletAnalysis | Portfolio and transaction analysis |

---

## 0G Network Details

| Property | Value |
|----------|-------|
| Chain ID | 16600 |
| Network | 0G Newton Testnet |
| RPC | https://evmrpc-testnet.0g.ai |
| Explorer | https://chainscan-newton.0g.ai |
| Currency | A0GI |

---

## Project Structure

```
openagents/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── AgentChat.jsx      # Chat UI with suggestions
│   │   │   ├── AgentStatus.jsx    # Status panel with skills
│   │   │   ├── WalletPanel.jsx    # Wallet connect/disconnect UI
│   │   │   └── TxHistory.jsx      # Transaction history
│   │   ├── hooks/
│   │   │   └── useWallet.js       # ethers.js wallet hook
│   │   ├── services/
│   │   │   └── api.js             # Axios API service layer
│   │   ├── App.jsx                # Main app with state management
│   │   └── App.css                # DApp-style dark theme
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
├── backend/
│   ├── src/
│   │   ├── core/
│   │   │   ├── Agent.ts           # Abstract agent base class
│   │   │   └── Skill.ts           # Skill manager
│   │   ├── providers/
│   │   │   ├── StorageProvider.ts # 0G Storage integration
│   │   │   └── ComputeProvider.ts # 0G Compute integration
│   │   ├── skills/
│   │   │   └── UniswapSkill.ts    # Uniswap V3 skill
│   │   ├── utils/
│   │   │   └── EventEmitter.ts    # Async event system
│   │   ├── server.ts              # Express API server
│   │   └── index.ts               # Package exports
│   └── package.json
├── shared/
│   └── types.ts                   # Shared TypeScript types
├── .env.example
└── README.md
```

---

## License

MIT
