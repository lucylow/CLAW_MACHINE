/**
 * Shared graph data for Visual Agent Builder (templates, colors, manifest helpers).
 */

export const NODE_COLOR = {
  input: "#22c55e",
  planner: "#a3e635",
  model: "#84cc16",
  tool: "#14b8a6",
  memory: "#eab308",
  chain: "#f97316",
  channel: "#38bdf8",
  output: "#d946ef",
  deploy: "#22d3ee",
  monitor: "#f8fafc",
  guardrail: "#fb7185",
};

export function node(
  id,
  kind,
  x,
  y,
  label,
  description,
  category,
  config,
  tags,
  status,
  icon,
) {
  return {
    id,
    type: "builderNode",
    position: { x, y },
    data: {
      kind,
      label,
      description,
      category,
      prompt: kind === "model" ? "Reason carefully and use available context." : undefined,
      model: kind === "model" ? "qwen3.6-plus" : undefined,
      tool: kind === "tool" ? "browser" : undefined,
      memoryPolicy: kind === "memory" ? "kv+log" : undefined,
      chainPolicy: kind === "chain" ? "settle + verify" : undefined,
      channel: kind === "channel" || kind === "input" || kind === "output" ? "chat" : undefined,
      tags,
      enabled: true,
      status,
      config,
      icon,
    },
  };
}

export function edge(id, source, target, kind, label) {
  return {
    id,
    source,
    target,
    label,
    animated: kind !== "approval",
    style: {
      strokeWidth: 2,
      stroke:
        kind === "memory"
          ? "#eab308"
          : kind === "control"
            ? "#22c55e"
            : kind === "deployment"
              ? "#22d3ee"
              : kind === "approval"
                ? "#fb7185"
                : "#94a3b8",
    },
    data: {
      kind,
      encrypted: kind === "memory" || kind === "deployment",
      durable: kind === "memory" || kind === "deployment",
    },
  };
}

