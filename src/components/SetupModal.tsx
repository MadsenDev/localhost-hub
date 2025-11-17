interface SetupModalProps {
  isOpen: boolean;
  setupInput: string;
  onChange: (value: string) => void;
  onSave: () => void;
  onUseRepoRoot: () => void;
  onClose: () => void;
  setupError: string | null;
}

export function SetupModal({
  isOpen,
  setupInput,
  onChange,
  onSave,
  onUseRepoRoot,
  onClose,
  setupError
}: SetupModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 p-6">
      <div className="w-full max-w-xl space-y-5 rounded-3xl border border-slate-800 bg-slate-950 p-8 shadow-2xl">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.3em] text-indigo-400">First-time setup</p>
          <h2 className="text-2xl font-semibold text-white">Choose directories to scan</h2>
          <p className="text-sm text-slate-400">
            Localhost Hub looks for package.json files within the directories you provide. Add folders like ~/dev or ~/work to
            auto-discover projects.
          </p>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-widest text-slate-400">Directories</label>
          <textarea
            value={setupInput}
            onChange={(event) => onChange(event.target.value)}
            placeholder="/Users/you/dev\n~/workspaces"
            rows={4}
            className="w-full rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-3 text-sm text-slate-100 focus:border-indigo-400 focus:outline-none"
          />
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
