import { useState } from 'react';
import { HiXMark } from 'react-icons/hi2';

interface AddCustomScriptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (name: string, command: string, description?: string) => Promise<void>;
  projectName: string;
  existingScriptNames?: string[];
}

export function AddCustomScriptModal({
  isOpen,
  onClose,
  onSave,
  projectName,
  existingScriptNames = []
}: AddCustomScriptModalProps) {
  const [name, setName] = useState('');
  const [command, setCommand] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    setError(null);
    
    if (!name.trim()) {
      setError('Script name is required.');
      return;
    }
    
    if (!command.trim()) {
      setError('Command is required.');
      return;
    }
    
    if (existingScriptNames.includes(name.trim())) {
      setError(`A script named "${name.trim()}" already exists.`);
      return;
    }
    
    setPending(true);
    try {
      await onSave(name.trim(), command.trim(), description.trim() || undefined);
      setName('');
      setCommand('');
      setDescription('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save script.');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 px-4 py-8">
      <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-950">
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-indigo-500 dark:text-indigo-300">Custom Script</p>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Add script to {projectName}</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:text-slate-300 dark:hover:bg-slate-800 transition"
            aria-label="Close"
          >
            <HiXMark className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Script Name
            </label>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100 focus:outline-none"
              placeholder="e.g. deploy, test-custom"
            />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Command
            </label>
            <textarea
              value={command}
              onChange={(event) => setCommand(event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100 focus:outline-none"
              placeholder="e.g. npm run build && npm run deploy"
              rows={3}
            />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Description (optional)
            </label>
            <input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100 focus:outline-none"
              placeholder="What does this script do?"
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
            {pending ? 'Saving…' : 'Add Script'}
          </button>
        </div>
      </div>
    </div>
  );
}