export const DEFAULT_TEMPLATES = [
  {
    id: "research",
    name: "Research Agent",
    description:
      "Collects context, reasons over sources, stores lessons, and publishes a concise answer.",
    outcome: "A memory-enabled research agent that composes answers from retrieval + reasoning.",
    nodes: [
      node("n_input", "input", 0, 120, "User Query", "Accepts a research request from the user.", "interface", { channel: "web", source: "chat" }, ["chat", "query"], "ready", "MessageSquareMore"),
      node("n_planner", "planner", 250, 110, "Research Planner", "Decides what to fetch, verify, and cite.", "core", { style: "hierarchical" }, ["plan", "research"], "ready", "Workflow"),
      node("n_model", "model", 530, 80, "0G Compute", "Runs sealed inference for analysis.", "compute", { model: "qwen3.6-plus", sealed: true }, ["compute", "reasoning"], "configured", "Brain"),
      node("n_memory", "memory", 530, 280, "Persistent Memory", "Stores summaries, reflections, and prior answers.", "memory", { mode: "hybrid", retention: "long" }, ["memory", "reflection"], "configured", "Database"),
      node("n_tool", "tool", 820, 100, "Web + API Tools", "Searches sources and collects evidence.", "core", { tools: ["browser", "api"] }, ["tool", "search"], "ready", "TerminalSquare"),
      node("n_output", "output", 1100, 140, "Final Answer", "Publishes a concise research answer.", "interface", { format: "markdown" }, ["output", "report"], "ready", "FileCode2"),
      node("n_monitor", "monitor", 820, 300, "Observability", "Tracks latency, confidence, and tool outcomes.", "quality", { telemetry: true }, ["monitor", "metrics"], "ready", "Gauge"),
      node("n_guard", "guardrail", 250, 300, "Policy Gate", "Requires citations and blocks unsafe execution.", "quality", { approvals: true }, ["safety"], "ready", "ShieldCheck"),
    ],
    edges: [
      edge("e1", "n_input", "n_planner", "control"),
      edge("e2", "n_planner", "n_model", "data"),
      edge("e3", "n_model", "n_tool", "control"),
      edge("e4", "n_tool", "n_model", "data"),
      edge("e5", "n_model", "n_memory", "memory"),
      edge("e6", "n_guard", "n_model", "control"),
      edge("e7", "n_model", "n_output", "data"),
      edge("e8", "n_model", "n_monitor", "control"),
      edge("e9", "n_memory", "n_planner", "memory"),
      edge("e10", "n_monitor", "n_output", "control"),
    ],
  },
  {
    id: "support",
    name: "Customer Support Agent",
    description: "Learns from escalations, remembers policy, and routes sensitive cases safely.",
    outcome: "A support bot that remembers what went wrong and improves on the next ticket.",
    nodes: [
      node("s_input", "input", 0, 120, "Support Ticket", "User describes a problem or complaint.", "interface", { channel: "web" }, ["ticket"], "ready", "MessageSquareMore"),
      node("s_planner", "planner", 250, 120, "Triage Planner", "Classifies the request and chooses a path.", "core", { style: "triage" }, ["triage"], "ready", "Workflow"),
      node("s_memory", "memory", 520, 60, "Policy Memory", "Stores past resolutions and escalation lessons.", "memory", { mode: "kv+log" }, ["policy", "lesson"], "configured", "Database"),
      node("s_model", "model", 520, 260, "Sealed Inference", "Generates a response with policy context.", "compute", { model: "glm-5", sealed: true }, ["support"], "configured", "Brain"),
      node("s_tool", "tool", 800, 120, "CRM / Ticketing", "Creates tickets, tags cases, escalates, or refunds.", "core", { tools: ["crm", "api"] }, ["crm"], "ready", "TerminalSquare"),
      node("s_guard", "guardrail", 800, 280, "Escalation Guard", "Blocks risky actions and requests human approval.", "quality", { approvals: true }, ["guardrail"], "ready", "ShieldCheck"),
      node("s_output", "output", 1080, 160, "Customer Reply", "Returns a useful answer or a safe escalation.", "interface", { format: "chat" }, ["reply"], "ready", "FileCode2"),
    ],
    edges: [
      edge("e1", "s_input", "s_planner", "control"),
      edge("e2", "s_planner", "s_model", "data"),
      edge("e3", "s_memory", "s_model", "memory"),
      edge("e4", "s_model", "s_tool", "control"),
      edge("e5", "s_guard", "s_tool", "approval"),
      edge("e6", "s_tool", "s_output", "data"),
      edge("e7", "s_model", "s_output", "data"),
      edge("e8", "s_model", "s_memory", "memory"),
    ],
  },
  {
    id: "swarm",
    name: "Multi-Agent Swarm",
    description: "Coordinated planner, researcher, critic, and executor nodes sharing memory.",
    outcome: "A swarm that collaborates through shared context and role specialization.",
    nodes: [
      node("w_input", "input", 0, 140, "Goal", "A user or system goal enters the swarm.", "interface", { channel: "api" }, ["goal"], "ready", "MessageSquareMore"),
      node("w_planner", "planner", 250, 80, "Planner Agent", "Breaks the goal into steps.", "core", { role: "planner" }, ["planner"], "ready", "Workflow"),
      node("w_research", "model", 250, 240, "Research Agent", "Finds facts and signals.", "compute", { role: "researcher", model: "qwen3.6-plus" }, ["research"], "configured", "Brain"),
      node("w_critic", "guardrail", 520, 80, "Critic Agent", "Checks correctness and safety.", "quality", { role: "critic" }, ["critic"], "ready", "ShieldCheck"),
      node("w_executor", "tool", 520, 240, "Executor Agent", "Uses tools and performs actions.", "core", { role: "executor", tools: ["api", "browser"] }, ["executor"], "ready", "TerminalSquare"),
      node("w_memory", "memory", 800, 150, "Shared Memory", "A durable shared state across agents.", "memory", { mode: "log+kv" }, ["shared", "memory"], "configured", "Database"),
      node("w_output", "output", 1080, 150, "Delivered Outcome", "The swarm returns a completed result.", "interface", { format: "artifact" }, ["artifact"], "ready", "FileCode2"),
    ],
    edges: [
      edge("e1", "w_input", "w_planner", "control"),
      edge("e2", "w_planner", "w_research", "control"),
      edge("e3", "w_research", "w_critic", "data"),
      edge("e4", "w_critic", "w_executor", "control"),
      edge("e5", "w_executor", "w_memory", "memory"),
      edge("e6", "w_research", "w_memory", "memory"),
      edge("e7", "w_memory", "w_planner", "memory"),
      edge("e8", "w_executor", "w_output", "data"),
      edge("e9", "w_memory", "w_output", "data"),
    ],
  },
  {
    id: "deployable",
    name: "One-Click 0G Deployment",
    description: "A builder project that packages the graph, uploads artifacts, and deploys on 0G.",
    outcome: "A ready-to-deploy agent package with manifests, hashes, and verified endpoints.",
    nodes: [
      node("d_input", "input", 0, 140, "Builder Project", "The current visual graph is the source of truth.", "interface", { source: "canvas" }, ["builder"], "ready", "PanelsTopLeft"),
      node("d_validate", "monitor", 250, 140, "Validation", "Checks graph connectivity and deployment readiness.", "quality", { rules: ["entrypoint", "output", "memory"] }, ["validate"], "ready", "TestTube2"),
      node("d_model", "model", 250, 300, "Agent Model", "LLM step for packaged agent runtime.", "compute", { model: "qwen3.6-plus" }, ["model"], "configured", "Brain"),
      node("d_pack", "deploy", 520, 80, "Package Manifest", "Converts the graph into a deployment manifest.", "compute", { step: "package" }, ["manifest"], "ready", "Rocket"),
      node("d_upload", "chain", 520, 240, "0G Upload", "Uploads model prompts, memory config, and metadata.", "chain", { target: "0g-storage" }, ["upload"], "configured", "LinkIcon"),
      node("d_deploy", "deploy", 820, 80, "0G Deploy", "Calls the deployment backend once.", "compute", { step: "deploy" }, ["deploy"], "configured", "Rocket"),
      node("d_verify", "monitor", 820, 240, "Verification", "Reads back addresses, hashes, and status.", "quality", { step: "verify" }, ["verify"], "ready", "CircleCheckBig"),
      node("d_output", "output", 1080, 140, "Live Agent", "Returns explorer links, health, and runbook.", "interface", { format: "deployment receipt" }, ["receipt"], "ready", "Globe"),
    ],
    edges: [
      edge("e1", "d_input", "d_validate", "control"),
      edge("e2", "d_validate", "d_pack", "control"),
      edge("e2b", "d_validate", "d_model", "data"),
      edge("e2c", "d_model", "d_pack", "data"),
      edge("e3", "d_pack", "d_upload", "deployment"),
      edge("e4", "d_upload", "d_deploy", "deployment"),
      edge("e5", "d_deploy", "d_verify", "control"),
      edge("e6", "d_verify", "d_output", "data"),
      edge("e7", "d_validate", "d_output", "control"),
    ],
  },
];

