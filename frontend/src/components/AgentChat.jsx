import { useState, useRef, useEffect } from 'react';

const SUGGESTIONS = [
  'What can you do?',
  'Check my wallet balance on 0G',
  'Swap 0.1 ETH to USDC via Uniswap',
  'Store a note on 0G Storage',
  'Show agent capabilities',
];

export function AgentChat({ messages, onSendMessage, isProcessing, isWalletConnected }) {
  const [input, setInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(true);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (messages.length > 0) setShowSuggestions(false);
  }, [messages]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (input.trim() && !isProcessing) {
      onSendMessage(input.trim());
      setInput('');
      inputRef.current?.focus();
    }
  };

  const handleSuggestion = (text) => {
    setInput(text);
    inputRef.current?.focus();
  };

  const formatTimestamp = (ts) => {
    if (!ts) return '';
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="chat-container">
      {/* Messages area */}
      <div className="messages">
        {messages.length === 0 && showSuggestions && (
          <div className="suggestions-wrapper">
            <p className="suggestions-title">
              {isWalletConnected
                ? '👋 Wallet connected! Try asking:'
                : '🔗 Connect your wallet for full features, or try:'}
            </p>
            <div className="suggestions-grid">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  className="suggestion-chip"
                  onClick={() => handleSuggestion(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, idx) => (
          <div key={idx} className={`message message-${msg.role}`}>
            {msg.role !== 'user' && (
              <span className="role-avatar">
                {msg.role === 'agent' ? '🤖' : msg.role === 'system' ? '⚙️' : '📢'}
              </span>
            )}
            <div className="message-bubble">
              <p className="message-content">{msg.content}</p>
              {msg.timestamp && (
                <span className="message-time">{formatTimestamp(msg.timestamp)}</span>
              )}
              {msg.txHash && (
                <a
                  className="tx-link"
                  href={`https://chainscan-newton.0g.ai/tx/${msg.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View on 0G Explorer ↗
                </a>
              )}
              {Array.isArray(msg.trace) && msg.trace.length > 0 && (
                <p className="input-hint">Trace: {msg.trace.join(' -> ')}</p>
              )}
            </div>
            {msg.role === 'user' && (
              <span className="role-avatar">👤</span>
            )}
          </div>
        ))}

        {isProcessing && (
          <div className="message message-agent">
            <span className="role-avatar">🤖</span>
            <div className="message-bubble typing-bubble">
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <form onSubmit={handleSubmit} className="input-form">
        {!isWalletConnected && (
          <div className="wallet-warning">
            ⚠️ Connect wallet for on-chain features
          </div>
        )}
        <div className="input-row">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              isProcessing
                ? 'Agent is thinking…'
                : isWalletConnected
                ? 'Ask the agent anything…'
                : 'Ask the agent (wallet optional)…'
            }
            className="input-field"
            disabled={isProcessing}
            maxLength={2000}
          />
          <button
            type="submit"
            className="send-btn"
            disabled={isProcessing || !input.trim()}
            title="Send message"
          >
            {isProcessing ? <span className="spinner-sm" /> : '➤'}
          </button>
        </div>
        <p className="input-hint">
          {input.length > 0 ? `${input.length}/2000` : 'Powered by 0G Compute · Decentralized AI'}
        </p>
      </form>
    </div>
  );
}
