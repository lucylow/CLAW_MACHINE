/**
 * useAgentStream — React hook for SSE-based streaming agent responses.
 *
 * Connects to POST /api/agent/stream and surfaces real-time phase events
 * so the UI can show "routing → executing → reflecting → persisting" live.
 */
import { useState, useCallback, useRef } from 'react';

export const PHASES = {
  started:          { label: 'Starting…',         icon: '🚀' },
  routing:          { label: 'Routing skill…',     icon: '🔀' },
  'skill.executing':{ label: 'Running skill…',     icon: '⚙️' },
  'skill.executed': { label: 'Skill complete',     icon: '✅' },
  reflecting:       { label: 'Reflecting…',        icon: '🪞' },
  persisting_result:{ label: 'Persisting…',        icon: '💾' },
  complete:         { label: 'Done',               icon: '🎯' },
  error:            { label: 'Error',              icon: '❌' },
};

export function useAgentStream() {
  const [phase, setPhase]       = useState(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamError, setStreamError] = useState(null);
  const abortRef = useRef(null);

  const stream = useCallback(async (input, walletAddress, onResult) => {
    // Abort any in-flight stream
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsStreaming(true);
    setStreamError(null);
    setPhase('started');

    try {
      const response = await fetch('/api/agent/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(walletAddress ? { 'x-wallet-address': walletAddress } : {}),
        },
        body: JSON.stringify({ input, walletAddress }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Stream failed' }));
        throw new Error(err.error || `HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        let currentEvent = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            const raw = line.slice(6).trim();
            if (!raw) continue;
            try {
              const parsed = JSON.parse(raw);
              if (currentEvent === 'phase' || parsed.phase) {
                setPhase(parsed.phase);
              } else if (currentEvent === 'result' || parsed.output !== undefined) {
                setPhase('complete');
                onResult?.(parsed);
              } else if (currentEvent === 'error' || (parsed.code && parsed.message)) {
                setStreamError(parsed.message);
                setPhase('error');
              } else if (currentEvent === 'done') {
                // stream finished cleanly
              }
            } catch {
              // ignore malformed SSE data
            }
            currentEvent = '';
          }
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        setStreamError(err.message || 'Stream connection failed');
        setPhase('error');
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, []);

  const abort = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
    setPhase(null);
  }, []);

  return {
    phase,
    isStreaming,
    streamError,
    phaseLabel: phase ? (PHASES[phase]?.label ?? phase) : null,
    phaseIcon:  phase ? (PHASES[phase]?.icon  ?? '…')   : null,
    stream,
    abort,
  };
}
