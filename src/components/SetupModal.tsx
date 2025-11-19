interface SetupModalProps {
  isOpen: boolean;
  setupInput: string;
  onChange: (value: string) => void;
  onSave: () => void;
  onUseRepoRoot: () => void;
  onClose: () => void;
  setupError: string | null;
  onSelectFolder?: () => void;
  onRemoveFolder?: (path: string) => void;
}

export function SetupModal({
  isOpen,
  setupInput,
  onChange,
  onSave,
  onUseRepoRoot,
  onClose,
  setupError,
  onSelectFolder,
  onRemoveFolder
}: SetupModalProps) {
  if (!isOpen) return null;

  const directories = setupInput
    .split(/\n|,/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-6">
      <div className="w-full max-w-xl space-y-5 rounded-3xl border border-slate-200 bg-white p-8 shadow-2xl dark:border-slate-800 dark:bg-slate-950">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.3em] text-indigo-600 dark:text-indigo-400">First-time setup</p>
          <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">Choose directories to scan</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Localhost Hub looks for package.json files within the directories you provide. Click "Add folder" to select directories to scan.
          </p>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">Selected directories</label>
            <button
              type="button"
              onClick={onSelectFolder || (() => {})}
              disabled={!onSelectFolder}
              className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed dark:border-indigo-500/40 dark:bg-indigo-500/10 dark:text-indigo-200 dark:hover:bg-indigo-500/20"
            >
              + Add folder
            </button>
          </div>
          {directories.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center dark:border-slate-700 dark:bg-slate-900/30">
              <p className="text-sm text-slate-600 dark:text-slate-400">No directories selected</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">Click "Add folder" to get started</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/30">
              {directories.map((dir, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800/50"
                >
                  <span className="flex-1 truncate text-sm text-slate-700 dark:text-slate-200" title={dir}>
                    {dir}
                  </span>
                  {onRemoveFolder && (
                    <button
                      type="button"
                      onClick={() => onRemoveFolder(dir)}
                      className="ml-2 rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-rose-500 dark:text-slate-400 dark:hover:bg-slate-700/50 dark:hover:text-rose-400"
                      title="Remove"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          {setupError && <p className="text-sm text-rose-600 dark:text-rose-300">{setupError}</p>}
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            className="rounded-2xl border border-indigo-200 bg-indigo-600/90 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 dark:border-indigo-500/40 dark:bg-indigo-500/10 dark:text-indigo-200 dark:hover:bg-indigo-500/30"
            onClick={onSave}
          >
            Save & scan
          </button>
          <button
            className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-400 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:border-slate-700"
            onClick={onUseRepoRoot}
          >
            Use current workspace
          </button>
          <button
            className="rounded-2xl border border-transparent px-4 py-2 text-sm font-semibold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            onClick={onClose}
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}

export default SetupModal;
