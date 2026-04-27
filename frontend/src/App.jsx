import { useState, useEffect, useCallback } from 'react';
import { AgentChat } from './components/AgentChat.jsx';
import { AgentStatus } from './components/AgentStatus.jsx';
import { WalletPanel } from './components/WalletPanel.jsx';
import { TxHistory } from './components/TxHistory.jsx';
import { useWallet } from './hooks/useWallet.js';
import { agentApi, walletApi } from './services/api.js';
import './App.css';

export default function App() {
  const wallet = useWallet();

  const [agentStatus, setAgentStatus]   = useState('idle');
  const [backendInfo, setBackendInfo]   = useState(null);
  const [messages, setMessages]         = useState([]);
  const [skills, setSkills]             = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [backendOnline, setBackendOnline] = useState(false);

  // ── Fetch backend status on mount ──────────────────────────────────────────
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const data = await agentApi.getStatus();
        setBackendInfo(data);
        setAgentStatus('idle');
        setBackendOnline(true);
      } catch {
        setAgentStatus('error');
        setBackendOnline(false);
      }
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  // ── Fetch available skills ──────────────────────────────────────────────────
  useEffect(() => {
    agentApi.listSkills()
      .then((data) => setSkills(data?.skills || []))
      .catch(() => {});
  }, [backendOnline]);

  // ── Sync wallet address to localStorage for API interceptor ────────────────
  useEffect(() => {
    if (wallet.account) {
      localStorage.setItem('oa_wallet', wallet.account);
    } else {
      localStorage.removeItem('oa_wallet');
    }
  }, [wallet.account]);

  // ── Register wallet with backend when connected ─────────────────────────────
  useEffect(() => {
    if (!wallet.isConnected || !backendOnline) return;
    const registerWallet = async () => {
      try {
        const message = `OpenAgents auth: ${wallet.account} @ ${Date.now()}`;
        const signature = await wallet.signMessage(message);
        await walletApi.register(wallet.account, signature, message);
      } catch {
        // non-blocking — wallet still works without backend registration
      }
    };
    registerWallet();
  }, [wallet.isConnected, wallet.account, backendOnline]);

  // ── Send message to agent ───────────────────────────────────────────────────
  const handleSendMessage = useCallback(async (input, retries = 2) => {
    setAgentStatus('processing');
    if (retries === 2) {
      setMessages((prev) => [
        ...prev,
        { role: 'user', content: input, timestamp: Date.now() },
      ]);
    }

    try {
      const data = await agentApi.run(input, wallet.account);

      setMessages((prev) => [
        ...prev,
        {
          role: 'agent',
          content: data.output,
          timestamp: Date.now(),
          txHash: data.txHash || null,
        },
      ]);

      // Track any on-chain transactions returned by the agent
      if (data.txHash) {
        setTransactions((prev) => [
          {
            hash: data.txHash,
            description: input.slice(0, 40),
            status: 'success',
            timestamp: Date.now(),
          },
          ...prev,
        ]);
      }

      setAgentStatus('idle');
    } catch (error) {
      if (retries > 0) {
        setTimeout(() => handleSendMessage(input, retries - 1), 1200);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: 'system',
            content: `Error: ${error.message}`,
            timestamp: Date.now(),
          },
        ]);
        setAgentStatus('error');
      }
    }
  }, [wallet.account]);

  // ── Clear chat ──────────────────────────────────────────────────────────────
  const handleClearChat = () => {
    setMessages([]);
    if (wallet.account) {
      agentApi.clearHistory(wallet.account).catch(() => {});
    }
  };

  return (
    <div className="app">
      {/* ── Header ── */}
      <header className="header">
        <div className="header-left">
          <div className="logo">
            <span className="logo-icon">⬡</span>
            <div>
              <h1>OpenAgents</h1>
              <p className="header-sub">Decentralized AI · Powered by 0G Labs</p>
            </div>
          </div>
        </div>

        <div className="header-right">
          <div className={`backend-badge ${backendOnline ? 'badge-online' : 'badge-offline'}`}>
            <span className="badge-dot" />
            {backendOnline ? 'Backend Online' : 'Backend Offline'}
          </div>

          {wallet.isConnected ? (
            <div className="header-wallet-pill">
              <span className="hw-dot" />
              <span className="hw-addr">
                {wallet.account.slice(0, 6)}…{wallet.account.slice(-4)}
              </span>
              <span className="hw-net">{wallet.networkName}</span>
            </div>
          ) : (
            <button
              className="header-connect-btn"
              onClick={wallet.connect}
              disabled={wallet.isConnecting}
            >
              {wallet.isConnecting ? 'Connecting…' : '🦊 Connect Wallet'}
            </button>
          )}
        </div>
      </header>

      {/* ── Main layout ── */}
      <main className="main">
        {/* Sidebar */}
        <aside className="sidebar">
          <WalletPanel wallet={wallet} />
          <AgentStatus status={agentStatus} info={backendInfo} skills={skills} />
          <TxHistory transactions={transactions} />
        </aside>

        {/* Chat section */}
        <section className="chat-section">
          <div className="chat-toolbar">
            <span className="chat-title">Agent Chat</span>
            {messages.length > 0 && (
              <button className="clear-btn" onClick={handleClearChat} title="Clear conversation">
                🗑 Clear
              </button>
            )}
          </div>
          <AgentChat
            messages={messages}
            onSendMessage={handleSendMessage}
            isProcessing={agentStatus === 'processing'}
            isWalletConnected={wallet.isConnected}
          />
        </section>
      </main>
    </div>
  );
}
