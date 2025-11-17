import type { ScriptInfo } from '../types/global';

interface ScriptsPanelProps {
  scripts: ScriptInfo[];
  scriptInFlight: string | null;
  onRunScript: (script: ScriptInfo) => void;
  onStopScript: () => void;
  onRestartScript: (script: ScriptInfo) => void;
}

export function ScriptsPanel({ scripts, scriptInFlight, onRunScript, onStopScript, onRestartScript }: ScriptsPanelProps) {
  if (scripts.length === 0) {
    return <p className="text-sm text-slate-400">No scripts detected for this project.</p>;
  }

  return (
    <div className="space-y-3">
      {scripts.map((script) => {
        const isRunning = scriptInFlight === script.name;
        return (
          <div key={script.name} className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 transition hover:border-indigo-400/40">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-base font-semibold">{script.name}</p>
                <p className="text-xs uppercase tracking-wide text-slate-500">npm run</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  className={`rounded-full border px-4 py-1 text-xs font-semibold transition ${
                    isRunning
                      ? 'border-rose-400/40 bg-rose-500/10 text-rose-200 hover:bg-rose-500/30'
                      : 'border-indigo-500/40 bg-indigo-500/10 text-indigo-200 hover:bg-indigo-500/30'
                  }`}
                  onClick={() => (isRunning ? onStopScript() : onRunScript(script))}
                  disabled={Boolean(scriptInFlight && !isRunning)}
                >
                  {isRunning ? 'Stop' : 'Run'}
                </button>
                <button
                  className="rounded-full border border-slate-800/80 px-4 py-1 text-xs font-semibold text-slate-300 transition hover:border-indigo-400/40 hover:text-white disabled:opacity-40"
                  onClick={() => onRestartScript(script)}
                  disabled={Boolean(scriptInFlight && !isRunning)}
                >
                  Restart
                </button>
              </div>
            </div>
            {script.description && <p className="mt-2 text-sm text-slate-400">{script.description}</p>}
            <code className="mt-3 block rounded-lg bg-slate-950/80 px-3 py-2 text-xs text-slate-300">{script.command}</code>
          </div>
        );
      })}
    </div>
  );
}

export default ScriptsPanel;
