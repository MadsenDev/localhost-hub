import { useEffect, useState } from 'react';

type OverrideEntry = { id: string; key: string; value: string };

interface ScriptOverridesModalProps {
  isOpen: boolean;
  scriptName: string;
  initialOverrides?: Record<string, string>;
  onSave: (overrides: Record<string, string>) => void;
  onClose: () => void;
}

export function ScriptOverridesModal({ isOpen, scriptName, initialOverrides, onSave, onClose }: ScriptOverridesModalProps) {
  const [entries, setEntries] = useState<OverrideEntry[]>([]);

  useEffect(() => {
    setEntries(
      initialOverrides
        ? Object.entries(initialOverrides).map(([key, value]) => ({ id: `${key}-${Math.random()}`, key, value }))
        : []
    );
  }, [initialOverrides, scriptName, isOpen]);

  if (!isOpen) return null;

  const handleAdd = () => {
    setEntries((current) => [...current, { id: `override-${Date.now()}`, key: '', value: '' }]);
  };

  const handleChange = (id: string, changes: Partial<OverrideEntry>) => {
    setEntries((current) => current.map((entry) => (entry.id === id ? { ...entry, ...changes } : entry)));
  };

  const handleRemove = (id: string) => {
    setEntries((current) => current.filter((entry) => entry.id !== id));
  };

  const handleSave = () => {
    const overrides: Record<string, string> = {};
    entries.forEach((entry) => {
      if (entry.key.trim()) {
        overrides[entry.key.trim()] = entry.value;
      }
    });
    onSave(overrides);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 px-4 py-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-950">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-indigo-500 dark:text-indigo-300">Env overrides</p>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">{scriptName}</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-semibold text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            Close
          </button>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Overrides apply when running this script and do not persist to .env files.
        </p>

        <div className="mt-4 space-y-3">
          {entries.length === 0 && (
            <p className="text-xs text-slate-500 dark:text-slate-400">No overrides yet. Add your first variable.</p>
          )}
          {entries.map((entry) => (
            <div key={entry.id} className="flex items-center gap-2">
              <input
                value={entry.key}
                onChange={(event) => handleChange(entry.id, { key: event.target.value })}
                placeholder="KEY"
                className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-300 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-100"
              />
              <input
                value={entry.value}
                onChange={(event) => handleChange(entry.id, { value: event.target.value })}
                placeholder="value"
                className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-300 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-100"
              />
              <button
                onClick={() => handleRemove(entry.id)}
                className="text-xs text-rose-500 hover:text-rose-600 dark:text-rose-300 dark:hover:text-rose-200"
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <button
            onClick={handleAdd}
            className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs font-semibold text-slate-500 hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-700 dark:text-slate-300"
          >
            + Add variable
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="rounded-lg border border-indigo-200 bg-indigo-600/90 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 dark:border-indigo-500/40"
            >
              Save overrides
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ScriptOverridesModal;

