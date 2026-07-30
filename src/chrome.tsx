import React from 'react';
import type { Workspace } from './types';
import { Ic } from './icons';
import { HubLogo } from './brand';

import { getCurrentWindow } from '@tauri-apps/api/window';

interface TitleBarProps {
  runningCount: number;
  totalServices: number;
  portsLive: number;
  errorsToday: number;
  currentWs: Workspace | undefined;
  view: string;
  onOpenPalette: () => void;
  onToggleSidebar: () => void;
  pulse: number[];
}

// The window controls are drawn at the icons' native 16-unit box, so one view
// box unit is one CSS pixel and the geometry lands exactly where it was drawn.
// One size and one stroke for all four glyphs is the point: they sit next to
// each other, so any difference between them reads as a mistake.
const WIN_GLYPH = 16;
const WIN_STROKE = 1.25;

function getWin() {
  try { return getCurrentWindow(); } catch { return null; }
}

const win = getWin();

export function TitleBar({
  runningCount, totalServices, portsLive, errorsToday,
  currentWs, view, onOpenPalette, onToggleSidebar, pulse
}: TitleBarProps) {
  const accent = currentWs ? currentWs.swatch : "var(--blue)";
  const [maximized, setMaximized] = React.useState(false);
  const barRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!win) return;
    win.isMaximized().then(setMaximized);
    let unlisten: (() => void) | undefined;
    win.onResized(() => win.isMaximized().then(setMaximized)).then((u) => { unlisten = u; });
    return () => { unlisten?.(); };
  }, []);

  React.useEffect(() => {
    const el = barRef.current;
    if (!el || !win) return;
    function onDown(e: MouseEvent) {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (target.closest('button, .tb-search')) return;
      win!.startDragging();
    }
    el.addEventListener('mousedown', onDown);
    return () => el.removeEventListener('mousedown', onDown);
  }, []);

  return (
    <div
      ref={barRef}
      className="titlebar tb-v2"
      style={{ "--ws-accent": accent } as React.CSSProperties}
      onDoubleClick={(e) => {
        if ((e.target as HTMLElement).closest('button, .tb-search')) return;
        win?.toggleMaximize();
      }}
    >
      <div className="tb-accent-stripe" />

      <div className="tb-brand" onClick={onToggleSidebar} title="Toggle sidebar">
        <HubLogo size={20} accent="var(--blue)" body="var(--fg-1)" />
        <div className="tb-brand-name">
          Localhost Hub
          <span className="v">v{__APP_VERSION__}</span>
        </div>
      </div>

      <div className="tb-context">
        {currentWs ? (
          <div className="tb-ws-pill" title={`Workspace: ${currentWs.name}`}>
            <span className="sw" style={{ background: currentWs.swatch }} />
            <span className="nm">{currentWs.name}</span>
            <span className="crumb">/</span>
            <span className="view-name">{viewLabel(view)}</span>
          </div>
        ) : null}
      </div>

      <div className="tb-center">
        <div className="tb-search" onClick={onOpenPalette}>
          <span className="icon"><Ic.Search size={13} /></span>
          <span className="label">Run command, find project, jump to service…</span>
          <span className="kbd">⌘K</span>
        </div>
      </div>

      <div className="tb-status">
        <StatusChip icon={<Ic.Play size={11} />} label="services" value={`${runningCount}/${totalServices}`} tone={runningCount > 0 ? "ok" : "muted"} live={runningCount > 0} />
        <StatusChip icon={<Ic.Ports size={11} />} label="ports" value={String(portsLive)} tone={portsLive > 0 ? "blue" : "muted"} />
        <StatusChip icon={<Ic.Bell size={11} />} label={errorsToday === 1 ? "error" : "errors"} value={String(errorsToday)} tone={errorsToday > 0 ? "danger" : "muted"} />
        <PulseSpark pulse={pulse} />
      </div>

      <div className="tb-right">
        <div className="win-controls">
          <button type="button" className="wc" title="Minimize" aria-label="Minimize" onClick={() => win?.minimize()}>
            <Ic.WinMin size={WIN_GLYPH} sw={WIN_STROKE} />
          </button>
          <button
            type="button"
            className="wc"
            title={maximized ? "Restore" : "Maximize"}
            aria-label={maximized ? "Restore" : "Maximize"}
            onClick={() => win?.toggleMaximize()}
          >
            {maximized
              ? <Ic.WinRestore size={WIN_GLYPH} sw={WIN_STROKE} />
              : <Ic.WinMax size={WIN_GLYPH} sw={WIN_STROKE} />}
          </button>
          <button type="button" className="wc close" title="Close" aria-label="Close" onClick={() => win?.close()}>
            <Ic.WinClose size={WIN_GLYPH} sw={WIN_STROKE} />
          </button>
        </div>
      </div>
    </div>
  );
}

interface StatusChipProps { icon: React.ReactNode; label: string; value: string; tone?: string; live?: boolean; }

function StatusChip({ icon, label, value, tone = "muted", live = false }: StatusChipProps) {
  return (
    <div className={"tb-chip tone-" + tone + (live ? " is-live" : "")}>
      <span className="ci">{icon}</span>
      <span className="cv">{value}</span>
      <span className="cl">{label}</span>
    </div>
  );
}

function PulseSpark({ pulse }: { pulse: number[] }) {
  const w = 60, h = 14;
  const arr = pulse?.length ? pulse : new Array(24).fill(0);
  const pts = arr.map((v, i) => {
    const x = (i / Math.max(1, arr.length - 1)) * w;
    const y = h - (v * (h - 2)) - 1;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <div className="tb-pulse" title="Live log activity (last 30s)">
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
        <polyline points={pts} stroke="var(--blue)" strokeWidth="1.2" fill="none" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function viewLabel(v: string): string {
  const map: Record<string, string> = {
    home: "Home", workspace: "Services", project: "Project",
    ports: "Ports", logs: "Logs", sessions: "Sessions",
    containers: "Containers", settings: "Settings"
  };
  return map[v] ?? "—";
}
