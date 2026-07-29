import React from 'react';
import type { GitDiff, GitRepositoryInfo, Repo, StoredWorkspace, StoredService } from './types';
import { Ic } from './icons';
import { StatusDot } from './shared';
import { tauriApi } from './tauri-api';

interface ReposViewProps {
  repos: Repo[];
  workspaces: StoredWorkspace[];
  onAddToWorkspace: (wsId: string, svc: StoredService) => void;
  onCreateWorkspace: () => void;
  onGitChanged: (path: string) => Promise<void>;
}

export function ReposView({ repos, workspaces, onAddToWorkspace, onCreateWorkspace, onGitChanged }: ReposViewProps) {
  const [search, setSearch] = React.useState('');
  const [picker, setPicker] = React.useState<{ repoId: string; script: string; cmd: string } | null>(null);
  const [pickerWs, setPickerWs] = React.useState('');
  const [pickerName, setPickerName] = React.useState('');

  const filtered = repos.filter(r =>
    !search || r.name.toLowerCase().includes(search.toLowerCase()) || r.framework.toLowerCase().includes(search.toLowerCase())
  );

  function openPicker(repoId: string, script: string, cmd: string, defaultName: string) {
    setPicker({ repoId, script, cmd });
    setPickerName(defaultName);
    setPickerWs(workspaces[0]?.id ?? '');
  }

  function confirmAdd() {
    if (!picker || !pickerWs) return;
    const repo = repos.find(r => r.id === picker.repoId);
    if (!repo) return;
    onAddToWorkspace(pickerWs, {
      id: `svc-${Date.now()}`,
      name: pickerName || repo.name,
      repo_path: repo.path,
      script: picker.script,
      cmd: picker.cmd,
    });
    setPicker(null);
  }

  return (
    <div className="view"><div className="view-inner">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 18 }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 4 }}>Detected</div>
          <h1 className="h1">Repos</h1>
          <div style={{ color: 'var(--fg-3)', fontSize: 12.5, marginTop: 4 }}>
            All git repositories found in your configured folders.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <Ic.Search size={11} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-4)' }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Filter repos…"
              style={{ background: 'var(--bg-2)', border: '1px solid var(--line-1)', borderRadius: 'var(--r-1)', padding: '5px 10px 5px 28px', fontSize: 12, color: 'var(--fg-1)', outline: 'none', width: 180 }}
            />
          </div>
          <span style={{ fontSize: 11.5, color: 'var(--fg-4)', fontFamily: 'var(--font-mono)' }}>{filtered.length} repos</span>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="panel" style={{ padding: '48px 24px', textAlign: 'center' }}>
          <div style={{ color: 'var(--fg-3)', fontSize: 13 }}>No repos found.</div>
          <div style={{ color: 'var(--fg-4)', fontSize: 12, marginTop: 6 }}>
            Check your workspace folders in Settings.
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
          {filtered.map(repo => (
            <RepoCard
              key={repo.id}
              repo={repo}
              onAddScript={(script, cmd) => openPicker(repo.id, script, cmd, repo.name)}
              onGitChanged={onGitChanged}
            />
          ))}
        </div>
      )}

      {/* Add-to-workspace picker */}
      {picker && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line-1)', borderRadius: 'var(--r-2)', padding: 24, width: 360, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--fg-1)' }}>Add to workspace</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 11, color: 'var(--fg-4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Service name</label>
              <input
                value={pickerName}
                onChange={e => setPickerName(e.target.value)}
                style={{ background: 'var(--bg-2)', border: '1px solid var(--line-1)', borderRadius: 'var(--r-1)', padding: '6px 10px', fontSize: 12.5, color: 'var(--fg-1)', outline: 'none' }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 11, color: 'var(--fg-4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Workspace</label>
              {workspaces.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--fg-4)' }}>
                  No workspaces yet.{' '}
                  <button className="btn sm ghost" onClick={() => { setPicker(null); onCreateWorkspace(); }}>
                    Create one first
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {workspaces.map(w => (
                    <div
                      key={w.id}
                      onClick={() => setPickerWs(w.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 'var(--r-1)', background: pickerWs === w.id ? 'var(--bg-3)' : 'var(--bg-2)', border: `1px solid ${pickerWs === w.id ? 'var(--blue-edge)' : 'var(--line-1)'}`, cursor: 'pointer' }}
                    >
                      <span style={{ width: 10, height: 10, borderRadius: 2, background: w.color, flexShrink: 0 }} />
                      <span style={{ fontSize: 12.5, color: 'var(--fg-1)' }}>{w.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ fontSize: 11, color: 'var(--fg-4)', fontFamily: 'var(--font-mono)', background: 'var(--bg-2)', padding: '6px 10px', borderRadius: 'var(--r-1)' }}>
              {picker.cmd}
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn ghost sm" onClick={() => setPicker(null)}>Cancel</button>
              <button className="btn primary sm" onClick={confirmAdd} disabled={!pickerWs || workspaces.length === 0}>
                Add service
              </button>
            </div>
          </div>
        </div>
      )}
    </div></div>
  );
}

