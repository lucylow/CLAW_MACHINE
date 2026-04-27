export function ErrorBanner({ error, onRetry, onDismiss }) {
  if (!error) return null;
  return (
    <div className="status-panel" style={{ borderColor: "#ef4444" }}>
      <h3>Operational Issue</h3>
      <p className="wallet-error">{error.message}</p>
      <p className="wallet-hint">
        Code: {error.code} · Category: {error.category} · Request: {error.requestId || "n/a"}
      </p>
      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
        {typeof onRetry === "function" && (
          <button className="switch-network-btn" onClick={onRetry}>Retry</button>
        )}
        <button className="wallet-disconnect-btn" onClick={onDismiss}>Dismiss</button>
      </div>
    </div>
  );
}
