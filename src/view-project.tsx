import React from 'react';
import type { EnvProfile, LogLine, Port, Repo, Script, Service } from './types';
import { Ic } from './icons';
import { StatusDot } from './shared';
import { GitHubProjectPanel } from './github-project-panel';
import { tauriApi, type RepositoryHealth } from './tauri-api';
import {
  directProjectServiceId,
  DIRECT_PROJECT_WORKSPACE,
  EXTERNAL_PROCESS_WORKSPACE,
} from './project-runtime';
import { EnvProfilesPanel } from './env-profiles-panel';

type ProjectTab = 'overview' | 'scripts' | 'logs' | 'ports' | 'environment' | 'git' | 'github' | 'health';

interface ProjectViewProps {
  project: Repo;
  services: Service[];
  ports: Port[];
  logs: LogLine[];
  onBack: () => void;
  onStartScript: (project: Repo, script: Script, configuredService?: Service) => void;
  onStopService: (service: Service) => void;
  onRestartService: (service: Service) => void;
  onOpenLogs: (serviceIds: string[]) => void;
  onOpenUrl: (url: string) => void;
  onOpenEditor: (path: string) => void;
  onConfigureScripts: () => void;
  onManageGit: () => void;
  envProfiles: EnvProfile[];
  onSaveEnvProfiles: (projectPath: string, profiles: EnvProfile[]) => Promise<void>;
}

function belongsToProject(service: Service, project: Repo) {
  const servicePath = service.repo_path;
  if (!servicePath) return service.project === project.id;
  const roots = [project.path, project.git_root].filter(Boolean) as string[];
  return roots.some(root =>
    servicePath === root
    || servicePath.startsWith(`${root}/`)
    || root.startsWith(`${servicePath}/`)
  );
}