export const defaultTemplate = DEFAULT_TEMPLATES[0];

export function cloneTemplate(template) {
  return {
    nodes: template.nodes.map((n) => structuredCloneNode(n)),
    edges: template.edges.map((e) => structuredCloneEdge(e)),
  };
}

export function structuredCloneNode(nodeItem) {
  return {
    ...nodeItem,
    position: { ...nodeItem.position },
    data: JSON.parse(JSON.stringify(nodeItem.data)),
  };
}

export function structuredCloneEdge(edgeItem) {
  return {
    ...edgeItem,
    data: edgeItem.data ? JSON.parse(JSON.stringify(edgeItem.data)) : undefined,
    style: edgeItem.style ? { ...edgeItem.style } : undefined,
  };
}

export function getTemplateById(id) {
  return DEFAULT_TEMPLATES.find((t) => t.id === id) ?? defaultTemplate;
}

export function buildDeployTargetPreset() {
  return {
    network: "0G Testnet / Mainnet",
    storageProfile: "hybrid-memory",
    computeProfile: "sealed-inference",
    chainProfile: "agent-execution",
  };
}

export function buildManifest(appName, description, mode, nodes, edges, deploymentPreset) {
  const primaryModel = nodes.find((n) => n.data.kind === "model")?.data.model;
  const entryNodeId = nodes.find((n) => n.data.kind === "input")?.id;
  const hasMemory = nodes.some((n) => n.data.kind === "memory");
  const hasChain = nodes.some((n) => n.data.kind === "chain");
  const hasDeploy = nodes.some((n) => n.data.kind === "deploy");

  return {
    version: "1.0.0",
    appName,
    description,
    mode,
    createdAt: new Date().toISOString(),
    graph: {
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.type ?? "builderNode",
        position: n.position,
        data: n.data,
      })),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        data: e.data,
      })),
    },
    zeroG: {
      storage: {
        enabled: hasMemory,
        mode: hasMemory ? "hybrid" : "kv",
        retention: hasMemory ? "long" : "standard",
      },
      compute: {
        enabled: true,
        inference: "sealed",
        model: primaryModel,
        privacy: "private",
      },
      chain: {
        enabled: hasChain || hasDeploy,
        network: deploymentPreset.network,
        execution: hasChain ? "onchain" : "hybrid",
      },
      da: {
        enabled: true,
        policy: "mandatory",
      },
    },
    runtime: {
      entryNodeId,
      primaryModel,
      memoryStrategy: hasMemory ? "kv+log+reflection" : "ephemeral",
      approvalRequired: nodes.some((n) => n.data.kind === "guardrail"),
      humanInTheLoop: nodes.some((n) => n.data.kind === "guardrail" || n.data.kind === "monitor"),
    },
    exportHints: [
      "Include README setup instructions.",
      "Attach a 3-minute demo video.",
      "Document 0G Storage, Compute, DA, and Chain usage.",
      "Show at least one working example agent.",
      "Verify contract or deployment addresses after deployment.",
    ],
  };
}

