import React from 'react';
import type { HubDataShape, Service, Session, LogLine, Workspace, Port, ServiceStatus, Repo, StoredWorkspace, StoredService } from './types';
import { useTweaks, TweaksPanel, TweakSection, TweakRadio, TweakColor, TweakButton } from './tweaks-panel';
import { TitleBar } from './chrome';
import { Sidebar } from './sidebar';
import { HomeView } from './view-home';
import { WorkspaceView } from './view-workspace';
import { ReposView } from './view-repos';
import { GitHubReposView } from './view-github-repos';
import { PortsView } from './view-ports';
import { LogsView } from './view-logs';
import { SessionsView } from './view-sessions';
import { ProjectView } from './view-project';
import { CommandPalette } from './view-palette';
import { OnboardingView } from './view-onboarding';
import { SettingsView } from './view-settings';
import { githubAuth, type GitHubUser } from './github-auth';
import { listenToServiceEvents, tauriApi, type WorkspaceGroup, type ProcessInfo, type LivePort, type ManagedServiceInfo } from './tauri-api';
import { Ic } from './icons';
import { formatDuration } from './utils';

const TWEAK_DEFAULTS = {
  theme: "charcoal",
  accent: "#4a78c4",
  density: "balanced",
  sidebar: "labeled",
  showTitleBar: true,
};

const ACCENT_MAP: Record<string, { blue: string; warm: string }> = {
  "#4a78c4": { blue: "oklch(0.66 0.115 252)", warm: "oklch(0.80 0.07 75)"  },
  "#d9854f": { blue: "oklch(0.65 0.13 35)",   warm: "oklch(0.80 0.08 90)"  },
  "#8a78ec": { blue: "oklch(0.66 0.16 290)",  warm: "oklch(0.80 0.08 70)"  },
  "#54a892": { blue: "oklch(0.65 0.13 165)",  warm: "oklch(0.80 0.07 75)"  },
};

interface Toast { id: string; msg: string; kind: string; }
interface ManagedRuntime { status: ServiceStatus; pid: number | null; startedAt: number | null; }
type AppearanceKey = "theme" | "accent" | "density" | "sidebar";

const EMPTY_HUB: HubDataShape = { workspaces: [], projects: {}, activity: [], sessions: [], logSeeds: {}, ports: [], portEdges: [] };

const WS_COLORS = [
  'oklch(0.66 0.115 252)', 'oklch(0.80 0.07 75)', 'oklch(0.73 0.13 148)',
  'oklch(0.66 0.19 25)',   'oklch(0.66 0.16 290)', 'oklch(0.65 0.13 165)',
];



function guessPortGroup(port: number): string {
  if ([5432, 3306, 27017, 6379, 5984, 9200].includes(port)) return 'db';
  if ([4040, 8443].includes(port)) return 'edge';
  if ((port >= 3000 && port <= 3100) || (port >= 5170 && port <= 5180)) return 'web';
  if ((port >= 4000 && port <= 4200) || (port >= 8000 && port <= 8100)) return 'api';
  return 'api';
}

/** Derive Repo[] from scan results + live data */
function buildRepos(groups: WorkspaceGroup[], processes: ProcessInfo[], ports: LivePort[]): Repo[] {
  const pidToPort: Record<number, number> = {};
  for (const p of ports) {
    if (p.pid && !(p.pid in pidToPort)) pidToPort[p.pid] = p.port;
  }
  return groups.flatMap(g => g.projects.map(proj => {
    const proc = processes.find(p => p.cwd && (p.cwd === proj.path || p.cwd.startsWith(proj.path + '/')));
    const port = proc ? (pidToPort[proc.pid] ?? null) : null;
    return {
      id: `repo::${proj.path}`,
      name: proj.name,
      path: proj.path,
      framework: proj.framework,
      package_manager: proj.package_manager,
      scripts: proj.scripts,
      has_env: proj.has_env,
      has_git: proj.has_git,
      git_root: proj.git_root,
      manifests: proj.manifests,
      is_running: !!proc,
      running_port: port,
      cpu: proc?.cpu_usage ?? 0,
      mem: proc ? Math.round(proc.memory_kb / 1024) : 0,
    };
  }));
}

