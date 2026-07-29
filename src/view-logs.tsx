import React from 'react';
import type { Workspace, Service, LogLine } from './types';
import { Ic } from './icons';

type LogLevel = LogLine['kind'];

interface LogsViewProps {
  workspaces: Workspace[];
  services: Service[];
  logs: LogLine[];
  sources: Record<string, boolean>;
  toggleSource: (id: string) => void;
  setAllSources: (enabled: boolean) => void;
  search: string;
  setSearch: (q: string) => void;
  autoscroll: boolean;
  setAutoscroll: (v: boolean) => void;
  clearLogs: () => void;
}

const LOG_LEVELS: Array<{ id: LogLevel; label: string }> = [
  { id: 'error', label: 'Errors' },
  { id: 'warn', label: 'Warnings' },
  { id: 'ok', label: 'Success' },
  { id: 'info', label: 'Info' },
];

export function LogsView({ workspaces, services, logs, sources, toggleSource, setAllSources, search, setSearch, autoscroll, setAutoscroll, clearLogs }: LogsViewProps) {
  const bodyRef = React.useRef<HTMLDivElement>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const [levels, setLevels] = React.useState<Record<LogLevel, boolean>>({
    error: true,
    warn: true,
    ok: true,
    info: true,
  });
  const [actionStatus, setActionStatus] = React.useState('');
  const wsById = Object.fromEntries(workspaces.map((w) => [w.id, w]));
  const svcById = Object.fromEntries(services.map((s) => [s.id, s]));
  const workspaceServiceIds = new Set(workspaces.flatMap(workspace => workspace.services.map(service => service.id)));
  const standaloneServices = services.filter(service => !workspaceServiceIds.has(service.id));

  React.useEffect(() => {
    if (autoscroll && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [logs.length, autoscroll]);

  React.useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isTyping = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;
      if (event.key === '/' && !isTyping) {
        event.preventDefault();
        searchRef.current?.focus();
      } else if (event.key === 'Escape' && document.activeElement === searchRef.current) {
        setSearch('');
        searchRef.current?.blur();
      }
    }
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [setSearch]);

  const filtered = logs.filter((l) => {
    if (!sources[l.src]) return false;
    if (!levels[l.kind]) return false;
    if (!search) return true;
    const query = search.toLowerCase();
    return l.msg.toLowerCase().includes(query)
      || l.src.toLowerCase().includes(query)
      || svcById[l.src]?.name.toLowerCase().includes(query);
  });
  const levelCounts = Object.fromEntries(
    LOG_LEVELS.map(level => [level.id, logs.filter(line => line.kind === level.id).length]),
  ) as Record<LogLevel, number>;
  const visibleText = serializeLogs(filtered, svcById);

  async function copyVisible() {
    if (!visibleText) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(visibleText);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = visibleText;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        const copied = document.execCommand('copy');
        textarea.remove();
        if (!copied) throw new Error('clipboard unavailable');
      }
      setActionStatus(`Copied ${filtered.length} visible lines`);
    } catch {
      setActionStatus('Could not copy logs');
    }
  }

  async function exportVisible() {
    if (!visibleText) return;
    try {
      const [{ save }, { writeTextFile }] = await Promise.all([
        import('@tauri-apps/plugin-dialog'),
        import('@tauri-apps/plugin-fs'),
      ]);
      const path = await save({
        defaultPath: `localhost-hub-logs-${new Date().toISOString().slice(0, 10)}.log`,
        filters: [{ name: 'Log file', extensions: ['log', 'txt'] }],
      });
      if (!path) return;
      await writeTextFile(path, `${visibleText}\n`);
      setActionStatus(`Exported ${filtered.length} visible lines`);
    } catch {
      setActionStatus('Could not export logs');
    }
  }

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
              ref={searchRef}
              aria-label="Search logs"
              style={{ background: "transparent", border: 0, outline: "none", color: "var(--fg-1)", fontFamily: "var(--font-mono)", fontSize: 11.5, width: "100%" }}
              value={search}
              placeholder="Search logs…"
              onChange={(e) => setSearch(e.target.value)}
            />
            <span className="kbd" style={{ marginRight: 4 }}>/</span>
          </div>
          <button className="btn sm" onClick={() => void copyVisible()} disabled={filtered.length === 0}>Copy visible</button>
          <button className="btn sm" onClick={() => void exportVisible()} disabled={filtered.length === 0}>Export</button>
          <button className="btn sm" onClick={clearLogs}><Ic.Close size={11} /> Clear</button>
        </div>
      </div>

      <div className="logs-shell" style={{ height: "calc(100vh - 220px)" }}>
        <div className="logs-filters">
          <div className="logs-filter-actions">
            <span>Sources</span>
            <span>
              <button type="button" onClick={() => setAllSources(true)}>All</button>
              <button type="button" onClick={() => setAllSources(false)}>None</button>
            </span>
          </div>
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
              <div className="log-level-filters" aria-label="Log level filters">
                {LOG_LEVELS.map(level => (
                  <button
                    type="button"
                    key={level.id}
                    className={`log-level-filter ${level.id}${levels[level.id] ? ' active' : ''}`}
                    aria-pressed={levels[level.id]}
                    onClick={() => setLevels(current => ({ ...current, [level.id]: !current[level.id] }))}
                  >
                    {level.label} <span>{levelCounts[level.id]}</span>
                  </button>
                ))}
              </div>
              <button className="btn sm ghost" onClick={() => setAutoscroll(!autoscroll)}>{autoscroll ? <><Ic.Pause size={10} /> Unlock</> : <><Ic.Play size={10} /> Tail</>}</button>
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
                  <span className="msg"><HighlightedMessage message={l.msg} query={search} /></span>
                </div>
              );
            })}
          </div>
          <div className="logs-foot">
            <span>{actionStatus || 'Filters · workspace · source · level'}</span>
            <span>{autoscroll ? "▼ tailing" : "tail unlocked"}</span>
          </div>
        </div>
      </div>
    </div></div>
  );
}

function HighlightedMessage({ message, query }: { message: string; query: string }) {
  if (!query) return <>{message}</>;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = message.split(new RegExp(`(${escaped})`, 'ig'));
  return (
    <>
      {parts.map((part, index) => (
        part.toLowerCase() === query.toLowerCase()
          ? <mark className="log-search-match" key={index}>{part}</mark>
          : <React.Fragment key={index}>{part}</React.Fragment>
      ))}
    </>
  );
}

export function serializeLogs(logs: LogLine[], services: Record<string, Service>): string {
  return logs
    .map(line => `[${line.ts}] [${line.kind.toUpperCase()}] [${services[line.src]?.name ?? line.src}] ${line.msg}`)
    .join('\n');
}
