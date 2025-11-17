import type { RunHistory } from '../types/global';

interface ActivityPanelProps {
  runHistory: RunHistory[];
}

function formatTimestamp(timestamp: number) {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function ActivityPanel({ runHistory }: ActivityPanelProps) {
  if (runHistory.length === 0) {
    return <p className="text-sm text-slate-400">No scripts have been run yet.</p>;
  }

  return (
    <div className="space-y-4">
      {runHistory.map((process) => (
        <div key={process.id} className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-400">Script</p>
              <p className="text-lg font-semibold text-white">{process.script}</p>
            </div>
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${
              process.status === 'Success'
                ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/40'
                : 'bg-rose-500/10 text-rose-200 border-rose-500/40'
            }`}
            >
              {process.status}
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-400">
            <div>
              <p className="text-slate-500">Started</p>
              <p>{formatTimestamp(process.startedAt)}</p>
            </div>
            <div>
              <p className="text-slate-500">Ended</p>
              <p>{formatTimestamp(process.finishedAt)}</p>
            </div>
            <div>
              <p className="text-slate-500">Exit code</p>
              <p>{process.exitCode ?? '—'}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default ActivityPanel;
