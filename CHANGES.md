# CLAW_MACHINE Changelog

## v6.0.0 — "First Place Edition" (current)

### New: Self-Evolving Skill Engine
- `packages/core/src/evolution/SkillEvolutionEngine.ts` — generates TypeScript skill code from natural language using 0G Compute, sandbox-tests it in `vm.runInNewContext`, scores quality, hot-registers passing skills into SkillRunner, persists to 0G Storage
- `backend/src/routes/evolution.ts` — REST endpoints: POST /api/evolution/evolve, GET /api/evolution/skills, POST /api/evolution/load, GET /api/evolution/status
- `frontend/src/components/EvolvePanel.jsx` — UI for describing, generating, and managing evolved skills with quality scores and test results

### New: On-Chain Skill Registry
- `contracts/SkillRegistry.sol` — Solidity contract on 0G Chain (chainId 16600): publishSkill, updateSkill, deprecateSkill, endorseSkill, listSkills, getSkill, SkillPublished/Updated/Endorsed events
- `backend/src/onchain/OnChainSkillRegistry.ts` — TypeScript integration with ethers.js v6: publishSkill, listChainSkills, getSkillById, endorseSkill, watchNewSkills, mock fallback
- `backend/src/routes/evolution.ts` — createOnChainRouter: GET/POST/endorse/get-by-id endpoints
- `contracts/deploy.ts` — Hardhat deploy script for 0G Newton Testnet
- `hardhat.config.ts` — Hardhat config with 0G network (chainId 16600)
- `frontend/src/components/OnChainPanel.jsx` — UI for browsing, publishing, and endorsing on-chain skills

### New: Visual No-Code Agent Builder
- `frontend/src/pages/Builder.jsx` — Drag-and-drop pipeline canvas: 7 node types (trigger, skill, memory, compute, storage, evolve, output), SVG edge connections, config panel per node, code preview, Deploy to 0G button
- `backend/src/routes/builder.ts` — POST /api/builder/deploy, GET /api/builder/pipelines, GET/DELETE /api/builder/pipeline/:id

### New: Multi-Modal Reasoning
- `packages/core/src/multimodal/MultiModalProcessor.ts` — image description via 0G Compute vision, audio transcription, data URI detection, memory persistence of extracted context

### New: Agent-to-Agent Messaging
- `packages/core/src/agentbus/AgentBus.ts` — 0G Storage Log-backed message queues: send, request (with timeout), broadcast, subscribe, reply, poll-based inbox

### Updated: @claw/core index.ts
- Exports MultiModalProcessor, AgentBus, SkillEvolutionEngine and all their types
- FRAMEWORK_VERSION = "0.6.0"

### Updated: App.jsx
- 3 new sidebar tabs: 🧬 Evolve, ⛓️ Chain, 🏗️ Build
- EvolvePanel, OnChainPanel, Builder wired in

### New: Documentation
- `ETHGLOBAL_SUBMISSION.md` — full EthGlobal submission document
- `architecture_v6.png` — updated architecture diagram

---

## v5.0.0 — Framework Edition
- `packages/core` SDK with AgentBuilder, defineSkill, definePlugin, PluginManager, SkillRunner, PlanExecutor
- `@claw/plugin-0g`, `@claw/plugin-openclaw`, `@claw/react`, `@claw/cli`
- `examples/frameworkDemo.ts`

## v4.0.0 — 0G Integration
- ZeroGStorageAdapter, ZeroGComputeAdapter, OpenClawAdapter
- HierarchicalPlanner, MemoryOrchestrator, PruningService, VectorIndex
- Prompt templates, example support agent

## v3.0.0 — Streaming & Skills
- SSE streaming, SkillsPanel, InsightsPanel, StreamPhaseBar
- Rate limiter, validation middleware, SwarmSkill
- Skills and memory routes

## v2.0.0 — Wallet Integration
- useWallet hook, WalletPanel, TxHistory
- API service layer, improved App.jsx
