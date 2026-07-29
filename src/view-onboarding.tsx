import React from 'react';
import { AnimatedHubLockup } from './brand';
import { Ic } from './icons';
import { githubAuth, type GitHubUser, type DeviceCodeResponse } from './github-auth';
import { tauriApi } from './tauri-api';

interface OnboardingProps {
  onComplete: (user: GitHubUser | null, workspaceRoots: string[]) => void;
}

type AuthState =
  | { phase: 'idle' }
  | { phase: 'requesting' }
  | { phase: 'pending'; code: DeviceCodeResponse }
  | { phase: 'polling'; code: DeviceCodeResponse }
  | { phase: 'connected'; user: GitHubUser }
  | { phase: 'error'; message: string };

export function OnboardingView({ onComplete }: OnboardingProps) {
  const [auth, setAuth] = React.useState<AuthState>({ phase: 'idle' });
  const [workspaceRoots, setWorkspaceRoots] = React.useState<string[]>([]);
  const cancelledRef = React.useRef(false);

  React.useEffect(() => {
    cancelledRef.current = false;
    tauriApi.findDefaultWorkspaceRoots().then((defaults) => {
      if (defaults && defaults.length > 0 && !cancelledRef.current) {
        setWorkspaceRoots(defaults);
      }
    }).catch(() => {});
    return () => { cancelledRef.current = true; };
  }, []);

  async function addWorkspaceRoot() {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({ directory: true, multiple: false, title: 'Select workspace folder' });
      if (selected && typeof selected === 'string') {
        setWorkspaceRoots((prev) => prev.includes(selected) ? prev : [...prev, selected]);
      }
    } catch {
      // not running in Tauri or dialog cancelled
    }
  }

  function removeRoot(root: string) {
    setWorkspaceRoots((prev) => prev.filter((r) => r !== root));
  }

  async function startAuth() {
    setAuth({ phase: 'requesting' });
    try {
      const code = await githubAuth.requestDeviceCode();
      if (!code) { setAuth({ phase: 'error', message: 'Not running inside Tauri.' }); return; }
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
    setTimeout(async () => {
      if (cancelledRef.current) return;
      try {
        const user = await githubAuth.pollToken(code.device_code);
        if (cancelledRef.current) return;
        if (user) {
          setAuth({ phase: 'connected', user });
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

  async function finish(user: GitHubUser | null) {
    await githubAuth.saveConfig({
      onboarding_complete: true,
      github_token: null,
      github_user: user,
      workspace_roots: workspaceRoots,
      user_workspaces: [],
      appearance: {
        theme: 'charcoal',
        accent: '#4a78c4',
        density: 'balanced',
        sidebar: 'labeled',
      },
    });
    onComplete(user, workspaceRoots);
  }

  return (
    <div className="onboarding">
      <div className="ob-inner">

        {/* Header */}
        <div className="ob-head ob-brand-head">
          <AnimatedHubLockup markSize={64} accent="var(--blue)" body="var(--fg-1)" />
          <div className="ob-sub">First-run setup</div>
        </div>

        {/* Three-column setup cards */}
        <div className="ob-cards" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>

          {/* Local card */}
          <div className="ob-card">
            <div className="ob-card-head">
              <span className="ob-card-label">LOCAL</span>
              <span className="tag ok" style={{ fontSize: 10 }}>ready</span>
            </div>
            <div className="ob-card-body">
              <CheckItem done label="Port scanning" sub="Detect processes on every port" />
              <CheckItem done label="Git status" sub="Branch, ahead/behind, dirty state" />
              <CheckItem done label="Process introspection" sub="CPU, memory per dev process" />
              <CheckItem done label="Workspace scanning" sub="Auto-detect projects from a root path" />
              <CheckItem done label="Log streaming" sub="Merged, source-coloured terminal output" />
            </div>
          </div>

          {/* Workspaces card */}
          <div className="ob-card">
            <div className="ob-card-head">
              <span className="ob-card-label">WORKSPACES</span>
              {workspaceRoots.length > 0
                ? <span className="tag ok" style={{ fontSize: 10 }}>{workspaceRoots.length} added</span>
                : <span className="tag" style={{ fontSize: 10, color: 'var(--fg-4)', background: 'var(--bg-2)', border: '1px solid var(--line-1)' }}>optional</span>}
            </div>
            <div className="ob-card-body" style={{ padding: '8px 14px', flex: 1 }}>
              {workspaceRoots.length === 0 ? (
                <div style={{ fontSize: 11.5, color: 'var(--fg-4)', lineHeight: 1.5 }}>
                  Add your code folders so Hub can find and monitor your projects.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {workspaceRoots.map((root) => (
                    <div key={root} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ flex: 1, fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--fg-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={root}>
                        {root.replace(/^\/home\/[^/]+/, '~')}
                      </span>
                      <button className="btn sm ghost" style={{ padding: '1px 6px', fontSize: 10 }} onClick={() => removeRoot(root)}>×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="ob-card-action">
              <button className="btn sm ghost" style={{ width: '100%', justifyContent: 'center' }} onClick={addWorkspaceRoot}>
                <Ic.Plus size={11} /> Add folder
              </button>
            </div>
          </div>

          {/* GitHub card */}
          <div className="ob-card">
            <div className="ob-card-head">
              <span className="ob-card-label">GITHUB</span>
              {auth.phase === 'connected'
                ? <span className="tag ok" style={{ fontSize: 10 }}>connected</span>
                : <span className="tag" style={{ fontSize: 10, color: 'var(--fg-4)', background: 'var(--bg-2)', border: '1px solid var(--line-1)' }}>optional</span>}
            </div>
            <div className="ob-card-body">
              <CheckItem done={auth.phase === 'connected'} label="PR status" sub="Open pull requests per repo" />
              <CheckItem done={auth.phase === 'connected'} label="CI checks" sub="GitHub Actions pass / fail inline" />
              <CheckItem done={auth.phase === 'connected'} label="Issue counts" sub="Open issues linked to local repos" />
              <CheckItem done={auth.phase === 'connected'} label="Branch sync" sub="Ahead / behind your GitHub remote" />
            </div>

            <div className="ob-card-action">
              <GitHubAction auth={auth} onStart={startAuth} onBeginPoll={beginPolling} onRetry={() => setAuth({ phase: 'idle' })} />
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="ob-footer">
          <button className="btn primary" onClick={() => finish(auth.phase === 'connected' ? auth.user : null)}>
            Launch Hub <Ic.Chevron size={10} />
          </button>
          {auth.phase !== 'connected' && (
            <span style={{ fontSize: 11.5, color: 'var(--fg-4)', marginLeft: 12 }}>
              GitHub can be connected later from Settings
            </span>
          )}
        </div>

      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function CheckItem({ done, label, sub }: { done: boolean; label: string; sub: string }) {
  return (
    <div className="ob-check">
      <span className="ob-check-icon" style={{ color: done ? 'var(--ok)' : 'var(--fg-4)' }}>
        {done ? <Ic.Check size={12} /> : <Ic.Dot size={6} />}
      </span>
      <div>
        <div style={{ fontSize: 12.5, color: done ? 'var(--fg-1)' : 'var(--fg-3)', fontWeight: 500 }}>{label}</div>
        <div style={{ fontSize: 11, color: 'var(--fg-4)', fontFamily: 'var(--font-mono)', marginTop: 1 }}>{sub}</div>
      </div>
    </div>
  );
}

function GitHubAction({
  auth, onStart, onBeginPoll, onRetry
}: {
  auth: AuthState;
  onStart: () => void;
  onBeginPoll: (code: DeviceCodeResponse) => void;
  onRetry: () => void;
}) {
  if (auth.phase === 'idle') {
    return (
      <button className="btn sm primary" style={{ width: '100%', justifyContent: 'center' }} onClick={onStart}>
        <GitHubMark size={14} /> Connect with GitHub
      </button>
    );
  }

  if (auth.phase === 'requesting') {
    return (
      <div className="ob-status">
        <span className="status-dot starting" />
        <span style={{ fontSize: 12, color: 'var(--fg-3)' }}>Contacting GitHub…</span>
      </div>
    );
  }

  if (auth.phase === 'pending' || auth.phase === 'polling') {
    const code = auth.code;
    const polling = auth.phase === 'polling';
    const verificationUrl = code.verification_uri_complete ?? code.verification_uri;
    const openGitHub = () => {
      tauriApi.openUrl(verificationUrl).catch(() => {});
    };
    return (
      <div className="ob-device-flow">
        <div className="ob-device-step">
          <span className="ob-step-num">1</span>
          <span>Open GitHub authorization</span>
        </div>
        <div className="ob-device-step">
          <span className="ob-step-num">2</span>
          <span>Enter this code:</span>
        </div>
        <div className="ob-user-code">{code.user_code}</div>
        <div className="ob-device-actions">
          <button className="btn sm primary" type="button" onClick={openGitHub}>
            Open GitHub
          </button>
        </div>
        {!polling ? (
          <button className="btn sm primary" style={{ width: '100%', justifyContent: 'center', marginTop: 10 }} onClick={() => onBeginPoll(code)}>
            I've authorized it
          </button>
        ) : (
          <div className="ob-status" style={{ marginTop: 10 }}>
            <span className="status-dot running" />
            <span style={{ fontSize: 12, color: 'var(--fg-3)' }}>Waiting for authorization…</span>
          </div>
        )}
      </div>
    );
  }

  if (auth.phase === 'connected') {
    return (
      <div className="ob-connected">
        <span style={{ color: 'var(--ok)' }}><Ic.Check size={14} /></span>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--fg-1)' }}>@{auth.user.login}</span>
        {auth.user.name && <span style={{ fontSize: 11.5, color: 'var(--fg-3)' }}>{auth.user.name}</span>}
      </div>
    );
  }

  if (auth.phase === 'error') {
    return (
      <div className="ob-error">
        <div style={{ fontSize: 11.5, color: 'var(--danger)', fontFamily: 'var(--font-mono)', marginBottom: 8 }}>{auth.message}</div>
        <button className="btn sm ghost" onClick={onRetry}>Try again</button>
      </div>
    );
  }

  return null;
}

function GitHubMark({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>
    </svg>
  );
}
