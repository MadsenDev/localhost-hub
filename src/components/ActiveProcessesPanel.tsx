import type { ActiveProcessInfo } from '../types/global';

interface ActiveProcessesPanelProps {
  processes: ActiveProcessInfo[];
}

export function formatDuration(startedAt: number) {
  const durationMs = Date.now() - startedAt;
  const seconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes === 0) {
    return `${seconds}s`;
  }
  return `${minutes}m ${remainingSeconds.toString().padStart(2, '0')}s`;
}

export function formatTimestamp(timestamp: number) {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function ActiveProcessesPanel({ processes }: ActiveProcessesPanelProps) {
  if (processes.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-900/80 bg-slate-950/50 p-4 text-sm text-slate-400">
        No scripts are currently running.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {processes.map((process) => (
        <div
          key={process.id}
          className={`rounded-2xl border p-4 ${
            process.isExternal
              ? 'border-purple-500/30 bg-purple-500/5'
              : 'border-indigo-500/30 bg-indigo-500/5'
          }`}
        >
          <div className="flex items-center gap-3">
            <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400" aria-hidden />
            <p className="text-sm font-semibold text-white">{process.script}</p>
            {process.isExternal && (
              <span className="rounded-full bg-purple-500/20 px-2 py-0.5 text-[10px] font-semibold text-purple-300">
                External
              </span>
            )}
            <span className="text-xs text-slate-400">{formatTimestamp(process.startedAt)}</span>
            <span className="ml-auto text-xs text-slate-300">{formatDuration(process.startedAt)}</span>
          </div>
          <p className="mt-2 truncate text-xs text-slate-400">{process.command}</p>
          <p className="truncate text-xs text-slate-500">{process.projectPath}</p>
        </div>
      ))}
    </div>
  );
}

export default ActiveProcessesPanel;
