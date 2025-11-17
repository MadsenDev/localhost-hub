import type { RefObject } from 'react';

interface LogsPanelProps {
  logOutput: string;
  logContainerRef: RefObject<HTMLPreElement>;
}

export function LogsPanel({ logOutput, logContainerRef }: LogsPanelProps) {
  return (
    <div className="space-y-3 text-sm text-slate-300">
      <pre
        ref={logContainerRef}
        className="h-64 overflow-y-auto rounded-xl bg-black/60 p-4 font-mono text-xs text-emerald-300 whitespace-pre-wrap"
      >
        {logOutput}
      </pre>
      <button className="w-full rounded-xl border border-slate-800 bg-slate-900/50 px-3 py-2 text-xs font-semibold text-slate-200">
        Export log (coming soon)
      </button>
    </div>
  );
}

export default LogsPanel;
