import React from 'react';
import type { HubDataShape, Repo, Workspace } from './types';
import { Ic } from './icons';
import { StatusDot, Sparkline, SectionHeader } from './shared';
import { tauriApi, type SystemStats } from './tauri-api';
import { attributeSession, deriveSessions, type DerivedSession, type SessionEventKind } from './sessions';
import { formatDuration } from './utils';

/** How each kind of session event reads in the activity list. */
const ACTIVITY_TONE: Record<SessionEventKind, string> = {
  started: '--blue',
  exited: '--ok',
  failed: '--danger',
  stopped: '--warn',
  interrupted: '--warn',
};

function formatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatWhen(ms: number): string {
  const elapsed = Date.now() - ms;
  if (elapsed < 60_000) return 'just now';
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}m ago`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)}h ago`;
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

interface HomeViewProps {
  data: HubDataShape;
  projects: Repo[];
  onOpenWs: (id: string) => void;
  onOpenProject: (id: string) => void;
  onResumeSession: (workspaceId: string) => void;
  startWs: (id: string) => void;
  stopWs: (id: string) => void;
}

export function HomeView({ data, projects, onOpenWs, onOpenProject, onResumeSession, startWs, stopWs }: HomeViewProps) {
  const allServices = data.workspaces.flatMap((w) => w.services);
  const running = allServices.filter((s) => s.status === "running").length;
  const failed = allServices.filter((s) => s.status === "failed").length;
  const totalPorts = data.ports.filter((p) => p.status === "running").length;
  // The most recent burst of recorded work, and the workspace it belonged to.
  // Read from run history rather than from `data`, whose `sessions` array was
  // filled with `[]` on every path — which is why this card never once appeared
  // and Home always greeted with "Good to see you".
  const [lastSession, setLastSession] = React.useState<DerivedSession | null>(null);
  // Refetched whenever the number of running services changes, so a start or a
  // stop is reflected here without polling: `data.workspaces` is already kept
  // current, and every start and stop moves this count. Fetching only on mount
  // left the card asserting "still running" after the user stopped the workspace
  // from this very view.
  React.useEffect(() => {
    let cancelled = false;
    tauriApi.listRunHistory()
      .then((runs) => {
        if (!cancelled) setLastSession(deriveSessions(runs, Date.now())[0] ?? null);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [running, failed]);

  // Only offered when the session's services still belong to a workspace that
  // exists. A session of scripts run straight from a project matches nothing, and
  // resuming it would start something the user never ran as a group.
  const attributed = lastSession ? attributeSession(lastSession, data.workspaces) : null;
  const lastWs = attributed?.workspace ?? null;

  // A session with something still running is not something to pick up — it is
  // happening. The card keeps its shape and changes its tense, and the duration is
  // measured against the current render rather than against the instant the history
  // was fetched, which would otherwise freeze at however long the session had run
  // by the time Home mounted.
  const sessionLive = lastSession?.live === true;
  const sessionDurationMs = lastSession
    ? Math.max(1000, (lastSession.endedAtMs ?? Date.now()) - lastSession.startedAtMs)
    : 0;

  // Recent activity is the newest session's own events, most recent first. It used
  // to read `data.activity`, which was `[]` on every path — so the panel always
  // showed its empty message, including while three services were running.
  const activity = React.useMemo(
    () => (lastSession ? [...lastSession.events].reverse().slice(0, 7) : []),
    [lastSession],
  );

  // Service ids are stable but not readable. A workspace service has a name; a
  // script run straight from a project has only its id, so show that rather than
  // guess at something friendlier.
  const serviceName = React.useCallback(
    (serviceId: string) =>
      allServices.find((service) => service.id === serviceId)?.name ?? serviceId,
    [allServices],
  );

  const [stats, setStats] = React.useState<SystemStats | null>(null);
  React.useEffect(() => {
    tauriApi.getSystemStats().then(s => { if (s) setStats(s); }).catch(() => {});
    const id = setInterval(() => {
      tauriApi.getSystemStats().then(s => { if (s) setStats(s); }).catch(() => {});
    }, 5000);
    return () => clearInterval(id);
  }, []);

  const now = new Date();
  const dateLabel = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    + ' · ' + now.toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit' });

  return (
    <div className="view"><div className="view-inner">
      <div className="dash-head">
        <div className="dash-greeting">
          <div className="eyebrow">{dateLabel}</div>
          <h1>
            {!(lastSession && lastWs)
              ? <>Good to see you</>
              : sessionLive ? <>Still running</> : <>Pick up where you left off</>}
          </h1>
        </div>
        <div className="dash-stats">
          <div className="dash-stat"><span className="v">{running}</span><span className="l">Services</span></div>
          <div className="dash-stat"><span className="v">{totalPorts}</span><span className="l">Ports live</span></div>
          <div className="dash-stat"><span className="v" style={{ color: failed ? "var(--danger)" : "var(--fg-1)" }}>{failed}</span><span className="l">Failed</span></div>
        </div>
      </div>

      {lastSession && lastWs ? (
        <div
          className="resume-card"
          onClick={() => (sessionLive ? onOpenWs(lastWs.id) : onResumeSession(lastWs.id))}
        >
          <div className="resume-rail" style={{ background: lastWs.swatch }} />
          <div className="resume-body">
            <div className="resume-head">
              <span className="eyebrow">
                {sessionLive ? 'Current session · started ' : 'Last session · '}
                {formatWhen(lastSession.startedAtMs)}
              </span>
              <span className="resume-meta mono">
                <span>{lastWs.name}</span>
                <span className="sep">·</span>
                <span>{lastSession.runs.length} {lastSession.runs.length === 1 ? 'run' : 'runs'}</span>
                <span className="sep">·</span>
                <span>{lastSession.tracks.length} {lastSession.tracks.length === 1 ? 'service' : 'services'}</span>
              </span>
            </div>
            <div className="resume-title">
              {sessionLive ? 'You have been working on ' : 'You were working on '}
              <em>{lastWs.name}</em> for {formatDuration(sessionDurationMs / 1000)}
            </div>
            <div className="resume-traces">
              {lastWs.services.slice(0, 4).map((s) => (
                <span key={s.id} className="resume-trace">
                  <StatusDot s={s.status} />
                  <span className="mono">{s.name}</span>
                  {/* Only when there is a port to show. An idle service has none, and
                      ":—" beside every name read as a broken value rather than as
                      "not listening". */}
                  {s.port !== null && s.port !== undefined ? (
                    <span className="mono port-suffix">:{s.port}</span>
                  ) : null}
                </span>
              ))}
            </div>
          </div>
          {/* Nothing to resume while it is still up, so the only action offered is
              the one that makes sense: go and look at it. */}
          <div className="resume-actions">
            {sessionLive ? (
              <button className="btn primary" onClick={(e) => { e.stopPropagation(); onOpenWs(lastWs.id); }}>
                <Ic.External size={11} /> Open workspace
              </button>
            ) : (
              <>
                <button className="btn primary" onClick={(e) => { e.stopPropagation(); onResumeSession(lastWs.id); }}>
                  <Ic.Play size={12} /> Resume session
                </button>
                <button className="btn ghost sm" onClick={(e) => { e.stopPropagation(); onOpenWs(lastWs.id); }}>
                  <Ic.External size={11} /> Open workspace
                </button>
              </>
            )}
          </div>
        </div>
      ) : data.workspaces.length === 0 ? (
        <div className="panel" style={{ padding: '28px 24px', textAlign: 'center', color: 'var(--fg-3)' }}>
          <div style={{ fontSize: 13, marginBottom: 8 }}>No workspaces configured yet.</div>
          <div style={{ fontSize: 12, color: 'var(--fg-4)' }}>Add a folder in Settings to start monitoring your projects.</div>
        </div>
      ) : null}

      <div style={{ height: 22 }} />

      <div className="dash-row">
        <KpiCard label="CPU usage" value={stats ? stats.cpu_usage.toFixed(1) : "—"} unit="%" delta="" trend={[]} />
        <KpiCard label="Memory used" value={stats ? (stats.memory_used_mb / 1024).toFixed(1) : "—"} unit={`/ ${stats ? (stats.memory_total_mb / 1024).toFixed(0) : "—"} GB`} delta="" trend={[]} />
        <KpiCard label="Load average" value={stats ? stats.load_avg[0].toFixed(2) : "—"} unit="1m" delta="" trend={[]} color="var(--warm)" />
      </div>

      <div className="dash-grid">
        <div>
          <SectionHeader title="Active workspaces" actionLabel="New workspace" onAction={() => {}} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {data.workspaces.map((w) => <WorkspaceCard key={w.id} w={w} onOpenWs={onOpenWs} startWs={startWs} stopWs={stopWs} />)}
          </div>
        </div>

        <div>
          <SectionHeader title="Recent activity" actionLabel="Open logs" onAction={() => onOpenWs("__logs__")} />
          <div className="panel" style={{ padding: 0 }}>
            {activity.length === 0 ? (
              <div style={{ padding: '20px 16px', fontSize: 12, color: 'var(--fg-4)', textAlign: 'center' }}>
                Nothing has run yet. Start a workspace and it will show up here.
              </div>
            ) : activity.map((event) => (
              <div key={`${event.serviceId}-${event.kind}-${event.atMs}`} className="activity-item">
                <span style={{ color: `var(${ACTIVITY_TONE[event.kind]})` }}>
                  {event.kind === 'failed' ? <Ic.Close size={12} />
                    : event.kind === 'exited' ? <Ic.Check size={12} />
                    : event.kind === 'started' ? <Ic.Play size={11} />
                    : <Ic.Bell size={12} />}
                </span>
                <span className="t">{formatClock(event.atMs)}</span>
                <span>
                  <span className="project">{serviceName(event.serviceId)}</span>
                  <span style={{ color: "var(--fg-3)" }}> › </span>
                  <span className="label">{event.detail}</span>
                </span>
                <span />
              </div>
            ))}
          </div>

          <div style={{ height: 16 }} />

          <SectionHeader title="Projects" />
          <div className="panel" style={{ padding: 0 }}>
            {projects.slice(0, 8).map((proj) => (
              <div key={proj.id} className="activity-item" style={{ gridTemplateColumns: "18px 1fr auto" }} onClick={() => onOpenProject(proj.id)}>
                <span style={{ color: "var(--blue)" }}><Ic.Folder size={12} /></span>
                <span>
                  <span className="mono" style={{ color: "var(--fg-1)" }}>{proj.name}</span>
                  <span className="mono" style={{ color: "var(--fg-4)" }}> · {proj.framework}</span>
                </span>
                <span className="mono" style={{ color: "var(--fg-3)" }}><Ic.Chevron size={12} /></span>
              </div>
            ))}
            {projects.length === 0 && (
              <div style={{ padding: '20px 16px', fontSize: 12, color: 'var(--fg-4)', textAlign: 'center' }}>
                Projects will appear here once workspaces are configured.
              </div>
            )}
          </div>
        </div>
      </div>
    </div></div>
  );
}

interface WorkspaceCardProps {
  w: Workspace;
  onOpenWs: (id: string) => void;
  startWs: (id: string) => void;
  stopWs: (id: string) => void;
}

function WorkspaceCard({ w, onOpenWs, startWs, stopWs }: WorkspaceCardProps) {
  const wsRunning = w.services.filter((s) => s.status === "running").length;
  const wsTotal = w.services.length;
  const isLive = wsRunning > 0;
  return (
    <div className="ws-card" onClick={() => onOpenWs(w.id)}>
      <div className="ws-head">
        <div className="ws-name">
          <span className="swatch" style={{ background: w.swatch }} />
          {w.name}
        </div>
        <div className="ws-stack">
          {isLive
            ? <span className="tag ok"><StatusDot s="running" /> {wsRunning}/{wsTotal} live</span>
            : <span className="tag">idle</span>}
        </div>
      </div>
      <div style={{ fontSize: 12, color: "var(--fg-3)", lineHeight: 1.5 }}>{w.desc}</div>
      <div className="ws-services">
        {w.services.slice(0, 4).map((s) => (
          <div key={s.id} className="svc">
            <StatusDot s={s.status} />
            <span style={{ color: "var(--fg-1)" }}>{s.name}</span>
            {s.port ? <span className="port-suffix">:{s.port}</span> : null}
          </div>
        ))}
        {w.services.length > 4 ? <div className="svc" style={{ color: "var(--fg-4)" }}>+{w.services.length - 4} more</div> : null}
      </div>
      <div className="ws-foot">
        <span>{w.path}</span>
        <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
          {isLive
            ? <button className="btn sm danger" onClick={(e) => { e.stopPropagation(); stopWs(w.id); }}><Ic.Stop size={11} /> Stop</button>
            : <button className="btn sm primary" onClick={(e) => { e.stopPropagation(); startWs(w.id); }}><Ic.Play size={11} /> Boot</button>}
        </span>
      </div>
    </div>
  );
}

interface KpiCardProps {
  label: string;
  value: string;
  unit: string;
  delta: string;
  trend: number[];
  color?: string;
}

function KpiCard({ label, value, unit, delta, trend, color }: KpiCardProps) {
  const isDown = delta && delta.startsWith("-");
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">
        {value}
        <span className="unit">{unit}</span>
        <span className={"delta " + (isDown ? "warn" : "")}>{delta}</span>
      </div>
      <Sparkline points={trend} color={color ?? "var(--blue)"} />
    </div>
  );
}