export function ProjectView({
  project,
  services,
  ports,
  logs,
  onBack,
  onStartScript,
  onStopService,
  onRestartService,
  onOpenLogs,
  onOpenUrl,
  onOpenEditor,
  onConfigureScripts,
  onManageGit,
  envProfiles,
  onSaveEnvProfiles,
}: ProjectViewProps) {
  const [tab, setTab] = React.useState<ProjectTab>('overview');
  const projectServices = services.filter(service => belongsToProject(service, project));
  const serviceIds = new Set([
    ...projectServices.map(service => service.id),
    ...project.scripts.map(script => directProjectServiceId(project, script)),
  ]);
  const projectLogs = logs.filter(line => serviceIds.has(line.src));
  const projectPorts = ports.filter(port =>
    serviceIds.has(port.svc)
    || projectServices.some(service => service.port === port.port)
    || project.running_port === port.port
  );
  const runningService = projectServices.find(service => service.status === 'running');
  const primaryUrl = runningService?.url
    ?? projectPorts.find(port => port.status === 'running')?.url
    ?? (project.running_port ? `http://localhost:${project.running_port}` : null);
  const git = project.git_status;

  return (
    <div className="view"><div className="view-inner">
      <button className="btn sm ghost" onClick={onBack} style={{ marginBottom: 14 }}>
        <Ic.Chevron size={10} style={{ transform: 'rotate(180deg)' }} /> Back to projects
      </button>

      <div className="proj-head">
        <div
          className="proj-icon"
          style={{ background: 'linear-gradient(135deg, var(--blue) 0%, var(--bg-3) 100%)', color: 'var(--fg-1)' }}
        >
          {project.name.slice(0, 2).toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 className="proj-title">{project.name}</h1>
          <div className="proj-sub">
            <span><Ic.Folder size={11} /> {project.path}</span>
            {git && <>
              <span className="sep">·</span>
              <span><Ic.Branch size={11} /> {git.branch}</span>
              <span className="sep">·</span>
              <span style={{ color: git.clean ? 'var(--ok)' : 'var(--warn)' }}>
                {git.clean ? 'clean' : `${git.changed} changes`}
              </span>
              <span className="sep">·</span>
              <span>↑{git.ahead} ↓{git.behind}</span>
            </>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {primaryUrl && (
            <button className="btn sm primary" onClick={() => onOpenUrl(primaryUrl)}>
              <Ic.External size={11} /> Open dev site
            </button>
          )}
          <button className="btn sm ghost" onClick={() => onOpenEditor(project.path)}>
            <Ic.External size={11} /> Open in editor
          </button>
        </div>
      </div>

      <div className="proj-tabs">
        {([
          ['overview', 'Overview', <Ic.Activity size={11} />],
          ['scripts', 'Scripts', <Ic.Play size={11} />, project.scripts.length],
          ['logs', 'Logs', <Ic.Logs size={11} />, projectLogs.length],
          ['ports', 'Ports', <Ic.Ports size={11} />, projectPorts.length],
          ['environment', 'Environment', <Ic.Activity size={11} />, envProfiles.length],
          ['git', 'Git', <Ic.Branch size={11} />, git?.changed],
          ['github', 'GitHub', <Ic.Globe size={11} />],
          ['health', 'Health', <Ic.Activity size={11} />],
        ] as Array<[ProjectTab, string, React.ReactNode, number?]>).map(([id, label, icon, badge]) => (
          <button key={id} type="button" className={`proj-tab${tab === id ? ' active' : ''}`} onClick={() => setTab(id)}>
            {icon} {label}{badge ? <span className="badge">{badge}</span> : null}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <OverviewTab project={project} services={projectServices} ports={projectPorts} />
      )}
      {tab === 'scripts' && (
        <ScriptsTab
          project={project}
          services={projectServices}
          onStart={onStartScript}
          onStop={onStopService}
          onRestart={onRestartService}
          onConfigure={onConfigureScripts}
        />
      )}
      {tab === 'logs' && (
        <LogsTab logs={projectLogs} serviceIds={[...serviceIds]} onOpenLogs={onOpenLogs} />
      )}
      {tab === 'ports' && (
        <PortsTab ports={projectPorts} fallbackPort={project.running_port} onOpenUrl={onOpenUrl} />
      )}
      {tab === 'environment' && (
        <EnvProfilesPanel
          projectPath={project.path}
          profiles={envProfiles}
          onSave={profiles => onSaveEnvProfiles(project.path, profiles)}
        />
      )}
      {tab === 'git' && (
        <GitTab project={project} onManageGit={onManageGit} />
      )}
      {tab === 'github' && (
        <div className="panel" style={{ padding: 14 }}>
          {project.has_git
            ? <GitHubProjectPanel path={project.git_root ?? project.path} />
            : <Empty icon={<Ic.Globe size={28} />} title="This project is not a Git repository." />}
        </div>
      )}
      {tab === 'health' && <ProjectHealth project={project} />}
    </div></div>
  );
}

function OverviewTab({ project, services, ports }: { project: Repo; services: Service[]; ports: Port[] }) {
  const running = services.filter(service => service.status === 'running');
  const cpu = services.reduce((total, service) => total + service.cpu, 0);
  const memory = services.reduce((total, service) => total + service.mem, 0);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(250px, 1fr)', gap: 16 }}>
      <div className="panel">
        <div className="panel-head"><div className="panel-title"><span className="dot" /> Services</div></div>
        {services.length === 0 ? (
          <Empty icon={<Ic.Play size={26} />} title="No workspace services are configured for this project." />
        ) : services.map(service => (
          <div key={service.id} className="script-row">
            <span className="name" style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              <StatusDot s={service.status} /> {service.name}
            </span>
            <span className="cmd">{service.cmd}</span>
            <span className="mono" style={{ color: 'var(--fg-3)', fontSize: 11 }}>
              {service.pid ? `PID ${service.pid}` : service.status}
              {service.port ? ` · :${service.port}` : ''}
              {service._ws === EXTERNAL_PROCESS_WORKSPACE ? ' · external' : service._ws === DIRECT_PROJECT_WORKSPACE ? ' · direct' : ''}
            </span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="panel">
          <div className="panel-head"><div className="panel-title"><span className="dot" /> Project</div></div>
          <div className="kv-grid" style={{ border: 0, borderRadius: 0 }}>
            <Detail label="Framework" value={project.framework || 'Unknown'} />
            <Detail label="Package manager" value={project.package_manager || 'Unknown'} />
            <Detail label="Scripts" value={`${project.scripts.length}`} />
            <Detail label="Manifests" value={`${project.manifests.length}`} />
            <Detail label="Environment" value={project.has_env ? 'Detected' : 'None detected'} />
            <Detail label="Git" value={project.has_git ? 'Repository' : 'Not detected'} />
          </div>
        </div>
        <div className="panel">
          <div className="panel-head"><div className="panel-title"><span className="dot" /> Runtime</div></div>
          <div className="kv-grid" style={{ border: 0, borderRadius: 0 }}>
            <Detail label="Running" value={`${running.length} / ${services.length}`} />
            <Detail label="Ports" value={`${ports.length}`} />
            <Detail label="CPU" value={`${cpu.toFixed(1)}%`} />
            <Detail label="Memory" value={`${memory.toFixed(0)} MB`} />
          </div>
        </div>
      </div>
    </div>
  );
}

function ScriptsTab({
  project,
  services,
  onStart,
  onStop,
  onRestart,
  onConfigure,
}: {
  project: Repo;
  services: Service[];
  onStart: (project: Repo, script: Script, configuredService?: Service) => void;
  onStop: (service: Service) => void;
  onRestart: (service: Service) => void;
  onConfigure: () => void;
}) {
  if (project.scripts.length === 0) {
    return <div className="panel"><Empty icon={<Ic.Play size={28} />} title="No runnable scripts were detected." /></div>;
  }
  return (
    <div className="panel">
      <div className="panel-head">
        <div className="panel-title"><span className="dot" /> Detected scripts</div>
        <button className="btn sm ghost" onClick={onConfigure}>Configure services</button>
      </div>
      {project.scripts.map(script => {
        const service = services.find(item => item.cmd === script.cmd || item.name === script.name);
        const live = service && service.status !== 'stopped' && service.status !== 'failed' && service.status !== 'exited';
        return (
          <div key={`${script.name}:${script.cmd}`} className="script-row">
            <span className="name">{script.name}</span>
            <span className="cmd">{script.cmd}</span>
            <span style={{ display: 'inline-flex', gap: 6 }}>
              {service ? live ? <>
                {service._ws !== EXTERNAL_PROCESS_WORKSPACE && (
                  <button className="btn sm ghost" onClick={() => onRestart(service)}><Ic.Reload size={11} /> Restart</button>
                )}
                <button className="btn sm danger" onClick={() => onStop(service)}><Ic.Stop size={11} /> Stop</button>
              </> : (
                <button className="btn sm primary" onClick={() => onStart(project, script, service)}><Ic.Play size={11} /> Run</button>
              ) : (
                <>
                  <button className="btn sm primary" onClick={() => onStart(project, script)}><Ic.Play size={11} /> Run</button>
                  <button className="btn sm ghost" onClick={onConfigure}><Ic.Plus size={11} /> Add to workspace</button>
                </>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function LogsTab({ logs, serviceIds, onOpenLogs }: { logs: LogLine[]; serviceIds: string[]; onOpenLogs: (ids: string[]) => void }) {
  return (
    <div className="panel">
      <div className="panel-head">
        <div className="panel-title"><span className="dot" /> Live process output</div>
        <button className="btn sm ghost" onClick={() => onOpenLogs(serviceIds)} disabled={serviceIds.length === 0}>
          <Ic.External size={11} /> Full log viewer
        </button>
      </div>
      {logs.length === 0 ? (
        <Empty icon={<Ic.Logs size={28} />} title="No logs have been captured for this project yet." />
      ) : (
        <div style={{ maxHeight: 480, overflow: 'auto', padding: '8px 14px', background: 'var(--bg-0)' }}>
          {logs.slice(-250).map((line, index) => (
            <div key={`${line.ts}:${index}`} className="mono" style={{ display: 'grid', gridTemplateColumns: '70px 110px 1fr', gap: 9, padding: '3px 0', fontSize: 11.5 }}>
              <span style={{ color: 'var(--fg-4)' }}>{line.ts}</span>
              <span style={{ color: 'var(--blue)' }}>{line.src}</span>
              <span style={{ color: line.kind === 'error' ? 'var(--danger)' : line.kind === 'warn' ? 'var(--warn)' : 'var(--fg-2)', whiteSpace: 'pre-wrap' }}>{line.msg}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PortsTab({ ports, fallbackPort, onOpenUrl }: { ports: Port[]; fallbackPort: number | null; onOpenUrl: (url: string) => void }) {
  const visible = ports.length > 0
    ? ports
    : fallbackPort
      ? [{ id: `project-${fallbackPort}`, port: fallbackPort, host: 'localhost', url: `http://localhost:${fallbackPort}`, status: 'running' as const, svc: '', ws: '', group: '' }]
      : [];
  return (
    <div className="panel">
      <div className="panel-head"><div className="panel-title"><span className="dot" /> Detected listeners</div></div>
      {visible.length === 0 ? (
        <Empty icon={<Ic.Ports size={28} />} title="No listening ports are associated with this project." />
      ) : (
        <div style={{ padding: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 10 }}>
          {visible.map(port => {
            const url = port.url ?? `http://localhost:${port.port}`;
            return (
              <div key={port.id} className="ws-card" style={{ padding: 12 }}>
                <div className="ws-head">
                  <span className="mono" style={{ fontSize: 16, fontWeight: 600 }}>:{port.port}</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><StatusDot s={port.status} /> {port.status}</span>
                </div>
                <button className="btn sm ghost" onClick={() => onOpenUrl(url)}><Ic.External size={11} /> {url}</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function GitTab({ project, onManageGit }: { project: Repo; onManageGit: () => void }) {
  const git = project.git_status;
  if (!project.has_git) return <div className="panel"><Empty icon={<Ic.Branch size={28} />} title="Git is not initialized for this project." /></div>;
  if (!git) return <div className="panel"><Empty icon={<Ic.Branch size={28} />} title="Git status is currently unavailable." /></div>;
  return (
    <div className="panel">
      <div className="panel-head">
        <div className="panel-title"><span className="dot" /> {git.branch}</div>
        <button className="btn sm ghost" onClick={onManageGit}><Ic.External size={11} /> Manage Git</button>
      </div>
      <div className="kv-grid" style={{ border: 0, borderRadius: 0 }}>
        <Detail label="State" value={git.clean ? 'Clean' : `${git.changed} changed`} />
        <Detail label="Staged" value={`${git.staged}`} />
        <Detail label="Unstaged" value={`${git.unstaged}`} />
        <Detail label="Untracked" value={`${git.untracked}`} />
        <Detail label="Ahead" value={`${git.ahead}`} />
        <Detail label="Behind" value={`${git.behind}`} />
      </div>
      <div style={{ padding: '12px 14px', borderTop: '1px solid var(--line-soft)' }}>
        <div style={{ color: 'var(--fg-4)', fontSize: 10.5, marginBottom: 5 }}>LAST COMMIT</div>
        <div style={{ color: 'var(--fg-2)', fontSize: 12 }}>
          {git.last_commit_hash && <span className="mono" style={{ color: 'var(--blue)', marginRight: 7 }}>{git.last_commit_hash}</span>}
          {git.last_commit_message ?? 'No commits yet'}
        </div>
      </div>
      {git.files.length > 0 && (
        <div style={{ borderTop: '1px solid var(--line-soft)' }}>
          {git.files.slice(0, 100).map(file => (
            <div key={file.path} className="script-row">
              <span className="mono" style={{ color: file.conflicted ? 'var(--danger)' : 'var(--warn)' }}>
                {file.conflicted ? 'CONFLICT' : file.index_status ?? file.worktree_status ?? 'changed'}
              </span>
              <span className="cmd">{file.path}</span>
              <span />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectHealth({ project }: { project: Repo }) {
  const path = project.git_root ?? project.path;
  const [result, setResult] = React.useState<RepositoryHealth | null>(null);
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const load = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setResult((await tauriApi.analyzeRepositoryHealth([path]))[0] ?? null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }, [path]);
  React.useEffect(() => { void load(); }, [load]);

  if (loading && !result) return <div className="panel"><Empty icon={<Ic.Activity size={28} />} title="Analyzing repository health…" /></div>;
  if (error || !result) return (
    <div className="panel">
      <Empty icon={<Ic.Activity size={28} />} title={error || 'Health analysis is unavailable.'} />
      <div style={{ textAlign: 'center', paddingBottom: 16 }}><button className="btn sm ghost" onClick={() => void load()}>Retry</button></div>
    </div>
  );
  return (
    <div className="panel">
      <div className="panel-head">
        <div className="panel-title"><span className="dot" /> Repository health</div>
        <button className="btn sm ghost" onClick={() => void load()} disabled={loading}><Ic.Reload size={11} /> Refresh</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: 16, padding: 16 }}>
        <div>
          <div className="mono" style={{ fontSize: 34, color: result.status === 'healthy' ? 'var(--ok)' : result.status === 'attention' ? 'var(--warn)' : 'var(--danger)' }}>
            {result.score}<span style={{ fontSize: 12, color: 'var(--fg-4)' }}>/100</span>
          </div>
          <div className={`tag ${result.status === 'healthy' ? 'ok' : 'warn'}`}>{result.status}</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 8 }}>
          {result.signals.map(signal => (
            <div key={signal.id} style={{ padding: 10, background: 'var(--bg-2)', border: '1px solid var(--line-1)', borderRadius: 'var(--r-1)' }}>
              <div style={{ fontSize: 11, color: signal.state === 'bad' ? 'var(--danger)' : signal.state === 'warn' ? 'var(--warn)' : 'var(--fg-2)', fontWeight: 650 }}>{signal.label}</div>
              <div style={{ fontSize: 11.5, color: 'var(--fg-3)', marginTop: 4 }}>{signal.detail}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="kv"><span className="k">{label}</span><span className="v">{value}</span></div>;
}

function Empty({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="empty" style={{ padding: 28 }}>
      {icon}
      <div style={{ color: 'var(--fg-3)', marginTop: 9, fontSize: 12 }}>{title}</div>
    </div>
  );
}
