import type { GitStatusInfo, ProjectInfo } from '../types/global';

interface GitPanelProps {
  project: ProjectInfo;
  gitStatus: GitStatusInfo | null;
  gitStatusLoading: boolean;
  onRefreshGit: () => void;
}

export function GitPanel({ project, gitStatus, gitStatusLoading, onRefreshGit }: GitPanelProps) {

  if (gitStatusLoading && !gitStatus) {
    return (
      <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/40 p-6 text-sm text-slate-600 dark:text-slate-300">
        Checking git status for <span className="font-mono">{project.name}</span>…
      </div>
    );
  }

  if (!gitStatus) {
    return (
      <div className="rounded-lg border border-amber-200 dark:border-amber-400/40 bg-amber-50 dark:bg-amber-500/10 p-6 text-sm text-amber-700 dark:text-amber-200">
        Git repository not detected in this project directory.
        <button
          onClick={onRefreshGit}
          className="ml-2 text-amber-800 underline decoration-dotted dark:text-amber-100 hover:text-amber-600"
        >
          Check again
        </button>
      </div>
    );
  }

  const changeList = gitStatus.changes ?? [];
  const hasChanges = changeList.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 px-3 py-1.5">
          <span className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Branch</span>
          <span className="font-semibold text-slate-900 dark:text-white">{gitStatus.branch ?? 'detached'}</span>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 px-3 py-1.5">
          <span className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Remote</span>
          <span className="font-semibold text-slate-900 dark:text-white">{gitStatus.upstream ?? 'origin'}</span>
        </div>
        {typeof gitStatus.ahead === 'number' && gitStatus.ahead > 0 && (
          <span className="rounded-full bg-emerald-100 dark:bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-200">
            ↑ {gitStatus.ahead} ahead
          </span>
        )}
        {typeof gitStatus.behind === 'number' && gitStatus.behind > 0 && (
          <span className="rounded-full bg-amber-100 dark:bg-amber-500/20 px-3 py-1 text-xs font-semibold text-amber-700 dark:text-amber-200">
            ↓ {gitStatus.behind} behind
          </span>
        )}
        <button
          onClick={onRefreshGit}
          className="text-xs font-semibold text-indigo-600 dark:text-indigo-300 hover:text-indigo-800 dark:hover:text-indigo-200"
          disabled={gitStatusLoading}
        >
          {gitStatusLoading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {gitStatus.lastCommit && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-4 shadow-sm dark:shadow-inner">
          <p className="text-sm font-semibold text-slate-900 dark:text-white mb-2">Last commit</p>
          <p className="font-mono text-xs text-slate-600 dark:text-slate-300">{gitStatus.lastCommit.hash}</p>
          <p className="text-sm text-slate-800 dark:text-slate-100">{gitStatus.lastCommit.message}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{gitStatus.lastCommit.relativeTime}</p>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">Working tree</p>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {hasChanges ? `${changeList.length} change${changeList.length === 1 ? '' : 's'}` : 'Clean'}
          </span>
        </div>
        {hasChanges ? (
          <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800 text-sm">
            {changeList.map((change) => {
              const statusLabel = `${change.indexStatus || ' '} ${change.worktreeStatus || ' '}`.trim();
              return (
                <li key={`${statusLabel}-${change.path}`} className="py-2 flex items-center gap-3 text-slate-700 dark:text-slate-200">
                  <span
                    className="rounded-md bg-slate-100 dark:bg-slate-800/70 px-2 py-0.5 text-xs font-mono text-slate-600 dark:text-slate-300"
                    title="Index/Worktree status"
                  >
                    {statusLabel || '??'}
                  </span>
                  <span className="font-mono text-xs text-slate-500 dark:text-slate-400">{change.path}</span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Working tree is clean.</p>
        )}
      </div>
    </div>
  );
}

export default GitPanel;

