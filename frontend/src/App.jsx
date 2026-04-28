import { useState, useEffect, useCallback, useRef } from 'react';
import { AgentChat } from './components/AgentChat.jsx';
import { AgentStatus } from './components/AgentStatus.jsx';
import { WalletPanel } from './components/WalletPanel.jsx';
import { TxHistory } from './components/TxHistory.jsx';
import { MemoryPanel } from './components/MemoryPanel.jsx';
import { SkillsPanel } from './components/SkillsPanel.jsx';
import { InsightsPanel } from './components/InsightsPanel.jsx';
import { StreamPhaseBar } from './components/StreamPhaseBar.jsx';
import { ErrorBanner } from './components/ErrorBanner.jsx';
import { PlannerPanel } from './components/PlannerPanel.jsx';
import { HowItWorks } from './components/HowItWorks.jsx';
import EvolvePanel from './components/EvolvePanel.jsx';
import OnChainPanel from './components/OnChainPanel.jsx';
import Builder from './pages/Builder.jsx';
import { useWallet } from './hooks/useWallet.js';
import { useAgentStream } from './hooks/useAgentStream.js';
import { agentApi, walletApi } from './services/api.js';
import './App.css';

// ── Session persistence helpers ─────────────────────────────────────────────
const SESSION_KEY = 'oa_messages_v1';
function loadMessages() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || '[]'); } catch { return []; }
}
function saveMessages(msgs) {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(msgs.slice(-100))); } catch {}
}

// ── Sidebar tabs ─────────────────────────────────────────────────────────────
const SIDEBAR_TABS = [
  { id: 'wallet',   label: '🔗 Wallet'   },
  { id: 'skills',   label: '⚙️ Skills'   },
  { id: 'memory',   label: '🧠 Memory'   },
  { id: 'planner',  label: '🗂️ Planner'  },
  { id: 'insights', label: '📊 Insights' },
  { id: 'txs',      label: '📜 Txns'     },
  { id: 'evolve',  label: '🧬 Evolve'  },
  { id: 'onchain', label: '⛓️ Chain'   },
  { id: 'builder', label: '🏗️ Build'   },
  { id: 'howto',   label: '❓ How'     },
];

