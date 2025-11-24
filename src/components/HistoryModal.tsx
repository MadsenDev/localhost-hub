import type { RunHistory } from '../types/global';

interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  runHistory: RunHistory[];
}

function formatTimestamp(timestamp: number) {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const EXIT_CODE_DESCRIPTIONS: Record<number, string> = {
  0: 'Exited successfully without errors.',
  1: 'Generic error – check logs for details.',
  130: 'Terminated via Ctrl+C (SIGINT).',
  137: 'Force killed (SIGKILL), often due to memory limits.',
  143: 'Stopped cleanly with SIGTERM.'
};

function describeExitCode(exitCode: number | null) {
  if (exitCode === null || exitCode === undefined) {
    return 'No exit code was reported for this run.';
  }
  return EXIT_CODE_DESCRIPTIONS[exitCode] ?? `Process exited with code ${exitCode}. Refer to the log output for context.`;
}

export function HistoryModal({ isOpen, onClose, runHistory }: HistoryModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 p-6" onClick={onClose}>
      <div
        className="w-full max-w-2xl rounded-3xl border border-slate-800 bg-slate-950 p-8 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-indigo-400">Activity</p>
            <h2 className="text-2xl font-semibold text-white">Recent History</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          >
            ×
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {runHistory.length === 0 ? (
            <p className="text-sm text-slate-400">No scripts have been run yet.</p>
          ) : (
            <div className="space-y-4">
              {runHistory.map((process) => (
                <div key={process.id} className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-400">Script</p>
                      <p className="text-lg font-semibold text-white">{process.script}</p>
                    </div>
                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                        process.status === 'Success'
                          ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/40'
                          : process.status === 'Stopped'
                          ? 'bg-amber-500/10 text-amber-300 border-amber-500/40'
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
                    <div className="relative">
                      <p className="text-slate-500">Exit code</p>
                      <div className="inline-flex group">
                        <span className="font-mono text-sm text-white">{process.exitCode ?? '—'}</span>
                        <span className="pointer-events-none absolute right-0 top-full z-50 hidden w-60 translate-y-2 rounded-lg bg-slate-900/95 px-3 py-2 text-[11px] text-slate-100 shadow-2xl group-hover:block">
                          {describeExitCode(process.exitCode)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

