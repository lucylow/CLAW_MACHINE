import { useState } from 'react';

export function WalletPanel({ wallet }) {
  const {
    account,
    balance,
    networkName,
    isConnected,
    isConnecting,
    error,
    is0GNetwork,
    connect,
    disconnect,
    switchTo0G,
  } = wallet;

  const [copied, setCopied] = useState(false);

  const shortAddress = (addr) =>
    addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : '';

  const copyAddress = () => {
    navigator.clipboard.writeText(account);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (!isConnected) {
    return (
      <div className="wallet-panel wallet-disconnected">
        <div className="wallet-icon">🔗</div>
        <p className="wallet-hint">Connect your wallet to interact with 0G agents</p>
        {error && <p className="wallet-error">{error}</p>}
        <button
          className="wallet-connect-btn"
          onClick={connect}
          disabled={isConnecting}
        >
          {isConnecting ? (
            <span className="btn-loading">
              <span className="spinner" /> Connecting…
            </span>
          ) : (
            '🦊 Connect Wallet'
          )}
        </button>
        <p className="wallet-sub">MetaMask or any EIP-1193 wallet</p>
      </div>
    );
  }

  return (
    <div className="wallet-panel wallet-connected">
      <div className="wallet-header">
        <span className="wallet-dot" />
        <span className="wallet-label">Connected</span>
      </div>

      <div className="wallet-address-row" onClick={copyAddress} title="Copy address">
        <span className="wallet-address">{shortAddress(account)}</span>
        <span className="copy-icon">{copied ? '✅' : '📋'}</span>
      </div>

      <div className="wallet-info-grid">
        <div className="wallet-info-item">
          <span className="info-label">Balance</span>
          <span className="info-value">
            {balance !== null ? `${parseFloat(balance).toFixed(4)} ETH` : '—'}
          </span>
        </div>
        <div className="wallet-info-item">
          <span className="info-label">Network</span>
          <span className={`info-value network-badge ${is0GNetwork ? 'network-0g' : 'network-other'}`}>
            {networkName || '—'}
          </span>
        </div>
      </div>

      {!is0GNetwork && (
        <button className="switch-network-btn" onClick={switchTo0G}>
          ⚡ Switch to 0G Testnet
        </button>
      )}

      <button className="wallet-disconnect-btn" onClick={disconnect}>
        Disconnect
      </button>
    </div>
  );
}
