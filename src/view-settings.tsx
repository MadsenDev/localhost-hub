import React from 'react';
import { Ic } from './icons';
import { githubAuth, type AppConfig, type DeviceCodeResponse, type GitHubUser } from './github-auth';
import { tauriApi, type SecretBackend } from './tauri-api';
import type { Repo, StoredWorkspace } from './types';

interface TweakValues {
  theme: string;
  accent: string;
  density: string;
  sidebar: string;
  showTitleBar: boolean;
}

type AuthState =
  | { phase: 'idle' }
  | { phase: 'requesting' }
  | { phase: 'pending'; code: DeviceCodeResponse }
  | { phase: 'polling'; code: DeviceCodeResponse }
  | { phase: 'connected'; user: GitHubUser }
  | { phase: 'error'; message: string };

interface SettingsViewProps {
  githubUser: GitHubUser | null;
  setGithubUser: (user: GitHubUser | null) => void;
  repos: Repo[];
  storedWorkspaces: StoredWorkspace[];
  tweaks: TweakValues;
  setTweak: (key: keyof TweakValues, value: TweakValues[keyof TweakValues]) => void;
  onConfigChanged: () => void;
  onCreateWorkspace: () => void;
  onUpdateWorkspace: (id: string, patch: { name?: string; color?: string }) => void;
  onDeleteWorkspace: (id: string) => void;
  onOpenRepos: () => void;
}

const defaultConfig = (): AppConfig => ({
  onboarding_complete: true,
  github_token: null,
  github_user: null,
  workspace_roots: [],
  user_workspaces: [],
  env_profiles: [],
  appearance: {
    theme: 'charcoal',
    accent: '#4a78c4',
    density: 'balanced',
    sidebar: 'labeled',
  },
});

const accentOptions = [
  { value: '#4a78c4', label: 'Steel', color: 'oklch(0.66 0.115 252)' },
  { value: '#d9854f', label: 'Amber', color: 'oklch(0.65 0.13 35)' },
  { value: '#8a78ec', label: 'Violet', color: 'oklch(0.66 0.16 290)' },
  { value: '#54a892', label: 'Teal', color: 'oklch(0.65 0.13 165)' },
];

