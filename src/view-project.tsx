import React from 'react';
import type { Project, Workspace, Service, LogLine } from './types';
import { Ic } from './icons';
import { StatusBadge } from './shared';

interface ProjectViewProps {
  project: Project;
  workspaces: Workspace[];
  services: Service[];
  logs: LogLine[];
  onBack: () => void;
  onRun: () => void;
  onOpenLogs: () => void;
}

export function ProjectView({ project, workspaces, services, onBack, onRun }: ProjectViewProps) {
  const [tab, setTab] = React.useState("scripts");
  const ws = workspaces.find((w) => w.services.some((s) => s.project === project.id));
  const svc = services.find((s) => s.project === project.id);

  return (
    <div className="view"><div className="view-inner">
      <button className="btn sm ghost" onClick={onBack} style={{ marginBottom: 14 }}>
        <Ic.Chevron size={10} style={{ transform: "rotate(180deg)" }} /> Back to {ws ? ws.name : "workspace"}
      </button>

      <div className="proj-head">
        <div className="proj-icon" style={{ background: `linear-gradient(135deg, ${ws ? ws.swatch : "var(--bg-2)"} 0%, var(--bg-3) 100%)`, color: "var(--fg-1)" }}>{project.icon}</div>
        <div>
          <h1 className="proj-title">{project.name}</h1>
          <div className="proj-sub">
            <span><Ic.Folder size={11} /> {project.path}</span>
            <span className="sep">·</span>
            <span><Ic.Branch size={11} /> {project.git.branch}</span>
            <span className="sep">·</span>
            <span style={{ color: project.git.clean ? "var(--ok)" : "var(--warn)" }}>{project.git.clean ? "clean" : project.git.changed + " changes"}</span>
            <span className="sep">·</span>
            <span>↑{project.git.ahead} ↓{project.git.behind}</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {svc && svc.status === "running"
            ? <button className="btn sm primary"><Ic.External size={11} /> localhost:{svc.port}</button>
            : <button className="btn sm primary" onClick={onRun}><Ic.Play size={11} /> Run dev</button>}
          <button className="btn sm ghost"><Ic.External size={11} /> Open in editor</button>
        </div>
      </div>

      <div className="proj-tabs">
        {[
          { id: "scripts", label: "Scripts",  icon: <Ic.Play size={11} /> },
          { id: "env",     label: "Env",      icon: <Ic.Settings size={11} />, badge: project.env.length },
          { id: "ports",   label: "Ports",    icon: <Ic.Ports size={11} />,   badge: project.ports.length },
          { id: "deps",    label: "Packages", icon: <Ic.Stack size={11} />,   badge: project.deps },
          { id: "git",     label: "Git",      icon: <Ic.Branch size={11} /> },
          { id: "logs",    label: "Logs",     icon: <Ic.Logs size={11} /> }
        ].map((t) => (
          <div key={t.id} className={"proj-tab" + (tab === t.id ? " active" : "")} onClick={() => setTab(t.id)}>
            {t.icon} {t.label}{t.badge != null ? <span className="badge">{t.badge}</span> : null}
          </div>
        ))}
      </div>

      {tab === "scripts" ? (
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 18 }}>
          <div>
            <div className="panel" style={{ marginBottom: 16 }}>
              <div className="panel-head">
                <div className="panel-title"><span className="dot" /> Recent runs</div>
                <span className="mono" style={{ fontSize: 10.5, color: "var(--fg-4)" }}>last 24h</span>
              </div>
              <div className="run-strip">
                {recentRuns().map((r, i) => (
                  <div key={i} className={"run-cell run-" + r.kind}>
                    <span className="run-bar" style={{ height: (20 + r.height * 40) + "px" }} />
                    <span className="run-tip">
                      <span className="run-tip-script">{r.script}</span>
                      <span className="run-tip-when mono">{r.when}</span>
                      <span className="run-tip-detail mono">{r.detail}</span>
                    </span>
                  </div>
                ))}
              </div>
              <div className="run-strip-foot">
                <div><span className="run-legend run-ok" /> success <span className="num" style={{ color: "var(--fg-1)" }}>34</span></div>
                <div><span className="run-legend run-warn" /> slow <span className="num" style={{ color: "var(--fg-1)" }}>6</span></div>
                <div><span className="run-legend run-error" /> failed <span className="num" style={{ color: "var(--fg-1)" }}>2</span></div>
                <div style={{ marginLeft: "auto" }}>avg <span className="num" style={{ color: "var(--fg-1)" }}>482ms</span></div>
                <div>p95 <span className="num" style={{ color: "var(--fg-1)" }}>1.2s</span></div>
              </div>
            </div>

            <div className="panel">
              <div className="panel-head">
                <div className="panel-title"><span className="dot" /> Scripts</div>
                <button className="btn sm ghost"><Ic.Plus size={11} /> Add script</button>
              </div>
              {project.scripts.map((s) => (
                <div key={s.name} className="script-row">
                  <span className="name">{s.name}{s.hot ? <span className="tag ok" style={{ marginLeft: 8 }}>hot</span> : null}</span>
                  <span className="cmd">{s.cmd}</span>
                  <span style={{ display: "inline-flex", gap: 6 }}>
                    <button className="btn sm ghost" onClick={onRun}><Ic.Play size={11} /> Run</button>
                    <button className="btn sm ghost"><Ic.External size={11} /></button>
                  </span>
                </div>
              ))}
            </div>

            <div style={{ height: 16 }} />
            <div className="panel">
              <div className="panel-head">
                <div className="panel-title"><span className="dot" /> Port history</div>
                <span className="mono" style={{ fontSize: 10.5, color: "var(--fg-4)" }}>last 7 days</span>
              </div>
              <div style={{ padding: 14 }}>
                {project.ports.map((p) => <PortHistoryRow key={p} port={p} />)}
              </div>
            </div>
          </div>

          <div>
            <div className="panel">
              <div className="panel-head"><div className="panel-title"><span className="dot" /> Overview</div></div>
              <div className="kv-grid" style={{ border: 0, borderRadius: 0 }}>
                <div className="kv"><span className="k">Framework</span><span className="v">{project.framework}</span></div>
                <div className="kv"><span className="k">Language</span><span className="v">{project.language}</span></div>
                <div className="kv"><span className="k">Package mgr</span><span className="v">{project.pkg}</span></div>
                <div className="kv"><span className="k">Node</span><span className="v">{project.node}</span></div>
                <div className="kv"><span className="k">Deps</span><span className="v">{project.deps} <span style={{ color: "var(--fg-4)" }}>+{project.dev} dev</span></span></div>
                <div className="kv"><span className="k">Ports</span><span className="v">{project.ports.join(", ")}</span></div>
              </div>
            </div>

            <div style={{ height: 16 }} />

            <div className="panel">
              <div className="panel-head"><div className="panel-title"><span className="dot" /> Git</div></div>
              <div style={{ padding: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <Ic.Branch size={13} />
                  <span className="mono" style={{ color: "var(--fg-1)", fontWeight: 600 }}>{project.git.branch}</span>
                  <span className="tag warn">{project.git.changed} changes</span>
                </div>
                <div className="mono" style={{ fontSize: 12, color: "var(--fg-2)", lineHeight: 1.5 }}>{project.git.last}</div>
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button className="btn sm ghost"><Ic.Branch size={11} /> Diff</button>
                  <button className="btn sm ghost"><Ic.External size={11} /> Open</button>
                </div>
              </div>
            </div>

            <div style={{ height: 16 }} />

            <div className="panel">
              <div className="panel-head"><div className="panel-title"><span className="dot" /> Build times</div></div>
              <div style={{ padding: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <BuildStat label="Avg" value="482ms" />
                <BuildStat label="p95" value="1.2s" />
                <BuildStat label="Cold" value="8.4s" tone="warn" />
                <BuildStat label="HMR" value="42ms" tone="ok" />
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {tab === "env" ? (
        <div className="panel">
          <div className="panel-head">
            <div className="panel-title"><span className="dot" /> Environment variables</div>
            <div style={{ display: "flex", gap: 6 }}>
              <button className="btn sm ghost"><Ic.Plus size={11} /> Add</button>
              <button className="btn sm ghost"><Ic.External size={11} /> .env file</button>
            </div>
          </div>
          {project.env.map((e) => (
            <div key={e.k} style={{ display: "grid", gridTemplateColumns: "1fr 2fr auto", gap: 10, padding: "10px 14px", borderBottom: "1px solid var(--line-soft)", alignItems: "center", fontSize: 12 }}>
              <span className="mono" style={{ color: "var(--fg-1)" }}>{e.k}</span>
              <span className="mono" style={{ color: "var(--fg-3)" }}>{e.v}</span>
              <button className="btn sm ghost"><Ic.External size={11} /></button>
            </div>
          ))}
        </div>
      ) : null}

      {tab === "ports" ? (
        <div className="panel">
          <div className="panel-head"><div className="panel-title"><span className="dot" /> Detected ports</div></div>
          <div style={{ padding: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {project.ports.map((p) => (
              <div key={p} className="ws-card" style={{ padding: 12 }}>
                <div className="ws-head">
                  <span className="mono" style={{ fontSize: 16, fontWeight: 600 }}>:{p}</span>
                  <StatusBadge s="running" />
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--blue)" }}>http://localhost:{p}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {(tab === "deps" || tab === "git" || tab === "logs") ? (
        <div className="empty">
          <Ic.Logs size={28} />
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, marginTop: 8 }}>{tab} panel</div>
          <div style={{ color: "var(--fg-4)", marginTop: 6 }}>Real data plumbs in via Tauri commands in v2.</div>
        </div>
      ) : null}
    </div></div>
  );
}

interface RunData { kind: string; height: number; script: string; when: string; duration: string; detail: string; }

function recentRuns(): RunData[] {
  const scripts = ["dev", "build", "test", "lint", "test:e2e", "format"];
  return new Array(48).fill(0).map((_, i) => {
    const r = ((i * 7919) % 100) / 100;
    const ok = r > 0.16;
    const slow = ok && r > 0.86;
    const failed = !ok;
    const kind = failed ? "error" : slow ? "warn" : "ok";
    const height = failed ? 0.95 : slow ? 0.85 : 0.20 + ((i * 31) % 60) / 100;
    const script = scripts[i % scripts.length];
    const hoursAgo = Math.floor((48 - i) * 0.5);
    return { kind, height, script, when: hoursAgo === 0 ? "just now" : `${hoursAgo}h ago`, duration: failed ? "exit 1" : `${Math.round(200 + height * 1800)}ms`, detail: failed ? "exit 1 · last line: TypeError…" : `${Math.round(200 + height * 1800)}ms · 0 errors` };
  });
}

function PortHistoryRow({ port }: { port: number }) {
  const cells = 84;
  const data = new Array(cells).fill(0).map((_, i) => {
    const day = Math.floor(i / 12);
    const hour = i % 12;
    const idle = hour > 9 || (day === 2 && hour > 6);
    return idle ? 0 : 0.35 + ((i * 53) % 70) / 100;
  });
  return (
    <div style={{ display: "grid", gridTemplateColumns: "90px 1fr 70px", gap: 12, alignItems: "center", padding: "6px 0" }}>
      <span className="mono" style={{ color: "var(--fg-1)", fontSize: 13, fontWeight: 600 }}>:{port}</span>
      <div style={{ display: "flex", gap: 1, height: 26, alignItems: "flex-end" }}>
        {data.map((v, i) => (
          <span key={i} style={{ flex: 1, height: (v === 0 ? 2 : 4 + v * 22) + "px", background: v === 0 ? "oklch(0.30 0.005 248 / 0.4)" : `oklch(0.66 0.115 252 / ${0.25 + v * 0.65})`, borderRadius: 1 }} />
        ))}
      </div>
      <div className="mono" style={{ fontSize: 11, color: "var(--ok)", textAlign: "right" }}>
        {Math.round(data.filter((v) => v > 0).length / data.length * 100)}% up
      </div>
    </div>
  );
}

interface BuildStatProps { label: string; value: string; tone?: string; }

function BuildStat({ label, value, tone = "muted" }: BuildStatProps) {
  const color = ({ ok: "var(--ok)", warn: "var(--warn)", danger: "var(--danger)", muted: "var(--fg-1)" } as Record<string, string>)[tone];
  return (
    <div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-4)", textTransform: "uppercase", letterSpacing: "0.12em" }}>{label}</div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 18, color, fontWeight: 600, marginTop: 4 }}>{value}</div>
    </div>
  );
}
