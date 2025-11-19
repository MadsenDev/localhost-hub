import type { RefObject } from 'react';

interface LogsPanelProps {
  logOutput: string;
  logContainerRef: RefObject<HTMLPreElement | null>;
  onExportLog: () => void;
  onClearLog: () => void;
  onCopyLog: () => void;
  onToggleAutoScroll: () => void;
  isExporting: boolean;
  canExport: boolean;
  canCopy: boolean;
  canClear: boolean;
  isAutoScrollEnabled: boolean;
}

export function LogsPanel({
  logOutput,
  logContainerRef,
  onExportLog,
  onClearLog,
  onCopyLog,
  onToggleAutoScroll,
  isExporting,
  canExport,
  canCopy,
  canClear,
  isAutoScrollEnabled
}: LogsPanelProps) {
  return (
    <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
      <pre
        ref={logContainerRef}
        className="h-64 overflow-y-auto rounded-xl bg-slate-100 dark:bg-black/60 p-4 font-mono text-xs text-slate-800 dark:text-emerald-300 whitespace-pre-wrap"
      >
        {logOutput || ' '}
      </pre>
      <div className="grid gap-2 sm:grid-cols-2">
        <button
          className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 transition hover:border-indigo-300 dark:hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-white disabled:opacity-40"
          onClick={onToggleAutoScroll}
          type="button"
        >
          {isAutoScrollEnabled ? 'Pause auto-scroll' : 'Resume auto-scroll'}
        </button>
        <button
          className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 transition hover:border-rose-300 dark:hover:border-rose-400 hover:text-rose-600 dark:hover:text-white disabled:opacity-40"
          onClick={onClearLog}
          disabled={!canClear}
          type="button"
        >
          Clear log
        </button>
        <button
          className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 transition hover:border-emerald-300 dark:hover:border-emerald-400 hover:text-emerald-600 dark:hover:text-white disabled:opacity-40"
          onClick={onCopyLog}
          disabled={!canCopy}
          type="button"
        >
          Copy log
        </button>
        <button
          className="rounded-xl border border-indigo-200 dark:border-indigo-500/40 bg-indigo-50 dark:bg-indigo-500/10 px-3 py-2 text-xs font-semibold text-indigo-700 dark:text-indigo-100 transition hover:bg-indigo-100 dark:hover:bg-indigo-500/30 disabled:opacity-40"
          onClick={onExportLog}
          disabled={!canExport || isExporting}
          type="button"
        >
          {isExporting ? 'Saving…' : 'Export log'}
        </button>
      </div>
    </div>
  );
}

export default LogsPanel;
