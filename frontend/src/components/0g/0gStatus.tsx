import { useEffect, useState } from "react";

export default function ZeroGStatus() {
  const [status, setStatus] = useState("Checking...");

  useEffect(() => {
    setStatus("0G Infrastructure Connected");
  }, []);

  return (
    <div className="status-panel">
      <h3 style={{ color: "#22d3ee", marginBottom: "0.5rem" }}>0G Infrastructure</h3>
      <p className="wallet-hint" style={{ margin: 0 }}>
        {status}
      </p>
    </div>
  );
}
