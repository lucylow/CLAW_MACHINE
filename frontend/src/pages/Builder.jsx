/**
 * Builder.jsx — Visual No-Code Agent Builder
 *
 * A drag-and-drop pipeline canvas where non-developers can:
 *   1. Drag skill nodes onto the canvas
 *   2. Connect them with edges to define execution order
 *   3. Configure parameters in the side panel
 *   4. Preview the generated agent code
 *   5. Click "Deploy to 0G" to register and run the agent
 *
 * Uses a lightweight custom canvas (no external graph library dep).
 */

import { useState, useRef, useCallback, useEffect } from "react";
import client from "../services/api.js";

// ── Node types ────────────────────────────────────────────────────────────────

const NODE_TYPES = {
  trigger:  { label: "Trigger",    color: "#6366f1", icon: "⚡" },
  skill:    { label: "Skill",      color: "#0ea5e9", icon: "🔧" },
  memory:   { label: "Memory",     color: "#10b981", icon: "🧠" },
  compute:  { label: "Compute",    color: "#f59e0b", icon: "⚙️" },
  storage:  { label: "Storage",    color: "#8b5cf6", icon: "💾" },
  output:   { label: "Output",     color: "#ec4899", icon: "📤" },
  evolve:   { label: "Evolve Skill", color: "#ef4444", icon: "🧬" },
};

const PALETTE_ITEMS = [
  { type: "trigger",  label: "User Message",    description: "Start from a user message" },
  { type: "skill",    label: "Run Skill",        description: "Execute a registered skill" },
  { type: "memory",   label: "Search Memory",    description: "Retrieve from 0G Storage KV" },
  { type: "compute",  label: "LLM Inference",    description: "Call 0G Compute model" },
  { type: "storage",  label: "Write Storage",    description: "Persist to 0G Storage Log" },
  { type: "evolve",   label: "Evolve Skill",     description: "Auto-generate a new skill" },
  { type: "output",   label: "Return Output",    description: "Return result to user" },
];

let nodeIdCounter = 1;
function newNodeId() { return `node-${nodeIdCounter++}`; }

// ── Component ─────────────────────────────────────────────────────────────────

