# OpenAgents Backend Foundation (v1.1.0)

A strong, modular foundation for building decentralized autonomous agents on the **0G Labs** ecosystem. This project provides the core infrastructure to integrate decentralized storage, compute, and blockchain capabilities into your AI agents.

## Key Improvements in v1.1.0

- **Verifiable Inference**: Added `ask()` method to the base `Agent` class that automatically verifies TEE signatures from 0G Compute providers.
- **Enhanced Event System**: Replaced the basic event emitter with a type-safe, async-capable `EventEmitter` supporting `once` and `allSettled` execution.
- **Deterministic Storage**: Mock storage now uses SHA-256 hashing to simulate content-addressable storage behavior found in 0G Storage.
- **Structured Compute Responses**: `ComputeProvider` now returns detailed metadata including token usage, provider address, and TEE signatures.
- **Robust Error Handling**: Added validation and try-catch blocks across core providers and agent execution paths.

## Features

- **Decentralized Storage**: Built-in support for 0G Storage to handle persistent agent memory and large data assets.
- **Verifiable Compute**: Integration with 0G Compute Network for TEE-backed AI inference.
- **Modular Agent Engine**: Extensible base classes to create specialized agents with custom logic and skills.
- **Skill System**: A pluggable skill management system allowing agents to dynamically acquire and execute new capabilities (e.g., Uniswap integration).
- **Event-Driven Architecture**: Utilizes an internal `EventEmitter` for better inter-component communication and extensibility.
- **Strong Foundation**: Designed for scalability, security, and decentralization.

## Quick Start

### Prerequisites

- Node.js >= 22.0.0
- A wallet with 0G tokens (for testnet or mainnet)

### Installation

```bash
npm install
```

### Building the Project

```bash
npm run build
```

## Core Architecture

| Component                      | Description                                                                                             |
| :----------------------------- | :------------------------------------------------------------------------------------------------------ |
| `src/core/Agent.ts`            | Base class for all agents, managing state and orchestrating providers, now with event emission.         |
| `src/core/Skill.ts`            | Defines the `Skill` interface and `SkillManager` for modular capabilities.                              |
| `src/providers/StorageProvider.ts` | Integration with 0G Storage SDK.                                                                        |
| `src/providers/ComputeProvider.ts` | Integration with 0G Compute SDK.                                                                        |
| `src/skills/UniswapSkill.ts`   | An example skill demonstrating Uniswap integration.                                                     |
| `src/utils/EventEmitter.ts`    | A utility for event-driven communication within the agent.                                              |
| `examples/BasicAgent.ts`       | A working example of an agent using the framework and skills, now listening to internal events.         |

## Documentation

For detailed information on 0G Labs integration, refer to the [official 0G documentation](https://docs.0g.ai/).

## License

MIT
