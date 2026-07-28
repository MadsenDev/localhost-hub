import React from 'react';
import type { Workspace, Session, Service } from './types';
import { Ic } from './icons';
import { SectionHeader } from './shared';
import { formatDuration } from './utils';

interface SessionsViewProps {
  workspaces: Workspace[];
  sessions: Session[];
  services: Service[];
  onResume: (s: Session) => void;
  onJumpToLogs: (t: number, s: Session) => void;
}

interface TrackSpan { svc: Service; spans: [number, number, string][] }

export function SessionsView({ workspaces, sessions, onResume, onJumpToLogs }: SessionsViewProps) {
  const [active, setActive] = React.useState(sessions[0].id);
  const [scrub, setScrub] = React.useState(0.78);
  const [hover, setHover] = React.useState<{ x: number; services: Service[] } | null>(null);
  const trackRef = React.useRef<HTMLDivElement>(null);
  const draggingRef = React.useRef(false);

  const activeSession = sessions.find((s) => s.id === active) ?? sessions[0];
  const ws = workspaces.find((w) => w.id === activeSession.ws);

  const tracks: TrackSpan[] = React.useMemo(() => {
    if (!ws) return [];
    return ws.services.map((s, i) => {
      const seed = (s.id.charCodeAt(0) + s.id.length) % 7;
      const spans: [number, number, string][] = [
        [0.02 + seed * 0.01, 0.32 + seed * 0.02, "blue"],
        [0.38 + seed * 0.005, 0.60 + seed * 0.01, "warm"],
        [0.66 + seed * 0.005, 0.97 - (i % 3) * 0.04, "ok"]
      ].filter((sp) => sp[1] > sp[0]) as [number, number, string][];
      return { svc: s, spans };
    });
  }, [ws]);

  const density = React.useMemo(() => {
    const buckets = 64;
    const out = new Array(buckets).fill(0);
    tracks.forEach(({ spans }) => {
      spans.forEach(([a, b]) => {
        const ia = Math.floor(a * buckets), ib = Math.ceil(b * buckets);
        for (let i = ia; i < ib; i++) out[i] += 1;
      });
    });
    const max = Math.max(1, ...out);
    return (out as number[]).map((v) => v / max);
  }, [tracks]);

  const events = React.useMemo(() => [
    { at: 0.04, kind: "boot",    label: "Workspace booted",  detail: "5 services started in 2.4s" },
    { at: 0.12, kind: "build",   label: "Vite build",         detail: "compiled successfully · 612ms · 2,483 modules" },
    { at: 0.21, kind: "request", label: "First request",      detail: "GET /pricing 200 142ms" },
    { at: 0.34, kind: "warn",    label: "HMR full reload",    detail: "Fast Refresh fell back to full reload" },
    { at: 0.41, kind: "build",   label: "Migration",          detail: "0042_add_invoice_line applied (118ms)" },
    { at: 0.52, kind: "restart", label: "API restarted",      detail: "config change · fastify hot-reload" },
    { at: 0.61, kind: "error",   label: "Bench panic",        detail: "thread 'bench_throughput' panicked", height: 0.95 },
    { at: 0.69, kind: "deploy",  label: "Tunnel opened",      detail: "ngrok → https://fattern-tunnel.ngrok.app" },
    { at: 0.78, kind: "now",     label: "Cursor",             detail: "current playhead position" },
    { at: 0.86, kind: "build",   label: "Compile /pricing",   detail: "412ms (4 modules)" },
    { at: 0.93, kind: "request", label: "Webhook in",         detail: "POST /webhooks/stripe 200" }
  ], [active]);

  function relX(e: React.MouseEvent): number {
    if (!trackRef.current) return 0;
    const r = trackRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
  }

  function onTrackDown(e: React.MouseEvent) { draggingRef.current = true; setScrub(relX(e)); }
  function onTrackMove(e: React.MouseEvent) {
    const t = relX(e);
    if (draggingRef.current) setScrub(t);
    const activeNow = tracks.filter(({ spans }) => spans.some(([a, b]) => t >= a && t <= b)).map(({ svc }) => svc);
    setHover({ x: t, services: activeNow });
  }
  function onTrackLeave() { setHover(null); }

  React.useEffect(() => {
    const up = () => { draggingRef.current = false; };
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, []);

  const elapsed = Math.round(activeSession.duration * scrub);
  const activeAtCursor = tracks.filter(({ spans }) => spans.some(([a, b]) => scrub >= a && scrub <= b)).length;
  const errorsBeforeCursor = events.filter((e) => e.kind === "error" && e.at <= scrub).length;

  return (
    <div className="view"><div className="view-inner">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 18 }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 4 }}>Memory</div>
          <h1 className="h1">Sessions</h1>
          <div style={{ color: "var(--fg-3)", fontSize: 12.5, marginTop: 4, maxWidth: 640 }}>
            Every burst of work, recorded as a slice of time. Scrub to see what was running, what changed, where it broke.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn sm ghost"><Ic.Filter size={11} /> Workspace</button>
          <button className="btn sm" onClick={() => onJumpToLogs(scrub, activeSession)}><Ic.Logs size={11} /> Logs at cursor</button>
          <button className="btn sm primary" onClick={() => onResume(activeSession)}><Ic.Play size={11} /> Resume session</button>
        </div>
      </div>

      <div className="timeline">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span className="tl-ws-swatch" style={{ background: ws?.swatch }} />
              <h2 className="h2" style={{ fontSize: 17 }}>{activeSession.title}</h2>
              {activeSession.badge ? <span className="tag ok"><span className="status-dot running" /> {activeSession.badge}</span> : null}
            </div>
            <div className="mono" style={{ fontSize: 11, color: "var(--fg-3)", marginTop: 4 }}>
              {ws?.name} · {activeSession.projects} projects · {activeSession.services} services · started {activeSession.when}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 600, color: "var(--warm)" }}>{formatDuration(elapsed)}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--fg-4)", textTransform: "uppercase", letterSpacing: "0.12em" }}>of {formatDuration(activeSession.duration)}</div>
          </div>
        </div>

        <div className="tl-event-rail">
          <div className="tl-density">
            {density.map((v, i) => (
              <span key={i} style={{ height: (8 + v * 16) + "px", background: `oklch(0.66 0.115 252 / ${0.12 + v * 0.65})` }} />
            ))}
          </div>
          <div className="tl-events">
            {events.map((ev, i) => (
              <button
                key={i}
                className={"tl-event ev-" + ev.kind + (Math.abs(ev.at - scrub) < 0.012 ? " is-near" : "")}
                style={{ left: (ev.at * 100) + "%" }}
                onClick={() => setScrub(ev.at)}
              >
                <span className="ev-stem" style={{ height: (12 + ((ev.height ?? 0.4) * 28)) + "px" }} />
                <span className="ev-glyph">{eventGlyph(ev.kind)}</span>
                <span className="ev-tip">
                  <span className="ev-tip-kind">{ev.kind}</span>
                  <span className="ev-tip-label">{ev.label}</span>
                  <span className="ev-tip-detail">{ev.detail}</span>
                  <span className="ev-tip-time">+{formatDuration(ev.at * activeSession.duration)}</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        <div ref={trackRef} className="tl-track" onMouseDown={onTrackDown} onMouseMove={onTrackMove} onMouseLeave={onTrackLeave}>
          <div className="tl-track-fill" style={{ width: (scrub * 100) + "%" }} />
          <div className="tl-playhead" style={{ left: `calc(${scrub * 100}% - 1px)` }}>
            <span className="tl-playhead-arm" />
            <span className="tl-playhead-bubble">{formatDuration(elapsed)}</span>
          </div>
          {hover && hover.x !== scrub ? (
            <div className="tl-hover-line" style={{ left: (hover.x * 100) + "%" }}>
              <span className="tl-hover-bubble">+{formatDuration(hover.x * activeSession.duration)} · {hover.services.length} active</span>
            </div>
          ) : null}
        </div>
        <div className="timeline-axis">
          <span>00:00</span>
          <span>{formatDuration(activeSession.duration * 0.25)}</span>
          <span>{formatDuration(activeSession.duration * 0.50)}</span>
          <span>{formatDuration(activeSession.duration * 0.75)}</span>
          <span>{formatDuration(activeSession.duration)}</span>
        </div>

        <div style={{ marginTop: 26, display: "grid", gap: 4 }}>
          {tracks.map(({ svc, spans }) => {
            const isActiveAtCursor = spans.some(([a, b]) => scrub >= a && scrub <= b);
            return (
              <div key={svc.id} className={"timeline-row tl-row" + (isActiveAtCursor ? " is-on" : "")}>
                <div className="label">
                  <span className={"status-dot " + (isActiveAtCursor ? "running" : "stopped")} style={{ marginRight: 8 }} />
                  <span className="mono" style={{ color: "var(--fg-1)" }}>{svc.name}</span>
                  <span style={{ color: "var(--fg-4)", marginLeft: 6 }}>:{svc.port ?? "—"}</span>
                </div>
                <div className="track-cell">
                  {spans.map((sp, i) => (
                    <div key={i} className={"timeline-bar " + sp[2]} style={{ left: (sp[0] * 100) + "%", width: ((sp[1] - sp[0]) * 100) + "%" }} />
                  ))}
                  <div className="tl-row-playhead" style={{ left: `calc(${scrub * 100}% - 1px)` }} />
                </div>
              </div>
            );
          })}
        </div>

        <div className="tl-stats">
          <TLStat label="At cursor" value={`+${formatDuration(elapsed)}`} sub="from session start" />
          <TLStat label="Active services" value={`${activeAtCursor}/${tracks.length}`} sub="at this moment" tone={activeAtCursor === tracks.length ? "ok" : "warn"} />
          <TLStat label="Errors before" value={String(errorsBeforeCursor)} sub={errorsBeforeCursor === 1 ? "1 bench panic" : errorsBeforeCursor + " events"} tone={errorsBeforeCursor > 0 ? "danger" : "muted"} />
          <TLStat label="Builds" value="14" sub="avg 482ms" />
          <TLStat label="Requests" value="218" sub="rpm peak" />
        </div>
      </div>

      <div style={{ height: 22 }} />

      <SectionHeader title="Session history" />
      <div className="panel" style={{ padding: 0 }}>
        {sessions.map((s) => {
          const w = workspaces.find((w) => w.id === s.ws);
          return (
            <div key={s.id} className={"session-row" + (active === s.id ? " active" : "")} onClick={() => { setActive(s.id); setScrub(0.5); }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: w ? w.swatch : "var(--fg-4)" }} />
              <span className="when">{s.when}</span>
              <span>
                <span className="title">{s.title}</span>
                <span className="meta" style={{ marginLeft: 8 }}>{w ? w.name : ""} · {s.projects} projects · {formatDuration(s.duration)}</span>
              </span>
              <span style={{ display: "inline-flex", gap: 6 }}>
                {s.badge ? <span className="tag ok">{s.badge}</span> : null}
                <span className="badge">{formatDuration(s.duration)}</span>
              </span>
            </div>
          );
        })}
      </div>
    </div></div>
  );
}

function eventGlyph(kind: string): string {
  const map: Record<string, string> = { build: "▲", error: "✕", warn: "!", restart: "↻", request: "›", deploy: "↗", boot: "◉", now: "●" };
  return map[kind] ?? "•";
}

interface TLStatProps { label: string; value: string; sub: string; tone?: string; }

function TLStat({ label, value, sub, tone = "muted" }: TLStatProps) {
  const colorMap: Record<string, string> = { ok: "var(--ok)", warn: "var(--warn)", danger: "var(--danger)", muted: "var(--fg-1)" };
  return (
    <div className="tl-stat">
      <div className="l">{label}</div>
      <div className="v" style={{ color: colorMap[tone] }}>{value}</div>
      <div className="s">{sub}</div>
    </div>
  );
}
