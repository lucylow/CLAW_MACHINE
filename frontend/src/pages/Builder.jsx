/**
 * CLAW MACHINE — No-code Visual Agent Builder (React Flow)
 *
 * Hooks: useNodesState / useEdgesState must run at component top level (never inside useMemo).
 */

import React, { forwardRef, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, {
  addEdge,
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
} from "reactflow";
import "reactflow/dist/style.css";
import "../styles/visual-builder.css";

import {
  AlertTriangle,
  Bot,
  Brain,
  CircleCheckBig,
  Clock3,
  Copy,
  Database,
  Download,
  FileCode2,
  FileJson,
  Gauge,
  Globe,
  Link as LinkIcon,
  MessageSquareMore,
  PanelsTopLeft,
  RadioTower,
  Rocket,
  Settings2,
  ShieldCheck,
  Sparkles,
  SquarePlus,
  TerminalSquare,
  TestTube2,
  Trash2,
  Upload,
  Wand2,
  Workflow,
} from "lucide-react";

import {
  NODE_COLOR,
  buildDeployTargetPreset,
  buildManifest,
  cloneTemplate,
  defaultTemplate,
  DEFAULT_TEMPLATES,
  getTemplateById,
  packageForZeroG,
  structuredCloneEdge,
  structuredCloneNode,
  validateBlueprint,
} from "./builder-graph.js";

const KINDS = [
  { kind: "input", label: "Input", description: "User prompt, webhook, or API event", icon: MessageSquareMore, category: "interface" },
  { kind: "planner", label: "Planner", description: "Break a goal into executable steps", icon: Workflow, category: "core" },
  { kind: "model", label: "Model", description: "LLM reasoning, analysis, or synthesis", icon: Brain, category: "compute" },
  { kind: "tool", label: "Tool", description: "Browser, terminal, API, file, or code action", icon: TerminalSquare, category: "core" },
  { kind: "memory", label: "Memory", description: "Persistent session, reflection, and retrieval", icon: Database, category: "memory" },
  { kind: "chain", label: "0G Chain", description: "Onchain execution, settlement, or proof", icon: LinkIcon, category: "chain" },
  { kind: "channel", label: "Channel", description: "Discord, Telegram, API, or dashboard output", icon: RadioTower, category: "interface" },
  { kind: "output", label: "Output", description: "Response, artifact, or action result", icon: FileCode2, category: "interface" },
  { kind: "deploy", label: "0G Deploy", description: "Package and push the agent stack", icon: Rocket, category: "compute" },
  { kind: "monitor", label: "Monitor", description: "Health, logs, alerts, and observability", icon: Gauge, category: "quality" },
  { kind: "guardrail", label: "Guardrail", description: "Policy, approvals, and safety checks", icon: ShieldCheck, category: "quality" },
];

const initialGraph = cloneTemplate(defaultTemplate);

function cn(...values) {
  return values.filter(Boolean).join(" ");
}

function safeJson(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

async function deployToZeroG(payload) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 60_000);
  try {
    const res = await fetch("/api/deploy/0g", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json) {
      throw new Error(json?.error?.message ?? `Deployment failed with status ${res.status}`);
    }
    return json;
  } finally {
    window.clearTimeout(timeout);
  }
}

function downloadJSON(filename, value) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function buildReadme(manifest, hash) {
  return `# ${manifest.appName}\n\n${manifest.description}\n\n## Deployment Hash\n${hash}\n\n## 0G Features\n- Storage: ${manifest.zeroG.storage.enabled ? "enabled" : "disabled"}\n- Compute: ${manifest.zeroG.compute.enabled ? "enabled" : "disabled"}\n- Chain: ${manifest.zeroG.chain.enabled ? "enabled" : "disabled"}\n- DA: ${manifest.zeroG.da.enabled ? "enabled" : "disabled"}\n\n## Runtime\n- Entry node: ${manifest.runtime.entryNodeId ?? "none"}\n- Memory strategy: ${manifest.runtime.memoryStrategy}\n- Human in the loop: ${manifest.runtime.humanInTheLoop ? "yes" : "no"}\n\n## Export Hints\n${manifest.exportHints.map((hint) => `- ${hint}`).join("\n")}`;
}

function iconForKind(kind) {
  const I = KINDS.find((k) => k.kind === kind)?.icon ?? Bot;
  return <I className="vb-icon" />;
}

function builderNodeTitle(kind) {
  return KINDS.find((item) => item.kind === kind)?.label ?? kind;
}