function RepoCard({
  repo,
  onAddScript,
  onGitChanged,
}: {
  repo: Repo;
  onAddScript: (script: string, cmd: string) => void;
  onGitChanged: (path: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const [gitExpanded, setGitExpanded] = React.useState(false);
  const [pendingGitAction, setPendingGitAction] = React.useState<string | null>(null);
  const [commitMessage, setCommitMessage] = React.useState('');
  const [gitNotice, setGitNotice] = React.useState<{ text: string; error: boolean } | null>(null);
  const [diff, setDiff] = React.useState<{ path: string; staged: boolean; data: GitDiff } | null>(null);
  const devScripts = repo.scripts.filter(s => ['dev', 'start', 'run', 'serve', 'watch'].includes(s.name));
  const otherScripts = repo.scripts.filter(s => !['dev', 'start', 'run', 'serve', 'watch'].includes(s.name));
  const visibleScripts = expanded ? repo.scripts : devScripts.length > 0 ? devScripts : repo.scripts.slice(0, 3);
  const git = repo.git_status;
  const gitPath = repo.git_root ?? repo.path;

  async function runGitAction(label: string, action: () => Promise<unknown>) {
    setPendingGitAction(label);
    setGitNotice(null);
    try {
      await action();
      await onGitChanged(gitPath);
      setDiff(null);
      setGitNotice({ text: `${label} complete.`, error: false });
    } catch (error) {
      setGitNotice({ text: error instanceof Error ? error.message : String(error), error: true });
    } finally {
      setPendingGitAction(null);
    }
  }

  async function showDiff(path: string, staged: boolean) {
    const label = staged ? 'Loading staged diff' : 'Loading worktree diff';
    setPendingGitAction(label);
    setGitNotice(null);
    try {
      const data = await tauriApi.getGitDiff(gitPath, path, staged);
      setDiff({ path, staged, data });
    } catch (error) {
      setGitNotice({ text: error instanceof Error ? error.message : String(error), error: true });
    } finally {
      setPendingGitAction(null);
    }
  }

  async function createCommit() {
    const message = commitMessage.trim();
    if (!message) {
      setGitNotice({ text: 'Enter a commit message first.', error: true });
      return;
    }
    await runGitAction('Commit', async () => {
      const result = await tauriApi.commitGitChanges(gitPath, message);
      setCommitMessage('');
      setGitNotice({ text: `Committed ${result.hash}.`, error: false });
    });
  }

  return (
    <div className="panel" style={{ padding: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'flex-start', gap: 10, borderBottom: repo.scripts.length > 0 ? '1px solid var(--line-0)' : 'none' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-1)' }}>{repo.name}</span>
            {repo.is_running && <StatusDot s="running" />}
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: 'var(--fg-3)', fontFamily: 'var(--font-mono)', background: 'var(--bg-2)', padding: '1px 6px', borderRadius: 4 }}>{repo.framework || 'Project'}</span>
            {repo.package_manager && <span style={{ fontSize: 11, color: 'var(--fg-4)', fontFamily: 'var(--font-mono)' }}>{repo.package_manager}</span>}
            {git ? (
              <>
                <span style={{ fontSize: 11, color: 'var(--fg-3)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                  <Ic.Branch size={10} /> {git.branch}
                </span>
                <span className={`tag ${git.clean ? 'ok' : 'warn'}`}>
                  {git.clean ? 'clean' : `${git.changed} changed`}
                </span>
                {git.ahead > 0 && <span style={{ fontSize: 10.5, color: 'var(--ok)' }}>↑{git.ahead}</span>}
                {git.behind > 0 && <span style={{ fontSize: 10.5, color: 'var(--warn)' }}>↓{git.behind}</span>}
              </>
            ) : repo.has_git ? (
              <span style={{ fontSize: 11, color: 'var(--fg-4)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                <Ic.Branch size={10} /> Git status unavailable
              </span>
            ) : null}
            {repo.running_port && <span style={{ fontSize: 11, color: 'var(--ok)', fontFamily: 'var(--font-mono)' }}>:{repo.running_port}</span>}
          </div>
          <div style={{ fontSize: 11, color: 'var(--fg-4)', fontFamily: 'var(--font-mono)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={repo.path}>
            {repo.path.replace(/^\/home\/[^/]+/, '~')}
          </div>
        </div>
      </div>

      {git && (
        <div style={{ padding: '9px 14px', borderBottom: repo.scripts.length > 0 ? '1px solid var(--line-0)' : 'none', background: 'var(--bg-1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, color: 'var(--fg-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {git.last_commit_hash && <span className="mono" style={{ color: 'var(--blue)', marginRight: 6 }}>{git.last_commit_hash}</span>}
                {git.last_commit_message ?? 'No commits yet'}
              </div>
              {!git.clean && (
                <div style={{ display: 'flex', gap: 8, marginTop: 4, color: 'var(--fg-4)', fontSize: 10.5 }}>
                  {git.staged > 0 && <span>{git.staged} staged</span>}
                  {git.unstaged > 0 && <span>{git.unstaged} unstaged</span>}
                  {git.untracked > 0 && <span>{git.untracked} untracked</span>}
                  {git.conflicted > 0 && <span style={{ color: 'var(--bad)' }}>{git.conflicted} conflicted</span>}
                </div>
              )}
            </div>
            <button className="btn sm ghost" style={{ flexShrink: 0, fontSize: 10.5 }} onClick={() => setGitExpanded(value => !value)}>
              {gitExpanded ? 'Close Git' : 'Open Git'}
            </button>
          </div>

          {gitExpanded && git.files.length > 0 && (
            <div style={{ marginTop: 8, borderTop: '1px solid var(--line-0)', paddingTop: 5 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                <button
                  className="btn sm ghost"
                  disabled={pendingGitAction !== null || !git.files.some(file => file.worktree_status)}
                  onClick={() => runGitAction(
                    'Stage all',
                    () => tauriApi.stageGitFiles(gitPath, git.files.filter(file => file.worktree_status).map(file => file.path)),
                  )}
                >
                  Stage all
                </button>
                <button
                  className="btn sm ghost"
                  disabled={pendingGitAction !== null || !git.files.some(file => file.index_status)}
                  onClick={() => runGitAction(
                    'Unstage all',
                    () => tauriApi.unstageGitFiles(gitPath, git.files.filter(file => file.index_status).map(file => file.path)),
                  )}
                >
                  Unstage all
                </button>
                {pendingGitAction && <span style={{ color: 'var(--fg-4)', fontSize: 10.5 }}>{pendingGitAction}…</span>}
              </div>
              {git.files.slice(0, 12).map(file => (
                <div key={file.path} style={{ display: 'flex', alignItems: 'center', gap: 7, minHeight: 21, fontSize: 10.5 }}>
                  <span style={{ display: 'inline-flex', gap: 3, width: 38, flexShrink: 0 }}>
                    {file.index_status && <span className="tag ok" title={`Index: ${file.index_status}`}>S</span>}
                    {file.worktree_status && <span className="tag warn" title={`Worktree: ${file.worktree_status}`}>{file.worktree_status === 'untracked' ? '?' : 'U'}</span>}
                    {file.conflicted && <span className="tag" style={{ color: 'var(--bad)' }} title="Conflicted">!</span>}
                  </span>
                  <span className="mono" title={file.path} style={{ color: 'var(--fg-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {file.path}
                  </span>
                  <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 4, flexShrink: 0 }}>
                    {file.index_status && (
                      <>
                        <button className="btn sm ghost" disabled={pendingGitAction !== null} onClick={() => showDiff(file.path, true)}>Diff S</button>
                        <button
                          className="btn sm ghost"
                          disabled={pendingGitAction !== null}
                          onClick={() => runGitAction('Unstage', () => tauriApi.unstageGitFiles(gitPath, [file.path]))}
                        >
                          Unstage
                        </button>
                      </>
                    )}
                    {file.worktree_status && (
                      <>
                        <button className="btn sm ghost" disabled={pendingGitAction !== null} onClick={() => showDiff(file.path, false)}>Diff U</button>
                        <button
                          className="btn sm ghost"
                          disabled={pendingGitAction !== null}
                          onClick={() => runGitAction('Stage', () => tauriApi.stageGitFiles(gitPath, [file.path]))}
                        >
                          Stage
                        </button>
                      </>
                    )}
                  </span>
                </div>
              ))}
              {git.files.length > 12 && (
                <div style={{ color: 'var(--fg-4)', fontSize: 10.5, marginTop: 4 }}>+{git.files.length - 12} more files</div>
              )}
              {diff && (
                <div style={{ marginTop: 8, border: '1px solid var(--line-1)', borderRadius: 'var(--r-1)', overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', background: 'var(--bg-2)', fontSize: 10.5 }}>
                    <span className="mono" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {diff.staged ? 'staged' : 'worktree'} · {diff.path}
                    </span>
                    <span style={{ color: 'var(--ok)' }}>+{diff.data.additions}</span>
                    <span style={{ color: 'var(--bad)' }}>−{diff.data.deletions}</span>
                    <button className="btn sm ghost" onClick={() => setDiff(null)}>Close</button>
                  </div>
                  <pre style={{ margin: 0, padding: 10, maxHeight: 280, overflow: 'auto', background: 'var(--bg-0)', color: 'var(--fg-2)', fontSize: 10.5, lineHeight: 1.5, whiteSpace: 'pre' }}>
                    {diff.data.patch || 'No textual diff available.'}
                  </pre>
                </div>
              )}
              {git.staged > 0 && (
                <div style={{ display: 'flex', gap: 6, marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--line-0)' }}>
                  <input
                    value={commitMessage}
                    onChange={event => setCommitMessage(event.target.value)}
                    onKeyDown={event => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        createCommit();
                      }
                    }}
                    placeholder={`Commit ${git.staged} staged file${git.staged === 1 ? '' : 's'}…`}
                    style={{ flex: 1, minWidth: 0, background: 'var(--bg-2)', border: '1px solid var(--line-1)', borderRadius: 'var(--r-1)', padding: '5px 8px', fontSize: 11, color: 'var(--fg-1)', outline: 'none' }}
                  />
                  <button className="btn sm primary" disabled={pendingGitAction !== null || !commitMessage.trim()} onClick={createCommit}>
                    Commit
                  </button>
                </div>
              )}
              {gitNotice && (
                <div style={{ marginTop: 6, color: gitNotice.error ? 'var(--bad)' : 'var(--ok)', fontSize: 10.5 }}>
                  {gitNotice.text}
                </div>
              )}
            </div>
          )}
          {gitExpanded && (
            <GitRepositoryPanel
              path={gitPath}
              statusHash={git.last_commit_hash}
              clean={git.clean}
              onStatusChanged={() => onGitChanged(gitPath)}
            />
          )}
        </div>
      )}

      {visibleScripts.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {visibleScripts.map(s => (
            <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px', borderBottom: '1px solid var(--line-0)' }}>
              <span style={{ fontSize: 12, color: 'var(--fg-2)', fontFamily: 'var(--font-mono)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <span style={{ color: 'var(--fg-1)', fontWeight: 500 }}>{s.name}</span>
                <span style={{ color: 'var(--fg-4)' }}> — {s.cmd}</span>
              </span>
              <button className="btn sm ghost" style={{ flexShrink: 0, fontSize: 11 }} onClick={() => onAddScript(s.name, s.cmd)}>
                <Ic.Plus size={10} /> Add
              </button>
            </div>
          ))}
          {!expanded && otherScripts.length > 0 && (
            <button
              className="btn sm ghost"
              style={{ margin: '6px 14px 8px', fontSize: 11, justifyContent: 'center' }}
              onClick={() => setExpanded(true)}
            >
              +{otherScripts.length} more scripts
            </button>
          )}
        </div>
      )}

      {repo.scripts.length === 0 && (
        <div style={{ padding: '10px 14px', fontSize: 12, color: 'var(--fg-4)' }}>No scripts detected</div>
      )}
    </div>
  );
}

function GitRepositoryPanel({
  path,
  statusHash,
  clean,
  onStatusChanged,
}: {
  path: string;
  statusHash: string | null;
  clean: boolean;
  onStatusChanged: () => Promise<void>;
}) {
  const [info, setInfo] = React.useState<GitRepositoryInfo | null>(null);
  const [pending, setPending] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<{ text: string; error: boolean } | null>(null);
  const [branchName, setBranchName] = React.useState('');
  const [remoteName, setRemoteName] = React.useState('');
  const [remoteUrl, setRemoteUrl] = React.useState('');
  const [renaming, setRenaming] = React.useState<{ current: string; next: string } | null>(null);

  const load = React.useCallback(async () => {
    setPending('Loading repository');
    try {
      setInfo(await tauriApi.getGitRepositoryInfo(path, 30));
      setNotice(null);
    } catch (error) {
      setNotice({ text: error instanceof Error ? error.message : String(error), error: true });
    } finally {
      setPending(null);
    }
  }, [path]);

  React.useEffect(() => {
    load();
  }, [load, statusHash]);

  async function run(
    label: string,
    action: () => Promise<GitRepositoryInfo | unknown>,
    refreshStatus = false,
  ) {
    setPending(label);
    setNotice(null);
    try {
      const result = await action();
      if (result && typeof result === 'object' && 'branches' in result) {
        setInfo(result as GitRepositoryInfo);
      } else {
        setInfo(await tauriApi.getGitRepositoryInfo(path, 30));
      }
      if (refreshStatus) await onStatusChanged();
      const detail = result && typeof result === 'object' && 'output' in result
        ? String(result.output)
        : '';
      setNotice({ text: detail || `${label} complete.`, error: false });
    } catch (error) {
      setNotice({ text: error instanceof Error ? error.message : String(error), error: true });
    } finally {
      setPending(null);
    }
  }

  async function createBranch() {
    const name = branchName.trim();
    if (!name) return;
    await run('Create branch', () => tauriApi.createGitBranch(path, name), true);
    setBranchName('');
  }

  async function addRemote() {
    const name = remoteName.trim();
    const url = remoteUrl.trim();
    if (!name || !url) return;
    await run('Add remote', () => tauriApi.addGitRemote(path, name, url));
    setRemoteName('');
    setRemoteUrl('');
  }

  return (
    <div style={{ marginTop: 9, borderTop: '1px solid var(--line-0)', paddingTop: 8, display: 'grid', gap: 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 10 }}>
        <div style={{ border: '1px solid var(--line-1)', borderRadius: 'var(--r-1)', overflow: 'hidden' }}>
          <div style={{ padding: '6px 8px', background: 'var(--bg-2)', fontSize: 10.5, fontWeight: 600 }}>Branches</div>
          <div style={{ padding: 7, display: 'grid', gap: 4 }}>
            {info?.branches.filter(branch => !branch.remote).map(branch => (
              <div key={branch.name} style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 24 }}>
                <Ic.Branch size={10} />
                <span className="mono" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 10.5 }}>
                  {branch.name}
                </span>
                {branch.upstream && (
                  <span className="mono" title={branch.upstream} style={{ color: 'var(--fg-4)', fontSize: 9.5 }}>
                    ↑{branch.ahead} ↓{branch.behind}
                  </span>
                )}
                {branch.current ? (
                  <span className="tag ok">current</span>
                ) : (
                  <>
                    <button
                      className="btn sm ghost"
                      disabled={pending !== null}
                      onClick={() => run('Checkout', () => tauriApi.checkoutGitBranch(path, branch.name), true)}
                    >
                      Checkout
                    </button>
                    <button
                      className="btn sm ghost"
                      disabled={pending !== null}
                      onClick={() => {
                        if (window.confirm(`Delete local branch "${branch.name}"?`)) {
                          run('Delete branch', () => tauriApi.deleteGitBranch(path, branch.name));
                        }
                      }}
                    >
                      Delete
                    </button>
                  </>
                )}
              </div>
            ))}
            <div style={{ display: 'flex', gap: 5, marginTop: 3 }}>
              <input
                value={branchName}
                onChange={event => setBranchName(event.target.value)}
                placeholder="new branch"
                className="mono"
                style={{ flex: 1, minWidth: 0, background: 'var(--bg-2)', border: '1px solid var(--line-1)', borderRadius: 'var(--r-1)', padding: '4px 6px', fontSize: 10.5, color: 'var(--fg-1)' }}
              />
              <button className="btn sm ghost" disabled={pending !== null || !branchName.trim()} onClick={createBranch}>Create</button>
            </div>
            {(info?.branches.some(branch => branch.remote) ?? false) && (
              <div style={{ color: 'var(--fg-4)', fontSize: 10, marginTop: 3 }}>
                Remote: {info!.branches.filter(branch => branch.remote).map(branch => branch.name).join(', ')}
              </div>
            )}
          </div>
        </div>

        <div style={{ border: '1px solid var(--line-1)', borderRadius: 'var(--r-1)', overflow: 'hidden' }}>
          <div style={{ padding: '6px 8px', background: 'var(--bg-2)', fontSize: 10.5, fontWeight: 600 }}>Remotes</div>
          <div style={{ padding: 7, display: 'grid', gap: 5 }}>
            {info?.remotes.map(remote => (
              <div key={remote.name} style={{ display: 'grid', gap: 3 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span className="mono" style={{ fontSize: 10.5, fontWeight: 600 }}>{remote.name}</span>
                  <span className="mono" title={remote.url ?? ''} style={{ flex: 1, minWidth: 0, color: 'var(--fg-4)', fontSize: 9.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {remote.url ?? 'no fetch URL'}
                  </span>
                  <button className="btn sm ghost" disabled={pending !== null} onClick={() => setRenaming({ current: remote.name, next: remote.name })}>Rename</button>
                  <button
                    className="btn sm ghost"
                    disabled={pending !== null}
                    onClick={() => {
                      if (window.confirm(`Remove remote "${remote.name}"? This does not delete the remote repository.`)) {
                        run('Remove remote', () => tauriApi.removeGitRemote(path, remote.name));
                      }
                    }}
                  >
                    Remove
                  </button>
                </div>
                {renaming?.current === remote.name && (
                  <div style={{ display: 'flex', gap: 4 }}>
                    <input
                      value={renaming.next}
                      onChange={event => setRenaming({ current: remote.name, next: event.target.value })}
                      className="mono"
                      style={{ flex: 1, minWidth: 0, background: 'var(--bg-2)', border: '1px solid var(--line-1)', borderRadius: 'var(--r-1)', padding: '4px 6px', fontSize: 10.5, color: 'var(--fg-1)' }}
                    />
                    <button
                      className="btn sm ghost"
                      disabled={pending !== null || !renaming.next.trim()}
                      onClick={async () => {
                        await run('Rename remote', () => tauriApi.renameGitRemote(path, remote.name, renaming.next.trim()));
                        setRenaming(null);
                      }}
                    >
                      Save
                    </button>
                    <button className="btn sm ghost" onClick={() => setRenaming(null)}>Cancel</button>
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <button
                    className="btn sm ghost"
                    disabled={pending !== null}
                    onClick={() => run('Fetch', () => tauriApi.fetchGitRemote(path, remote.name), true)}
                  >
                    Fetch
                  </button>
                  <button
                    className="btn sm ghost"
                    disabled={pending !== null || !clean}
                    title={clean ? 'Fast-forward pull' : 'Commit or stash local changes before pulling'}
                    onClick={() => run('Pull', () => tauriApi.pullGitRemote(path, remote.name), true)}
                  >
                    Pull
                  </button>
                  <button
                    className="btn sm primary"
                    disabled={pending !== null}
                    onClick={() => run('Push', () => tauriApi.pushGitRemote(path, remote.name), true)}
                  >
                    Push
                  </button>
                  <span style={{ marginLeft: 'auto', color: 'var(--fg-4)', fontSize: 9.5 }}>
                    credential helper / SSH agent
                  </span>
                </div>
              </div>
            ))}
            {info?.remotes.length === 0 && <span style={{ color: 'var(--fg-4)', fontSize: 10.5 }}>No remotes configured.</span>}
            <div style={{ display: 'grid', gridTemplateColumns: '90px minmax(0, 1fr) auto', gap: 4, marginTop: 3 }}>
              <input
                value={remoteName}
                onChange={event => setRemoteName(event.target.value)}
                placeholder="origin"
                className="mono"
                style={{ minWidth: 0, background: 'var(--bg-2)', border: '1px solid var(--line-1)', borderRadius: 'var(--r-1)', padding: '4px 6px', fontSize: 10.5, color: 'var(--fg-1)' }}
              />
              <input
                value={remoteUrl}
                onChange={event => setRemoteUrl(event.target.value)}
                placeholder="https://…"
                className="mono"
                style={{ minWidth: 0, background: 'var(--bg-2)', border: '1px solid var(--line-1)', borderRadius: 'var(--r-1)', padding: '4px 6px', fontSize: 10.5, color: 'var(--fg-1)' }}
              />
              <button className="btn sm ghost" disabled={pending !== null || !remoteName.trim() || !remoteUrl.trim()} onClick={addRemote}>Add</button>
            </div>
          </div>
        </div>
      </div>

      <div style={{ border: '1px solid var(--line-1)', borderRadius: 'var(--r-1)', overflow: 'hidden' }}>
        <div style={{ padding: '6px 8px', background: 'var(--bg-2)', display: 'flex', gap: 8, alignItems: 'center', fontSize: 10.5, fontWeight: 600 }}>
          <span style={{ flex: 1 }}>Recent commits</span>
          {pending && <span style={{ color: 'var(--fg-4)', fontWeight: 400 }}>{pending}…</span>}
          <button className="btn sm ghost" disabled={pending !== null} onClick={load}>Refresh</button>
        </div>
        <div style={{ maxHeight: 230, overflow: 'auto' }}>
          {info?.history.map(entry => (
            <div key={entry.full_hash} style={{ display: 'grid', gridTemplateColumns: '64px minmax(0, 1fr) auto', gap: 7, padding: '6px 8px', borderTop: '1px solid var(--line-0)', fontSize: 10.5 }}>
              <span className="mono" title={entry.full_hash} style={{ color: 'var(--blue)' }}>{entry.hash}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: 'var(--fg-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.message}</div>
                <div style={{ color: 'var(--fg-4)', fontSize: 9.5 }}>{entry.author} · {new Date(entry.timestamp * 1000).toLocaleString()}</div>
              </div>
              <span className="mono" style={{ color: 'var(--fg-4)', whiteSpace: 'nowrap' }}>
                {entry.files_changed} files <span style={{ color: 'var(--ok)' }}>+{entry.additions}</span> <span style={{ color: 'var(--bad)' }}>−{entry.deletions}</span>
              </span>
            </div>
          ))}
          {info?.history.length === 0 && <div style={{ padding: 10, color: 'var(--fg-4)', fontSize: 10.5 }}>No commits yet.</div>}
        </div>
      </div>

      {notice && (
        <div style={{ color: notice.error ? 'var(--bad)' : 'var(--ok)', fontSize: 10.5, whiteSpace: 'pre-wrap', maxHeight: 120, overflow: 'auto' }}>
          {notice.text}
        </div>
      )}
    </div>
  );
}