export function SettingsView({
  githubUser, setGithubUser, repos, storedWorkspaces, tweaks, setTweak,
  onConfigChanged, onCreateWorkspace, onUpdateWorkspace, onDeleteWorkspace, onOpenRepos,
}: SettingsViewProps) {
  const [config, setConfig] = React.useState<AppConfig | null>(null);
  const [roots, setRoots] = React.useState<string[]>([]);
  const [auth, setAuth] = React.useState<AuthState>(githubUser ? { phase: 'connected', user: githubUser } : { phase: 'idle' });
  const [secretBackend, setSecretBackend] = React.useState<SecretBackend | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    tauriApi.secretStorageBackend()
      .then((backend) => { if (!cancelled) setSecretBackend(backend); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  const [editingWs, setEditingWs] = React.useState<string | null>(null);
  const [nameInput, setNameInput] = React.useState('');
  const [rootError, setRootError] = React.useState('');
  const cancelledRef = React.useRef(false);

  React.useEffect(() => {
    cancelledRef.current = false;
    githubAuth.loadConfig().then((cfg) => {
      if (cancelledRef.current) return;
      const next = cfg ?? defaultConfig();
      setConfig(next);
      setRoots(next.workspace_roots ?? []);
      setAuth(next.github_user ? { phase: 'connected', user: next.github_user } : { phase: 'idle' });
      setGithubUser(next.github_user ?? null);
    }).catch(() => {});
    return () => { cancelledRef.current = true; };
  }, [setGithubUser]);

  async function saveConfig(patch: Partial<AppConfig>) {
    const latest = await githubAuth.loadConfig().catch(() => null);
    const base = latest ?? config ?? defaultConfig();
    const next = { ...base, ...patch };
    await githubAuth.saveConfig(next);
    setConfig(next);
    return next;
  }

  async function saveRoots(nextRoots: string[]) {
    const deduped = Array.from(new Set(nextRoots.filter(Boolean)));
    setRoots(deduped);
    await saveConfig({ workspace_roots: deduped });
    onConfigChanged();
  }

  async function addWorkspaceRoot() {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({ directory: true, multiple: false, title: 'Select workspace folder' });
      if (selected && typeof selected === 'string') {
        setRootError('');
        await saveRoots([...roots, selected]);
      }
    } catch {
      setRootError('Folder picker is only available in the desktop app.');
    }
  }

  async function addDefaultRoots() {
    const defaults = await tauriApi.findDefaultWorkspaceRoots().catch(() => [] as string[]);
    await saveRoots([...roots, ...defaults]);
  }

  async function disconnectGitHub() {
    await saveConfig({ github_token: null, github_user: null });
    setGithubUser(null);
    setAuth({ phase: 'idle' });
    onConfigChanged();
  }

  async function startAuth() {
    setAuth({ phase: 'requesting' });
    try {
      const code = await githubAuth.requestDeviceCode();
      if (!code) {
        setAuth({ phase: 'error', message: 'Not running inside Tauri.' });
        return;
      }
      setAuth({ phase: 'pending', code });
    } catch (e) {
      setAuth({ phase: 'error', message: String(e) });
    }
  }

  function beginPolling(code: DeviceCodeResponse) {
    setAuth({ phase: 'polling', code });
    poll(code, code.interval * 1000);
  }

  function poll(code: DeviceCodeResponse, intervalMs: number) {
    window.setTimeout(async () => {
      if (cancelledRef.current) return;
      try {
        const user = await githubAuth.pollToken(code.device_code);
        if (cancelledRef.current) return;
        if (user) {
          setGithubUser(user);
          setAuth({ phase: 'connected', user });
          const cfg = await githubAuth.loadConfig().catch(() => null);
          if (cfg) setConfig(cfg);
          onConfigChanged();
        } else {
          poll(code, intervalMs);
        }
      } catch (err) {
        if (cancelledRef.current) return;
        const msg = String(err);
        if (msg.includes('authorization_pending')) {
          poll(code, intervalMs);
        } else if (msg.includes('slow_down')) {
          poll(code, intervalMs + 5000);
        } else if (msg.includes('expired_token')) {
          setAuth({ phase: 'error', message: 'Code expired. Please try again.' });
        } else if (msg.includes('access_denied')) {
          setAuth({ phase: 'error', message: 'Access denied.' });
        } else {
          setAuth({ phase: 'error', message: msg });
        }
      }
    }, intervalMs);
  }

  function startWorkspaceRename(workspace: StoredWorkspace) {
    setEditingWs(workspace.id);
    setNameInput(workspace.name);
  }

  function commitWorkspaceRename(workspace: StoredWorkspace) {
    const next = nameInput.trim();
    if (next && next !== workspace.name) onUpdateWorkspace(workspace.id, { name: next });
    setEditingWs(null);
  }

  return (
    <div className="view"><div className="view-inner settings-view">
      <div className="settings-head">
        <div>
          <div className="eyebrow" style={{ marginBottom: 4 }}>Control room</div>
          <h1 className="h1">Settings</h1>
          <div className="settings-sub">Configure integrations, scan roots, workspaces, and interface preferences.</div>
        </div>
        <div className="settings-stats">
          <Metric label="Repos" value={repos.length} />
          <Metric label="Roots" value={roots.length} />
          <Metric label="Workspaces" value={storedWorkspaces.length} />
        </div>
      </div>

      <div className="settings-grid">
        <section className="panel settings-panel">
          <div className="panel-head">
            <div className={'panel-title ' + (auth.phase === 'connected' ? 'active' : '')}>
              <span className="dot" /> GitHub
            </div>
          </div>
          <div className="settings-panel-body">
            <GitHubSettingsAction
              auth={auth}
              secretBackend={secretBackend}
              onStart={startAuth}
              onBeginPoll={beginPolling}
              onDisconnect={disconnectGitHub}
              onRetry={() => setAuth({ phase: 'idle' })}
            />
          </div>
        </section>

        <section className="panel settings-panel">
          <div className="panel-head">
            <div className="panel-title"><span className="dot" /> Workspace Roots</div>
            <div className="panel-actions">
              <button className="btn sm ghost" onClick={addDefaultRoots}>Defaults</button>
              <button className="btn sm primary" onClick={addWorkspaceRoot}><Ic.Plus size={11} /> Add</button>
            </div>
          </div>
          <div className="settings-list">
            {roots.length === 0 ? (
              <EmptyLine icon={<Ic.Folder size={16} />} text="No scan roots configured." />
            ) : roots.map((root) => (
              <div key={root} className="settings-row">
                <Ic.Folder size={14} />
                <span className="settings-path" title={root}>{root.replace(/^\/home\/[^/]+/, '~')}</span>
                <button className="btn sm ghost danger" onClick={() => saveRoots(roots.filter((r) => r !== root))}>
                  <Ic.Close size={10} />
                </button>
              </div>
            ))}
            {rootError && <div className="settings-inline-error">{rootError}</div>}
          </div>
        </section>

        <section className="panel settings-panel settings-wide">
          <div className="panel-head">
            <div className="panel-title"><span className="dot" /> Workspaces</div>
            <div className="panel-actions">
              <button className="btn sm ghost" onClick={onOpenRepos}>Browse repos</button>
              <button className="btn sm primary" onClick={onCreateWorkspace}><Ic.Plus size={11} /> New</button>
            </div>
          </div>
          <div className="settings-list">
            {storedWorkspaces.length === 0 ? (
              <EmptyLine icon={<Ic.Stack size={16} />} text="No workspaces created yet." />
            ) : storedWorkspaces.map((workspace) => (
              <div key={workspace.id} className="settings-row settings-workspace-row">
                <span className="settings-swatch" style={{ background: workspace.color }} />
                {editingWs === workspace.id ? (
                  <input
                    className="settings-input"
                    autoFocus
                    value={nameInput}
                    onChange={(event) => setNameInput(event.target.value)}
                    onBlur={() => commitWorkspaceRename(workspace)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') commitWorkspaceRename(workspace);
                      if (event.key === 'Escape') setEditingWs(null);
                    }}
                  />
                ) : (
                  <button className="settings-row-main" onClick={() => startWorkspaceRename(workspace)}>
                    <span>{workspace.name}</span>
                    <span>{workspace.services.length} service{workspace.services.length === 1 ? '' : 's'}</span>
                  </button>
                )}
                <button className="btn sm ghost danger" onClick={() => onDeleteWorkspace(workspace.id)}>
                  Delete
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="panel settings-panel settings-wide">
          <div className="panel-head">
            <div className="panel-title"><span className="dot" /> Appearance</div>
          </div>
          <div className="settings-form">
            <Segmented
              label="Theme"
              value={tweaks.theme}
              options={[
                { value: 'charcoal', label: 'Charcoal' },
                { value: 'midnight', label: 'Midnight' },
                { value: 'espresso', label: 'Espresso' },
              ]}
              onChange={(value) => setTweak('theme', value)}
            />
            <Segmented
              label="Density"
              value={tweaks.density}
              options={[
                { value: 'breathable', label: 'Air' },
                { value: 'balanced', label: 'Default' },
                { value: 'dense', label: 'Compact' },
              ]}
              onChange={(value) => setTweak('density', value)}
            />
            <Segmented
              label="Sidebar"
              value={tweaks.sidebar}
              options={[
                { value: 'collapsed', label: 'Icons' },
                { value: 'labeled', label: 'Default' },
                { value: 'wide', label: 'Wide' },
              ]}
              onChange={(value) => setTweak('sidebar', value)}
            />
            <div className="settings-field">
              <div>
                <label>Accent</label>
                <span>Primary action and active-state color.</span>
              </div>
              <div className="settings-swatches">
                {accentOptions.map((accent) => (
                  <button
                    key={accent.value}
                    className="settings-accent"
                    data-on={tweaks.accent === accent.value ? '1' : '0'}
                    style={{ background: accent.color }}
                    title={accent.label}
                    onClick={() => setTweak('accent', accent.value)}
                  />
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div></div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="settings-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function EmptyLine({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="settings-empty-line">
      {icon}
      <span>{text}</span>
    </div>
  );
}

function GitHubSettingsAction({
  auth, secretBackend, onStart, onBeginPoll, onDisconnect, onRetry,
}: {
  auth: AuthState;
  secretBackend: SecretBackend | null;
  onStart: () => void;
  onBeginPoll: (code: DeviceCodeResponse) => void;
  onDisconnect: () => void;
  onRetry: () => void;
}) {
  if (auth.phase === 'connected') {
    return (
      <div className="settings-github-card">
        <div className="settings-github-user">
          {auth.user.avatar_url ? <img src={auth.user.avatar_url} alt="" /> : <GitHubMark size={24} />}
          <div>
            <strong>@{auth.user.login}</strong>
            <span>{auth.user.name ?? 'Connected to GitHub'}</span>
          </div>
        </div>
        <button className="btn sm ghost danger" onClick={onDisconnect}>Disconnect</button>
        {secretBackend ? (
          <p className="settings-sub settings-secret-note">
            {secretBackend === 'keyring'
              ? 'Your access token is stored in the system credential store.'
              : 'No system credential store is available, so your access token is stored in a file readable only by your user account.'}
          </p>
        ) : null}
      </div>
    );
  }

  if (auth.phase === 'requesting') {
    return <div className="settings-status"><span className="status-dot starting" /> Contacting GitHub...</div>;
  }

  if (auth.phase === 'pending' || auth.phase === 'polling') {
    const code = auth.code;
    const polling = auth.phase === 'polling';
    const verificationUrl = code.verification_uri_complete ?? code.verification_uri;
    return (
      <div className="settings-device-flow">
        <div className="settings-device-code">{code.user_code}</div>
        <div className="settings-device-actions">
          <button className="btn sm primary" onClick={() => tauriApi.openUrl(verificationUrl).catch(() => {})}>
            Open GitHub
          </button>
        </div>
        {polling ? (
          <div className="settings-status"><span className="status-dot running" /> Waiting for authorization...</div>
        ) : (
          <button className="btn sm primary" onClick={() => onBeginPoll(code)}>I've authorized it</button>
        )}
      </div>
    );
  }

  if (auth.phase === 'error') {
    return (
      <div className="settings-error">
        <div>{auth.message}</div>
        <button className="btn sm ghost" onClick={onRetry}>Try again</button>
      </div>
    );
  }

  return (
    <div className="settings-connect">
      <div>
        <strong>Connect GitHub</strong>
        <span>Enable PR status, issue counts, CI checks, and branch sync.</span>
      </div>
      <button className="btn sm primary" onClick={onStart}>
        <GitHubMark size={13} /> Connect
      </button>
    </div>
  );
}

function Segmented({
  label, value, options, onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="settings-field">
      <label>{label}</label>
      <div className="settings-segmented">
        {options.map((option) => (
          <button
            key={option.value}
            data-on={value === option.value ? '1' : '0'}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function GitHubMark({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>
    </svg>
  );
}
