import React from 'react';
import type { HubDataShape, Repo } from './types';
import { Ic } from './icons';

interface PaletteItem {
  id: string;
  label: string;
  sub: string;
  kind: string;
  icon: React.ReactNode;
  shortcut?: string;
  run: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  data: HubDataShape;
  projects: Repo[];
  onRunScript: (wsId: string, svcId: string) => void;
  onRunProjectScript: (project: Repo, script: Repo['scripts'][number]) => void;
  onSwitchWs: (id: string) => void;
  onOpenView: (v: string) => void;
  onOpenProject: (id: string) => void;
  onOpenUrl: (url: string) => void;
}

export function CommandPalette({ open, onClose, data, projects, onRunScript, onRunProjectScript, onSwitchWs, onOpenView, onOpenProject, onOpenUrl }: CommandPaletteProps) {
  const [q, setQ] = React.useState("");
  const [tab, setTab] = React.useState("all");
  const [idx, setIdx] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (open) {
      setQ(""); setIdx(0);
      setTimeout(() => inputRef.current?.focus(), 40);
    }
  }, [open]);

  const items: PaletteItem[] = React.useMemo(() => {
    const out: PaletteItem[] = [];
    [
      { id: "v-home",     label: "Go to Home",       sub: "Dashboard overview",  kind: "nav", icon: <Ic.Home size={13} />,    run: () => onOpenView("home") },
      { id: "v-ws",       label: "Go to Workspace",  sub: "Currently selected",  kind: "nav", icon: <Ic.Stack size={13} />,   run: () => onOpenView("workspace") },
      { id: "v-health",   label: "Go to Health",     sub: "Repository health",    kind: "nav", icon: <Ic.Activity size={13} />, run: () => onOpenView("health") },
      { id: "v-ports",    label: "Go to Ports",      sub: "Port topology map",   kind: "nav", icon: <Ic.Ports size={13} />,   run: () => onOpenView("ports") },
      { id: "v-logs",     label: "Go to Logs",       sub: "Streaming logs",      kind: "nav", icon: <Ic.Logs size={13} />,    run: () => onOpenView("logs") },
      { id: "v-sessions", label: "Go to Sessions",   sub: "Timeline scrubber",   kind: "nav", icon: <Ic.History size={13} />, run: () => onOpenView("sessions") }
    ].forEach((i) => out.push(i));

    data.workspaces.forEach((w) => {
      out.push({ id: "ws-" + w.id, label: `Switch to ${w.name}`, sub: w.path, kind: "ws", icon: <span style={{ width: 10, height: 10, borderRadius: 2, background: w.swatch, display: "inline-block" }} />, run: () => onSwitchWs(w.id) });
    });

    projects.forEach((project) => {
      project.scripts.forEach((script) => {
        out.push({
          id: `project-script-${project.id}-${script.name}`,
          label: `Run ${script.name} · ${project.name}`,
          sub: script.cmd,
          kind: "script",
          icon: <Ic.Play size={13} />,
          run: () => onRunProjectScript(project, script),
        });
      });
    });

    data.workspaces.forEach((w) => {
      w.services.forEach((s) => {
        out.push({ id: "script-" + s.id, label: `Run ${s.name} · ${s.cmd}`, sub: `${w.name} · ${s.project}`, kind: "script", icon: <Ic.Play size={13} />, shortcut: s.status === "running" ? "running" : "", run: () => onRunScript(w.id, s.id) });
      });
    });

    data.ports.filter((p) => p.status === "running").forEach((p) => {
      const url = p.url ?? `http://localhost:${p.port}`;
      out.push({ id: "open-" + p.port, label: `Open ${url.replace(/^https?:\/\//, '')}`, sub: "in browser", kind: "open", icon: <Ic.Globe size={13} />, run: () => onOpenUrl(url) });
    });

    projects.forEach((p) => {
      out.push({ id: "proj-" + p.id, label: p.name, sub: p.path, kind: "project", icon: <Ic.Folder size={13} />, run: () => onOpenProject(p.id) });
    });

    // No per-session entries. They read `Resume "…"` but only navigated to the
    // Sessions view, which "Go to Sessions" above already does — and they were
    // built from an array that was always empty, so none ever appeared. Resuming a
    // session is offered on Home, where it actually starts the workspace.

    return out;
  }, [data, projects, onOpenProject, onOpenUrl, onOpenView, onRunProjectScript, onRunScript, onSwitchWs]);

  const filtered = items.filter((i) => {
    if (tab !== "all" && i.kind !== tab) return false;
    if (!q) return true;
    return (i.label + " " + (i.sub || "")).toLowerCase().includes(q.toLowerCase());
  });

  React.useEffect(() => { setIdx(0); }, [q, tab]);

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(filtered.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); const item = filtered[idx]; if (item) { item.run(); onClose(); } }
    else if (e.key === "Escape") { onClose(); }
  }

  if (!open) return null;

  return (
    <div className="palette-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="palette">
        <div className="palette-input-wrap">
          <span style={{ display: "grid", placeItems: "center", color: "var(--fg-3)" }}><Ic.Search size={14} /></span>
          <input ref={inputRef} className="palette-input" placeholder="Type a command, search projects, run a script…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} />
          <span className="esc">ESC</span>
        </div>
        <div className="palette-tabs">
          {[
            { id: "all",     label: "All" },
            { id: "nav",     label: "Navigate" },
            { id: "script",  label: "Run script" },
            { id: "ws",      label: "Workspace" },
            { id: "project", label: "Project" },
            { id: "open",    label: "Open URL" }
          ].map((t) => (
            <div key={t.id} className={"palette-tab" + (tab === t.id ? " active" : "")} onClick={() => setTab(t.id)}>{t.label}</div>
          ))}
        </div>
        <div className="palette-list">
          {filtered.length === 0 ? (
            <div className="empty">
              <Ic.Search size={20} />
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, marginTop: 8 }}>No results for "{q}"</div>
            </div>
          ) : filtered.slice(0, 50).map((item, i) => (
            <div key={item.id} className={"palette-row" + (i === idx ? " active" : "")} onMouseEnter={() => setIdx(i)} onClick={() => { item.run(); onClose(); }}>
              <span className="icon">{item.icon}</span>
              <span>
                <div className="label">{item.label}</div>
                <div className="sub">{item.sub}</div>
              </span>
              <span className="right">{item.shortcut ?? (item.kind === "nav" ? "↵" : "")}</span>
            </div>
          ))}
        </div>
        <div className="palette-foot">
          <span>↑↓ navigate · ↵ select · ESC dismiss</span>
          <span>{filtered.length} matches</span>
        </div>
      </div>
    </div>
  );
}
