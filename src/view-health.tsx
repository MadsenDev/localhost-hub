import React from 'react';
import type { Repo } from './types';
import { Ic } from './icons';
import { tauriApi, type HealthSignalState, type RepositoryHealth } from './tauri-api';

interface HealthViewProps {
  repos: Repo[];
}

const STATUS_ORDER = { risk: 0, attention: 1, healthy: 2 };
const STATUS_COLOR = {
  healthy: 'var(--ok)',
  attention: 'var(--warn)',
  risk: 'var(--danger)',
};
const SIGNAL_COLOR: Record<HealthSignalState, string> = {
  good: 'var(--ok)',
  info: 'var(--fg-3)',
  warn: 'var(--warn)',
  bad: 'var(--danger)',
};

export function HealthView({ repos }: HealthViewProps) {
  const paths = React.useMemo(
    () => [...new Set(repos.map(repo => repo.git_root ?? repo.path))],
    [repos],
  );
  const [results, setResults] = React.useState<RepositoryHealth[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [expanded, setExpanded] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (paths.length === 0) {
      setResults([]);
      return;
    }
    setLoading(true);
    setError('');
    try {
      setResults((await tauriApi.analyzeRepositoryHealth(paths)) ?? []);
    } catch (reason) {
      setError(String(reason).replace(/^Error:\s*/, ''));
    } finally {
      setLoading(false);
    }
  }, [paths]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const repoByPath = React.useMemo(
    () => new Map(repos.map(repo => [repo.git_root ?? repo.path, repo])),
    [repos],
  );
  const sorted = [...results].sort(
    (left, right) =>
      STATUS_ORDER[left.status] - STATUS_ORDER[right.status] || left.score - right.score,
  );
  const counts = {
    healthy: results.filter(result => result.status === 'healthy').length,
    attention: results.filter(result => result.status === 'attention').length,
    risk: results.filter(result => result.status === 'risk').length,
  };
  const average = results.length
    ? Math.round(results.reduce((sum, result) => sum + result.score, 0) / results.length)
    : 0;

  return (
    <div className="view"><div className="view-inner">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 18 }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 4 }}>Local intelligence</div>
          <h1 className="h1">Repository health</h1>
          <div style={{ color: 'var(--fg-3)', fontSize: 12.5, marginTop: 4 }}>
            Native checks for activity, Git hygiene, documentation, dependencies, and CI.
          </div>
        </div>
        <button className="btn sm" onClick={() => void load()} disabled={loading}>
          <Ic.Reload size={11} /> {loading ? 'Analyzing…' : 'Refresh'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10, marginBottom: 14 }}>
        <HealthKpi label="Average score" value={results.length ? `${average}` : '—'} color="var(--blue)" />
        <HealthKpi label="Healthy" value={`${counts.healthy}`} color="var(--ok)" />
        <HealthKpi label="Needs attention" value={`${counts.attention}`} color="var(--warn)" />
        <HealthKpi label="At risk" value={`${counts.risk}`} color="var(--danger)" />
      </div>

      {error ? (
        <div className="panel" style={{ padding: 18, color: 'var(--danger)', fontSize: 12.5 }}>{error}</div>
      ) : paths.length === 0 ? (
        <div className="panel empty">
          <Ic.Activity size={30} />
          <div style={{ marginTop: 10 }}>No local repositories to analyze.</div>
          <div style={{ color: 'var(--fg-4)', marginTop: 6, fontSize: 12 }}>
            Add workspace folders in Settings, then rescan.
          </div>
        </div>
      ) : loading && results.length === 0 ? (
        <div className="panel empty">
          <Ic.Activity size={30} />
          <div style={{ marginTop: 10 }}>Analyzing {paths.length} repositories…</div>
        </div>
      ) : (
        <div className="panel">
          {sorted.map((health, index) => {
            const repo = repoByPath.get(health.path);
            const important = health.signals.filter(signal => signal.state === 'bad' || signal.state === 'warn');
            const isExpanded = expanded === health.path;
            return (
              <div
                key={health.path}
                style={{ borderTop: index === 0 ? 'none' : '1px solid var(--line-1)' }}
              >
                <button
                  type="button"
                  onClick={() => setExpanded(isExpanded ? null : health.path)}
                  aria-expanded={isExpanded}
                  style={{
                    width: '100%',
                    display: 'grid',
                    gridTemplateColumns: 'minmax(180px, 1.2fr) 86px minmax(220px, 1.5fr) 120px 20px',
                    alignItems: 'center',
                    gap: 14,
                    padding: '13px 15px',
                    color: 'inherit',
                    background: 'transparent',
                    border: 0,
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 7, height: 7, borderRadius: 99, background: STATUS_COLOR[health.status] }} />
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--fg-1)' }}>
                        {repo?.name ?? health.path.split(/[\\/]/).pop()}
                      </span>
                    </span>
                    <span style={{ display: 'block', marginTop: 3, color: 'var(--fg-4)', fontSize: 10.5, fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {health.path}
                    </span>
                  </span>
                  <span style={{ color: STATUS_COLOR[health.status], fontFamily: 'var(--font-mono)', fontSize: 19, fontWeight: 650 }}>
                    {health.score}<span style={{ fontSize: 10, color: 'var(--fg-4)' }}>/100</span>
                  </span>
                  <span style={{ color: important.length ? 'var(--fg-2)' : 'var(--fg-3)', fontSize: 11.5 }}>
                    {important[0]?.detail ?? 'No immediate health warnings'}
                    {important.length > 1 && <span style={{ color: 'var(--fg-4)' }}> · +{important.length - 1} more</span>}
                  </span>
                  <span style={{ color: 'var(--fg-4)', fontSize: 11, textAlign: 'right' }}>
                    {health.days_since_last_commit == null
                      ? 'No commits'
                      : health.days_since_last_commit === 0
                        ? 'Active today'
                        : `${health.days_since_last_commit}d since commit`}
                  </span>
                  <Ic.ChevronD size={11} style={{ transform: isExpanded ? 'rotate(180deg)' : undefined }} />
                </button>

                {isExpanded && (
                  <div style={{ padding: '0 15px 15px 30px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 7 }}>
                      {health.signals.map(signal => (
                        <div key={signal.id} style={{ padding: '9px 10px', borderRadius: 'var(--r-1)', background: 'var(--bg-2)', border: '1px solid var(--line-1)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: SIGNAL_COLOR[signal.state], fontSize: 10.5, fontWeight: 650, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                            <span style={{ width: 6, height: 6, borderRadius: 99, background: SIGNAL_COLOR[signal.state] }} />
                            {signal.label}
                          </div>
                          <div style={{ color: 'var(--fg-3)', fontSize: 11.5, marginTop: 5 }}>{signal.detail}</div>
                        </div>
                      ))}
                    </div>
                    {health.stale_branches.length > 0 && (
                      <div style={{ marginTop: 10, color: 'var(--fg-4)', fontSize: 11 }}>
                        Inactive branches: {health.stale_branches.map(branch =>
                          `${branch.name} (${branch.days_since_commit}d${branch.merged_into_head ? ', merged' : ''})`
                        ).join(' · ')}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div></div>
  );
}

function HealthKpi({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={{ color }}>{value}</div>
    </div>
  );
}
