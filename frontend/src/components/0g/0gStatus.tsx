import { useEffect, useState, useCallback } from "react";

interface EndpointStatus {
  name: string;
  url: string;
  ok: boolean | null;
  latencyMs: number | null;
  error?: string;
}

const ENDPOINTS = [
  { name: "0G KV Storage",   envKey: "VITE_0G_KV",      fallback: "https://rpc-storage-testnet.0g.ai" },
  { name: "0G Log Storage",  envKey: "VITE_0G_LOG",     fallback: "https://rpc-storage-testnet.0g.ai" },
  { name: "0G Blob Storage", envKey: "VITE_0G_BLOB",    fallback: "https://rpc-storage-testnet.0g.ai" },
  { name: "0G Compute",      envKey: "VITE_0G_COMPUTE", fallback: "https://api.compute.0g.ai" },
  { name: "0G Chain RPC",    envKey: "VITE_0G_RPC",     fallback: "https://evmrpc-testnet.0g.ai" },
];

const MODELS = ["qwen3.6-plus", "GLM-5-FP8", "DeepSeek-V3.1"];

async function pingEndpoint(url: string): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const t0 = performance.now();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    await fetch(url, { method: "HEAD", signal: ctrl.signal, mode: "no-cors" });
    clearTimeout(timer);
    return { ok: true, latencyMs: Math.round(performance.now() - t0) };
  } catch (err) {
    return { ok: false, latencyMs: Math.round(performance.now() - t0), error: err instanceof Error ? err.message : "unreachable" };
  }
}

function Dot({ ok }: { ok: boolean | null }) {
  const c = ok === null ? "#6b7280" : ok ? "#10b981" : "#ef4444";
  return <span style={{ display:"inline-block", width:8, height:8, borderRadius:"50%", background:c, flexShrink:0, boxShadow: ok ? `0 0 6px ${c}` : "none" }} />;
}

export default function ZeroGStatus() {
  const [statuses, setStatuses] = useState<EndpointStatus[]>(
    ENDPOINTS.map(e => ({ name: e.name, url: (import.meta as any).env?.[e.envKey] ?? e.fallback, ok: null, latencyMs: null }))
  );
  const [checking, setChecking] = useState(false);
  const [lastChecked, setLastChecked] = useState<string | null>(null);

  const runChecks = useCallback(async () => {
    setChecking(true);
    const results = await Promise.all(ENDPOINTS.map(async e => {
      const url = (import.meta as any).env?.[e.envKey] ?? e.fallback;
      const r = await pingEndpoint(url);
      return { name: e.name, url, ...r };
    }));
    setStatuses(results);
    setLastChecked(new Date().toLocaleTimeString());
    setChecking(false);
  }, []);

  useEffect(() => { runChecks(); const id = setInterval(runChecks, 30_000); return () => clearInterval(id); }, [runChecks]);

  const allOk = statuses.every(s => s.ok === true);
  const anyOk = statuses.some(s => s.ok === true);
  const oc = allOk ? "#10b981" : anyOk ? "#f59e0b" : "#ef4444";
  const ol = allOk ? "All Systems Operational" : anyOk ? "Partial Connectivity" : "Offline / Unconfigured";

  return (
    <div className="status-panel" style={{ display:"flex", flexDirection:"column", gap:12 }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <h3 style={{ color:"#22d3ee", margin:0, fontSize:14, fontWeight:700 }}>0G Infrastructure</h3>
        <button onClick={runChecks} disabled={checking} style={{ background:"none", border:"1px solid rgba(255,255,255,0.15)", color:"#9ca3af", borderRadius:5, padding:"2px 8px", fontSize:11, cursor: checking ? "not-allowed" : "pointer" }}>
          {checking ? "Checking…" : "↻ Refresh"}
        </button>
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 10px", borderRadius:6, background:`${oc}18`, border:`1px solid ${oc}44` }}>
        <Dot ok={allOk ? true : anyOk ? null : false} />
        <span style={{ fontSize:12, fontWeight:600, color:oc }}>{ol}</span>
        {lastChecked && <span style={{ marginLeft:"auto", fontSize:10, color:"#6b7280" }}>{lastChecked}</span>}
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
        {statuses.map(s => (
          <div key={s.name} style={{ display:"flex", alignItems:"center", gap:8, padding:"5px 8px", borderRadius:5, background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)" }}>
            <Dot ok={s.ok} />
            <span style={{ fontSize:12, color:"#d1d5db", flex:1 }}>{s.name}</span>
            {s.latencyMs !== null && s.ok && <span style={{ fontSize:10, color:"#6b7280" }}>{s.latencyMs}ms</span>}
            {s.ok === false && <span style={{ fontSize:10, color:"#ef4444" }} title={s.error}>unreachable</span>}
            {s.ok === null && <span style={{ fontSize:10, color:"#6b7280" }}>—</span>}
          </div>
        ))}
      </div>
      <div>
        <div style={{ fontSize:11, fontWeight:600, color:"#6b7280", textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:6 }}>Compute Models</div>
        <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
          {MODELS.map(m => <span key={m} style={{ fontSize:11, padding:"2px 8px", borderRadius:4, background:"rgba(34,211,238,0.1)", border:"1px solid rgba(34,211,238,0.25)", color:"#22d3ee" }}>{m}</span>)}
        </div>
      </div>
      <div style={{ fontSize:11, color:"#4b5563", borderTop:"1px solid rgba(255,255,255,0.06)", paddingTop:8 }}>
        <div>Chain ID: <span style={{ color:"#9ca3af" }}>16600</span> (0G Newton Testnet)</div>
        <div style={{ marginTop:2 }}>Explorer: <a href="https://chainscan-galileo.0g.ai" target="_blank" rel="noopener noreferrer" style={{ color:"#22d3ee", textDecoration:"none" }}>chainscan-galileo.0g.ai</a></div>
      </div>
    </div>
  );
}
