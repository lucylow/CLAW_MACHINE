/**
 * StreamPhaseBar — animated progress bar showing the current agent phase
 * during SSE streaming. Renders as a slim banner below the chat toolbar.
 */
import { PHASES } from '../hooks/useAgentStream';

const PHASE_ORDER = [
  'started',
  'routing',
  'skill.executing',
  'skill.executed',
  'reflecting',
  'persisting_result',
  'complete',
];

export function StreamPhaseBar({ phase, isStreaming }) {
  if (!isStreaming && !phase) return null;

  const currentIdx = PHASE_ORDER.indexOf(phase ?? '');
  const progress = currentIdx >= 0
    ? Math.round(((currentIdx + 1) / PHASE_ORDER.length) * 100)
    : phase === 'complete' ? 100 : 10;

  const info = PHASES[phase] ?? { label: phase, icon: '…' };
  const isDone = phase === 'complete';
  const isError = phase === 'error';

  return (
    <div className={`phase-bar ${isDone ? 'phase-done' : ''} ${isError ? 'phase-error' : ''}`}>
      <div className="phase-bar-inner">
        <span className="phase-icon">{info.icon}</span>
        <span className="phase-label">{info.label}</span>
        <span className="phase-pct">{progress}%</span>
      </div>
      <div className="phase-track">
        <div
          className="phase-fill"
          style={{
            width: `${progress}%`,
            background: isError
              ? 'var(--red)'
              : isDone
              ? 'var(--green)'
              : 'var(--accent-grad)',
            transition: 'width 0.4s ease',
          }}
        />
      </div>
    </div>
  );
}
