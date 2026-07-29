import React from 'react';
import type { Repo, StoredWorkspace, StoredService } from './types';
import { Ic } from './icons';
import { StatusDot } from './shared';

interface ReposViewProps {
  repos: Repo[];
  workspaces: StoredWorkspace[];
  onAddToWorkspace: (wsId: string, svc: StoredService) => void;
  onCreateWorkspace: () => void;
}

export function ReposView({ repos, workspaces, onAddToWorkspace, onCreateWorkspace }: ReposViewProps) {
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

function RepoCard({ repo, onAddScript }: { repo: Repo; onAddScript: (script: string, cmd: string) => void }) {
  const [expanded, setExpanded] = React.useState(false);
  const [gitExpanded, setGitExpanded] = React.useState(false);
  const devScripts = repo.scripts.filter(s => ['dev', 'start', 'run', 'serve', 'watch'].includes(s.name));
  const otherScripts = repo.scripts.filter(s => !['dev', 'start', 'run', 'serve', 'watch'].includes(s.name));
  const visibleScripts = expanded ? repo.scripts : devScripts.length > 0 ? devScripts : repo.scripts.slice(0, 3);
  const git = repo.git_status;

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
            {git.files.length > 0 && (
              <button className="btn sm ghost" style={{ flexShrink: 0, fontSize: 10.5 }} onClick={() => setGitExpanded(value => !value)}>
                {gitExpanded ? 'Hide files' : 'View files'}
              </button>
            )}
          </div>

          {gitExpanded && git.files.length > 0 && (
            <div style={{ marginTop: 8, borderTop: '1px solid var(--line-0)', paddingTop: 5 }}>
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
                </div>
              ))}
              {git.files.length > 12 && (
                <div style={{ color: 'var(--fg-4)', fontSize: 10.5, marginTop: 4 }}>+{git.files.length - 12} more files</div>
              )}
            </div>
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