export default function Builder() {
  const [nodes, setNodes] = useState([
    { id: "node-0", type: "trigger", label: "User Message", x: 80, y: 200, config: { prompt: "" } },
    { id: "node-out", type: "output", label: "Return Output", x: 680, y: 200, config: {} },
  ]);
  const [edges, setEdges] = useState([]);
  const [selected, setSelected] = useState(null);
  const [dragging, setDragging] = useState(null);
  const [connecting, setConnecting] = useState(null); // { fromId }
  const [skills, setSkills] = useState([]);
  const [deploying, setDeploying] = useState(false);
  const [deployResult, setDeployResult] = useState(null);
  const [showCode, setShowCode] = useState(false);
  const canvasRef = useRef(null);

  // Load available skills
  useEffect(() => {
    client.get("/api/skills").then(r => {
      setSkills((r.data?.payload?.skills || r.data?.skills || []).slice(0, 20));
    }).catch(() => {});
  }, []);

  // ── Drag from palette ──────────────────────────────────────────────────────

  const onPaletteDragStart = useCallback((e, item) => {
    e.dataTransfer.setData("palette-item", JSON.stringify(item));
  }, []);

  const onCanvasDrop = useCallback((e) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData("palette-item");
    if (!raw) return;
    const item = JSON.parse(raw);
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left - 60;
    const y = e.clientY - rect.top - 24;
    const id = newNodeId();
    setNodes(prev => [...prev, {
      id,
      type: item.type,
      label: item.label,
      x: Math.max(0, x),
      y: Math.max(0, y),
      config: item.type === "skill" ? { skillId: skills[0]?.id || "" } : {},
    }]);
    setSelected(id);
  }, [skills]);

  // ── Node drag ──────────────────────────────────────────────────────────────

  const onNodeMouseDown = useCallback((e, id) => {
    if (connecting) return;
    e.stopPropagation();
    setSelected(id);
    const startX = e.clientX;
    const startY = e.clientY;
    const node = nodes.find(n => n.id === id);
    const origX = node.x;
    const origY = node.y;

    const onMove = (me) => {
      setNodes(prev => prev.map(n =>
        n.id === id
          ? { ...n, x: origX + me.clientX - startX, y: origY + me.clientY - startY }
          : n
      ));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [nodes, connecting]);

  // ── Edge connecting ────────────────────────────────────────────────────────

  const onPortClick = useCallback((e, nodeId, portType) => {
    e.stopPropagation();
    if (portType === "out") {
      setConnecting({ fromId: nodeId });
    } else if (portType === "in" && connecting) {
      if (connecting.fromId !== nodeId) {
        setEdges(prev => {
          const exists = prev.some(ed => ed.from === connecting.fromId && ed.to === nodeId);
          if (exists) return prev;
          return [...prev, { id: `e-${Date.now()}`, from: connecting.fromId, to: nodeId }];
        });
      }
      setConnecting(null);
    }
  }, [connecting]);

  const onCanvasClick = useCallback(() => {
    setConnecting(null);
    setSelected(null);
  }, []);

  const deleteEdge = useCallback((edgeId) => {
    setEdges(prev => prev.filter(e => e.id !== edgeId));
  }, []);

  const deleteNode = useCallback((nodeId) => {
    if (nodeId === "node-0" || nodeId === "node-out") return;
    setNodes(prev => prev.filter(n => n.id !== nodeId));
    setEdges(prev => prev.filter(e => e.from !== nodeId && e.to !== nodeId));
    if (selected === nodeId) setSelected(null);
  }, [selected]);

  // ── Config panel ───────────────────────────────────────────────────────────

  const updateConfig = useCallback((nodeId, key, value) => {
    setNodes(prev => prev.map(n =>
      n.id === nodeId ? { ...n, config: { ...n.config, [key]: value } } : n
    ));
  }, []);

  const updateLabel = useCallback((nodeId, label) => {
    setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, label } : n));
  }, []);

  // ── Code generation ────────────────────────────────────────────────────────

  const generateCode = useCallback(() => {
    const lines = [
      `import { AgentBuilder, defineSkill } from "@claw/core";`,
      `import { zeroGPlugin } from "@claw/plugin-0g";`,
      ``,
      `// Auto-generated by CLAW_MACHINE Visual Builder`,
      `const agent = await new AgentBuilder()`,
      `  .setName("VisualAgent")`,
      `  .setSystemPrompt("You are a helpful AI agent.")`,
      `  .use(zeroGPlugin({ rpc: process.env.EVM_RPC }))`,
    ];

    const skillNodes = nodes.filter(n => n.type === "skill" && n.config.skillId);
    for (const n of skillNodes) {
      lines.push(`  // Skill node: ${n.label}`);
    }

    const hasEvolve = nodes.some(n => n.type === "evolve");
    if (hasEvolve) {
      lines.push(`  .enableEvolution()`);
    }

    lines.push(`  .enableReflection()`);
    lines.push(`  .build();`);
    lines.push(``);
    lines.push(`const result = await agent.run({ message: "Hello!" });`);
    lines.push(`console.log(result.output);`);

    return lines.join("\n");
  }, [nodes]);

  // ── Deploy ─────────────────────────────────────────────────────────────────

  const deploy = useCallback(async () => {
    setDeploying(true);
    setDeployResult(null);
    try {
      const pipeline = {
        nodes: nodes.map(n => ({ id: n.id, type: n.type, label: n.label, config: n.config })),
        edges: edges.map(e => ({ from: e.from, to: e.to })),
        generatedCode: generateCode(),
      };
      const resp = await client.post("/api/builder/deploy", pipeline);
      setDeployResult({ success: true, agentId: resp.data?.payload?.agentId || "deployed" });
    } catch (err) {
      setDeployResult({ success: false, error: err.message });
    } finally {
      setDeploying(false);
    }
  }, [nodes, edges, generateCode]);

  // ── Render helpers ─────────────────────────────────────────────────────────

  const selectedNode = nodes.find(n => n.id === selected);
  const nodeType = selectedNode ? NODE_TYPES[selectedNode.type] : null;

  // Compute edge SVG paths
  const edgePaths = edges.map(edge => {
    const from = nodes.find(n => n.id === edge.from);
    const to = nodes.find(n => n.id === edge.to);
    if (!from || !to) return null;
    const x1 = from.x + 120;
    const y1 = from.y + 24;
    const x2 = to.x;
    const y2 = to.y + 24;
    const cx = (x1 + x2) / 2;
    return { ...edge, path: `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}` };
  }).filter(Boolean);

  return (
    <div className="builder-page">
      {/* Header */}
      <div className="builder-header">
        <div className="builder-title">
          <span className="builder-title-icon">🏗️</span>
          <span>Visual Agent Builder</span>
          <span className="builder-badge">No-Code</span>
        </div>
        <div className="builder-actions">
          <button className="builder-btn secondary" onClick={() => setShowCode(s => !s)}>
            {showCode ? "Hide Code" : "View Code"}
          </button>
          <button
            className="builder-btn primary"
            onClick={deploy}
            disabled={deploying}
          >
            {deploying ? "Deploying…" : "⚡ Deploy to 0G"}
          </button>
        </div>
      </div>

      {deployResult && (
        <div className={`builder-deploy-result ${deployResult.success ? "success" : "error"}`}>
          {deployResult.success
            ? `✓ Agent deployed! ID: ${deployResult.agentId}`
            : `✗ Deploy failed: ${deployResult.error}`}
          <button onClick={() => setDeployResult(null)}>×</button>
        </div>
      )}

      <div className="builder-body">
        {/* Palette */}
        <div className="builder-palette">
          <div className="palette-title">Nodes</div>
          {PALETTE_ITEMS.map(item => (
            <div
              key={item.type}
              className="palette-item"
              draggable
              onDragStart={e => onPaletteDragStart(e, item)}
              style={{ borderLeftColor: NODE_TYPES[item.type].color }}
            >
              <span className="palette-icon">{NODE_TYPES[item.type].icon}</span>
              <div>
                <div className="palette-label">{item.label}</div>
                <div className="palette-desc">{item.description}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Canvas */}
        <div
          className="builder-canvas"
          ref={canvasRef}
          onDrop={onCanvasDrop}
          onDragOver={e => e.preventDefault()}
          onClick={onCanvasClick}
        >
          {/* SVG edges */}
          <svg className="builder-edges" style={{ position: "absolute", inset: 0, pointerEvents: "none", width: "100%", height: "100%" }}>
            {edgePaths.map(edge => (
              <g key={edge.id}>
                <path
                  d={edge.path}
                  stroke="#6366f1"
                  strokeWidth={2}
                  fill="none"
                  strokeDasharray="6 3"
                  opacity={0.7}
                />
                <circle
                  cx={(nodes.find(n => n.id === edge.from)?.x ?? 0) + 120 + ((nodes.find(n => n.id === edge.to)?.x ?? 0) - (nodes.find(n => n.id === edge.from)?.x ?? 0) - 120) / 2}
                  cy={(nodes.find(n => n.id === edge.from)?.y ?? 0) + 24 + ((nodes.find(n => n.id === edge.to)?.y ?? 0) - (nodes.find(n => n.id === edge.from)?.y ?? 0)) / 2}
                  r={7}
                  fill="#1e1e2e"
                  stroke="#6366f1"
                  strokeWidth={1.5}
                  style={{ pointerEvents: "all", cursor: "pointer" }}
                  onClick={e => { e.stopPropagation(); deleteEdge(edge.id); }}
                />
              </g>
            ))}
          </svg>

          {/* Nodes */}
          {nodes.map(node => {
            const nt = NODE_TYPES[node.type];
            const isSelected = selected === node.id;
            const isConnectingFrom = connecting?.fromId === node.id;
            return (
              <div
                key={node.id}
                className={`builder-node ${isSelected ? "selected" : ""} ${isConnectingFrom ? "connecting" : ""}`}
                style={{ left: node.x, top: node.y, borderColor: nt.color }}
                onMouseDown={e => onNodeMouseDown(e, node.id)}
              >
                {/* In port */}
                {node.type !== "trigger" && (
                  <div
                    className="node-port in"
                    style={{ borderColor: nt.color }}
                    onClick={e => onPortClick(e, node.id, "in")}
                    title="Connect input"
                  />
                )}

                <div className="node-header" style={{ background: nt.color }}>
                  <span>{nt.icon}</span>
                  <span>{node.label}</span>
                </div>
                <div className="node-body">
                  <span className="node-type-label">{nt.label}</span>
                </div>

                {/* Out port */}
                {node.type !== "output" && (
                  <div
                    className="node-port out"
                    style={{ borderColor: nt.color }}
                    onClick={e => onPortClick(e, node.id, "out")}
                    title="Connect output"
                  />
                )}

                {/* Delete button */}
                {isSelected && node.id !== "node-0" && node.id !== "node-out" && (
                  <button
                    className="node-delete"
                    onClick={e => { e.stopPropagation(); deleteNode(node.id); }}
                    title="Delete node"
                  >×</button>
                )}
              </div>
            );
          })}

          {connecting && (
            <div className="builder-connecting-hint">
              Click an input port to connect, or click canvas to cancel
            </div>
          )}
        </div>

        {/* Config panel */}
        <div className="builder-config">
          {selectedNode ? (
            <>
              <div className="config-title" style={{ color: nodeType?.color }}>
                {nodeType?.icon} {nodeType?.label} Config
              </div>
              <label className="config-label">Label</label>
              <input
                className="config-input"
                value={selectedNode.label}
                onChange={e => updateLabel(selectedNode.id, e.target.value)}
              />

              {selectedNode.type === "trigger" && (
                <>
                  <label className="config-label">System Prompt</label>
                  <textarea
                    className="config-textarea"
                    rows={4}
                    placeholder="You are a helpful AI agent..."
                    value={selectedNode.config.prompt || ""}
                    onChange={e => updateConfig(selectedNode.id, "prompt", e.target.value)}
                  />
                </>
              )}

              {selectedNode.type === "skill" && (
                <>
                  <label className="config-label">Skill</label>
                  <select
                    className="config-select"
                    value={selectedNode.config.skillId || ""}
                    onChange={e => updateConfig(selectedNode.id, "skillId", e.target.value)}
                  >
                    <option value="">— Select skill —</option>
                    {skills.map(s => (
                      <option key={s.id} value={s.id}>{s.name || s.id}</option>
                    ))}
                  </select>
                </>
              )}

              {selectedNode.type === "compute" && (
                <>
                  <label className="config-label">Model</label>
                  <select
                    className="config-select"
                    value={selectedNode.config.model || "qwen3.6-plus"}
                    onChange={e => updateConfig(selectedNode.id, "model", e.target.value)}
                  >
                    <option value="qwen3.6-plus">qwen3.6-plus (0G Compute)</option>
                    <option value="GLM-5-FP8">GLM-5-FP8 (0G TEE)</option>
                    <option value="DeepSeek-V3.1">DeepSeek-V3.1</option>
                    <option value="gpt-4o-mini">gpt-4o-mini (fallback)</option>
                  </select>
                  <label className="config-label">Temperature</label>
                  <input
                    className="config-input"
                    type="number"
                    min={0} max={2} step={0.1}
                    value={selectedNode.config.temperature ?? 0.7}
                    onChange={e => updateConfig(selectedNode.id, "temperature", parseFloat(e.target.value))}
                  />
                </>
              )}

              {selectedNode.type === "memory" && (
                <>
                  <label className="config-label">Search Query</label>
                  <input
                    className="config-input"
                    placeholder="What to search for..."
                    value={selectedNode.config.query || ""}
                    onChange={e => updateConfig(selectedNode.id, "query", e.target.value)}
                  />
                  <label className="config-label">Max Results</label>
                  <input
                    className="config-input"
                    type="number"
                    min={1} max={20}
                    value={selectedNode.config.limit ?? 5}
                    onChange={e => updateConfig(selectedNode.id, "limit", parseInt(e.target.value))}
                  />
                </>
              )}

              {selectedNode.type === "evolve" && (
                <>
                  <label className="config-label">Skill Description</label>
                  <textarea
                    className="config-textarea"
                    rows={4}
                    placeholder="Describe the skill to auto-generate..."
                    value={selectedNode.config.description || ""}
                    onChange={e => updateConfig(selectedNode.id, "description", e.target.value)}
                  />
                  <label className="config-label">Min Quality Score</label>
                  <input
                    className="config-input"
                    type="number"
                    min={0} max={1} step={0.05}
                    value={selectedNode.config.minScore ?? 0.6}
                    onChange={e => updateConfig(selectedNode.id, "minScore", parseFloat(e.target.value))}
                  />
                </>
              )}

              {selectedNode.type === "storage" && (
                <>
                  <label className="config-label">Storage Key</label>
                  <input
                    className="config-input"
                    placeholder="my-data-key"
                    value={selectedNode.config.key || ""}
                    onChange={e => updateConfig(selectedNode.id, "key", e.target.value)}
                  />
                  <label className="config-label">Tier</label>
                  <select
                    className="config-select"
                    value={selectedNode.config.tier || "warm"}
                    onChange={e => updateConfig(selectedNode.id, "tier", e.target.value)}
                  >
                    <option value="hot">Hot (KV — fast)</option>
                    <option value="warm">Warm (Log — ordered)</option>
                    <option value="cold">Cold (Blob — archived)</option>
                  </select>
                </>
              )}
            </>
          ) : (
            <div className="config-empty">
              <div className="config-empty-icon">🖱️</div>
              <div>Click a node to configure it</div>
              <div className="config-empty-hint">Drag nodes from the palette to build your pipeline</div>
            </div>
          )}

          {/* Generated code preview */}
          {showCode && (
            <div className="builder-code-preview">
              <div className="code-preview-title">Generated Code</div>
              <pre className="code-preview-body">{generateCode()}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
