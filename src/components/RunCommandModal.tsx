import { useState } from 'react';

interface RunCommandModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRun: (command: string, label?: string) => Promise<void>;
  projectName: string;
}

export function RunCommandModal({ isOpen, onClose, onRun, projectName }: RunCommandModalProps) {
  const [command, setCommand] = useState('');
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (!command.trim()) {
      setError('Command is required.');
      return;
    }
    setError(null);
    setPending(true);
    try {
      await onRun(command.trim(), label.trim() || undefined);
      setCommand('');
      setLabel('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run command.');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 px-4 py-8">
      <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-950">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-indigo-500 dark:text-indigo-300">Custom Command</p>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Run command in {projectName}</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-semibold text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            Close
          </button>
        </div>

        <div className="mt-6 space-y-4">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Command</label>
            <textarea
              value={command}
              onChange={(event) => setCommand(event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100"
              placeholder="e.g. npm run lint"
              rows={3}
            />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Label (optional)
            </label>
            <input
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100"
              placeholder="Shown in history (defaults to the command)"
            />
          </div>
          {error && <p className="text-sm text-rose-500">{error}</p>}
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={pending}
            className="rounded-xl border border-indigo-200 bg-indigo-600/90 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50 dark:border-indigo-500/40"
          >
            {pending ? 'Running…' : 'Run command'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default RunCommandModal;

