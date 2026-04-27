# OpenAgents (CLAW_MACHINE)

Production-looking, hackathon-ready 0G-native agent framework with:
- composable TypeScript runtime (`AgentRuntime`)
- persistent memory model with reflection loop
- skill registry + execution traces
- wallet-aware React DApp UI
- explicit 0G chain/storage/compute configuration and degraded fallback modes

## Why this matters

Most demo agents are stateless chat wrappers. OpenAgents focuses on continuity:
- it stores structured memory per session/wallet
- it generates structured reflections after failures
- it retrieves and summarizes prior context for future turns
- it surfaces traces and lessons in the UI for transparent behavior

## Architecture

```text
React DApp (frontend)
  Wallet connect + chat + status + tx history + memory/reflection panel
        |
        v
Express API (backend)
  /health /ready /api/config
  /api/agent/* /api/storage/* /api/wallet/*
        |
        v
Agent Runtime (TypeScript)
  AgentRuntime
    -> SkillRegistry
    -> MemoryStore (tiered records)
    -> ReflectionEngine
    -> EventBus (trace + observability)
    -> ComputeProvider / StorageProvider adapters
        |
        +--> 0G Chain (wallet/tx identity)
        +--> 0G Storage (artifacts + memory persistence path)
        +--> 0G Compute (inference path)
```

## Quick Start

### Prerequisites
- Node.js 18+
- npm
- MetaMask (optional but recommended for full demo)

### Install and run
```bash
npm install
cp .env.example .env
npm run dev
```

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:3001`

### Build
```bash
npm run build
```

## Demo flow (under 3 minutes)

1. Open app, connect wallet.
2. Ask: `Summarize my wallet activity`.
3. Ask: `Run a swap simulation`.
4. Ask: `Show the last mistake you learned from`.
5. Open memory/reflection panel and show continuity.
6. Show tx history + skill execution trace + backend status.

## API surface

- `GET /health` - liveness
- `GET /ready` - readiness + provider health/degraded modes
- `GET /api/config` - runtime config visibility
- `GET /api/agent/status`
- `POST /api/agent/run`
- `GET /api/agent/skills`
- `POST /api/agent/skills/execute`
- `GET /api/agent/history`
- `DELETE /api/agent/history`
- `POST /api/storage/upload`
- `GET /api/storage/download/:hash`
- `POST /api/wallet/register`
- `GET /api/wallet/:addr/config`
- `PUT /api/wallet/:addr/config`

## Memory and reflection model

### Memory categories
- `session_state`
- `conversation_turn`
- `task_result`
- `reflection`
- `skill_execution`
- `wallet_profile`
- `artifact`
- `error_event`
- `summary`

### Reflection shape
- source turn id
- task type
- success/failure result
- root cause and mistake summary
- corrective advice
- confidence + severity + tags
- related memory IDs
- next best action

## 0G integration clarity

- **0G Chain**: wallet identity, signing flow, tx metadata, explorer linking.
- **0G Storage**: artifact hash path and storage endpoints.
- **0G Compute**: inference and reflection generation path (mock/default mode available).

Fallback modes are explicit:
- compute unavailable -> mock compute path (degraded)
- storage unavailable -> memory mode (degraded)
- wallet disconnected -> read-only exploration still works

## Repository layout

```text
backend/src/
  config/
  core/
  events/
  memory/
  reflection/
  skills/
  providers/
  types/
  server.ts
frontend/src/
  components/
  hooks/
  services/
  App.jsx
shared/
  types.ts
```

## Environment variables

See `.env.example`. Key values:
- `PORT`
- `CORS_ORIGIN`
- `OG_RPC_URL`
- `OG_CHAIN_ID`
- `OG_STORAGE_RPC`
- `OG_COMPUTE_RPC`
- `OG_COMPUTE_MODE` (`mock` or `production`)
- `OG_STORAGE_MODE` (`memory` or `production`)

## Quality gates

- TypeScript build passes for backend
- Vite production build passes for frontend
- request IDs + structured logs for observability
- consistent JSON error format for API responses

## Error handling and degraded modes

### Error model
- Backend normalizes failures into typed `AppError` objects with stable codes.
- API errors use a consistent envelope:
  - `ok: false`
  - `error.code`, `error.message`, `error.category`
  - `error.recoverable`, `error.retryable`
  - `error.requestId` and `error.details`

### Recovery behavior
- Validation issues return 4xx with actionable fields.
- Provider/network failures are normalized and may retry with bounded backoff.
- Agent runtime phase failures are tracked in trace output and may degrade gracefully.
- Reflection and persistence failures do not always fail the primary user answer.

### Fallback visibility
- Mock/degraded modes are exposed via:
  - `GET /ready`
  - `GET /api/agent/status`
  - frontend diagnostics banner and runtime traces

### Troubleshooting quick notes
- Wallet not connecting: verify wallet extension and 0G testnet chain selection.
- Storage download fails: validate hash format and whether artifact exists locally.
- Compute unavailable: run in demo/mock mode with `OG_COMPUTE_MODE=mock`.
- Backend error details: inspect `requestId` from UI and logs for correlation.

## Roadmap

- add real 0G storage/compute SDK adapters behind current interfaces
- add integration tests for `/api/agent/run` and reflection loops
- add semantic retrieval ranking (importance + recency + task affinity)
- persist memory snapshots with schema migration support

## License

MIT