export function validateBlueprint(nodes, edges) {
  const issues = [];
  const kinds = nodes.map((n) => n.data.kind);
  const idSet = new Set(nodes.map((n) => n.id));

  if (!kinds.includes("input")) {
    issues.push({
      id: "no-input",
      severity: "error",
      title: "Add an input node",
      detail: "Every deployable agent needs a source of user intent.",
    });
  }
  if (!kinds.includes("model")) {
    issues.push({
      id: "no-model",
      severity: "error",
      title: "Add a model node",
      detail: "The agent needs a reasoning engine for planning and synthesis.",
    });
  }
  if (!kinds.includes("output")) {
    issues.push({
      id: "no-output",
      severity: "error",
      title: "Add an output node",
      detail: "The agent should return something visible to the user or another system.",
    });
  }
  if (!kinds.includes("memory")) {
    issues.push({
      id: "no-memory",
      severity: "warning",
      title: "No persistent memory",
      detail: "The builder works without memory, but CLAW MACHINE becomes much stronger with snapshots and reflections.",
    });
  }
  if (!kinds.includes("deploy")) {
    issues.push({
      id: "no-deploy-node",
      severity: "warning",
      title: "No deploy node",
      detail: "A deploy node helps users understand the one-click 0G deployment path.",
    });
  }

  for (const e of edges) {
    if (!idSet.has(e.source) || !idSet.has(e.target)) {
      issues.push({
        id: e.id,
        severity: "error",
        title: "Broken connection",
        detail: `Edge ${e.id} points to a missing node.`,
      });
    }
  }

  const inputNodes = nodes.filter((n) => n.data.kind === "input");
  const outputNodes = nodes.filter((n) => n.data.kind === "output");
  if (inputNodes.length && outputNodes.length) {
    const adjacency = new Map();
    for (const n of nodes) adjacency.set(n.id, []);
    for (const e of edges) {
      adjacency.get(e.source)?.push(e.target);
    }

    const visited = new Set();
    const queue = inputNodes.map((n) => n.id);
    while (queue.length) {
      const current = queue.shift();
      if (visited.has(current)) continue;
      visited.add(current);
      const next = adjacency.get(current) ?? [];
      next.forEach((id) => {
        if (!visited.has(id)) queue.push(id);
      });
    }

    const reachableOutput = outputNodes.some((n) => visited.has(n.id));
    if (!reachableOutput) {
      issues.push({
        id: "no-path",
        severity: "error",
        title: "No path from input to output",
        detail: "Connect at least one input to one output through model or planner nodes.",
      });
    }
  }

  const hasMemoryLoop = edges.some((e) => {
    const src = nodes.find((n) => n.id === e.source)?.data.kind;
    const tgt = nodes.find((n) => n.id === e.target)?.data.kind;
    return src === "memory" || tgt === "memory";
  });
  if (!hasMemoryLoop) {
    issues.push({
      id: "memory-loop",
      severity: "info",
      title: "Add a memory loop",
      detail: "Persistent memory snapshots and reflections make agents improve over time.",
    });
  }

  return issues;
}

export async function sha256(text) {
  if (typeof window !== "undefined" && window.crypto?.subtle) {
    const data = new TextEncoder().encode(text);
    const digest = await window.crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  return `fallback_${Math.abs(hash)}`;
}

export async function packageForZeroG(manifest, nodes, edges) {
  const bundle = {
    manifest,
    nodes,
    edges,
    exportedAt: new Date().toISOString(),
    files: {
      "manifest.json": manifest,
      "graph.json": { nodes, edges },
      "README.deploy.md": {
        title: manifest.appName,
        summary: manifest.description,
        zeroG: manifest.zeroG,
        runtime: manifest.runtime,
      },
    },
  };

  const hash = await sha256(JSON.stringify(bundle));

  return {
    hash,
    artifacts: [
      {
        name: "manifest.json",
        size: `${JSON.stringify(manifest).length} bytes`,
        kind: "manifest",
        hash: await sha256(JSON.stringify(manifest)),
      },
      {
        name: "graph.json",
        size: `${JSON.stringify({ nodes, edges }).length} bytes`,
        kind: "graph",
        hash: await sha256(JSON.stringify({ nodes, edges })),
      },
      {
        name: "README.deploy.md",
        size: `${JSON.stringify(bundle.files["README.deploy.md"]).length} bytes`,
        kind: "document",
        hash: await sha256(JSON.stringify(bundle.files["README.deploy.md"])),
      },
    ],
    bundle,
  };
}
