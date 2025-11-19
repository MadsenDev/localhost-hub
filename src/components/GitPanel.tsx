import { useEffect, useMemo, useState } from 'react';
import type { GitStatusInfo, ProjectInfo } from '../types/global';

interface GitPanelProps {
  project: ProjectInfo;
  gitStatus: GitStatusInfo | null;
  gitStatusLoading: boolean;
  onRefreshGit: () => void;
  onCommit: (payload: { message: string; stageAll?: boolean }) => Promise<void>;
  onPull: (payload: { remote?: string; branch?: string }) => Promise<void>;
  onPush: (payload: { remote?: string; branch?: string; setUpstream?: boolean }) => Promise<void>;
}

export function GitPanel({ project, gitStatus, gitStatusLoading, onRefreshGit, onCommit, onPull, onPush }: GitPanelProps) {
  const defaultBranch = gitStatus?.branch ?? '';
  const [commitMessage, setCommitMessage] = useState('');
  const [stageAll, setStageAll] = useState(true);
  const upstreamParts = useMemo(() => (gitStatus?.upstream ? gitStatus.upstream.split('/') : []), [gitStatus]);
  const upstreamRemote = upstreamParts[0] || 'origin';
  const upstreamBranch = upstreamParts.slice(1).join('/') || defaultBranch;

  const [remote, setRemote] = useState(upstreamRemote);
  const [branch, setBranch] = useState(upstreamBranch);
  const [pendingAction, setPendingAction] = useState<null | 'commit' | 'pull' | 'push'>(null);

  useEffect(() => {
    setRemote(upstreamRemote);
    setBranch(upstreamBranch);
  }, [upstreamRemote, upstreamBranch]);

  const handleCommit = async () => {
    const message = commitMessage.trim();
    if (!message) return;
    setPendingAction('commit');
    try {
      await onCommit({ message, stageAll });
      setCommitMessage('');
    } catch {
      // Toast handled upstream
    } finally {
      setPendingAction(null);
    }
  };

  const handlePull = async () => {
    setPendingAction('pull');
    try {
      await onPull({ remote, branch });
    } catch {
      // Toast handled upstream
    } finally {
      setPendingAction(null);
    }
  };

  const handlePush = async (setUpstream = false) => {
    setPendingAction('push');
    try {
      await onPush({ remote, branch, setUpstream });
    } catch {
      // Toast handled upstream
    } finally {
      setPendingAction(null);
    }
  };

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

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-4 shadow-sm dark:shadow-inner">
        <p className="text-sm font-semibold text-slate-900 dark:text-white mb-3">Commit changes</p>
        <textarea
          value={commitMessage}
          onChange={(event) => setCommitMessage(event.target.value)}
          placeholder="Commit message"
          className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/60 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-500/30 transition"
          rows={2}
        />
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={stageAll}
              onChange={(event) => setStageAll(event.target.checked)}
              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            Stage all changes
          </label>
          <button
            onClick={handleCommit}
            disabled={!commitMessage.trim() || pendingAction === 'commit'}
            className="ml-auto rounded-lg border border-indigo-200 dark:border-indigo-500/40 bg-indigo-50 dark:bg-indigo-500/10 px-4 py-2 text-sm font-semibold text-indigo-700 dark:text-indigo-200 transition hover:bg-indigo-100 dark:hover:bg-indigo-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {pendingAction === 'commit' ? 'Committing…' : 'Commit'}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-4 shadow-sm dark:shadow-inner space-y-3">
        <p className="text-sm font-semibold text-slate-900 dark:text-white">Sync with remote</p>
        <div className="flex flex-wrap gap-3">
          <div className="flex-1 min-w-[120px]">
            <label className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Remote</label>
            <input
              value={remote}
              onChange={(event) => setRemote(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/60 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-500/30 transition"
            />
          </div>
          <div className="flex-1 min-w-[120px]">
            <label className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Branch</label>
            <input
              value={branch}
              onChange={(event) => setBranch(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/60 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-500/30 transition"
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handlePull}
            disabled={pendingAction === 'pull'}
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/60 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:border-indigo-300 dark:hover:border-indigo-500/40 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {pendingAction === 'pull' ? 'Pulling…' : 'Pull'}
          </button>
          <button
            onClick={() => handlePush(false)}
            disabled={pendingAction === 'push'}
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/60 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:border-indigo-300 dark:hover:border-indigo-500/40 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {pendingAction === 'push' ? 'Pushing…' : 'Push'}
          </button>
          <button
            onClick={() => handlePush(true)}
            disabled={pendingAction === 'push'}
            className="rounded-lg border border-transparent bg-indigo-600/90 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {pendingAction === 'push' ? 'Pushing…' : 'Push & set upstream'}
          </button>
        </div>
      </div>

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

