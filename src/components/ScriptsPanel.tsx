import { motion, AnimatePresence } from 'framer-motion';
import { HiTrash } from 'react-icons/hi2';
import type { ScriptInfo } from '../types/global';

interface ScriptsPanelProps {
  scripts: ScriptInfo[];
  scriptInFlight: string | null;
  onRunScript: (script: ScriptInfo) => void;
  onStopScript: () => void;
  onRestartScript: (script: ScriptInfo) => void;
  forceStopReady: boolean;
  onForceStopScript: () => void;
  onEditOverrides?: (script: ScriptInfo) => void;
  hasOverrides?: (script: ScriptInfo) => boolean;
  onDeleteScript?: (script: ScriptInfo) => void;
}

export function ScriptsPanel({
  scripts,
  scriptInFlight,
  onRunScript,
  onStopScript,
  onRestartScript,
  forceStopReady,
  onForceStopScript,
  onEditOverrides,
  hasOverrides,
  onDeleteScript
}: ScriptsPanelProps) {
  if (scripts.length === 0) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">No scripts detected for this project.</p>;
  }

  return (
    <div className="space-y-3">
      <AnimatePresence mode="popLayout">
        {scripts.map((script, index) => {
          const isRunning = scriptInFlight === script.name;
          const runnerLabel = script.runner === 'cargo' ? 'cargo' : script.runner === 'custom' ? 'command' : 'npm run';
          return (
            <motion.div
              key={script.name}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2, delay: index * 0.05 }}
              whileHover={{ scale: 1.01 }}
              className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/40 p-4 transition hover:border-indigo-300 dark:hover:border-indigo-400/40"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-base font-semibold text-slate-900 dark:text-white">{script.name}</p>
                  <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-500">{runnerLabel}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    data-tour={index === 0 ? 'script-run' : undefined}
                    className={`rounded-full border px-4 py-1 text-xs font-semibold transition ${
                      isRunning
                        ? 'border-rose-300 dark:border-rose-400/40 bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-200 hover:bg-rose-100 dark:hover:bg-rose-500/30'
                        : 'border-indigo-300 dark:border-indigo-500/40 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-200 hover:bg-indigo-100 dark:hover:bg-indigo-500/30'
                    }`}
                    onClick={() => (isRunning ? onStopScript() : onRunScript(script))}
                    disabled={Boolean(scriptInFlight && !isRunning)}
                  >
                    {isRunning ? 'Stop' : 'Run'}
                  </button>
                  <button
                    className="rounded-full border border-slate-200 dark:border-slate-800/80 px-4 py-1 text-xs font-semibold text-slate-600 dark:text-slate-300 transition hover:border-indigo-300 dark:hover:border-indigo-400/40 hover:text-indigo-600 dark:hover:text-white disabled:opacity-40"
                    onClick={() => onRestartScript(script)}
                    disabled={Boolean(scriptInFlight && !isRunning)}
                  >
                    Restart
                  </button>
                  {onEditOverrides && (
                    <button
                      className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition ${
                        hasOverrides?.(script)
                          ? 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-400/50 dark:bg-amber-500/10 dark:text-amber-200'
                          : 'border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-700 dark:text-slate-300 dark:hover:border-indigo-400/40'
                      }`}
                      onClick={() => onEditOverrides(script)}
                      disabled={Boolean(scriptInFlight && !isRunning)}
                    >
                      Env overrides{hasOverrides?.(script) ? ' • set' : ''}
                    </button>
                  )}
                  {isRunning && forceStopReady && (
                    <button
                      className="rounded-full border border-rose-500/70 px-4 py-1 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 dark:bg-rose-500 dark:hover:bg-rose-400 transition"
                      onClick={onForceStopScript}
                    >
                      Force stop
                    </button>
                  )}
                  {onDeleteScript && script.runner === 'custom' && (
                    <button
                      className="rounded-full border border-slate-200 dark:border-slate-800/80 px-3 py-1 text-xs font-semibold text-slate-600 dark:text-slate-300 transition hover:border-rose-300 dark:hover:border-rose-400/40 hover:text-rose-600 dark:hover:text-rose-300 disabled:opacity-40"
                      onClick={() => onDeleteScript(script)}
                      disabled={Boolean(scriptInFlight && isRunning)}
                      title="Delete custom script"
                    >
                      <HiTrash className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
              {script.description && <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{script.description}</p>}
              <code className="mt-3 block rounded-lg bg-slate-100 dark:bg-slate-950/80 px-3 py-2 text-xs text-slate-700 dark:text-slate-300">{script.command}</code>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

export default ScriptsPanel;
