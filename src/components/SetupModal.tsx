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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 p-6">
      <div className="w-full max-w-xl space-y-5 rounded-3xl border border-slate-800 bg-slate-950 p-8 shadow-2xl">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.3em] text-indigo-400">First-time setup</p>
          <h2 className="text-2xl font-semibold text-white">Choose directories to scan</h2>
          <p className="text-sm text-slate-400">
            Localhost Hub looks for package.json files within the directories you provide. Click "Add folder" to select directories to scan.
          </p>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-widest text-slate-400">Selected directories</label>
            <button
              type="button"
              onClick={onSelectFolder || (() => {})}
              disabled={!onSelectFolder}
              className="rounded-xl border border-indigo-500/40 bg-indigo-500/10 px-4 py-2 text-xs font-semibold text-indigo-200 hover:bg-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              + Add folder
            </button>
          </div>
          {directories.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/30 p-8 text-center">
              <p className="text-sm text-slate-500">No directories selected</p>
              <p className="mt-1 text-xs text-slate-600">Click "Add folder" to get started</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900/30 p-3">
              {directories.map((dir, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-800/50 px-3 py-2"
                >
                  <span className="flex-1 truncate text-sm text-slate-200" title={dir}>
                    {dir}
                  </span>
                  {onRemoveFolder && (
                    <button
                      type="button"
                      onClick={() => onRemoveFolder(dir)}
                      className="ml-2 rounded-lg px-2 py-1 text-xs font-semibold text-slate-400 hover:bg-slate-700/50 hover:text-rose-400"
                      title="Remove"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          {setupError && <p className="text-sm text-rose-300">{setupError}</p>}
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            className="rounded-2xl border border-indigo-500/40 bg-indigo-500/10 px-4 py-2 text-sm font-semibold text-indigo-200 hover:bg-indigo-500/30"
            onClick={onSave}
          >
            Save & scan
          </button>
          <button
            className="rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-2 text-sm font-semibold text-slate-200 hover:border-slate-700"
            onClick={onUseRepoRoot}
          >
            Use current workspace
          </button>
          <button
            className="rounded-2xl border border-transparent px-4 py-2 text-sm font-semibold text-slate-400 hover:text-slate-200"
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
