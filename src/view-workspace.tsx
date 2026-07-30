import React from 'react';
import type { EnvProfile, Workspace, Repo, StoredService } from './types';
import { Ic } from './icons';
import { StatusDot } from './shared';
import { formatUptime } from './utils';

interface WorkspaceViewProps {
  workspace: Workspace | null;
  onStartSvc: (wsId: string, svcId: string) => void;
  onStopSvc: (wsId: string, svcId: string) => void;
  onRestartSvc: (wsId: string, svcId: string) => void;
  onStartAll: (wsId: string) => void;
  onStopAll: (wsId: string) => void;
  onOpenLogs: (srcId: string) => void;
  onOpenWorkspaceLogs: (wsId: string) => void;
  onOpenUrl: (url: string) => void;
  onDeleteWorkspace: (id: string) => void;
  onUpdateWorkspace: (id: string, patch: { name?: string; color?: string }) => void;
  onRemoveService: (wsId: string, svcId: string) => void;
  onUpdateService: (
    wsId: string,
    svcId: string,
    patch: {
      run_mode?: 'parallel' | 'sequential';
      order?: number;
      env_profile_id?: string | null;
      expected_port?: number | null;
      startup_delay_ms?: number;
      readiness_timeout_ms?: number;
      depends_on?: string[];
    },
  ) => void;
  onAddService: () => void;
  repos: Repo[];
  envProfiles: EnvProfile[];
  onAddToWorkspace: (wsId: string, svc: StoredService) => void;
}

const COLOR_OPTIONS = [
  'oklch(0.66 0.115 252)', 'oklch(0.80 0.07 75)', 'oklch(0.73 0.13 148)',
  'oklch(0.66 0.19 25)',   'oklch(0.66 0.16 290)', 'oklch(0.65 0.13 165)',
  'oklch(0.70 0.12 200)',  'oklch(0.68 0.14 320)',
];

