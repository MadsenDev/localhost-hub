import React from 'react';
import { Ic } from './icons';
import { tauriApi, type RunOutcome, type RunRecord } from './tauri-api';

const OUTCOME_LABEL: Record<RunOutcome, string> = {
  running: 'Running',
  exited: 'Exited',
  stopped: 'Stopped',
  failed: 'Failed',
  interrupted: 'Interrupted',
};

const OUTCOME_COLOR: Record<RunOutcome, string> = {
  running: 'var(--blue)',
  exited: 'var(--ok)',
  stopped: 'var(--fg-3)',
  failed: 'var(--danger)',
  interrupted: 'var(--warn)',
};

function formatWhen(ms: number): string {
  const date = new Date(ms);
  const elapsed = Date.now() - ms;
  if (elapsed < 60_000) return 'just now';
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}m ago`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)}h ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatRunDuration(record: RunRecord): string {
  if (record.ended_at_ms === null) return '—';
  const ms = Math.max(0, record.ended_at_ms - record.started_at_ms);
  if (ms < 1_000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1_000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1_000);
  return `${minutes}m ${seconds}s`;
}

export function HistoryView() {
  const [runs, setRuns] = React.useState<RunRecord[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [openRun, setOpenRun] = React.useState<string | null>(null);
  const [log, setLog] = React.useState<{ lines: string[]; truncated: boolean } | null>(null);
  const [logError, setLogError] = React.useState('');

  const load = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRuns(await tauriApi.listRunHistory());
    } catch (reason) {
      setError(String(reason).replace(/^Error:\s*/, ''));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const openLog = React.useCallback(async (runId: string) => {
    if (openRun === runId) {
      setOpenRun(null);
      setLog(null);
      return;
    }
    setOpenRun(runId);
    setLog(null);
    setLogError('');
    try {
      const result = await tauriApi.readRunLog(runId);
      setLog({ lines: result.lines, truncated: result.truncated });
    } catch (reason) {
      setLogError(String(reason).replace(/^Error:\s*/, ''));
    }
  }, [openRun]);

  const clear = React.useCallback(async () => {
    try {
      await tauriApi.clearRunHistory();
      setOpenRun(null);
      setLog(null);
      await load();
    } catch (reason) {
      setError(String(reason).replace(/^Error:\s*/, ''));
    }
  }, [load]);

  const interrupted = runs.filter(run => run.outcome === 'interrupted').length;

  return (
    <div className="view"><div className="view-inner">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 18 }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 4 }}>Persisted</div>
          <h1 className="h1">Run history</h1>
          <div style={{ color: 'var(--fg-3)', fontSize: 12.5, marginTop: 4 }}>
            Every service run and its output, kept across restarts.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn sm" onClick={() => void load()} disabled={loading}>
            <Ic.Reload size={11} /> {loading ? 'Loading…' : 'Refresh'}
          </button>
          <button className="btn sm ghost danger" onClick={() => void clear()} disabled={runs.length === 0}>
            Clear
          </button>
        </div>
      </div>

      {interrupted > 0 ? (
        <div className="panel" style={{ padding: '10px 14px', marginBottom: 12, fontSize: 12.5, color: 'var(--warn)' }}>
          {interrupted === 1 ? '1 run was' : `${interrupted} runs were`} still running when Localhost Hub last
          closed. Their final state is unknown.
        </div>
      ) : null}

      {error ? (
        <div className="panel" style={{ padding: 18, color: 'var(--danger)', fontSize: 12.5 }}>{error}</div>
      ) : runs.length === 0 ? (
        <div className="panel empty">
          <Ic.History size={30} />
          <div style={{ marginTop: 10 }}>{loading ? 'Loading run history…' : 'No runs recorded yet.'}</div>
          <div style={{ color: 'var(--fg-4)', marginTop: 6, fontSize: 12 }}>
            Start a service and its run will be recorded here.
          </div>
        </div>
      ) : (
        <div className="panel">
          {runs.map((run, index) => {
            const isOpen = openRun === run.run_id;
            return (
              <div key={run.run_id} style={{ borderTop: index === 0 ? 'none' : '1px solid var(--line-1)' }}>
                <button
                  type="button"
                  onClick={() => void openLog(run.run_id)}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0, 1fr) auto auto auto auto',
                    alignItems: 'center',
                    gap: 12,
                    width: '100%',
                    background: 'none',
                    border: 'none',
                    padding: '11px 14px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    color: 'inherit',
                    font: 'inherit',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{run.service_id}</div>
                    <div
                      className="mono"
                      style={{
                        color: 'var(--fg-4)',
                        fontSize: 11.5,
                        marginTop: 2,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={`${run.cmd}\n${run.cwd}`}
                    >
                      {run.cmd}
                    </div>
                  </div>
                  <span style={{ color: 'var(--fg-4)', fontSize: 11.5 }}>PID {run.pid}</span>
                  <span style={{ color: 'var(--fg-3)', fontSize: 11.5 }}>{formatRunDuration(run)}</span>
                  <span style={{ color: 'var(--fg-4)', fontSize: 11.5 }}>{formatWhen(run.started_at_ms)}</span>
                  <span style={{ color: OUTCOME_COLOR[run.outcome], fontSize: 11.5, fontWeight: 500 }}>
                    {OUTCOME_LABEL[run.outcome]}
                    {run.exit_code !== null ? ` (${run.exit_code})` : ''}
                  </span>
                </button>

                {isOpen ? (
                  <div style={{ padding: '0 14px 14px' }}>
                    {logError ? (
                      <div style={{ color: 'var(--danger)', fontSize: 12 }}>{logError}</div>
                    ) : log === null ? (
                      <div style={{ color: 'var(--fg-4)', fontSize: 12 }}>Loading output…</div>
                    ) : log.lines.length === 0 ? (
                      <div style={{ color: 'var(--fg-4)', fontSize: 12 }}>This run produced no output.</div>
                    ) : (
                      <>
                        {log.truncated || run.log_truncated ? (
                          <div style={{ color: 'var(--warn)', fontSize: 11.5, marginBottom: 6 }}>
                            Showing the end of a longer log.
                          </div>
                        ) : null}
                        <pre
                          className="mono"
                          style={{
                            margin: 0,
                            padding: 10,
                            maxHeight: 320,
                            overflow: 'auto',
                            background: 'var(--bg-1)',
                            border: '1px solid var(--line-1)',
                            borderRadius: 6,
                            fontSize: 11.5,
                            lineHeight: 1.5,
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                          }}
                        >
                          {log.lines.join('\n')}
                        </pre>
                      </>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div></div>
  );
}