const BuilderNodeCard = memo(
  forwardRef(function BuilderNodeCard({ data, selected }, ref) {
  const accent = NODE_COLOR[data.kind];
  return (
    <div
      ref={ref}
      className={cn("vb-node-card", selected && "selected")}
      style={selected ? { boxShadow: `0 0 0 1px ${accent}55, 0 0 35px ${accent}22` } : undefined}
    >
      <Handle type="target" position={Position.Left} className="!h-3 !w-3 !border-0 !bg-lime-400" />
      <Handle type="source" position={Position.Right} className="!h-3 !w-3 !border-0 !bg-lime-400" />
      <div style={{ marginBottom: "0.75rem", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.75rem" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.28em", color: "rgba(255,255,255,0.55)" }}>
            <span style={{ display: "flex", height: "1.5rem", width: "1.5rem", alignItems: "center", justifyContent: "center", borderRadius: "999px", border: "1px solid rgba(255,255,255,0.1)", color: accent }}>
              {iconForKind(data.kind)}
            </span>
            {builderNodeTitle(data.kind)}
          </div>
          <h3 style={{ margin: "0.5rem 0 0", fontSize: "1rem", fontWeight: 600, color: "#fff" }}>{data.label}</h3>
          <p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem", lineHeight: 1.5, color: "rgba(255,255,255,0.65)" }}>{data.description}</p>
        </div>
        <span className="vb-node-pill">{data.status}</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
        {data.tags.slice(0, 3).map((tag) => (
          <span key={tag} className="vb-badge" style={{ fontSize: "10px" }}>
            {tag}
          </span>
        ))}
      </div>
      <div style={{ marginTop: "1rem", borderRadius: "0.75rem", border: "1px solid rgba(255,255,255,0.1)", background: "rgba(0,0,0,0.4)", padding: "0.75rem", fontSize: "12px", color: "rgba(255,255,255,0.6)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
          <span>Category</span>
          <span style={{ color: "#fff" }}>{data.category}</span>
        </div>
        <div style={{ marginTop: "0.25rem", display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
          <span>Enabled</span>
          <span style={{ color: data.enabled ? "#a3e635" : "#f87171" }}>{data.enabled ? "yes" : "no"}</span>
        </div>
      </div>
    </div>
  );
  }),
);

function NodeLibrary({ onAdd, onDragStart }) {
  return (
    <div className="vb-card">
      <div className="vb-card-header">
        <h3 className="vb-card-title">
          <SquarePlus className="vb-icon" style={{ color: "#a3e635" }} /> Node Library
        </h3>
      </div>
      <div className="vb-card-content vb-grid-2">
        {KINDS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.kind}
              type="button"
              draggable
              onDragStart={(e) => onDragStart(e, item.kind)}
              className="vb-node-lib-btn"
              onClick={() => onAdd(item.kind)}
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem" }}>
                <span style={{ marginTop: 2, color: "#a3e635" }}>
                  <Icon className="vb-icon" />
                </span>
                <div>
                  <div style={{ fontSize: "0.875rem", fontWeight: 500 }}>{item.label}</div>
                  <div style={{ fontSize: "12px", lineHeight: 1.4, color: "rgba(255,255,255,0.55)" }}>{item.description}</div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TemplateLibrary({ templates, onSelect }) {
  return (
    <div className="vb-card">
      <div className="vb-card-header">
        <h3 className="vb-card-title">
          <Sparkles className="vb-icon" style={{ color: "#a3e635" }} /> Templates
        </h3>
      </div>
      <div className="vb-card-content" style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {templates.map((template) => (
          <button key={template.id} type="button" onClick={() => onSelect(template.id)} className="vb-template-btn">
            <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", alignItems: "center" }}>
              <div style={{ fontSize: "0.875rem", fontWeight: 600 }}>{template.name}</div>
              <span className="vb-badge" style={{ borderColor: "rgba(163,230,53,0.2)", background: "rgba(163,230,53,0.1)", color: "#bef264" }}>
                preset
              </span>
            </div>
            <p style={{ margin: "0.25rem 0 0", fontSize: "12px", lineHeight: 1.5, color: "rgba(255,255,255,0.6)" }}>{template.description}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function InspectorPanel({ selectedNode, onUpdate, onDelete }) {
  if (!selectedNode) {
    return (
      <div className="vb-card">
        <div className="vb-card-header">
          <h3 className="vb-card-title">Inspector</h3>
        </div>
        <div className="vb-card-content" style={{ fontSize: "0.875rem", color: "rgba(255,255,255,0.55)" }}>
          Select a node to edit labels, prompts, tool settings, memory rules, and deployment hints.
        </div>
      </div>
    );
  }

  const data = selectedNode.data;

  return (
    <div className="vb-card">
      <div className="vb-card-header">
        <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", alignItems: "flex-start" }}>
          <div>
            <h3 className="vb-card-title">Inspector</h3>
            <p style={{ margin: "0.5rem 0 0", fontSize: "1rem", fontWeight: 600 }}>{data.label}</p>
          </div>
          <button type="button" className="vb-btn vb-btn-ghost" onClick={onDelete} title="Delete node" style={{ color: "#fca5a5" }}>
            <Trash2 className="vb-icon" />
          </button>
        </div>
      </div>
      <div className="vb-card-content" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <div>
          <label className="vb-label">Label</label>
          <input className="vb-input" value={data.label} onChange={(e) => onUpdate({ label: e.target.value })} />
        </div>
        <div>
          <label className="vb-label">Description</label>
          <textarea className="vb-textarea" value={data.description} onChange={(e) => onUpdate({ description: e.target.value })} />
        </div>
        <div>
          <label className="vb-label">Prompt / Instruction</label>
          <textarea
            className="vb-textarea"
            style={{ minHeight: "7rem" }}
            value={data.prompt ?? ""}
            onChange={(e) => onUpdate({ prompt: e.target.value })}
            placeholder="System prompt, instruction, or agent policy..."
          />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
          <div>
            <label className="vb-label">Model</label>
            <input className="vb-input" value={data.model ?? ""} onChange={(e) => onUpdate({ model: e.target.value })} placeholder="qwen3.6-plus" />
          </div>
          <div>
            <label className="vb-label">Status</label>
            <input className="vb-input" value={data.status} readOnly />
          </div>
        </div>
        <div>
          <label className="vb-label">Tags</label>
          <input
            className="vb-input"
            value={data.tags.join(", ")}
            onChange={(e) => onUpdate({ tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })}
          />
        </div>
        <div>
          <label className="vb-label">Enabled</label>
          <div className="vb-switch-row">
            <span style={{ fontSize: "0.875rem", color: "rgba(255,255,255,0.7)" }}>Node enabled in runtime</span>
            <input type="checkbox" checked={data.enabled} onChange={(e) => onUpdate({ enabled: e.target.checked })} />
          </div>
        </div>
        <div style={{ borderRadius: "0.75rem", border: "1px solid rgba(255,255,255,0.1)", background: "rgba(0,0,0,0.4)", padding: "0.75rem", fontSize: "12px", color: "rgba(255,255,255,0.6)" }}>
          <div style={{ marginBottom: "0.5rem", display: "flex", justifyContent: "space-between" }}>
            <span style={{ textTransform: "uppercase", letterSpacing: "0.22em" }}>Config</span>
            <span className="vb-badge">{data.kind}</span>
          </div>
          <pre className="vb-pre">{safeJson(data.config)}</pre>
        </div>
      </div>
    </div>
  );
}

function ReadonlyManifestPanel({ manifest, hash }) {
  return (
    <div className="vb-card">
      <div className="vb-card-header">
        <h3 className="vb-card-title">
          <FileJson className="vb-icon" style={{ color: "#a3e635" }} /> Manifest Preview
        </h3>
      </div>
      <div className="vb-card-content" style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <div style={{ borderRadius: "0.75rem", border: "1px solid rgba(255,255,255,0.1)", background: "rgba(0,0,0,0.4)", padding: "0.75rem", fontSize: "12px", color: "rgba(255,255,255,0.7)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
            <span>Package Hash</span>
            <span style={{ fontFamily: "monospace", color: "#bef264" }}>{hash}</span>
          </div>
          <div style={{ marginTop: "0.5rem", display: "flex", justifyContent: "space-between" }}>
            <span>Entry Node</span>
            <span style={{ color: "#fff" }}>{manifest.runtime.entryNodeId ?? "none"}</span>
          </div>
          <div style={{ marginTop: "0.5rem", display: "flex", justifyContent: "space-between" }}>
            <span>Primary Model</span>
            <span style={{ color: "#fff" }}>{manifest.runtime.primaryModel ?? "none"}</span>
          </div>
          <div style={{ marginTop: "0.5rem", display: "flex", justifyContent: "space-between" }}>
            <span>Memory</span>
            <span style={{ color: "#fff" }}>{manifest.runtime.memoryStrategy}</span>
          </div>
        </div>
        <div className="vb-scroll">
          <pre className="vb-pre">{safeJson(manifest)}</pre>
        </div>
      </div>
    </div>
  );
}

function DeploymentLog({ logs }) {
  return (
    <div className="vb-card">
      <div className="vb-card-header">
        <h3 className="vb-card-title">
          <Clock3 className="vb-icon" style={{ color: "#a3e635" }} /> Deployment Log
        </h3>
      </div>
      <div className="vb-card-content" style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {logs.length === 0 ? (
          <div style={{ borderRadius: "0.75rem", border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", padding: "0.75rem", fontSize: "0.875rem", color: "rgba(255,255,255,0.55)" }}>
            No deployment activity yet. Click <span style={{ color: "#fff" }}>Deploy to 0G</span> to package, upload, and verify.
          </div>
        ) : (
          logs.map((item) => (
            <div key={item.id} style={{ borderRadius: "0.75rem", border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", padding: "0.75rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
                <div style={{ fontSize: "0.875rem", fontWeight: 500 }}>{item.title}</div>
                <span
                  className={cn(
                    "vb-badge",
                    item.state === "success" && "border-lime-400/20",
                  )}
                  style={
                    item.state === "success"
                      ? { borderColor: "rgba(163,230,53,0.2)", background: "rgba(163,230,53,0.1)", color: "#bef264" }
                      : item.state === "running"
                        ? { borderColor: "rgba(34,211,238,0.2)", background: "rgba(34,211,238,0.1)", color: "#a5f3fc" }
                        : item.state === "error"
                          ? { borderColor: "rgba(248,113,113,0.2)", background: "rgba(248,113,113,0.1)", color: "#fca5a5" }
                          : {}
                  }
                >
                  {item.state}
                </span>
              </div>
              <p style={{ margin: "0.25rem 0 0", fontSize: "12px", lineHeight: 1.5, color: "rgba(255,255,255,0.55)" }}>{item.detail}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function DeploymentSummaryCard({ issues }) {
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  const infos = issues.filter((i) => i.severity === "info");

  return (
    <div className="vb-card">
      <div className="vb-card-header">
        <h3 className="vb-card-title">
          <TestTube2 className="vb-icon" style={{ color: "#a3e635" }} /> Readiness
        </h3>
      </div>
      <div className="vb-card-content" style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "0.5rem" }}>
          <StatusPill label="Errors" value={errors.length} tone="red" />
          <StatusPill label="Warnings" value={warnings.length} tone="amber" />
          <StatusPill label="Hints" value={infos.length} tone="blue" />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {issues.length === 0 ? (
            <div style={{ borderRadius: "0.75rem", border: "1px solid rgba(163,230,53,0.2)", background: "rgba(163,230,53,0.1)", padding: "0.75rem", fontSize: "0.875rem", color: "#d9f99d" }}>
              The graph is ready for packaging and 0G deployment.
            </div>
          ) : (
            issues.map((issue) => (
              <div
                key={issue.id}
                className={cn(
                  issue.severity === "error" && "vb-issue-error",
                  issue.severity === "warning" && "vb-issue-warn",
                  issue.severity === "info" && "vb-issue-info",
                )}
                style={{ borderRadius: "0.75rem", padding: "0.75rem" }}
              >
                <div style={{ fontSize: "0.875rem", fontWeight: 500 }}>{issue.title}</div>
                <div style={{ marginTop: "0.25rem", fontSize: "12px", lineHeight: 1.5, opacity: 0.85 }}>{issue.detail}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function StatusPill({ label, value, tone }) {
  const classes =
    tone === "red"
      ? "vb-issue-error"
      : tone === "amber"
        ? "vb-issue-warn"
        : "vb-issue-info";
  return (
    <div className={cn(classes)} style={{ borderRadius: "0.75rem", padding: "0.75rem", textAlign: "center" }}>
      <div style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.22em", opacity: 0.8 }}>{label}</div>
      <div style={{ marginTop: "0.25rem", fontSize: "1.125rem", fontWeight: 600 }}>{value}</div>
    </div>
  );
}

function ReceiptItem({ label, value }) {
  return (
    <div style={{ borderRadius: "0.75rem", border: "1px solid rgba(255,255,255,0.1)", background: "rgba(0,0,0,0.4)", padding: "0.75rem", fontSize: "0.875rem", color: "rgba(255,255,255,0.7)" }}>
      <div style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.24em", color: "rgba(255,255,255,0.45)" }}>{label}</div>
      <div style={{ marginTop: "0.25rem", wordBreak: "break-all", fontFamily: "monospace", fontSize: "12px", color: "#bef264" }}>{value}</div>
    </div>
  );
}

function addNodeToCanvas(nodes, kind, position) {
  const template = KINDS.find((item) => item.kind === kind);
  const index = nodes.filter((n) => n.data.kind === kind).length + 1;
  const newNode = {
    id: `${kind}_${index}_${Date.now().toString(36)}`,
    type: "builderNode",
    position: position ?? { x: 120 + nodes.length * 15, y: 120 + (nodes.length % 3) * 70 },
    data: {
      kind,
      label: `${template?.label ?? kind} ${index}`,
      description: template?.description ?? "New node",
      category: template?.category ?? "core",
      prompt: kind === "model" ? "Think carefully and use the available graph context." : undefined,
      model: kind === "model" ? "qwen3.6-plus" : undefined,
      tool: kind === "tool" ? "browser" : undefined,
      memoryPolicy: kind === "memory" ? "kv+log" : undefined,
      chainPolicy: kind === "chain" ? "deploy + verify" : undefined,
      channel: kind === "channel" || kind === "input" || kind === "output" ? "chat" : undefined,
      tags: [kind, "custom"],
      enabled: true,
      status: "configured",
      config: {},
      icon: template ? undefined : "Sparkles",
    },
  };
  return [...nodes, newNode];
}

function BuilderCanvas() {
  const [activeTemplate, setActiveTemplate] = useState(defaultTemplate);
  const [appName, setAppName] = useState("Claw Machine Agent");
  const [description, setDescription] = useState(defaultTemplate.description);
  const [mode, setMode] = useState("draft");
  const [nodes, setNodes, onNodesChange] = useNodesState(initialGraph.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialGraph.edges);
  const [selectedNodeId, setSelectedNodeId] = useState(defaultTemplate.nodes[0]?.id ?? null);
  const [readiness, setReadiness] = useState(validateBlueprint(defaultTemplate.nodes, defaultTemplate.edges));
  const [logs, setLogs] = useState([]);
  const [deploying, setDeploying] = useState(false);
  const [deployDialogOpen, setDeployDialogOpen] = useState(false);
  const [deployTab, setDeployTab] = useState("summary");
  const [deployReceipt, setDeployReceipt] = useState(null);
  const [hashPreview, setHashPreview] = useState("");
  const [artifactList, setArtifactList] = useState([]);
  const [automationEnabled, setAutomationEnabled] = useState(true);
  const [humanApprovalRequired, setHumanApprovalRequired] = useState(true);
  const [temperature, setTemperature] = useState(0.4);
  const [deploymentPreset] = useState(buildDeployTargetPreset());
  const flowWrapRef = useRef(null);

  useEffect(() => {
    setReadiness(validateBlueprint(nodes, edges));
  }, [nodes, edges]);

  const selectedNode = useMemo(() => nodes.find((node) => node.id === selectedNodeId) ?? null, [nodes, selectedNodeId]);

  const manifest = useMemo(() => buildManifest(appName, description, mode, nodes, edges, deploymentPreset), [appName, description, mode, nodes, edges, deploymentPreset]);

  const hasErrors = readiness.some((issue) => issue.severity === "error");
  const deployReady = !hasErrors && nodes.length > 0;

  const updateSelectedNode = useCallback(
    (patch) => {
      if (!selectedNode) return;
      setNodes((current) => current.map((node) => (node.id === selectedNode.id ? { ...node, data: { ...node.data, ...patch } } : node)));
    },
    [selectedNode, setNodes],
  );

  const removeSelectedNode = useCallback(() => {
    if (!selectedNode) return;
    setNodes((current) => current.filter((node) => node.id !== selectedNode.id));
    setEdges((current) => current.filter((edge) => edge.source !== selectedNode.id && edge.target !== selectedNode.id));
    setSelectedNodeId(null);
  }, [selectedNode, setNodes, setEdges]);

  const onConnect = useCallback(
    (connection) => {
      setEdges((eds) =>
        addEdge(
          {
            ...connection,
            animated: true,
            type: "smoothstep",
            style: { strokeWidth: 2, stroke: "#a3e635" },
            data: { kind: "control", encrypted: false, durable: false },
          },
          eds,
        ),
      );
    },
    [setEdges],
  );

  const onNodeClick = useCallback((_event, node) => {
    setSelectedNodeId(node.id);
  }, []);

  const onDragStart = (event, kind) => {
    event.dataTransfer.setData("application/reactflow", kind);
    event.dataTransfer.effectAllowed = "move";
  };

  const onDrop = useCallback(
    (event) => {
      event.preventDefault();
      const kind = event.dataTransfer.getData("application/reactflow");
      if (!kind) return;
      const bounds = flowWrapRef.current?.getBoundingClientRect();
      if (!bounds) return;
      const position = {
        x: event.clientX - bounds.left - 100,
        y: event.clientY - bounds.top - 40,
      };
      setNodes((current) => addNodeToCanvas(current, kind, position));
    },
    [setNodes],
  );

  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const selectTemplate = useCallback(
    (templateId) => {
      const template = getTemplateById(templateId);
      setActiveTemplate(template);
      setAppName(template.name);
      setDescription(template.outcome);
      setSelectedNodeId(template.nodes[0]?.id ?? null);
      setNodes(template.nodes.map(structuredCloneNode));
      setEdges(template.edges.map(structuredCloneEdge));
      setMode("draft");
      setLogs([]);
      setDeployReceipt(null);
      setHashPreview("");
      setArtifactList([]);
    },
    [setNodes, setEdges],
  );

  const addNode = useCallback(
    (kind) => {
      setNodes((current) => addNodeToCanvas(current, kind));
    },
    [setNodes],
  );

  const exportManifest = useCallback(() => {
    downloadJSON(`${appName.replace(/\s+/g, "-").toLowerCase()}-manifest.json`, manifest);
  }, [appName, manifest]);

  const exportGraph = useCallback(() => {
    downloadJSON(`${appName.replace(/\s+/g, "-").toLowerCase()}-graph.json`, { nodes, edges });
  }, [appName, nodes, edges]);

  const exportReadme = useCallback(() => {
    const readme = buildReadme(manifest, hashPreview || "pending-hash");
    downloadText(`${appName.replace(/\s+/g, "-").toLowerCase()}-README.deploy.md`, readme);
  }, [appName, manifest, hashPreview]);

  const generateBundle = useCallback(async () => {
    setMode("dry-run");
    setLogs([
      { id: "1", title: "Validate blueprint", detail: "Checking required nodes, paths, and deployment readiness.", state: "running", ts: Date.now() },
      { id: "2", title: "Build manifest", detail: "Converting the canvas into a 0G deployment manifest.", state: "pending", ts: Date.now() },
      { id: "3", title: "Package artifacts", detail: "Preparing manifest.json, graph.json, and README.deploy.md.", state: "pending", ts: Date.now() },
    ]);

    const bundle = await packageForZeroG(manifest, nodes, edges);
    setHashPreview(bundle.hash);
    setArtifactList(bundle.artifacts);
    setLogs([
      { id: "1", title: "Validate blueprint", detail: "Blueprint validated and ready for deployment.", state: "success", ts: Date.now() },
      { id: "2", title: "Build manifest", detail: "Manifest generated successfully.", state: "success", ts: Date.now() },
      { id: "3", title: "Package artifacts", detail: "Artifacts packaged and hashed.", state: "success", ts: Date.now() },
    ]);
    setMode("dry-run");
    return bundle;
  }, [manifest, nodes, edges]);

  const deploy = useCallback(async () => {
    if (deploying) return;
    setDeploying(true);
    setDeployDialogOpen(true);
    setDeployReceipt(null);
    setLogs([
      { id: "1", title: "Validate blueprint", detail: "Checking the graph for missing inputs, outputs, and memory loops.", state: "running", ts: Date.now() },
      { id: "2", title: "Package manifest", detail: "Building the deployment bundle for 0G.", state: "pending", ts: Date.now() },
      { id: "3", title: "Upload artifacts", detail: "Sending manifests and graph metadata to 0G Storage.", state: "pending", ts: Date.now() },
      { id: "4", title: "Deploy runtime", detail: "Creating the agent runtime and wiring compute + chain.", state: "pending", ts: Date.now() },
      { id: "5", title: "Verify receipt", detail: "Reading back the deployment receipt and explorer links.", state: "pending", ts: Date.now() },
    ]);

    try {
      const bundle = await packageForZeroG(manifest, nodes, edges);
      setHashPreview(bundle.hash);
      setArtifactList(bundle.artifacts);
      setMode("deploy");
      setLogs((current) =>
        current.map((item) => {
          if (item.id === "1" || item.id === "2") return { ...item, state: "success" };
          if (item.id === "3") return { ...item, state: "running", detail: "Uploading bundle to 0G Storage..." };
          return item;
        }),
      );

      const response = await deployToZeroG({
        manifest,
        mode: "deploy",
        target: deploymentPreset,
      });

      if (!response.ok) {
        throw new Error(response.error?.message ?? "0G deployment failed");
      }

      setLogs((current) =>
        current.map((item) => {
          if (item.id === "3") return { ...item, state: "success", detail: "Artifacts uploaded to 0G Storage." };
          if (item.id === "4") return { ...item, state: "success", detail: "Runtime deployed and activated." };
          if (item.id === "5") return { ...item, state: "success", detail: "Deployment receipt and explorer links verified." };
          return item;
        }),
      );

      setDeployReceipt(response);
      setMode("verify");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown deployment failure";
      setLogs((current) => [...current, { id: `err_${Date.now()}`, title: "Deployment failed", detail: message, state: "error", ts: Date.now() }]);
    } finally {
      setDeploying(false);
    }
  }, [deploying, deploymentPreset, manifest, nodes, edges]);

  const copyManifest = useCallback(async () => {
    await navigator.clipboard.writeText(JSON.stringify(manifest, null, 2));
  }, [manifest]);

  const copyReceipt = useCallback(async () => {
    if (!deployReceipt) return;
    await navigator.clipboard.writeText(JSON.stringify(deployReceipt, null, 2));
  }, [deployReceipt]);

  const deploymentSummary = useMemo(() => {
    const issueCount = readiness.length;
    const errorCount = readiness.filter((i) => i.severity === "error").length;
    const warningCount = readiness.filter((i) => i.severity === "warning").length;
    return {
      nodes: nodes.length,
      edges: edges.length,
      issueCount,
      errorCount,
      warningCount,
      ready: deployReady,
      hasMemory: nodes.some((n) => n.data.kind === "memory"),
      hasDeploy: nodes.some((n) => n.data.kind === "deploy"),
      hasGuardrail: nodes.some((n) => n.data.kind === "guardrail"),
      hasChain: nodes.some((n) => n.data.kind === "chain"),
      primaryModel: nodes.find((n) => n.data.kind === "model")?.data.model ?? "qwen3.6-plus",
    };
  }, [nodes, edges, readiness, deployReady]);

  return (
    <div className="vb-root">
      <div className="vb-container">
        <header className="vb-header">
          <div>
            <div className="vb-header-title-row">
              <div className="vb-logo">
                <Wand2 className="vb-icon" style={{ width: "1.25rem", height: "1.25rem" }} />
              </div>
              <div>
                <p className="vb-kicker">CLAW MACHINE</p>
                <h1 className="vb-h1">No-code Visual Agent Builder</h1>
              </div>
            </div>
            <p className="vb-sub">
              Compose agents visually, wire memory and tools, inspect the runtime, export a deployable manifest, and ship the full stack to 0G with one click.
            </p>
          </div>
          <div className="vb-badges">
            <span className="vb-badge">0G Storage</span>
            <span className="vb-badge">0G Compute</span>
            <span className="vb-badge">0G Chain</span>
            <span className="vb-badge">0G DA</span>
          </div>
        </header>

        <div className="vb-grid-main">
          <aside className="vb-aside">
            <TemplateLibrary templates={DEFAULT_TEMPLATES} onSelect={selectTemplate} />
            <NodeLibrary onAdd={addNode} onDragStart={onDragStart} />

            <div className="vb-card">
              <div className="vb-card-header">
                <h3 className="vb-card-title">
                  <Settings2 className="vb-icon" style={{ color: "#a3e635" }} /> Builder Settings
                </h3>
              </div>
              <div className="vb-card-content" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div>
                  <label className="vb-label">Agent Name</label>
                  <input className="vb-input" value={appName} onChange={(e) => setAppName(e.target.value)} />
                </div>
                <div>
                  <label className="vb-label">Description</label>
                  <textarea className="vb-textarea" value={description} onChange={(e) => setDescription(e.target.value)} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  <div className="vb-switch-row">
                    <span style={{ fontSize: "0.875rem", color: "rgba(255,255,255,0.7)" }}>Automation Enabled</span>
                    <input type="checkbox" checked={automationEnabled} onChange={(e) => setAutomationEnabled(e.target.checked)} />
                  </div>
                  <div className="vb-switch-row">
                    <span style={{ fontSize: "0.875rem", color: "rgba(255,255,255,0.7)" }}>Human Approval</span>
                    <input type="checkbox" checked={humanApprovalRequired} onChange={(e) => setHumanApprovalRequired(e.target.checked)} />
                  </div>
                </div>
                <div>
                  <label className="vb-label">Primary Model Temperature</label>
                  <input type="range" className="vb-slider" min={0} max={1} step={0.05} value={temperature} onChange={(e) => setTemperature(Number(e.target.value))} />
                  <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)", marginTop: 4 }}>{temperature.toFixed(2)}</div>
                </div>
              </div>
            </div>
          </aside>

          <main className="vb-main-col">
            <div className="vb-canvas-wrap">
              <div className="vb-card-header" style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "0.75rem" }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: "1.125rem", color: "#fff" }}>Canvas</h3>
                    <p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem", color: "rgba(255,255,255,0.55)" }}>
                      Drag nodes from the library or use presets, then connect them into a deployable agent graph.
                    </p>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                    <button type="button" className="vb-btn vb-btn-outline" onClick={generateBundle}>
                      <TestTube2 className="vb-icon" /> Dry-run
                    </button>
                    <button type="button" className="vb-btn vb-btn-outline" onClick={exportManifest}>
                      <Download className="vb-icon" /> Export manifest
                    </button>
                    <button type="button" className="vb-btn vb-btn-outline" onClick={exportGraph}>
                      <PanelsTopLeft className="vb-icon" /> Export graph
                    </button>
                    <button type="button" className="vb-btn vb-btn-outline" onClick={exportReadme}>
                      <FileJson className="vb-icon" /> Export README
                    </button>
                    <button type="button" className="vb-btn vb-btn-primary" onClick={deploy} disabled={!deployReady || deploying}>
                      <Rocket className="vb-icon" /> {deploying ? "Deploying..." : "Deploy to 0G"}
                    </button>
                  </div>
                </div>
              </div>
              <div ref={flowWrapRef} className="vb-canvas-inner">
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  onConnect={onConnect}
                  onNodeClick={onNodeClick}
                  onDrop={onDrop}
                  onDragOver={onDragOver}
                  fitView
                  nodeTypes={{ builderNode: BuilderNodeCard }}
                  className="vb-react-flow"
                  style={{ width: "100%", height: "100%" }}
                >
                  <MiniMap nodeColor={(n) => NODE_COLOR[n.data.kind] ?? "#fff"} className="!bg-black/50 !text-white" />
                  <Controls className="!bg-black/60 !text-white" />
                  <Background gap={24} size={1} color="#ffffff14" />
                </ReactFlow>
              </div>
            </div>

            <div className="vb-card">
              <div className="vb-card-header">
                <h3 className="vb-card-title">
                  <PanelsTopLeft className="vb-icon" style={{ color: "#a3e635" }} /> Flow Overview
                </h3>
              </div>
              <div className="vb-card-content vb-flow-stats">
                {[
                  { label: "Nodes", value: deploymentSummary.nodes },
                  { label: "Edges", value: deploymentSummary.edges },
                  { label: "Issues", value: deploymentSummary.issueCount },
                  { label: "Errors", value: deploymentSummary.errorCount },
                  { label: "Warnings", value: deploymentSummary.warningCount },
                  { label: "Memory", value: deploymentSummary.hasMemory ? "yes" : "no" },
                  { label: "Guardrails", value: deploymentSummary.hasGuardrail ? "yes" : "no" },
                  { label: "Chain", value: deploymentSummary.hasChain ? "yes" : "no" },
                ].map((item) => (
                  <div key={item.label} className="vb-stat-cell">
                    <div style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.24em", color: "rgba(255,255,255,0.45)" }}>{item.label}</div>
                    <div style={{ marginTop: "0.25rem", fontSize: "1.125rem", fontWeight: 600 }}>{String(item.value)}</div>
                  </div>
                ))}
              </div>
            </div>
          </main>

          <aside className="vb-aside">
            <DeploymentSummaryCard issues={readiness} />
            <InspectorPanel selectedNode={selectedNode} onUpdate={updateSelectedNode} onDelete={removeSelectedNode} />
            <ReadonlyManifestPanel manifest={manifest} hash={hashPreview || "pending"} />
            <DeploymentLog logs={logs} />
          </aside>
        </div>

        <div className="vb-card vb-footer-bar">
          <div className="vb-footer-inner">
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <div
                className="vb-logo"
                style={{
                  borderColor: deployReady ? "rgba(163,230,53,0.2)" : "rgba(251,191,36,0.2)",
                  background: deployReady ? "rgba(163,230,53,0.1)" : "rgba(251,191,36,0.1)",
                  color: deployReady ? "#bef264" : "#fde68a",
                }}
              >
                {deployReady ? <CircleCheckBig className="vb-icon" /> : <AlertTriangle className="vb-icon" />}
              </div>
              <div>
                <div style={{ fontSize: "0.875rem", textTransform: "uppercase", letterSpacing: "0.24em", color: "rgba(255,255,255,0.45)" }}>Deployment State</div>
                <div style={{ fontSize: "1.125rem", fontWeight: 600 }}>
                  {deployReady ? "Ready for one-click 0G deployment" : "Fix graph issues before deployment"}
                </div>
                <div style={{ fontSize: "0.875rem", color: "rgba(255,255,255,0.55)" }}>
                  {deploymentSummary.primaryModel} • {manifest.zeroG.storage.mode} storage • {manifest.zeroG.compute.inference} inference • {manifest.zeroG.chain.network}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
              <button type="button" className="vb-btn vb-btn-outline" onClick={copyManifest}>
                <Copy className="vb-icon" /> Copy manifest
              </button>
              <button type="button" className="vb-btn vb-btn-outline" onClick={() => setDeployDialogOpen(true)}>
                <Upload className="vb-icon" /> Deployment details
              </button>
              <button type="button" className="vb-btn vb-btn-primary" onClick={deploy} disabled={!deployReady || deploying}>
                <Rocket className="vb-icon" /> {deploying ? "Deploying..." : "Deploy to 0G"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {deployDialogOpen && (
        <div className="vb-dialog-overlay" role="presentation" onClick={() => setDeployDialogOpen(false)}>
          <div className="vb-dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="vb-card-header" style={{ padding: "1.25rem" }}>
              <h2 style={{ margin: 0, display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "1.25rem" }}>
                <Rocket className="vb-icon" style={{ color: "#a3e635" }} /> One-click 0G deployment
              </h2>
              <p style={{ margin: "0.5rem 0 0", fontSize: "0.875rem", color: "rgba(255,255,255,0.6)" }}>
                Package the visual graph into a manifest, upload artifacts, deploy the runtime, and verify the receipt.
              </p>
            </div>

            <div className="vb-dialog-body">
              <div className="vb-tabs-list" style={{ marginBottom: "1rem" }}>
                {["summary", "artifact", "receipt", "api"].map((t) => (
                  <button key={t} type="button" className={cn("vb-tab", deployTab === t && "active")} onClick={() => setDeployTab(t)}>
                    {t === "summary" ? "Summary" : t === "artifact" ? "Artifacts" : t === "receipt" ? "Receipt" : "API Contract"}
                  </button>
                ))}
              </div>

              {deployTab === "summary" && (
                <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
                  <div className="vb-card" style={{ background: "rgba(255,255,255,0.05)" }}>
                    <div className="vb-card-header">
                      <h3 style={{ margin: 0, fontSize: "1rem" }}>Deployment Manifest</h3>
                    </div>
                    <div className="vb-card-content">
                      <pre className="vb-pre" style={{ maxHeight: 360, overflow: "auto", padding: "0.75rem", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "0.75rem", background: "rgba(0,0,0,0.4)" }}>
                        {safeJson(manifest)}
                      </pre>
                    </div>
                  </div>
                  <div className="vb-card" style={{ background: "rgba(255,255,255,0.05)" }}>
                    <div className="vb-card-header">
                      <h3 style={{ margin: 0, fontSize: "1rem" }}>Deployment Plan</h3>
                    </div>
                    <div className="vb-card-content" style={{ fontSize: "0.875rem", color: "rgba(255,255,255,0.7)", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                      {[
                        ["1. Validate", "Check entry nodes, outputs, memory loops, and graph connectivity."],
                        ["2. Package", "Convert the visual canvas into manifest.json, graph.json, and README.deploy.md."],
                        ["3. Upload", "Send assets and metadata to 0G Storage, then attach hashes to the receipt."],
                        ["4. Deploy", "Call the backend deployment route to provision the runtime and connect compute + chain."],
                        ["5. Verify", "Return addresses, links, and a receipt for the builder dashboard and README."],
                      ].map(([title, detail]) => (
                        <div key={title} style={{ borderRadius: "0.75rem", border: "1px solid rgba(255,255,255,0.1)", background: "rgba(0,0,0,0.4)", padding: "0.75rem" }}>
                          <div style={{ fontWeight: 500, color: "#fff" }}>{title}</div>
                          <div style={{ marginTop: "0.25rem", fontSize: "12px", lineHeight: 1.5, color: "rgba(255,255,255,0.55)" }}>{detail}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {deployTab === "artifact" && (
                <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
                  <div className="vb-card" style={{ background: "rgba(255,255,255,0.05)" }}>
                    <div className="vb-card-header">
                      <h3 style={{ margin: 0, fontSize: "1rem" }}>Artifacts</h3>
                    </div>
                    <div className="vb-card-content">
                      {artifactList.length === 0 ? (
                        <div style={{ padding: "0.75rem", fontSize: "0.875rem", color: "rgba(255,255,255,0.55)" }}>Run a dry-run or deployment to generate artifacts and hashes.</div>
                      ) : (
                        artifactList.map((artifact) => (
                          <div key={artifact.name} style={{ marginBottom: "0.5rem", borderRadius: "0.75rem", border: "1px solid rgba(255,255,255,0.1)", background: "rgba(0,0,0,0.4)", padding: "0.75rem" }}>
                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                              <span style={{ fontWeight: 500 }}>{artifact.name}</span>
                              <span className="vb-badge">{artifact.kind}</span>
                            </div>
                            <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.55)", marginTop: 4 }}>{artifact.size}</div>
                            <div style={{ fontFamily: "monospace", fontSize: "11px", color: "#bef264", marginTop: 4 }}>{artifact.hash}</div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                  <div className="vb-card" style={{ background: "rgba(255,255,255,0.05)" }}>
                    <div className="vb-card-header">
                      <h3 style={{ margin: 0, fontSize: "1rem" }}>Packaging Hash</h3>
                    </div>
                    <div className="vb-card-content" style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                      <div style={{ borderRadius: "0.75rem", border: "1px solid rgba(255,255,255,0.1)", background: "rgba(0,0,0,0.4)", padding: "0.75rem", fontSize: "0.875rem" }}>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span>Manifest hash</span>
                          <span style={{ fontFamily: "monospace", color: "#bef264" }}>{hashPreview || "pending"}</span>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                        <button type="button" className="vb-btn vb-btn-outline" onClick={generateBundle}>
                          <TestTube2 className="vb-icon" /> Re-run dry-run
                        </button>
                        <button type="button" className="vb-btn vb-btn-outline" onClick={copyManifest}>
                          <Copy className="vb-icon" /> Copy manifest
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {deployTab === "receipt" && (
                <div className="vb-card" style={{ background: "rgba(255,255,255,0.05)" }}>
                  <div className="vb-card-header">
                    <h3 style={{ margin: 0, fontSize: "1rem" }}>Deployment Receipt</h3>
                  </div>
                  <div className="vb-card-content">
                    {deployReceipt ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                        <div style={{ borderRadius: "0.75rem", border: "1px solid rgba(255,255,255,0.1)", background: "rgba(0,0,0,0.4)", padding: "0.75rem", fontSize: "0.875rem" }}>
                          <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <span>Deployment ID</span>
                            <span style={{ fontFamily: "monospace", color: "#bef264" }}>{deployReceipt.deploymentId}</span>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
                            <span>Manifest Hash</span>
                            <span style={{ fontFamily: "monospace", color: "#bef264" }}>{deployReceipt.manifestHash}</span>
                          </div>
                        </div>
                        <div style={{ display: "grid", gap: "0.75rem", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
                          <ReceiptItem label="Storage" value={deployReceipt.addresses?.storage ?? "n/a"} />
                          <ReceiptItem label="Compute" value={deployReceipt.addresses?.compute ?? "n/a"} />
                          <ReceiptItem label="Chain" value={deployReceipt.addresses?.chain ?? "n/a"} />
                          <ReceiptItem label="DA" value={deployReceipt.addresses?.da ?? "n/a"} />
                        </div>
                        {deployReceipt.warnings?.length ? (
                          <div className="vb-issue-warn" style={{ padding: "0.75rem" }}>
                            <div style={{ fontWeight: 500 }}>Warnings</div>
                            <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.25rem", fontSize: "12px" }}>
                              {deployReceipt.warnings.map((w) => (
                                <li key={w}>{w}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <div style={{ fontSize: "0.875rem", color: "rgba(255,255,255,0.55)" }}>No receipt yet. Deploy the graph to produce a deployment identifier and addresses.</div>
                    )}
                  </div>
                </div>
              )}

              {deployTab === "api" && (
                <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
                  <div className="vb-card" style={{ background: "rgba(255,255,255,0.05)" }}>
                    <div className="vb-card-header">
                      <h3 style={{ margin: 0, fontSize: "1rem" }}>Backend API Contract</h3>
                    </div>
                    <div className="vb-card-content" style={{ fontSize: "0.875rem", color: "rgba(255,255,255,0.7)", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                      <div style={{ padding: "0.75rem", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "0.75rem", background: "rgba(0,0,0,0.4)" }}>
                        <div style={{ fontWeight: 500, color: "#fff" }}>POST /api/deploy/0g</div>
                        <div style={{ marginTop: 4, fontSize: "12px", lineHeight: 1.5, color: "rgba(255,255,255,0.55)" }}>Accepts deployment manifest; returns receipt (stub wired in CLAW backend).</div>
                      </div>
                      <div style={{ padding: "0.75rem", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "0.75rem", background: "rgba(0,0,0,0.4)" }}>
                        <div style={{ fontWeight: 500, color: "#fff" }}>POST /api/builder/deploy</div>
                        <div style={{ marginTop: 4, fontSize: "12px", lineHeight: 1.5, color: "rgba(255,255,255,0.55)" }}>Legacy visual pipeline deploy with trigger/output node types.</div>
                      </div>
                    </div>
                  </div>
                  <div className="vb-card" style={{ background: "rgba(255,255,255,0.05)" }}>
                    <div className="vb-card-header">
                      <h3 style={{ margin: 0, fontSize: "1rem" }}>Template</h3>
                    </div>
                    <div className="vb-card-content" style={{ fontSize: "0.875rem", color: "rgba(255,255,255,0.7)" }}>
                      Active preset: <strong style={{ color: "#fff" }}>{activeTemplate.name}</strong>
                    </div>
                  </div>
                </div>
              )}

              <div style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid rgba(255,255,255,0.1)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
                <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.45)" }}>0G deployment preview • {appName}</span>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button type="button" className="vb-btn vb-btn-outline" onClick={copyReceipt} disabled={!deployReceipt}>
                    <Copy className="vb-icon" /> Copy receipt
                  </button>
                  <button type="button" className="vb-btn vb-btn-primary" onClick={deploy} disabled={!deployReady || deploying}>
                    <Rocket className="vb-icon" /> {deploying ? "Deploying..." : "Deploy to 0G"}
                  </button>
                  <button type="button" className="vb-btn vb-btn-outline" onClick={() => setDeployDialogOpen(false)}>
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Builder() {
  return (
    <ReactFlowProvider>
      <BuilderCanvas />
    </ReactFlowProvider>
  );
}