export default function App() {
  const wallet = useWallet();
  const agentStream = useAgentStream();

  const [agentStatus, setAgentStatus]     = useState('idle');
  const [backendInfo, setBackendInfo]     = useState(null);
  const [messages, setMessages]           = useState(loadMessages);
  const [skills, setSkills]               = useState([]);
  const [transactions, setTransactions]   = useState([]);
  const [backendOnline, setBackendOnline] = useState(false);
  const [historyInsights, setHistoryInsights] = useState(null);
  const [fullInsights, setFullInsights]   = useState(null);
  const [uiError, setUiError]             = useState(null);
  const [sidebarTab, setSidebarTab]       = useState('wallet');
  const [useStreaming, setUseStreaming]    = useState(true);
  const retryTimerRef = useRef(null);

  // Persist messages to localStorage
  useEffect(() => { saveMessages(messages); }, [messages]);

  // ── Fetch backend status ──────────────────────────────────────────────────
  const fetchStatus = useCallback(async () => {
    try {
      const data = await agentApi.getStatus();
      setBackendInfo(data);
      setAgentStatus('idle');
      setBackendOnline(true);
      setUiError(null);
    } catch {
      setAgentStatus('error');
      setBackendOnline(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const iv = setInterval(fetchStatus, 30_000);
    return () => clearInterval(iv);
  }, [fetchStatus]);

  // ── Fetch skills ──────────────────────────────────────────────────────────
  const fetchSkills = useCallback(async () => {
    try {
      const data = await agentApi.listSkills();
      setSkills(data?.skills || []);
    } catch (e) {
      setUiError(e);
    }
  }, []);

  useEffect(() => { if (backendOnline) fetchSkills(); }, [backendOnline, fetchSkills]);

  // ── Sync wallet to localStorage ───────────────────────────────────────────
  useEffect(() => {
    if (wallet.account) localStorage.setItem('oa_wallet', wallet.account);
    else localStorage.removeItem('oa_wallet');
  }, [wallet.account]);

  // ── Register wallet with backend ──────────────────────────────────────────
  useEffect(() => {
    if (!wallet.isConnected || !backendOnline) return;
    (async () => {
      try {
        const message = `OpenAgents auth: ${wallet.account} @ ${Date.now()}`;
        const signature = await wallet.signMessage(message);
        await walletApi.register(wallet.account, signature, message);
      } catch {
        // non-blocking
      }
    })();
  }, [wallet.isConnected, wallet.account, backendOnline]);

  // ── Fetch history insights ────────────────────────────────────────────────
  useEffect(() => {
    if (!wallet.account || !backendOnline) { setHistoryInsights(null); setFullInsights(null); return; }
    agentApi.getHistory(wallet.account)
      .then(d => setHistoryInsights(d))
      .catch(e => setUiError(e));
    // Richer insights endpoint
    agentApi.getInsights(wallet.account)
      .then(d => setFullInsights(d))
      .catch(() => {});
  }, [wallet.account, backendOnline, messages.length]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      // Ctrl/Cmd + K → focus chat input
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        document.querySelector('.input-field')?.focus();
      }
      // Ctrl/Cmd + Shift + C → clear chat
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'C') {
        e.preventDefault();
        handleClearChat();
      }
      // Escape → abort stream
      if (e.key === 'Escape' && agentStream.isStreaming) {
        agentStream.abort();
        setAgentStatus('idle');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [agentStream]);

  // ── Send message ──────────────────────────────────────────────────────────
  const handleSendMessage = useCallback(async (input, retries = 2) => {
    setAgentStatus('processing');

    if (retries === 2) {
      setMessages(prev => [...prev, { role: 'user', content: input, timestamp: Date.now() }]);
    }

    // ── Streaming path ──────────────────────────────────────────────────────
    if (useStreaming) {
      await agentStream.stream(input, wallet.account, (result) => {
        setMessages(prev => [
          ...prev,
          {
            role: 'agent',
            content: result.output,
            timestamp: Date.now(),
            txHash: result.txHash || null,
            trace: result.trace || [],
            selectedSkill: result.selectedSkill,
          },
        ]);
        if (result.txHash) {
          setTransactions(prev => [{
            hash: result.txHash,
            description: input.slice(0, 40),
            type: result.selectedSkill || 'agent.run',
            status: 'success',
            network: '0G Newton',
            timestamp: Date.now(),
          }, ...prev]);
        }
        setAgentStatus('idle');
        setUiError(null);
      });

      if (agentStream.streamError) {
        setUiError({ message: agentStream.streamError, code: 'STREAM_ERROR', category: 'agent' });
        setAgentStatus('error');
      }
      return;
    }

    // ── Fallback: REST path ─────────────────────────────────────────────────
    try {
      const data = await agentApi.run(input, wallet.account);
      setUiError(null);
      setMessages(prev => [
        ...prev,
        {
          role: 'agent',
          content: data.output,
          timestamp: Date.now(),
          txHash: data.txHash || null,
          trace: data.trace || [],
          selectedSkill: data.selectedSkill,
        },
      ]);
      if (data.txHash) {
        setTransactions(prev => [{
          hash: data.txHash,
          description: input.slice(0, 40),
          type: data.selectedSkill || 'agent.run',
          status: 'success',
          network: '0G Newton',
          timestamp: Date.now(),
        }, ...prev]);
      }
      setAgentStatus('idle');
    } catch (error) {
      if (retries > 0) {
        retryTimerRef.current = setTimeout(() => handleSendMessage(input, retries - 1), 1200);
      } else {
        setUiError(error);
        setMessages(prev => [
          ...prev,
          { role: 'system', content: `Error: ${error.message} (${error.code || 'unknown'})`, timestamp: Date.now() },
        ]);
        setAgentStatus('error');
      }
    }
  }, [wallet.account, useStreaming, agentStream]);

  // ── Clear chat ────────────────────────────────────────────────────────────
  const handleClearChat = () => {
    clearTimeout(retryTimerRef.current);
    setMessages([]);
    localStorage.removeItem(SESSION_KEY);
    if (wallet.account) agentApi.clearHistory(wallet.account).catch(() => {});
  };

  const isProcessing = agentStatus === 'processing' || agentStream.isStreaming;

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
          {/* Streaming toggle */}
          <label className="stream-toggle-label" title="Toggle SSE streaming mode">
            <input
              type="checkbox"
              checked={useStreaming}
              onChange={e => setUseStreaming(e.target.checked)}
            />
            <span className="stream-toggle-text">⚡ Stream</span>
          </label>

          <div className={`backend-badge ${backendOnline ? 'badge-online' : 'badge-offline'}`}>
            <span className="badge-dot" />
            {backendOnline ? 'Online' : 'Offline'}
          </div>

          {wallet.isConnected ? (
            <div className="header-wallet-pill">
              <span className="hw-dot" />
              <span className="hw-addr">{wallet.account.slice(0, 6)}…{wallet.account.slice(-4)}</span>
              <span className="hw-net">{wallet.networkName}</span>
            </div>
          ) : (
            <button className="header-connect-btn" onClick={wallet.connect} disabled={wallet.isConnecting}>
              {wallet.isConnecting ? 'Connecting…' : '🦊 Connect Wallet'}
            </button>
          )}
        </div>
      </header>

      {/* ── Main layout ── */}
      <main className="main">
        {/* Sidebar */}
        <aside className="sidebar">
          {/* Tab bar */}
          <div className="sidebar-tabs">
            {SIDEBAR_TABS.map(t => (
              <button
                key={t.id}
                className={`sidebar-tab ${sidebarTab === t.id ? 'active' : ''}`}
                onClick={() => setSidebarTab(t.id)}
                title={t.label}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="sidebar-content">
            {sidebarTab === 'wallet' && (
              <>
                <WalletPanel wallet={wallet} />
                <ErrorBanner
                  error={uiError}
                  onRetry={() => { setUiError(null); fetchStatus(); }}
                  onDismiss={() => setUiError(null)}
                />
                <AgentStatus status={agentStatus} info={backendInfo} skills={skills} />
              </>
            )}
            {sidebarTab === 'skills' && (
              <SkillsPanel skills={skills} onSkillsChange={fetchSkills} />
            )}
            {sidebarTab === 'memory' && (
              <MemoryPanel history={historyInsights} />
            )}
            {sidebarTab === 'insights' && (
              <InsightsPanel insights={fullInsights || historyInsights} />
            )}
            {sidebarTab === 'planner' && (
              <PlannerPanel walletAddress={wallet.account} />
            )}
            {sidebarTab === 'txs' && (
              <TxHistory transactions={transactions} />
            )}
            {sidebarTab === 'evolve' && (
              <EvolvePanel walletAddress={wallet.account} />
            )}
            {sidebarTab === 'onchain' && (
              <OnChainPanel walletAddress={wallet.account} />
            )}
            {sidebarTab === 'builder' && (
              <Builder />
            )}
            {sidebarTab === 'howto' && (
              <HowItWorks />
            )}
          </div>
        </aside>

        {/* Chat section */}
        <section className="chat-section">
          <div className="chat-toolbar">
            <span className="chat-title">
              Agent Chat
              {isProcessing && agentStream.phaseLabel && (
                <span className="chat-phase-pill">
                  {agentStream.phaseIcon} {agentStream.phaseLabel}
                </span>
              )}
            </span>
            <div className="chat-toolbar-actions">
              {isProcessing && useStreaming && (
                <button
                  className="abort-btn"
                  onClick={() => { agentStream.abort(); setAgentStatus('idle'); }}
                  title="Abort stream (Esc)"
                >
                  ✕ Abort
                </button>
              )}
              {messages.length > 0 && (
                <button className="clear-btn" onClick={handleClearChat} title="Clear (Ctrl+Shift+C)">
                  🗑 Clear
                </button>
              )}
            </div>
          </div>

          {/* Live phase progress bar */}
          <StreamPhaseBar phase={agentStream.phase} isStreaming={agentStream.isStreaming} />

          <AgentChat
            messages={messages}
            onSendMessage={handleSendMessage}
            isProcessing={isProcessing}
            isWalletConnected={wallet.isConnected}
          />
        </section>
      </main>
    </div>
  );
}
