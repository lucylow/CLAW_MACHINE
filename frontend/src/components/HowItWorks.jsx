/**
 * HowItWorks
 *
 * A compact visual pipeline panel that helps a hackathon judge understand the
 * Claw Machine architecture in under 30 seconds.
 *
 * Shows the full data flow:
 *   Wallet → Agent Chat → Memory Retrieval → Skill Execution
 *   → 0G Compute → 0G Storage → Reflection → Improved Future Behavior
 */

import { useState } from 'react';

const STEPS = [
  {
    icon: '🔑',
    label: 'Wallet Connect',
    detail: 'EIP-1193 wallet signs a message to register with the backend. Chain ID 16600 (0G Testnet) is auto-added to MetaMask.',
    color: '#6366f1',
  },
  {
    icon: '💬',
    label: 'Agent Chat',
    detail: 'User message is sent to the AgentRuntime. Prior lessons from 0G Storage are retrieved and injected into the system prompt.',
    color: '#8b5cf6',
  },
  {
    icon: '🧠',
    label: 'Memory Retrieval',
    detail: 'MemoryOrchestrator queries the VectorIndex using cosine similarity. Top-3 relevant reflections are returned and ranked by recency + importance.',
    color: '#a855f7',
  },
  {
    icon: '⚙️',
    label: 'Skill Execution',
    detail: 'SkillRegistry routes the task to the best skill (0G Storage, 0G Compute, Uniswap, ENS, Price Oracle, or Agent Swarm). OpenClaw tools are registered as first-class skills via OpenClawAdapter.',
    color: '#ec4899',
  },
  {
    icon: '🔮',
    label: '0G Compute',
    detail: 'LLM inference runs on 0G Compute with TEE verifiability. Provider acknowledgment is handled automatically. Supports qwen3.6-plus, GLM-5-FP8, DeepSeek-V3.1.',
    color: '#f43f5e',
  },
  {
    icon: '🗄️',
    label: '0G Storage',
    detail: 'Episodes are appended to the 0G Storage Log (immutable audit trail). State is written to the 0G Storage KV stream (mutable, replayable). Old episodes are archived to blob storage.',
    color: '#f97316',
  },
  {
    icon: '🔁',
    label: 'Reflection',
    detail: 'After each task, a structured reflection is generated via 0G Compute (TEE-verified). Fields: rootCause, mistakeSummary, correctiveAdvice, severity, tags. Stored in 0G Storage and indexed in the VectorIndex.',
    color: '#eab308',
  },
  {
    icon: '📈',
    label: 'Improved Behavior',
    detail: 'Next task retrieves top-3 relevant reflections. Corrective advice is injected into the system prompt. The agent avoids repeating past mistakes across sessions.',
    color: '#22c55e',
  },
];

export function HowItWorks({ onClose }) {
  const [activeStep, setActiveStep] = useState(null);

  return (
    <div className="how-it-works-panel">
      <div className="hiw-header">
        <span className="hiw-title">How Claw Machine Works</span>
        {onClose && (
          <button className="hiw-close" onClick={onClose} aria-label="Close">✕</button>
        )}
      </div>

      <div className="hiw-subtitle">
        Self-improving persistent memory for OpenClaw agents, powered by 0G Storage + 0G Compute
      </div>

      {/* Pipeline flow */}
      <div className="hiw-pipeline">
        {STEPS.map((step, i) => (
          <div key={step.label} className="hiw-step-wrapper">
            <button
              className={`hiw-step ${activeStep === i ? 'hiw-step-active' : ''}`}
              style={{ '--step-color': step.color }}
              onClick={() => setActiveStep(activeStep === i ? null : i)}
              title={step.label}
            >
              <span className="hiw-step-icon">{step.icon}</span>
              <span className="hiw-step-label">{step.label}</span>
            </button>
            {i < STEPS.length - 1 && (
              <span className="hiw-arrow">→</span>
            )}
          </div>
        ))}
      </div>

      {/* Detail panel */}
      {activeStep !== null && (
        <div className="hiw-detail" style={{ borderColor: STEPS[activeStep].color }}>
          <span className="hiw-detail-icon">{STEPS[activeStep].icon}</span>
          <div>
            <div className="hiw-detail-label" style={{ color: STEPS[activeStep].color }}>
              {STEPS[activeStep].label}
            </div>
            <div className="hiw-detail-text">{STEPS[activeStep].detail}</div>
          </div>
        </div>
      )}

      {/* 0G Integration summary */}
      <div className="hiw-og-row">
        <div className="hiw-og-badge" style={{ background: 'rgba(99,102,241,0.12)', borderColor: 'rgba(99,102,241,0.4)' }}>
          <span>🔮</span>
          <span><strong>0G Compute</strong> — TEE inference, reflection generation, embeddings</span>
        </div>
        <div className="hiw-og-badge" style={{ background: 'rgba(249,115,22,0.12)', borderColor: 'rgba(249,115,22,0.4)' }}>
          <span>🗄️</span>
          <span><strong>0G Storage</strong> — KV hot state, Log episodes, blob archive</span>
        </div>
        <div className="hiw-og-badge" style={{ background: 'rgba(34,197,94,0.12)', borderColor: 'rgba(34,197,94,0.4)' }}>
          <span>⛓️</span>
          <span><strong>0G Chain</strong> — Wallet identity, on-chain attestations</span>
        </div>
      </div>
    </div>
  );
}
