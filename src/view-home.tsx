import React from 'react';
import type { HubDataShape, Repo, Session, Workspace } from './types';
import { Ic } from './icons';
import { StatusDot, Sparkline, SectionHeader } from './shared';
import { tauriApi, type SystemStats } from './tauri-api';

interface HomeViewProps {
  data: HubDataShape;
  projects: Repo[];
  onOpenWs: (id: string) => void;
  onOpenProject: (id: string) => void;
  onResumeSession: (s: Session) => void;
  startWs: (id: string) => void;
  stopWs: (id: string) => void;
}

export function HomeView({ data, projects, onOpenWs, onOpenProject, onResumeSession, startWs, stopWs }: HomeViewProps) {
  const allServices = data.workspaces.flatMap((w) => w.services);
  const running = allServices.filter((s) => s.status === "running").length;
  const failed = allServices.filter((s) => s.status === "failed").length;
  const totalPorts = data.ports.filter((p) => p.status === "running").length;
  const lastSession = data.sessions.find((s) => s.badge) || data.sessions[1] || data.sessions[0] || null;
  const lastWs = lastSession ? (data.workspaces.find((w) => w.id === lastSession.ws) ?? data.workspaces[0]) : null;

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
          <h1>{lastSession ? <>Pick up where you left off</> : <>Good to see you</>}</h1>
        </div>
        <div className="dash-stats">
          <div className="dash-stat"><span className="v">{running}</span><span className="l">Services</span></div>
          <div className="dash-stat"><span className="v">{totalPorts}</span><span className="l">Ports live</span></div>
          <div className="dash-stat"><span className="v" style={{ color: failed ? "var(--danger)" : "var(--fg-1)" }}>{failed}</span><span className="l">Failed</span></div>
        </div>
      </div>

      {lastSession && lastWs ? (
        <div className="resume-card" onClick={() => onResumeSession(lastSession)}>
          <div className="resume-rail" style={{ background: lastWs.swatch }} />
          <div className="resume-body">
            <div className="resume-head">
              <span className="eyebrow">Last session · {lastSession.when}</span>
              <span className="resume-meta mono">
                <span>{lastWs.name}</span>
                <span className="sep">·</span>
                <span>{lastSession.projects} projects</span>
                <span className="sep">·</span>
                <span>{lastSession.services} services</span>
              </span>
            </div>
            <div className="resume-title">You were working on <em>{lastSession.title}</em></div>
            <div className="resume-traces">
              {lastWs.services.slice(0, 4).map((s) => (
                <span key={s.id} className="resume-trace">
                  <StatusDot s={s.status} />
                  <span className="mono">{s.name}</span>
                  <span className="mono" style={{ color: "var(--fg-4)" }}>:{s.port ?? "—"}</span>
                </span>
              ))}
            </div>
          </div>
          <div className="resume-actions">
            <button className="btn primary" onClick={(e) => { e.stopPropagation(); onResumeSession(lastSession); }}>
              <Ic.Play size={12} /> Resume session
            </button>
            <button className="btn ghost sm" onClick={(e) => { e.stopPropagation(); onOpenWs(lastWs.id); }}>
              <Ic.External size={11} /> Open workspace
            </button>
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
            {data.activity.length === 0 ? (
              <div style={{ padding: '20px 16px', fontSize: 12, color: 'var(--fg-4)', textAlign: 'center' }}>
                Activity will appear here once services are running.
              </div>
            ) : data.activity.map((a, i) => (
              <div key={i} className="activity-item">
                <span style={{ color: a.kind === "error" ? "var(--danger)" : a.kind === "warn" ? "var(--warn)" : a.kind === "ok" ? "var(--ok)" : "var(--blue)" }}>
                  {a.kind === "error" ? <Ic.Close size={12} /> : a.kind === "warn" ? <Ic.Bell size={12} /> : a.kind === "ok" ? <Ic.Check size={12} /> : <Ic.Dot size={12} />}
                </span>
                <span className="t">{a.ts}</span>
                <span><span className="project">{a.project}</span> <span style={{ color: "var(--fg-3)" }}> ›</span> <span className="label">{a.label}</span></span>
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
            <span style={{ color: "var(--fg-4)" }}>{s.port ? ":" + s.port : ""}</span>
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
