export function TxHistory({ transactions = [] }) {
  if (transactions.length === 0) return null;

  return (
    <div className="tx-history">
      <h4>Recent Transactions</h4>
      <ul className="tx-list">
        {transactions.slice(0, 5).map((tx, i) => (
          <li key={i} className="tx-item">
            <span className={`tx-status tx-${tx.status}`}>
              {tx.status === 'success' ? '✅' : tx.status === 'pending' ? '⏳' : '❌'}
            </span>
            <div className="tx-details">
              <span className="tx-desc">{tx.description || tx.type}</span>
              {tx.hash && (
                <a
                  className="tx-hash"
                  href={`https://chainscan-newton.0g.ai/tx/${tx.hash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {tx.hash.slice(0, 10)}…
                </a>
              )}
            </div>
            <span className="tx-time">
              {tx.timestamp
                ? new Date(tx.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : ''}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
