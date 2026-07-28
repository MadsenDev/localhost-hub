import React from 'react';
import { Ic } from './icons';
import { tauriApi, type GitHubRepo } from './tauri-api';

export function GitHubReposView() {
  const [repos, setRepos] = React.useState<GitHubRepo[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');

  const loadRepos = React.useCallback((isCancelled: () => boolean) => {
    setLoading(true);
    setError('');
    tauriApi.listGitHubRepos()
      .then((items) => {
        if (isCancelled()) return;
        setRepos(items ?? []);
      })
      .catch((err) => {
        if (isCancelled()) return;
        setError(String(err));
      })
      .finally(() => {
        if (!isCancelled()) setLoading(false);
      });
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    loadRepos(() => cancelled);
    return () => { cancelled = true; };
  }, [loadRepos]);

  return (
    <div className="view"><div className="view-inner">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 18 }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 4 }}>GitHub</div>
          <h1 className="h1">GitHub Repos</h1>
          <div style={{ color: 'var(--fg-3)', fontSize: 12.5, marginTop: 4 }}>
            Authenticated repositories from your GitHub account.
          </div>
        </div>
        <button className="btn sm ghost" onClick={() => loadRepos(() => false)}>
          <Ic.Reload size={11} /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="panel" style={{ padding: '42px 24px', textAlign: 'center', color: 'var(--fg-3)', fontSize: 13 }}>
          Loading GitHub repositories...
        </div>
      ) : error ? (
        <div className="panel" style={{ padding: '28px 24px' }}>
          <div style={{ color: 'var(--danger)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{error}</div>
          <div style={{ color: 'var(--fg-4)', fontSize: 12, marginTop: 8 }}>
            Connect GitHub in Settings, then return here.
          </div>
        </div>
      ) : repos.length === 0 ? (
        <div className="panel" style={{ padding: '42px 24px', textAlign: 'center' }}>
          <div style={{ color: 'var(--fg-3)', fontSize: 13 }}>No GitHub repositories found.</div>
        </div>
      ) : (
        <div className="panel">
          <div className="svc-thead" style={{ gridTemplateColumns: 'minmax(220px, 1.4fr) minmax(110px, .6fr) minmax(120px, .8fr) minmax(90px, .5fr) 120px' }}>
            <span>Repository</span>
            <span>Language</span>
            <span>Default branch</span>
            <span>Visibility</span>
            <span style={{ textAlign: 'right' }}>Actions</span>
          </div>
          {repos.map((repo) => (
            <div
              key={repo.full_name}
              className="svc-row"
              style={{ gridTemplateColumns: 'minmax(220px, 1.4fr) minmax(110px, .6fr) minmax(120px, .8fr) minmax(90px, .5fr) 120px' }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ color: 'var(--fg-1)', fontWeight: 600, fontSize: 12.5 }}>{repo.full_name}</div>
                <div className="mono" style={{ color: 'var(--fg-4)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {repo.description || repo.clone_url}
                </div>
              </div>
              <div className="mono" style={{ color: repo.language ? 'var(--fg-2)' : 'var(--fg-4)', fontSize: 11.5 }}>
                {repo.language ?? 'Unknown'}
              </div>
              <div className="mono" style={{ color: 'var(--fg-3)', fontSize: 11.5 }}>{repo.default_branch}</div>
              <div>
                <span className="tag" style={{ fontSize: 10 }}>{repo.private ? 'private' : 'public'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button className="btn sm ghost" onClick={() => tauriApi.openUrl(repo.html_url)}>
                  <Ic.External size={11} /> Open
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div></div>
  );
}