/** Derive renderable HubDataShape from user-defined workspaces + live data */
function buildHubData(
  stored: StoredWorkspace[],
  processes: ProcessInfo[],
  ports: LivePort[],
  managedRuntimes: Record<string, ManagedRuntime> = {},
): HubDataShape {
  const pidToPort: Record<number, number> = {};
  for (const p of ports) {
    if (p.pid && !(p.pid in pidToPort)) pidToPort[p.pid] = p.port;
  }

  const workspaces: Workspace[] = stored.map((sw) => {
    const services: Service[] = sw.services.map((ss) => {
      const proc = processes.find(p => p.cwd && (p.cwd === ss.repo_path || p.cwd.startsWith(ss.repo_path + '/')));
      const port = proc ? (pidToPort[proc.pid] ?? null) : null;
      const managedRuntime = managedRuntimes[ss.id];
      const startedAt = managedRuntime?.startedAt ?? null;
      return {
        id: ss.id,
        project: ss.id,
        name: ss.name,
        cmd: ss.cmd,
        repo_path: ss.repo_path,
        port,
        status: managedRuntime?.status ?? ((proc ? 'running' : 'stopped') as ServiceStatus),
        uptime: startedAt ? Math.max(0, Math.floor((Date.now() - startedAt) / 1000)) : 0,
        pid: managedRuntime?.pid ?? proc?.pid ?? null,
        pkg: '',
        cpu: proc?.cpu_usage ?? 0,
        mem: proc ? Math.round(proc.memory_kb / 1024) : 0,
        framework: '',
      };
    });
    return {
      id: sw.id,
      name: sw.name,
      desc: `${sw.services.length} service${sw.services.length !== 1 ? 's' : ''}`,
      swatch: sw.color,
      path: '',
      projects: sw.services.map(s => s.id),
      services,
      sessions: 0,
      lastOpened: 'recently',
    };
  });

  const portsList: Port[] = ports.map(p => {
    const proc = processes.find(pr => pr.pid === p.pid);
    const matchWs = proc?.cwd
      ? stored.find(sw => sw.services.some(ss => proc.cwd!.startsWith(ss.repo_path)))
      : null;
    return { id: `p-${p.port}`, port: p.port, svc: p.process_name ?? 'unknown', host: 'localhost', status: 'running' as ServiceStatus, ws: matchWs?.id ?? 'system', group: guessPortGroup(p.port) };
  });

  return { workspaces, projects: {}, activity: [], sessions: [], logSeeds: {}, ports: portsList, portEdges: [] };
}