export function WorkspaceView({
  workspace: w, onStartSvc, onStopSvc, onRestartSvc, onStartAll, onStopAll,
  onOpenLogs, onOpenWorkspaceLogs, onOpenUrl, onDeleteWorkspace, onUpdateWorkspace,
  onRemoveService, onUpdateService, onAddService,
  envProfiles,
}: WorkspaceViewProps) {

  const [editingName, setEditingName] = React.useState(false);
  const [nameInput, setNameInput] = React.useState('');
  const [showColorPicker, setShowColorPicker] = React.useState(false);

  // Empty state — no workspaces exist at all
  if (!w) {
    return (
      <div className="view"><div className="view-inner">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 18 }}>
          <div>
            <div className="eyebrow" style={{ marginBottom: 4 }}>Workspaces</div>
            <h1 className="h1">No workspaces yet</h1>
          </div>
        </div>
        <div className="panel" style={{ padding: '48px 24px', textAlign: 'center' }}>
          <div style={{ color: 'var(--fg-3)', fontSize: 13, marginBottom: 8 }}>
            A workspace groups scripts from your repos so you can start them together.
          </div>
          <div style={{ color: 'var(--fg-4)', fontSize: 12, marginBottom: 20 }}>
            Go to Repos, find a script, and click Add — or create a blank workspace.
          </div>
          <button className="btn primary sm" onClick={onAddService}>
            <Ic.Plus size={11} /> Browse Repos
          </button>
        </div>
      </div></div>
    );
  }

  const running = w.services.filter(s => s.status === 'running').length;
  const active = w.services.filter(s => s.status === 'running' || s.status === 'starting' || s.status === 'restarting').length;
  const total = w.services.length;
  const liveAny = active > 0;

  function startNameEdit() {
    setNameInput(w!.name);
    setEditingName(true);
  }

  function commitName() {
    if (nameInput.trim() && nameInput.trim() !== w!.name) {
      onUpdateWorkspace(w!.id, { name: nameInput.trim() });
    }
    setEditingName(false);
  }

  return (
    <div className="view"><div className="view-inner">
      <div className="ws-hero">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="eyebrow" style={{ marginBottom: 4 }}>Workspace</div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Color swatch — click to pick */}
            <span
              className="swatch"
              style={{ background: w.swatch, cursor: 'pointer', flexShrink: 0, position: 'relative' }}
              onClick={() => setShowColorPicker(v => !v)}
              title="Change color"
            >
              {showColorPicker && (
                <div
                  style={{
                    position: 'absolute', top: 'calc(100% + 6px)', left: 0,
                    background: 'var(--bg-1)', border: '1px solid var(--line-1)',
                    borderRadius: 'var(--r-2)', padding: 8, display: 'flex', gap: 6,
                    flexWrap: 'wrap', width: 128, zIndex: 50,
                  }}
                  onClick={e => e.stopPropagation()}
                >
                  {COLOR_OPTIONS.map(c => (
                    <span
                      key={c}
                      onClick={() => { onUpdateWorkspace(w!.id, { color: c }); setShowColorPicker(false); }}
                      style={{
                        width: 20, height: 20, borderRadius: 4, background: c, cursor: 'pointer',
                        outline: c === w!.swatch ? '2px solid var(--fg-1)' : 'none',
                        outlineOffset: 2,
                      }}
                    />
                  ))}
                </div>
              )}
            </span>

            {/* Workspace name — click to edit */}
            {editingName ? (
              <input
                autoFocus
                value={nameInput}
                onChange={e => setNameInput(e.target.value)}
                onBlur={commitName}
                onKeyDown={e => { if (e.key === 'Enter') commitName(); if (e.key === 'Escape') setEditingName(false); }}
                style={{
                  background: 'var(--bg-2)', border: '1px solid var(--blue-edge)', borderRadius: 'var(--r-1)',
                  color: 'var(--fg-1)', fontSize: 'inherit', fontWeight: 'inherit', outline: 'none',
                  padding: '2px 8px', minWidth: 0, width: '100%', maxWidth: 320,
                }}
              />
            ) : (
              <span style={{ cursor: 'text' }} onClick={startNameEdit} title="Click to rename">
                {w.name}
              </span>
            )}
          </h1>

          <div className="meta" style={{ marginTop: 8 }}>
            <div className="m"><span className="l">Services</span><span className="v">{running}/{total} live</span></div>
          </div>
        </div>

        <div className="actions">
          <button className="btn ghost" onClick={() => onOpenWorkspaceLogs(w.id)} disabled={total === 0}>
            <Ic.Logs size={12} /> Combined logs
          </button>
          {liveAny
            ? <button className="btn danger" onClick={() => onStopAll(w.id)}><Ic.Stop size={12} /> Stop all</button>
            : <button className="btn primary" onClick={() => onStartAll(w.id)} disabled={total === 0}><Ic.Play size={12} /> Boot all</button>}
          <button className="btn ghost sm" style={{ color: 'var(--danger)' }} onClick={() => onDeleteWorkspace(w.id)}>
            <Ic.Stop size={11} /> Delete
          </button>
        </div>
      </div>

      {/* Services panel */}
      <div className="panel">
        <div className="panel-head">
          <div className={'panel-title ' + (liveAny ? 'active' : '')}>
            <span className="dot" />
            Services
            <span className="num" style={{ color: 'var(--fg-3)', marginLeft: 8 }}>{running}/{total}</span>
          </div>
          <div className="panel-actions">
            <button className="btn sm ghost" onClick={onAddService}><Ic.Plus size={11} /> Add from repos</button>
          </div>
        </div>

        {total === 0 ? (
          <div style={{ padding: '32px 24px', textAlign: 'center' }}>
            <div style={{ color: 'var(--fg-4)', fontSize: 12.5, marginBottom: 12 }}>
              No services yet. Add scripts from your repos.
            </div>
            <button className="btn sm ghost" onClick={onAddService}>
              <Ic.Plus size={10} /> Browse Repos
            </button>
          </div>
        ) : (
          <>
            <div className="svc-thead">
              <span></span>
              <span>Service</span>
              <span>Command</span>
              <span>Port</span>
              <span>Uptime</span>
              <span style={{ textAlign: 'right' }}>Actions</span>
            </div>

            {w.services.map(s => (
              <div key={s.id} className={'svc-row status-' + s.status}>
                <div className="svc-stat-cell"><StatusDot s={s.status} /></div>
                <div className="svc-name">
                  <span className="name">{s.name}</span>
                  <span className="sub mono">
                    {s.cmd}
                    {s.pid ? <span style={{ color: 'var(--fg-3)' }}> · pid {s.pid}</span> : null}
                  </span>
                </div>
                <div className="svc-cmd">
                  <div>{s.cmd}</div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 4, alignItems: 'center' }}>
                    <button
                      className="btn sm ghost"
                      style={{ paddingInline: 6 }}
                      title="Toggle workspace startup mode"
                      onClick={() => onUpdateService(w.id, s.id, {
                        run_mode: s.run_mode === 'sequential' ? 'parallel' : 'sequential',
                      })}
                    >
                      {s.run_mode === 'sequential' ? `Sequential ${(s.order ?? 0) + 1}` : 'Parallel'}
                    </button>
                    <select
                      aria-label={`${s.name} environment profile`}
                      className="input"
                      style={{ height: 26, maxWidth: 150, fontSize: 10.5 }}
                      value={s.env_profile_id ?? ''}
                      onChange={event => onUpdateService(w.id, s.id, {
                        env_profile_id: event.target.value || null,
                      })}
                    >
                      <option value="">Project default env</option>
                      {envProfiles
                        .filter(profile => profile.project_path === s.repo_path)
                        .map(profile => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
                    </select>
                    {w.services.length > 1 && (
                      <details className="dependency-picker">
                        <summary
                          className="btn sm ghost"
                          title="Select services that must start and become ready before this service"
                        >
                          Depends{(s.depends_on ?? []).length > 0 ? ` (${s.depends_on!.length})` : ''}
                        </summary>
                        <div className="dependency-menu" aria-label={`${s.name} dependencies`}>
                          {w.services
                            .filter(candidate => candidate.id !== s.id)
                            .map(candidate => (
                              <label key={candidate.id}>
                                <input
                                  type="checkbox"
                                  checked={(s.depends_on ?? []).includes(candidate.id)}
                                  onChange={event => {
                                    const dependencies = new Set(s.depends_on ?? []);
                                    if (event.target.checked) dependencies.add(candidate.id);
                                    else dependencies.delete(candidate.id);
                                    onUpdateService(w.id, s.id, {
                                      depends_on: w.services
                                        .filter(service => dependencies.has(service.id))
                                        .map(service => service.id),
                                    });
                                  }}
                                />
                                {candidate.name}
                              </label>
                            ))}
                        </div>
                      </details>
                    )}
                    <label
                      title="Wait before launching this service"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--fg-4)', fontSize: 10 }}
                    >
                      Delay
                      <input
                        className="input mono"
                        aria-label={`${s.name} startup delay seconds`}
                        inputMode="numeric"
                        value={Math.round((s.startup_delay_ms ?? 0) / 1000)}
                        onChange={event => {
                          const seconds = Number(event.target.value);
                          onUpdateService(w.id, s.id, {
                            startup_delay_ms: Number.isInteger(seconds) && seconds >= 0 && seconds <= 120
                              ? seconds * 1000
                              : 0,
                          });
                        }}
                        style={{ width: 45, height: 26, fontSize: 10.5 }}
                      />
                      s
                    </label>
                    <label
                      title="Wait for all expected ports before unlocking dependent services; zero disables readiness waiting"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--fg-4)', fontSize: 10 }}
                    >
                      Ready
                      <input
                        className="input mono"
                        aria-label={`${s.name} readiness timeout seconds`}
                        inputMode="numeric"
                        value={Math.round((s.readiness_timeout_ms ?? 0) / 1000)}
                        onChange={event => {
                          const seconds = Number(event.target.value);
                          onUpdateService(w.id, s.id, {
                            readiness_timeout_ms: Number.isInteger(seconds) && seconds >= 0 && seconds <= 300
                              ? seconds * 1000
                              : 0,
                          });
                        }}
                        style={{ width: 45, height: 26, fontSize: 10.5 }}
                      />
                      s
                    </label>
                  </div>
                </div>
                <div className="svc-port">
                  {s.url || s.port ? (
                    <>
                      <Ic.Globe size={12} />
                      <a
                        href={s.url ?? `http://localhost:${s.port!}`}
                        onClick={event => {
                          event.preventDefault();
                          onOpenUrl(s.url ?? `http://localhost:${s.port!}`);
                        }}
                      >
                        {s.url ? s.url.replace(/^https?:\/\//, '') : `localhost:${s.port!}`}
                      </a>
                    </>
                  ) : (
                    <input
                      className="input mono"
                      aria-label={`${s.name} expected port`}
                      title="Expected port checked before this service starts"
                      inputMode="numeric"
                      placeholder="Expected"
                      value={s.expected_port ?? ''}
                      onChange={event => {
                        const value = event.target.value.trim();
                        const port = Number(value);
                        onUpdateService(w.id, s.id, {
                          expected_port: value && Number.isInteger(port) && port >= 1 && port <= 65535
                            ? port
                            : null,
                        });
                      }}
                      style={{ width: 84, height: 26, fontSize: 10.5 }}
                    />
                  )}
                </div>
                <div className="svc-uptime">{formatUptime(s.uptime)}</div>
                <div className="svc-actions">
                  {s.status === 'running' || s.status === 'starting' ? (
                    <>
                      <button className="btn sm ghost" title="Logs" onClick={() => onOpenLogs(s.id)}><Ic.Logs size={11} /></button>
                      <button className="btn sm ghost" title="Restart" onClick={() => onRestartSvc(w.id, s.id)}><Ic.Reload size={11} /></button>
                      <button className="btn sm ghost danger" title="Stop" onClick={() => onStopSvc(w.id, s.id)}><Ic.Stop size={11} /></button>
                    </>
                  ) : s.status === 'failed' || s.status === 'crashed' || s.status === 'exited' ? (
                    <>
                      <button className="btn sm danger" title="Logs" onClick={() => onOpenLogs(s.id)}><Ic.Logs size={11} /> Inspect</button>
                      <button className="btn sm ghost" title="Retry" onClick={() => onRestartSvc(w.id, s.id)}><Ic.Reload size={11} /></button>
                      <button className="btn sm ghost" title="Remove" onClick={() => onRemoveService(w.id, s.id)} style={{ color: 'var(--fg-4)' }}>×</button>
                    </>
                  ) : (
                    <>
                      <button className="btn sm primary" onClick={() => onStartSvc(w.id, s.id)}><Ic.Play size={11} /> Start</button>
                      <button className="btn sm ghost" title="Remove" onClick={() => onRemoveService(w.id, s.id)} style={{ color: 'var(--fg-4)', fontSize: 13 }}>×</button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Resource summary */}
      {total > 0 && (
        <div style={{ marginTop: 16 }}>
          <div className="ws-rail-card" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '12px 16px' }}>
            <ResourceBar label="CPU" value={w.services.reduce((a, s) => a + (s.cpu || 0), 0)} max={100} unit="%" color="var(--blue)" />
            <ResourceBar label="MEM" value={w.services.reduce((a, s) => a + (s.mem || 0), 0)} max={2048} unit="MB" color="var(--warm)" />
          </div>
        </div>
      )}

    </div></div>
  );
}

interface ResourceBarProps {
  label: string;
  value: number;
  max: number;
  unit: string;
  color: string;
}

function ResourceBar({ label, value, max, unit, color }: ResourceBarProps) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div style={{ marginBottom: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--fg-3)', marginBottom: 4 }}>
        <span>{label}</span>
        <span style={{ color: 'var(--fg-1)' }}>{Math.round(value)}<span style={{ color: 'var(--fg-4)' }}> {unit}</span></span>
      </div>
      <div style={{ height: 6, background: 'var(--bg-inset)', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{ width: pct + '%', height: '100%', background: color, transition: 'width .4s' }} />
      </div>
    </div>
  );
}
