/**
 * PlannerPanel
 *
 * Displays active hierarchical plans from the HierarchicalPlanner.
 * Shows task dependency graph, execution status, and final synthesis result.
 *
 * Connects to:
 *   GET /api/agent/plans        — list active plans
 *   POST /api/agent/plan        — create a new plan
 */

import { useState, useEffect, useCallback } from 'react';
import client from '../services/api.js';

const STATUS_COLORS = {
  pending:   '#6b7280',
  running:   '#6366f1',
  completed: '#22c55e',
  failed:    '#ef4444',
  skipped:   '#f59e0b',
};

const STATUS_ICONS = {
  pending:   '⏳',
  running:   '⚡',
  completed: '✅',
  failed:    '❌',
  skipped:   '⏭️',
};

export function PlannerPanel({ walletAddress }) {
  const [plans, setPlans]       = useState([]);
  const [loading, setLoading]   = useState(false);
  const [goal, setGoal]         = useState('');
  const [creating, setCreating] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [error, setError]       = useState(null);

  const fetchPlans = useCallback(async () => {
    setLoading(true);
    try {
      const data = await client.get('/api/agent/plans', {
        params: walletAddress ? { walletAddress } : {},
      });
      setPlans(data.data?.plans ?? []);
    } catch (err) {
      // Plans endpoint may not exist in older deployments — fail silently
    } finally {
      setLoading(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    fetchPlans();
    const interval = setInterval(fetchPlans, 5000);
    return () => clearInterval(interval);
  }, [fetchPlans]);

  const createPlan = async () => {
    if (!goal.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const data = await client.post('/api/agent/plan', {
        goal: goal.trim(),
        walletAddress,
      });
      setGoal('');
      setPlans((prev) => [data.data?.plan, ...prev].filter(Boolean));
      setExpanded(data.data?.plan?.planId ?? null);
    } catch (err) {
      setError(err?.response?.data?.error ?? err.message ?? 'Failed to create plan');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="planner-panel">
      <div className="planner-header">
        <span className="planner-title">Hierarchical Planner</span>
        <button className="icon-btn" onClick={fetchPlans} title="Refresh" disabled={loading}>
          {loading ? '…' : '↻'}
        </button>
      </div>

      {/* Goal input */}
      <div className="planner-input-row">
        <input
          className="planner-input"
          placeholder="Enter a complex goal to decompose…"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !creating && createPlan()}
          disabled={creating}
        />
        <button
          className="planner-create-btn"
          onClick={createPlan}
          disabled={creating || !goal.trim()}
        >
          {creating ? '…' : 'Plan'}
        </button>
      </div>

      {error && <div className="planner-error">{error}</div>}

      {/* Plans list */}
      {plans.length === 0 && !loading && (
        <div className="planner-empty">
          No plans yet. Enter a complex goal above to decompose it into parallel sub-tasks.
        </div>
      )}

      <div className="plans-list">
        {plans.map((plan) => (
          <div key={plan.planId} className="plan-card">
            <button
              className="plan-card-header"
              onClick={() => setExpanded(expanded === plan.planId ? null : plan.planId)}
            >
              <span
                className="plan-status-dot"
                style={{ background: STATUS_COLORS[plan.status] ?? '#6b7280' }}
              />
              <span className="plan-goal">{plan.originalGoal?.slice(0, 70)}</span>
              <span className="plan-task-count">{plan.tasks?.length ?? 0} tasks</span>
              <span className="plan-chevron">{expanded === plan.planId ? '▲' : '▼'}</span>
            </button>

            {expanded === plan.planId && (
              <div className="plan-detail">
                {/* Task list */}
                <div className="plan-tasks">
                  {(plan.tasks ?? []).map((task) => (
                    <div key={task.id} className="plan-task">
                      <span
                        className="plan-task-icon"
                        title={task.status}
                      >
                        {STATUS_ICONS[task.status] ?? '⏳'}
                      </span>
                      <div className="plan-task-body">
                        <div className="plan-task-goal">{task.goal}</div>
                        {task.dependencies?.length > 0 && (
                          <div className="plan-task-deps">
                            depends on: {task.dependencies.join(', ')}
                          </div>
                        )}
                        {task.skillHint && (
                          <div className="plan-task-skill">skill: {task.skillHint}</div>
                        )}
                        {task.result && (
                          <div className="plan-task-result">{task.result.slice(0, 120)}</div>
                        )}
                        {task.error && (
                          <div className="plan-task-error">{task.error.slice(0, 100)}</div>
                        )}
                      </div>
                      <span
                        className="plan-task-status"
                        style={{ color: STATUS_COLORS[task.status] }}
                      >
                        {task.status}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Final result */}
                {plan.finalResult && (
                  <div className="plan-final-result">
                    <div className="plan-final-label">Synthesis result</div>
                    <div className="plan-final-text">{plan.finalResult.slice(0, 400)}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
