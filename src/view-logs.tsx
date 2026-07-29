import React from 'react';
import type { Workspace, Service, LogLine } from './types';
import { Ic } from './icons';

interface LogsViewProps {
  workspaces: Workspace[];
  services: Service[];
  logs: LogLine[];
  sources: Record<string, boolean>;
  toggleSource: (id: string) => void;
  search: string;
  setSearch: (q: string) => void;
  autoscroll: boolean;
  setAutoscroll: (v: boolean) => void;
  clearLogs: () => void;
}

export function LogsView({ workspaces, services, logs, sources, toggleSource, search, setSearch, autoscroll, setAutoscroll, clearLogs }: LogsViewProps) {
  const bodyRef = React.useRef<HTMLDivElement>(null);
  const wsById = Object.fromEntries(workspaces.map((w) => [w.id, w]));
  const svcById = Object.fromEntries(services.map((s) => [s.id, s]));
  const workspaceServiceIds = new Set(workspaces.flatMap(workspace => workspace.services.map(service => service.id)));
  const standaloneServices = services.filter(service => !workspaceServiceIds.has(service.id));

  React.useEffect(() => {
    if (autoscroll && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [logs.length, autoscroll]);

  const filtered = logs.filter((l) => {
    if (!sources[l.src]) return false;
    if (!search) return true;
    return l.msg.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="view"><div className="view-inner" style={{ paddingBottom: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 16 }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 4 }}>Stream</div>
          <h1 className="h1">Logs</h1>
          <div style={{ color: "var(--fg-3)", fontSize: 12.5, marginTop: 4 }}>Merged, source-coloured. Filter on the left, search above.</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <div className="tb-search" style={{ width: 280, height: 28 }}>
            <span className="icon"><Ic.Search size={12} /></span>
            <input
              style={{ background: "transparent", border: 0, outline: "none", color: "var(--fg-1)", fontFamily: "var(--font-mono)", fontSize: 11.5, width: "100%" }}
              value={search}
              placeholder="Search logs…"
              onChange={(e) => setSearch(e.target.value)}
            />
            <span className="kbd" style={{ marginRight: 4 }}>/</span>
          </div>
          <button className="btn sm" onClick={clearLogs}><Ic.Close size={11} /> Clear</button>
        </div>
      </div>

      <div className="logs-shell" style={{ height: "calc(100vh - 220px)" }}>
        <div className="logs-filters">
          {workspaces.map((g) => (
            <div key={g.id}>
              <div style={{ padding: "10px 12px 4px", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-4)", textTransform: "uppercase", letterSpacing: "0.12em", display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: g.swatch }} />
                {g.name}
              </div>
              {g.services.map((s) => {
                const active = !!sources[s.id];
                const count = logs.filter((l) => l.src === s.id).length;
                return (
                  <div key={s.id} className={"logs-filter-row" + (active ? " active" : " muted")} onClick={() => toggleSource(s.id)}>
                    <span className="ck">{active ? <Ic.Check size={12} /> : <Ic.Dot size={6} />}</span>
                    <span><span className="name mono" style={{ fontSize: 12 }}>{s.name}</span></span>
                    <span className="count">{count}</span>
                  </div>
                );
              })}
            </div>
          ))}
          {standaloneServices.length > 0 && (
            <div>
              <div style={{ padding: "10px 12px 4px", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-4)", textTransform: "uppercase", letterSpacing: "0.12em", display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: "var(--blue)" }} />
                Direct & external
              </div>
              {standaloneServices.map((service) => {
                const active = !!sources[service.id];
                const count = logs.filter(line => line.src === service.id).length;
                return (
                  <div key={service.id} className={"logs-filter-row" + (active ? " active" : " muted")} onClick={() => toggleSource(service.id)}>
                    <span className="ck">{active ? <Ic.Check size={12} /> : <Ic.Dot size={6} />}</span>
                    <span><span className="name mono" style={{ fontSize: 12 }}>{service.name}</span></span>
                    <span className="count">{count}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="logs-stream">
          <div className="logs-head">
            <div className="left">
              <span><span className="num" style={{ color: "var(--fg-1)" }}>{filtered.length}</span> lines</span>
              <span style={{ color: "var(--fg-4)" }}>·</span>
              <span>tail <span className="num" style={{ color: autoscroll ? "var(--ok)" : "var(--fg-3)" }}>{autoscroll ? "locked" : "free"}</span></span>
              <span style={{ color: "var(--fg-4)" }}>·</span>
              <span>{Object.values(sources).filter(Boolean).length} sources</span>
            </div>
            <div className="right">
              <button className="btn sm ghost" onClick={() => setAutoscroll(!autoscroll)}>{autoscroll ? <><Ic.Pause size={10} /> Unlock</> : <><Ic.Play size={10} /> Tail</>}</button>
              <button className="btn sm ghost"><Ic.External size={11} /></button>
            </div>
          </div>
          <div className="logs-body" ref={bodyRef}>
            {filtered.length === 0 ? (
              <div className="empty">
                <Ic.Logs size={28} />
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>No matching lines</div>
              </div>
            ) : filtered.map((l, i) => {
              const svc = svcById[l.src];
              const wsId = workspaces.find((w) => w.services.some((s) => s.id === l.src))?.id;
              const wsSwatch = wsId ? wsById[wsId].swatch : "var(--fg-4)";
              return (
                <div key={i} className={"log-line " + (l.kind || "info")}>
                  <span className="ts">{l.ts}</span>
                  <span className="src" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 6, height: 6, borderRadius: 99, background: wsSwatch }} />
                    {svc ? svc.name : l.src}
                  </span>
                  <span className="msg" dangerouslySetInnerHTML={{ __html: highlight(l.msg, search) }} />
                </div>
              );
            })}
          </div>
          <div className="logs-foot">
            <span>Filters · workspace · source · level</span>
            <span>{autoscroll ? "▼ tailing" : "scroll to top to unlock"}</span>
          </div>
        </div>
      </div>
    </div></div>
  );
}

function highlight(msg: string, q: string): string {
  let s = msg.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  s = s.replace(/(http:\/\/[^\s]+)/g, '<span class="kw">$1</span>');
  s = s.replace(/(:\d{2,5}\b)/g, '<span class="num">$1</span>');
  s = s.replace(/\b(\d+(?:\.\d+)?)\s?(ms|MB|GB|s)\b/g, '<span class="num">$1$2</span>');
  s = s.replace(/('[^']*')/g, '<span class="str">$1</span>');
  if (q) {
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    s = s.replace(new RegExp("(" + escaped + ")", "ig"), '<mark style="background: var(--warm-soft); color: var(--warm); padding: 0 2px; border-radius: 2px;">$1</mark>');
  }
  return s;
}
