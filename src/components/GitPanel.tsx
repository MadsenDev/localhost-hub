import { useMemo, useState } from 'react';
import type { GitStatusInfo, ProjectInfo } from '../types/global';
import GitAuthModal from './GitAuthModal';

interface GitPanelProps {
  project: ProjectInfo;
  gitStatus: GitStatusInfo | null;
  gitStatusLoading: boolean;
  onRefreshGit: () => void;
  electronAPI?: Window['electronAPI'];
}

export function GitPanel({ project, gitStatus, gitStatusLoading, onRefreshGit, electronAPI }: GitPanelProps) {
  const [commitMessage, setCommitMessage] = useState('');
  const [checkoutBranch, setCheckoutBranch] = useState('');
  const [newBranchName, setNewBranchName] = useState('');
  const [stashMessage, setStashMessage] = useState('');
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const gitApi = electronAPI?.git;
  const [showAuthModal, setShowAuthModal] = useState(false);
  const stagedChanges = useMemo(() => {
    if (!gitStatus?.changes) return [];
    return gitStatus.changes.filter((change) => (change.indexStatus ?? '').trim() && (change.indexStatus ?? '').trim() !== '?');
  }, [gitStatus]);

  const unstagedChanges = useMemo(() => {
    if (!gitStatus?.changes) return [];
    return gitStatus.changes.filter((change) => !(change.indexStatus ?? '').trim() || (change.indexStatus ?? '').trim() === '?');
  }, [gitStatus]);

  const handleGitAction = async (label: string, action: () => Promise<void>) => {
    if (!gitApi) return;
    setPendingAction(label);
    setActionStatus(null);
    try {
      await action();
      setActionStatus(`${label} succeeded`);
      await onRefreshGit();
    } catch (error) {
      setActionStatus(error instanceof Error ? error.message : `${label} failed`);
    } finally {
      setPendingAction(null);
    }
  };

  const toggleStage = async (file: string, shouldStage: boolean) => {
    if (!gitApi) return;
    await handleGitAction(shouldStage ? 'Stage' : 'Unstage', () =>
      shouldStage
        ? gitApi.stageFiles({ projectPath: project.path, files: [file] })
        : gitApi.unstageFiles({ projectPath: project.path, files: [file] })
    );
  };

  const stageAll = async (files: string[]) => {
    if (!gitApi || files.length === 0) return;
    await handleGitAction('Stage all', () => gitApi.stageFiles({ projectPath: project.path, files }));
  };

  const unstageAll = async (files: string[]) => {
    if (!gitApi || files.length === 0) return;
    await handleGitAction('Unstage all', () => gitApi.unstageFiles({ projectPath: project.path, files }));
  };

  const handleCommit = async () => {
    if (!gitApi || !commitMessage.trim()) {
      setActionStatus('Enter a commit message.');
      return;
    }
    await handleGitAction('Commit', async () => {
      await gitApi.commit({ projectPath: project.path, message: commitMessage.trim() });
      setCommitMessage('');
    });
  };

  const handlePush = async (credentials?: { username: string; password: string }) => {
    if (!gitApi) return;
    await handleGitAction('Push', () => gitApi.push({ projectPath: project.path, credentials }));
  };

  const handleCheckout = async () => {
    if (!gitApi || !checkoutBranch.trim()) {
      setActionStatus('Enter a branch name to checkout.');
      return;
    }
    await handleGitAction('Checkout', async () => {
      await gitApi.checkout({ projectPath: project.path, branch: checkoutBranch.trim() });
      setCheckoutBranch('');
    });
  };

  const handleCreateBranch = async () => {
    if (!gitApi || !newBranchName.trim()) {
      setActionStatus('Enter a branch name to create.');
      return;
    }
    await handleGitAction('Create branch', async () => {
      await gitApi.createBranch({ projectPath: project.path, branch: newBranchName.trim() });
      setNewBranchName('');
    });
  };

  const handleStashSave = async () => {
    if (!gitApi) return;
    await handleGitAction('Stash save', async () => {
      await gitApi.stashSave({ projectPath: project.path, message: stashMessage.trim() || undefined });
      setStashMessage('');
    });
  };

  const handleStashPop = async () => {
    if (!gitApi) return;
    await handleGitAction('Stash pop', () => gitApi.stashPop({ projectPath: project.path }));
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
        <div className="flex items-center gap-2">
          <button
            onClick={onRefreshGit}
            className="text-xs font-semibold text-indigo-600 dark:text-indigo-300 hover:text-indigo-800 dark:hover:text-indigo-200"
            disabled={gitStatusLoading}
          >
            {gitStatusLoading ? 'Refreshing…' : 'Refresh'}
          </button>
          {!gitApi && (
            <span className="text-xs text-slate-500 dark:text-slate-400">Connect desktop app for git actions.</span>
          )}
        </div>
      </div>

      {gitStatus.lastCommit && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-4 shadow-sm dark:shadow-inner">
          <p className="text-sm font-semibold text-slate-900 dark:text-white mb-2">Last commit</p>
          <p className="font-mono text-xs text-slate-600 dark:text-slate-300">{gitStatus.lastCommit.hash}</p>
          <p className="text-sm text-slate-800 dark:text-slate-100">{gitStatus.lastCommit.message}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{gitStatus.lastCommit.relativeTime}</p>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">Staged changes</p>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 dark:text-slate-400">{stagedChanges.length} file(s)</span>
            {gitApi && stagedChanges.length > 0 && (
              <button className="text-xs text-rose-500 hover:text-rose-600" onClick={() => unstageAll(stagedChanges.map((c) => c.path))}>
                Unstage all
              </button>
            )}
          </div>
        </div>
        {stagedChanges.length > 0 ? (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
            {stagedChanges.map((change) => (
              <li key={`staged-${change.path}`} className="py-2 flex items-center justify-between gap-3 text-slate-700 dark:text-slate-200">
                <div className="flex items-center gap-3">
                  <span className="rounded-md bg-emerald-100 dark:bg-emerald-500/20 px-2 py-0.5 text-xs font-mono text-emerald-700 dark:text-emerald-200">
                    {change.indexStatus?.trim() || 'M'}
                  </span>
                  <span className="font-mono text-xs text-slate-500 dark:text-slate-400">{change.path}</span>
                </div>
                {gitApi && (
                  <button
                    onClick={() => toggleStage(change.path, false)}
                    className="text-xs text-rose-500 hover:text-rose-600 dark:text-rose-300 dark:hover:text-rose-200"
                  >
                    Unstage
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400">Nothing staged.</p>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">Working tree</p>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 dark:text-slate-400">{unstagedChanges.length} file(s)</span>
            {gitApi && unstagedChanges.length > 0 && (
              <button
                onClick={() => stageAll(unstagedChanges.map((c) => c.path))}
                className="text-xs text-indigo-600 hover:text-indigo-800 dark:text-indigo-300 dark:hover:text-indigo-100"
              >
                Stage all
              </button>
            )}
          </div>
        </div>
        {unstagedChanges.length > 0 ? (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
            {unstagedChanges.map((change) => {
              const worktreeStatus = change.worktreeStatus?.trim() || change.indexStatus?.trim() || '??';
              return (
                <li key={`wt-${change.path}`} className="py-2 flex items-center justify-between gap-3 text-slate-700 dark:text-slate-200">
                  <div className="flex items-center gap-3">
                    <span className="rounded-md bg-slate-100 dark:bg-slate-800/70 px-2 py-0.5 text-xs font-mono text-slate-600 dark:text-slate-300">
                      {worktreeStatus}
                    </span>
                    <span className="font-mono text-xs text-slate-500 dark:text-slate-400">{change.path}</span>
                  </div>
                  {gitApi && (
                    <button
                      onClick={() => toggleStage(change.path, true)}
                      className="text-xs text-indigo-600 hover:text-indigo-800 dark:text-indigo-300 dark:hover:text-indigo-100"
                    >
                      Stage
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400">Working tree is clean.</p>
        )}
      </div>

      {gitApi && (
        <div className="space-y-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-4">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">Git actions</p>
          {actionStatus && <p className="text-xs text-slate-500 dark:text-slate-400">{actionStatus}</p>}
          <div className="space-y-3">
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Commit message</label>
              <div className="flex gap-2">
                <input
                  value={commitMessage}
                  onChange={(event) => setCommitMessage(event.target.value)}
                  placeholder="Describe your changes"
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900/40"
                />
                <button
                  onClick={handleCommit}
                  disabled={pendingAction !== null || stagedChanges.length === 0}
                  className="rounded-lg border border-indigo-200 bg-indigo-600/90 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {pendingAction === 'Commit' ? 'Committing…' : 'Commit'}
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Checkout branch</label>
              <div className="flex gap-2">
                <input
                  value={checkoutBranch}
                  onChange={(event) => setCheckoutBranch(event.target.value)}
                  placeholder="branch-name"
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900/40"
                />
                <button
                  onClick={handleCheckout}
                  disabled={pendingAction !== null}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-200"
                >
                  {pendingAction === 'Checkout' ? 'Checking out…' : 'Checkout'}
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Create branch</label>
              <div className="flex gap-2">
                <input
                  value={newBranchName}
                  onChange={(event) => setNewBranchName(event.target.value)}
                  placeholder="new-branch-name"
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900/40"
                />
                <button
                  onClick={handleCreateBranch}
                  disabled={pendingAction !== null}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-200"
                >
                  {pendingAction === 'Create branch' ? 'Creating…' : 'Create'}
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Stash changes</label>
              <div className="flex gap-2">
                <input
                  value={stashMessage}
                  onChange={(event) => setStashMessage(event.target.value)}
                  placeholder="optional note"
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900/40"
                />
                <button
                  onClick={handleStashSave}
                  disabled={pendingAction !== null}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-200"
                >
                  {pendingAction === 'Stash save' ? 'Stashing…' : 'Stash save'}
                </button>
                <button
                  onClick={handleStashPop}
                  disabled={pendingAction !== null}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-200"
                >
                  {pendingAction === 'Stash pop' ? 'Applying…' : 'Stash pop'}
                </button>
              </div>
            </div>

            <div className="flex justify-between items-center">
              <button
                onClick={() => setShowAuthModal(true)}
                disabled={pendingAction !== null}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-200"
              >
                {pendingAction === 'Push' ? 'Pushing…' : 'Push'}
              </button>
            </div>
          </div>
        </div>
      )}
      {gitApi && showAuthModal && (
        <GitAuthModal
          isOpen
          onClose={() => setShowAuthModal(false)}
          onSubmit={(credentials) => {
            setShowAuthModal(false);
            handlePush(credentials);
          }}
        />
      )}
    </div>
  );
}

export default GitPanel;