export default function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [onboarding, setOnboarding] = React.useState<boolean | null>(null);
  const [githubUser, setGithubUser] = React.useState<GitHubUser | null>(null);

  React.useEffect(() => {
    githubAuth.loadConfig().then((cfg) => {
      if (cfg && cfg.onboarding_complete) {
        setGithubUser(cfg.github_user ?? null);
        if (cfg.appearance) {
          setTweak({
            theme: cfg.appearance.theme || TWEAK_DEFAULTS.theme,
            accent: cfg.appearance.accent || TWEAK_DEFAULTS.accent,
            density: cfg.appearance.density || TWEAK_DEFAULTS.density,
            sidebar: cfg.appearance.sidebar || TWEAK_DEFAULTS.sidebar,
          });
        }
        setOnboarding(false);
      } else {
        setOnboarding(true);
      }
    }).catch(() => setOnboarding(true));
  }, []);

  React.useEffect(() => {
    const html = document.documentElement;
    html.setAttribute("data-theme", t.theme);
    html.setAttribute("data-density", t.density);
    html.setAttribute("data-sidebar", t.sidebar);
    const a = ACCENT_MAP[t.accent] ?? ACCENT_MAP["#4a78c4"];
    html.style.setProperty("--blue", a.blue);
    html.style.setProperty("--warm", a.warm);
    html.style.setProperty("--blue-soft", a.blue.replace(")", " / 0.18)"));
    html.style.setProperty("--blue-edge", a.blue.replace(")", " / 0.45)"));
    html.style.setProperty("--warm-soft", a.warm.replace(")", " / 0.16)"));
    html.style.setProperty("--warm-edge", a.warm.replace(")", " / 0.42)"));
  }, [t.theme, t.density, t.sidebar, t.accent]);

  const [data, setData] = React.useState<HubDataShape>(EMPTY_HUB);
  const [repos, setRepos] = React.useState<Repo[]>([]);
  const [storedWorkspaces, setStoredWorkspaces] = React.useState<StoredWorkspace[]>([]);
  const liveGroupsRef = React.useRef<WorkspaceGroup[]>([]);
  const storedWsRef = React.useRef<StoredWorkspace[]>([]);
  const managedRuntimesRef = React.useRef<Record<string, ManagedRuntime>>({});
  const [view, setView] = React.useState("home");
  const [ws, setWs] = React.useState("");
  const [project, setProject] = React.useState("");
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const [workspaceRefreshKey, setWorkspaceRefreshKey] = React.useState(0);
  const [, setManagedRuntimes] = React.useState<Record<string, ManagedRuntime>>({});

  const [logs, setLogs] = React.useState<LogLine[]>([]);
  const [sources, setSources] = React.useState<Record<string, boolean>>({});
  const [logSearch, setLogSearch] = React.useState("");
  const [autoscroll, setAutoscroll] = React.useState(true);

  // Load workspace groups once, then poll live process/port data every 5s
  React.useEffect(() => {
    if (onboarding !== false) return;
    let cancelled = false;

    async function loadGroups() {
      const cfg = await githubAuth.loadConfig().catch(() => null);
      let roots = cfg?.workspace_roots ?? [];
      if (roots.length === 0) {
        roots = await tauriApi.findDefaultWorkspaceRoots().catch(() => [] as string[]);
      }

      // Load user workspaces from config
      const userWs = cfg?.user_workspaces ?? [];
      if (!cancelled) {
        storedWsRef.current = userWs;
        setStoredWorkspaces(userWs);
        if (userWs.length > 0 && !ws) setWs(userWs[0].id);
      }

      if (roots.length === 0) return;
      const groups = await tauriApi.scanWorkspaceGroups(roots).catch(() => [] as WorkspaceGroup[]);
      if (cancelled) return;
      liveGroupsRef.current = groups;
    }

    async function refreshLive() {
      const [processes, ports, managed] = await Promise.all([
        tauriApi.getProcesses().catch(() => [] as ProcessInfo[]),
        tauriApi.scanPorts().catch(() => [] as LivePort[]),
        tauriApi.listManagedServices().catch(() => [] as ManagedServiceInfo[]),
      ]);
      if (cancelled) return;
      syncManagedServiceRuntimes(managed);
      setRepos(buildRepos(liveGroupsRef.current, processes, ports));
      setData(buildHubData(storedWsRef.current, processes, ports, managedRuntimesRef.current));
    }

    loadGroups().then(refreshLive);
    const id = setInterval(refreshLive, 5000);
    return () => { cancelled = true; clearInterval(id); };
  }, [onboarding, workspaceRefreshKey]);

  const allServices = React.useMemo(
    () => data.workspaces.flatMap((w) => w.services.map((s) => ({ ...s, _ws: w.id }))),
    [data]
  );
  const runningCount = allServices.filter((s) => s.status === "running").length;
  const portsLive = data.ports.filter((p) => p.status === "running").length;
  const errorsToday = logs.filter((l) => l.kind === "error").length;
  const runningByWs = React.useMemo(() => {
    const out: Record<string, number> = {};
    data.workspaces.forEach((w) => { out[w.id] = w.services.filter((s) => s.status === "running").length; });
    return out;
  }, [data]);

  const [pulse, setPulse] = React.useState<number[]>(() => new Array(24).fill(0));
  React.useEffect(() => {
    setPulse((p) => {
      const next = p.slice();
      next[next.length - 1] = Math.min(1, (next[next.length - 1] || 0) + 0.18);
      return next;
    });
  }, [logs.length]);
  React.useEffect(() => {
    const id = setInterval(() => {
      setPulse((p) => { const next = p.slice(1); next.push(0); return next; });
    }, 1200);
    return () => clearInterval(id);
  }, []);

  React.useEffect(() => {
    const id = setInterval(() => {
      const runtimes = managedRuntimesRef.current;
      if (!Object.values(runtimes).some((runtime) => runtime.startedAt)) return;
      const now = Date.now();
      setData((d) => ({
        ...d,
        workspaces: d.workspaces.map((w) => ({
          ...w,
          services: w.services.map((s) => {
            const runtime = runtimes[s.id];
            if (!runtime?.startedAt) return s;
            return {
              ...s,
              pid: runtime.pid,
              status: runtime.status,
              uptime: Math.max(0, Math.floor((now - runtime.startedAt) / 1000)),
            };
          }),
        })),
      }));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const currentWs = data.workspaces.find((w) => w.id === ws) ?? data.workspaces[0] ?? undefined;

  function toast(msg: string, kind = "info") {
    const id = Math.random().toString(36).slice(2);
    setToasts((ts) => [...ts, { id, msg, kind }]);
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), 3200);
  }

  function updateAppearance(key: AppearanceKey, value: string) {
    setTweak(key, value);
    const nextAppearance = {
      theme: key === "theme" ? String(value) : t.theme,
      accent: key === "accent" ? String(value) : t.accent,
      density: key === "density" ? String(value) : t.density,
      sidebar: key === "sidebar" ? String(value) : t.sidebar,
    };
    githubAuth.loadConfig()
      .then((cfg) => {
        if (!cfg) return;
        return githubAuth.saveConfig({ ...cfg, appearance: nextAppearance });
      })
      .catch(() => {});
  }

  function pushLog(srcId: string, text: string, kind: string) {
    const ts = new Date().toLocaleTimeString("en-GB", { hour12: false }).slice(0, 8) + "." + String(Math.floor(Math.random() * 999)).padStart(3, "0");
    const safeKind = (kind || "info") as LogLine["kind"];
    setLogs((l) => {
      const next = l.concat({ ts, src: srcId, msg: text, kind: safeKind });
      return next.length > 600 ? next.slice(-600) : next;
    });
  }

  React.useEffect(() => {
    let unlisten: (() => void) | null = null;
    let cancelled = false;
    listenToServiceEvents((event) => {
      const kind = event.kind === "stderr" || event.kind === "error" ? "error" : event.kind === "started" ? "ok" : "info";
      pushLog(event.service_id, event.message, kind);
      if (event.kind === "started") {
        const svc = storedWsRef.current.flatMap((w) => w.services.map((s) => ({ ...s, wsId: w.id }))).find((s) => s.id === event.service_id);
        if (svc) setManagedServiceStatus(svc.wsId, event.service_id, "running", event.pid ?? null);
      }
      if (event.kind === "stopped" || event.kind === "exited" || event.kind === "error") {
        const svc = storedWsRef.current.flatMap((w) => w.services.map((s) => ({ ...s, wsId: w.id }))).find((s) => s.id === event.service_id);
        const status: ServiceStatus = event.kind === "error"
          ? "failed"
          : event.kind === "exited"
            ? event.code && event.code !== 0 ? "crashed" : "exited"
            : "stopped";
        if (svc) setManagedServiceStatus(svc.wsId, event.service_id, status, event.pid ?? null);
      }
    }).then((dispose) => {
      if (cancelled) dispose();
      else unlisten = dispose;
    });
    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, []);

  async function saveWorkspaces(next: StoredWorkspace[]) {
    storedWsRef.current = next;
    setStoredWorkspaces(next);
    const cfg = await githubAuth.loadConfig().catch(() => null);
    if (cfg) await githubAuth.saveConfig({ ...cfg, user_workspaces: next }).catch(() => {});
  }

  function createWorkspace() {
    const idx = storedWsRef.current.length;
    const newWs: StoredWorkspace = {
      id: `ws-${Date.now()}`,
      name: 'New workspace',
      color: WS_COLORS[idx % WS_COLORS.length],
      services: [],
    };
    saveWorkspaces([...storedWsRef.current, newWs]);
    setWs(newWs.id);
    setView('workspace');
  }

  function updateWorkspace(id: string, patch: Partial<Pick<StoredWorkspace, 'name' | 'color'>>) {
    saveWorkspaces(storedWsRef.current.map(w => w.id === id ? { ...w, ...patch } : w));
  }

  function deleteWorkspace(id: string) {
    const next = storedWsRef.current.filter(w => w.id !== id);
    saveWorkspaces(next);
    if (ws === id) { setWs(next[0]?.id ?? ''); setView(next.length > 0 ? 'workspace' : 'home'); }
  }

  function addServiceToWorkspace(wsId: string, svc: StoredService) {
    saveWorkspaces(storedWsRef.current.map(w => w.id === wsId ? { ...w, services: [...w.services, svc] } : w));
  }

  function removeServiceFromWorkspace(wsId: string, svcId: string) {
    saveWorkspaces(storedWsRef.current.map(w => w.id === wsId ? { ...w, services: w.services.filter(s => s.id !== svcId) } : w));
  }

  // Keep log sources in sync with detected services
  React.useEffect(() => {
    setSources(prev => {
      const next = { ...prev };
      allServices.forEach(s => { if (!(s.id in next)) next[s.id] = true; });
      return next;
    });
  }, [allServices]);

  function setServiceStatus(wsId: string, svcId: string, status: Service["status"]) {
    setData((d) => ({
      ...d,
      workspaces: d.workspaces.map((w) => w.id !== wsId ? w : {
        ...w,
        services: w.services.map((s) => s.id !== svcId ? s : {
          ...s, status,
          uptime: ["stopped", "failed", "exited", "crashed"].includes(status) ? 0 : s.uptime,
        }),
      }),
    }));
  }

  function setManagedServiceStatus(wsId: string, svcId: string, status: ServiceStatus, pid?: number | null) {
    const existing = managedRuntimesRef.current[svcId];
    const running = status === "starting" || status === "running" || status === "restarting";
    const nextRuntime: ManagedRuntime = {
      status,
      pid: pid ?? existing?.pid ?? null,
      startedAt: running ? (existing?.startedAt ?? Date.now()) : null,
    };
    managedRuntimesRef.current = { ...managedRuntimesRef.current, [svcId]: nextRuntime };
    setManagedRuntimes(managedRuntimesRef.current);
    setData((d) => ({
      ...d,
      workspaces: d.workspaces.map((w) => w.id !== wsId ? w : {
        ...w,
        services: w.services.map((s) => s.id !== svcId ? s : {
          ...s,
          status,
          pid: nextRuntime.pid,
          uptime: nextRuntime.startedAt ? Math.max(0, Math.floor((Date.now() - nextRuntime.startedAt) / 1000)) : 0,
        }),
      }),
    }));
  }

  function syncManagedServiceRuntimes(managed: ManagedServiceInfo[]) {
    if (managed.length === 0 && Object.keys(managedRuntimesRef.current).length === 0) return;
    const managedById = new Map(managed.map((service) => [service.service_id, service]));
    const next: Record<string, ManagedRuntime> = {};

    for (const [svcId, runtime] of Object.entries(managedRuntimesRef.current)) {
      const service = managedById.get(svcId);
      if (!service) {
        if (runtime.status === "starting" || runtime.status === "running") {
          next[svcId] = { ...runtime, status: "stopped", pid: runtime.pid, startedAt: null };
        } else {
          next[svcId] = runtime;
        }
        continue;
      }
      next[svcId] = {
        status: "running",
        pid: service.pid,
        startedAt: service.started_at_ms,
      };
    }

    for (const service of managed) {
      if (next[service.service_id]) continue;
      next[service.service_id] = {
        status: "running",
        pid: service.pid,
        startedAt: service.started_at_ms,
      };
    }

    managedRuntimesRef.current = next;
    setManagedRuntimes(next);
  }

  async function startService(wsId: string, svcId: string) {
    const svc = data.workspaces.find((w) => w.id === wsId)?.services.find((s) => s.id === svcId);
    if (!svc) return;
    setManagedServiceStatus(wsId, svcId, "starting");
    pushLog(svcId, `> ${svc.cmd}`, "info");
    toast(`Starting ${svc.name}`, "info");
    try {
      if (!svc.repo_path) throw new Error("Missing repo path for service.");
      await tauriApi.startService(svc.id, svc.repo_path, svc.cmd);
    } catch (err) {
      setManagedServiceStatus(wsId, svcId, "failed");
      pushLog(svcId, String(err), "error");
      toast(`Failed to start ${svc.name}`, "error");
    }
  }

  async function stopService(wsId: string, svcId: string) {
    const svc = data.workspaces.find((w) => w.id === wsId)?.services.find((s) => s.id === svcId);
    if (!svc) return;
    try {
      try {
        await tauriApi.stopManagedService(svc.id);
      } catch (err) {
        if (!svc.pid) throw err;
        await tauriApi.killProcess(svc.pid);
      }
      setManagedServiceStatus(wsId, svcId, "stopped");
      toast(`Stopped ${svc.name}`, "info");
    } catch (err) {
      pushLog(svcId, String(err), "error");
      toast(`Failed to stop ${svc.name}`, "error");
    }
  }

  async function restartService(wsId: string, svcId: string) {
    setManagedServiceStatus(wsId, svcId, "restarting");
    await stopService(wsId, svcId);
    window.setTimeout(() => startService(wsId, svcId), 400);
  }

  function startAll(wsId: string) {
    const w = data.workspaces.find((x) => x.id === wsId);
    if (!w) return;
    w.services.forEach((s, i) => {
      if (s.status !== "running") setTimeout(() => startService(wsId, s.id), i * 350);
    });
    toast(`Booting workspace ${w.name}`, "info");
  }

  function stopAll(wsId: string) {
    const w = data.workspaces.find((x) => x.id === wsId);
    if (!w) return;
    w.services.forEach((s) => {
      if (s.status === "running" || s.status === "starting" || s.status === "restarting") stopService(wsId, s.id);
    });
    toast(`Stopping workspace ${w.name}`, "warn");
  }

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      } else if (e.key === "Escape") {
        setPaletteOpen(false);
      } else if (e.key === "/" && document.activeElement === document.body) {
        e.preventDefault();
        setView("logs");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function onOpenWs(id: string) {
    if (id === "__logs__") { setView("logs"); return; }
    setWs(id);
    setView("workspace");
  }

  const activeView = (() => {
    if (view === "home") return (
      <HomeView
        data={data}
        onOpenWs={onOpenWs}
        onOpenProject={(id) => { setProject(id); setView("project"); }}
        onResumeSession={(s: Session) => { setWs(s.ws); setView("workspace"); startAll(s.ws); }}
        startWs={(id) => startAll(id)}
        stopWs={(id) => stopAll(id)}
      />
    );
    if (view === "repos") return (
      <ReposView
        repos={repos}
        workspaces={storedWorkspaces}
        onAddToWorkspace={addServiceToWorkspace}
        onCreateWorkspace={createWorkspace}
      />
    );
    if (view === "github-repos") return <GitHubReposView />;
    if (view === "workspace" && !currentWs) return (
      <WorkspaceView
        workspace={null}
        onStartSvc={startService}
        onStopSvc={stopService}
        onRestartSvc={restartService}
        onStartAll={startAll}
        onStopAll={stopAll}
        onOpenLogs={() => setView("logs")}
        onDeleteWorkspace={deleteWorkspace}
        onUpdateWorkspace={updateWorkspace}
        onRemoveService={removeServiceFromWorkspace}
        onAddService={() => setView("repos")}
        repos={repos}
        onAddToWorkspace={addServiceToWorkspace}
      />
    );
    if (view === "workspace") return (
      <WorkspaceView
        workspace={currentWs!}
        onStartSvc={startService}
        onStopSvc={stopService}
        onRestartSvc={restartService}
        onStartAll={startAll}
        onStopAll={stopAll}
        onOpenLogs={() => setView("logs")}
        onDeleteWorkspace={deleteWorkspace}
        onUpdateWorkspace={updateWorkspace}
        onRemoveService={removeServiceFromWorkspace}
        onAddService={() => setView("repos")}
        repos={repos}
        onAddToWorkspace={addServiceToWorkspace}
      />
    );
    if (view === "ports") return (
      <PortsView ports={data.ports} edges={data.portEdges} workspaces={data.workspaces} services={allServices} />
    );
    if (view === "logs") return (
      <LogsView
        workspaces={data.workspaces}
        services={allServices}
        logs={logs}
        sources={sources}
        toggleSource={(id) => setSources((s) => ({ ...s, [id]: !s[id] }))}
        search={logSearch}
        setSearch={setLogSearch}
        autoscroll={autoscroll}
        setAutoscroll={setAutoscroll}
        clearLogs={() => setLogs([])}
      />
    );
    if (view === "sessions") return (
      <SessionsView
        workspaces={data.workspaces}
        sessions={data.sessions}
        services={allServices}
        onResume={(s: Session) => { setWs(s.ws); setView("workspace"); toast(`Resumed "${s.title}"`, "ok"); }}
        onJumpToLogs={(t: number, s: Session) => { setView("logs"); toast(`Jumped to logs @ +${formatDuration(t * s.duration)}`, "info"); }}
      />
    );
    if (view === "project") {
      const proj = data.projects[project] ?? data.projects[Object.keys(data.projects)[0]];
      if (!proj) return null;
      return (
        <ProjectView
          project={proj}
          workspaces={data.workspaces}
          services={allServices}
          logs={logs}
          onBack={() => setView("workspace")}
          onRun={() => {
            const svc = allServices.find((s) => s.project === proj.id);
            if (svc) startService(svc._ws, svc.id);
          }}
          onOpenLogs={() => setView("logs")}
        />
      );
    }
    if (view === "containers") return (
      <div className="view"><div className="view-inner">
        <div className="empty">
          <Ic.Stack size={36} />
          <div style={{ marginTop: 10, fontFamily: "var(--font-mono)" }}>Containers panel</div>
          <div style={{ color: "var(--fg-4)", marginTop: 6, fontSize: 12 }}>Docker compose stacks attached to a workspace will show here.</div>
        </div>
      </div></div>
    );
    if (view === "settings") return (
      <SettingsView
        githubUser={githubUser}
        setGithubUser={setGithubUser}
        repos={repos}
        storedWorkspaces={storedWorkspaces}
        tweaks={t}
        setTweak={(key, value) => updateAppearance(key as AppearanceKey, String(value))}
        onConfigChanged={() => setWorkspaceRefreshKey((key) => key + 1)}
        onCreateWorkspace={createWorkspace}
        onUpdateWorkspace={updateWorkspace}
        onDeleteWorkspace={deleteWorkspace}
        onOpenRepos={() => setView("repos")}
      />
    );
    return null;
  })();

  if (onboarding === null) {
    return <div className="app-shell" />;
  }

  if (onboarding) {
    return (
      <div className="app-shell" style={{ flexDirection: 'column' }}>
        <TitleBar
          runningCount={0}
          totalServices={0}
          portsLive={0}
          errorsToday={0}
          currentWs={undefined}
          view="onboarding"
          onOpenPalette={() => {}}
          onToggleSidebar={() => {}}
          pulse={[]}
        />
        <OnboardingView onComplete={(user, roots) => {
          setGithubUser(user);
          setOnboarding(false);
          tauriApi.scanWorkspaceGroups(roots).then((groups) => {
            liveGroupsRef.current = groups;
          }).catch(() => {});
        }} />
      </div>
    );
  }

  return (
    <div className="app-shell">
      <TitleBar
        runningCount={runningCount}
        totalServices={allServices.length}
        portsLive={portsLive}
        errorsToday={errorsToday}
        currentWs={currentWs}
        view={view}
        onOpenPalette={() => setPaletteOpen(true)}
        onToggleSidebar={() => updateAppearance("sidebar", t.sidebar === "collapsed" ? "labeled" : t.sidebar === "labeled" ? "wide" : "collapsed")}
        pulse={pulse}
      />
      <div className="app-body">
        <Sidebar
          view={view}
          setView={setView}
          ws={ws}
          setWs={setWs}
          workspaces={data.workspaces}
          runningByWs={runningByWs}
          onCreateWorkspace={createWorkspace}
        />
        <div className="main-pane">{activeView}</div>
      </div>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        data={data}
        onRunScript={(wsId, svcId) => startService(wsId, svcId)}
        onSwitchWs={(id) => { setWs(id); setView("workspace"); }}
        onOpenView={(v) => setView(v)}
        onOpenProject={(id) => { setProject(id); setView("project"); }}
      />

      <TweaksPanel title="Tweaks" noDeckControls={true}>
        <TweakSection label="Theme">
          <TweakRadio
            label="Surface"
            value={t.theme}
            options={[
              { value: "charcoal", label: "Charcoal" },
              { value: "midnight", label: "Midnight" },
              { value: "espresso", label: "Espresso" },
            ]}
            onChange={(v) => updateAppearance("theme", v)}
          />
          <TweakColor
            label="Accent"
            value={t.accent}
            options={["#4a78c4", "#d9854f", "#8a78ec", "#54a892"]}
            onChange={(v) => updateAppearance("accent", v)}
          />
        </TweakSection>
        <TweakSection label="Layout">
          <TweakRadio
            label="Density"
            value={t.density}
            options={[
              { value: "breathable", label: "Air" },
              { value: "balanced",   label: "Default" },
              { value: "dense",      label: "Compact" },
            ]}
            onChange={(v) => updateAppearance("density", v)}
          />
          <TweakRadio
            label="Sidebar"
            value={t.sidebar}
            options={[
              { value: "collapsed", label: "Icons" },
              { value: "labeled",   label: "Default" },
              { value: "wide",      label: "Wide" },
            ]}
            onChange={(v) => updateAppearance("sidebar", v)}
          />
        </TweakSection>
        <TweakSection label="Try it">
          <TweakButton label="Boot Fattern workspace" onClick={() => { setView("workspace"); setWs("fattern"); startAll("fattern"); }} />
          <TweakButton label="Open Command Palette (⌘K)" onClick={() => setPaletteOpen(true)} secondary />
          <TweakButton label="Stop everything" onClick={() => data.workspaces.forEach((w) => stopAll(w.id))} secondary />
        </TweakSection>
      </TweaksPanel>

      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={"toast " + (t.kind || "")}>{t.msg}</div>
        ))}
      </div>
    </div>
  );
}
