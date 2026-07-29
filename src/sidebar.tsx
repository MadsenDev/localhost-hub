import type { Workspace } from './types';
import { Ic } from './icons';

interface SidebarProps {
  view: string;
  setView: (v: string) => void;
  ws: string;
  setWs: (id: string) => void;
  workspaces: Workspace[];
  runningByWs: Record<string, number>;
  onCreateWorkspace: () => void;
}

export function Sidebar({ view, setView, ws, setWs, workspaces, runningByWs, onCreateWorkspace }: SidebarProps) {
  const navItems = [
    { id: 'home',       label: 'Home',       icon: <Ic.Home /> },
    { id: 'repos',      label: 'Repos',      icon: <Ic.Folder /> },
    { id: 'github-repos', label: 'GitHub',    icon: <Ic.Branch /> },
    { id: 'health',     label: 'Health',     icon: <Ic.Activity /> },
    { id: 'ports',      label: 'Ports',      icon: <Ic.Ports />,     badge: <span className="badge live">live</span> },
    { id: 'logs',       label: 'Logs',       icon: <Ic.Logs /> },
    { id: 'sessions',   label: 'Sessions',   icon: <Ic.History /> },
    { id: 'containers', label: 'Containers', icon: <Ic.Container />, badge: <span className="badge">3</span> },
  ];
  const utility = [{ id: 'settings', label: 'Settings', icon: <Ic.Settings /> }];

  return (
    <aside className="sidebar">
      <div className="sb-section"><span>Navigation</span></div>
      {navItems.map((n) => (
        <div key={n.id} className={'sb-item' + (view === n.id ? ' active' : '')} onClick={() => setView(n.id)}>
          <span className="icon">{n.icon}</span>
          <span className="label">{n.label}</span>
          {n.badge ?? null}
        </div>
      ))}

      <div className="sb-divider" />

      <div className="sb-section">
        <span>Workspaces</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="count num">{workspaces.length}</span>
          <button
            className="btn sm ghost"
            style={{ padding: '1px 5px', fontSize: 12, lineHeight: 1 }}
            onClick={onCreateWorkspace}
            title="New workspace"
          >
            <Ic.Plus size={10} />
          </button>
        </span>
      </div>

      <div className="sb-workspaces">
        {workspaces.length === 0 ? (
          <div style={{ padding: '6px 14px', fontSize: 11.5, color: 'var(--fg-4)' }}>
            No workspaces yet
          </div>
        ) : (
          workspaces.map((w) => {
            const running = runningByWs[w.id] ?? 0;
            return (
              <div key={w.id} className={'sb-ws' + (ws === w.id && view === 'workspace' ? ' active' : '')} onClick={() => { setWs(w.id); setView('workspace'); }}>
                <span className="swatch" style={{ background: w.swatch }} />
                <span className="label">{w.name}</span>
                <span className="count">{running > 0 ? `${running}/${w.services.length}` : `${w.services.length}`}</span>
              </div>
            );
          })
        )}
      </div>

      <div className="sb-divider" />
      {utility.map((n) => (
        <div key={n.id} className={'sb-item' + (view === n.id ? ' active' : '')} onClick={() => setView(n.id)}>
          <span className="icon">{n.icon}</span>
          <span className="label">{n.label}</span>
        </div>
      ))}

      <div className="sb-foot">
        <span>local · sqlite</span>
        <span>v2.0.0</span>
      </div>
    </aside>
  );
}
