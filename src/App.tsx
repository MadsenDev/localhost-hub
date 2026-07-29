import React from 'react';
import type { EnvProfile, HubDataShape, Service, Session, LogLine, Workspace, Port, ServiceStatus, Repo, Script, StoredWorkspace, StoredService, GitStatus } from './types';
import { useTweaks, TweaksPanel, TweakSection, TweakRadio, TweakColor, TweakButton } from './tweaks-panel';
import { TitleBar } from './chrome';
import { Sidebar } from './sidebar';
import { HomeView } from './view-home';
import { WorkspaceView } from './view-workspace';
import { ReposView } from './view-repos';
import { GitHubReposView } from './view-github-repos';
import { HealthView } from './view-health';
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
import { CreateProjectDialog } from './create-project-dialog';
import {
  buildProjectRuntimeServices,
  directProjectServiceId,
  DIRECT_PROJECT_WORKSPACE,
  EXTERNAL_PROCESS_WORKSPACE,
} from './project-runtime';
import { normalizeProjectProfiles, resolveEnvProfile, toServiceEnvironment } from './env-profiles';

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
interface ManagedRuntime {
  status: ServiceStatus;
  pid: number | null;
  startedAt: number | null;
  ports: number[];
  urls: string[];
  cpu: number;
  memoryMb: number;
}
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
function buildRepos(
  groups: WorkspaceGroup[],
  processes: ProcessInfo[],
  ports: LivePort[],
  gitStatuses: Record<string, GitStatus | null>,
): Repo[] {
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
      git_status: gitStatuses[proj.git_root ?? proj.path] ?? null,
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
    const services: Service[] = sw.services.map((ss, index) => {
      const managedRuntime = managedRuntimes[ss.id];
      const proc = managedRuntime?.pid
        ? processes.find(p => p.pid === managedRuntime.pid)
        : processes.find(p => p.cwd && (p.cwd === ss.repo_path || p.cwd.startsWith(ss.repo_path + '/')));
      const port = managedRuntime?.ports[0] ?? (proc ? (pidToPort[proc.pid] ?? null) : null);
      const url = managedRuntime?.urls[0] ?? (port ? `http://localhost:${port}` : null);
      const startedAt = managedRuntime?.startedAt ?? null;
      return {
        id: ss.id,
        project: ss.id,
        name: ss.name,
        cmd: ss.cmd,
        repo_path: ss.repo_path,
        port,
        url,
        status: managedRuntime?.status ?? ((proc ? 'running' : 'stopped') as ServiceStatus),
        uptime: startedAt ? Math.max(0, Math.floor((Date.now() - startedAt) / 1000)) : 0,
        pid: managedRuntime?.pid ?? proc?.pid ?? null,
        pkg: '',
        cpu: managedRuntime?.cpu ?? proc?.cpu_usage ?? 0,
        mem: managedRuntime?.memoryMb ?? (proc ? Math.round(proc.memory_kb / 1024) : 0),
        framework: '',
        run_mode: ss.run_mode ?? 'parallel',
        order: ss.order ?? index,
        env_profile_id: ss.env_profile_id ?? null,
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

  const portsByNumber = new Map<number, Port>();
  ports.forEach(p => {
    const proc = processes.find(pr => pr.pid === p.pid);
    const matchWs = proc?.cwd
      ? stored.find(sw => sw.services.some(ss => proc.cwd!.startsWith(ss.repo_path)))
      : null;
    portsByNumber.set(p.port, {
      id: `p-${p.port}`,
      port: p.port,
      svc: p.process_name ?? 'unknown',
      host: p.bind_address || 'localhost',
      url: p.url || `http://localhost:${p.port}`,
      status: 'running' as ServiceStatus,
      ws: matchWs?.id ?? 'system',
      group: guessPortGroup(p.port),
    });
  });
  stored.forEach(workspace => {
    workspace.services.forEach(service => {
      const runtime = managedRuntimes[service.id];
      runtime?.ports.forEach(port => {
        const url = runtime.urls.find(candidate => candidate.includes(`:${port}`))
          ?? `http://localhost:${port}`;
        portsByNumber.set(port, {
          id: `p-${port}`,
          port,
          svc: service.id,
          host: 'localhost',
          url,
          status: runtime.status,
          ws: workspace.id,
          group: guessPortGroup(port),
        });
      });
    });
  });
  const portsList = [...portsByNumber.values()].sort((a, b) => a.port - b.port);

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
  const [envProfiles, setEnvProfiles] = React.useState<EnvProfile[]>([]);
  const liveGroupsRef = React.useRef<WorkspaceGroup[]>([]);
  const storedWsRef = React.useRef<StoredWorkspace[]>([]);
  const envProfilesRef = React.useRef<EnvProfile[]>([]);
  const managedRuntimesRef = React.useRef<Record<string, ManagedRuntime>>({});
  const liveProcessesRef = React.useRef<ProcessInfo[]>([]);
  const livePortsRef = React.useRef<LivePort[]>([]);
  const gitStatusesRef = React.useRef<Record<string, GitStatus | null>>({});
  const [view, setView] = React.useState("home");
  const [ws, setWs] = React.useState("");
  const [project, setProject] = React.useState("");
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [createProjectOpen, setCreateProjectOpen] = React.useState(false);
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const [workspaceRefreshKey, setWorkspaceRefreshKey] = React.useState(0);
  const [, setManagedRuntimes] = React.useState<Record<string, ManagedRuntime>>({});
  const [managedServices, setManagedServices] = React.useState<ManagedServiceInfo[]>([]);
  const [liveProcesses, setLiveProcesses] = React.useState<ProcessInfo[]>([]);
  const [livePorts, setLivePorts] = React.useState<LivePort[]>([]);

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
        const profiles = cfg?.env_profiles ?? [];
        envProfilesRef.current = profiles;
        setEnvProfiles(profiles);
        if (userWs.length > 0 && !ws) setWs(userWs[0].id);
      }

      if (roots.length === 0) return;
      const groups = await tauriApi.scanWorkspaceGroups(roots).catch(() => [] as WorkspaceGroup[]);
      if (cancelled) return;
      liveGroupsRef.current = groups;
      await refreshGitStatuses();
    }

    async function refreshGitStatuses() {
      const paths = [...new Set(
        liveGroupsRef.current
          .flatMap(group => group.projects)
          .filter(project => project.has_git)
          .map(project => project.git_root ?? project.path)
      )];
      const entries = await Promise.all(
        paths.map(async path => [
          path,
          await tauriApi.getGitStatus(path).catch(() => null),
        ] as const)
      );
      if (cancelled) return;
      gitStatusesRef.current = Object.fromEntries(entries);
      setRepos(buildRepos(
        liveGroupsRef.current,
        liveProcessesRef.current,
        livePortsRef.current,
        gitStatusesRef.current,
      ));
    }

    async function refreshLive() {
      const [processes, ports, managed] = await Promise.all([
        tauriApi.getProcesses().catch(() => [] as ProcessInfo[]),
        tauriApi.scanPorts().catch(() => [] as LivePort[]),
        tauriApi.listManagedServices().catch(() => [] as ManagedServiceInfo[]),
      ]);
      if (cancelled) return;
      liveProcessesRef.current = processes;
      livePortsRef.current = ports;
      setLiveProcesses(processes);
      setLivePorts(ports);
      setManagedServices(managed);
      syncManagedServiceRuntimes(managed);
      setRepos(buildRepos(liveGroupsRef.current, processes, ports, gitStatusesRef.current));
      setData(buildHubData(storedWsRef.current, processes, ports, managedRuntimesRef.current));
    }

    loadGroups().then(refreshLive);
    const liveId = setInterval(refreshLive, 5000);
    const gitId = setInterval(refreshGitStatuses, 15000);
    return () => {
      cancelled = true;
      clearInterval(liveId);
      clearInterval(gitId);
    };
  }, [onboarding, workspaceRefreshKey]);

  const workspaceServices = React.useMemo(
    () => data.workspaces.flatMap((w) => w.services.map((s) => ({ ...s, _ws: w.id }))),
    [data]
  );
  const projectRuntimeServices = React.useMemo(
    () => buildProjectRuntimeServices(repos, workspaceServices, managedServices, liveProcesses, livePorts),
    [repos, workspaceServices, managedServices, liveProcesses, livePorts],
  );
  const allServices = React.useMemo(
    () => [...workspaceServices, ...projectRuntimeServices],
    [workspaceServices, projectRuntimeServices],
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

  async function refreshRepoGitStatus(path: string) {
    const status = await tauriApi.getGitStatus(path);
    gitStatusesRef.current = { ...gitStatusesRef.current, [path]: status };
    setRepos(buildRepos(
      liveGroupsRef.current,
      liveProcessesRef.current,
      livePortsRef.current,
      gitStatusesRef.current,
    ));
  }

  async function handleProjectCreated(
    result: import('./tauri-api').CreateProjectResult,
    parentDirectory: string,
  ) {
    const cfg = await githubAuth.loadConfig().catch(() => null);
    if (cfg && !cfg.workspace_roots.includes(parentDirectory)) {
      await githubAuth.saveConfig({
        ...cfg,
        workspace_roots: [...cfg.workspace_roots, parentDirectory],
      });
    }
    setWorkspaceRefreshKey(key => key + 1);
    setView('repos');
    if (result.warnings.length > 0) {
      result.warnings.forEach(warning => toast(warning, 'warn'));
    } else {
      toast(`Created ${result.path}`, 'ok');
    }
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
      if (event.kind !== "url") pushLog(event.service_id, event.message, kind);
      if (event.kind === "starting" || event.kind === "restarting") {
        const svc = storedWsRef.current.flatMap((w) => w.services.map((s) => ({ ...s, wsId: w.id }))).find((s) => s.id === event.service_id);
        setManagedServiceStatus(svc?.wsId ?? DIRECT_PROJECT_WORKSPACE, event.service_id, event.kind, event.pid ?? null);
      }
      if (event.kind === "started") {
        const svc = storedWsRef.current.flatMap((w) => w.services.map((s) => ({ ...s, wsId: w.id }))).find((s) => s.id === event.service_id);
        setManagedServiceStatus(svc?.wsId ?? DIRECT_PROJECT_WORKSPACE, event.service_id, "running", event.pid ?? null);
      }
      if (event.kind === "url") {
        const svc = storedWsRef.current.flatMap((w) => w.services.map((s) => ({ ...s, wsId: w.id }))).find((s) => s.id === event.service_id);
        if (svc) setManagedServiceUrl(svc.wsId, event.service_id, event.message);
      }
      if (event.kind === "stopped" || event.kind === "exited" || event.kind === "error") {
        const svc = storedWsRef.current.flatMap((w) => w.services.map((s) => ({ ...s, wsId: w.id }))).find((s) => s.id === event.service_id);
        const status: ServiceStatus = event.kind === "error"
          ? "failed"
          : event.kind === "exited"
            ? event.code && event.code !== 0 ? "crashed" : "exited"
            : "stopped";
        setManagedServiceStatus(svc?.wsId ?? DIRECT_PROJECT_WORKSPACE, event.service_id, status, event.pid ?? null);
        if (!svc) {
          setManagedServices(current => current.filter(service => service.service_id !== event.service_id));
        }
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

  async function saveProjectEnvProfiles(projectPath: string, profiles: EnvProfile[]) {
    const next = normalizeProjectProfiles(envProfilesRef.current, projectPath, profiles);
    const cfg = await githubAuth.loadConfig().catch(() => null);
    if (cfg) {
      await githubAuth.saveConfig({ ...cfg, env_profiles: next });
    }
    envProfilesRef.current = next;
    setEnvProfiles(next);
    toast(`Saved environment profiles`, "ok");
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

  async function deleteWorkspace(id: string) {
    const liveWorkspace = data.workspaces.find((workspace) => workspace.id === id);
    if (liveWorkspace?.services.length) {
      try {
        const result = await tauriApi.stopWorkspace(
          id,
          liveWorkspace.services.map((service) => ({
            service_id: service.id,
            pid: service.pid ?? null,
          })),
        );
        if (result.failed.length > 0) {
          result.failed.forEach(({ service_id, error }) => pushLog(service_id, error, "error"));
          toast(`Could not stop every service in ${liveWorkspace.name}`, "error");
          return;
        }
      } catch (error) {
        pushLog(id, String(error), "error");
        toast(`Could not stop ${liveWorkspace.name}`, "error");
        return;
      }
    }
    const next = storedWsRef.current.filter(w => w.id !== id);
    await saveWorkspaces(next);
    if (ws === id) { setWs(next[0]?.id ?? ''); setView(next.length > 0 ? 'workspace' : 'home'); }
  }

  function addServiceToWorkspace(wsId: string, svc: StoredService) {
    saveWorkspaces(storedWsRef.current.map(w => w.id === wsId ? {
      ...w,
      services: [...w.services, {
        ...svc,
        run_mode: svc.run_mode ?? 'parallel',
        order: svc.order ?? w.services.length,
      }],
    } : w));
  }

  async function removeServiceFromWorkspace(wsId: string, svcId: string) {
    const service = data.workspaces
      .find((workspace) => workspace.id === wsId)
      ?.services.find((item) => item.id === svcId);
    if (service && service.status !== "stopped") {
      try {
        const result = await tauriApi.stopWorkspace(wsId, [{
          service_id: service.id,
          pid: service.pid ?? null,
        }]);
        if (result.failed.length > 0) {
          pushLog(svcId, result.failed[0].error, "error");
          toast(`Could not stop ${service.name}`, "error");
          return;
        }
      } catch (error) {
        pushLog(svcId, String(error), "error");
        toast(`Could not stop ${service.name}`, "error");
        return;
      }
    }
    await saveWorkspaces(storedWsRef.current.map(w => w.id === wsId ? { ...w, services: w.services.filter(s => s.id !== svcId) } : w));
  }

  function updateWorkspaceService(
    wsId: string,
    svcId: string,
    patch: Partial<Pick<StoredService, 'run_mode' | 'order' | 'env_profile_id'>>,
  ) {
    saveWorkspaces(storedWsRef.current.map(w => w.id === wsId ? {
      ...w,
      services: w.services.map(service => service.id === svcId ? { ...service, ...patch } : service),
    } : w));
  }

  // Keep log sources in sync with detected services
  React.useEffect(() => {
    setSources(prev => {
      const next = { ...prev };
      allServices.forEach(s => { if (!(s.id in next)) next[s.id] = true; });
      return next;
    });
  }, [allServices]);

  function setManagedServiceStatus(wsId: string, svcId: string, status: ServiceStatus, pid?: number | null) {
    const existing = managedRuntimesRef.current[svcId];
    const running = status === "starting" || status === "running" || status === "restarting";
    const nextRuntime: ManagedRuntime = {
      status,
      pid: running ? (pid ?? existing?.pid ?? null) : null,
      startedAt: running ? (existing?.startedAt ?? Date.now()) : null,
      ports: running ? (existing?.ports ?? []) : [],
      urls: running ? (existing?.urls ?? []) : [],
      cpu: running ? (existing?.cpu ?? 0) : 0,
      memoryMb: running ? (existing?.memoryMb ?? 0) : 0,
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

  function setManagedServiceUrl(wsId: string, svcId: string, url: string) {
    const existing = managedRuntimesRef.current[svcId];
    if (!existing) return;
    let port: number | null = null;
    try {
      const parsed = new URL(url);
      port = parsed.port ? Number(parsed.port) : null;
    } catch {
      return;
    }
    const nextRuntime: ManagedRuntime = {
      ...existing,
      urls: existing.urls.includes(url) ? existing.urls : [...existing.urls, url],
      ports: port && !existing.ports.includes(port) ? [...existing.ports, port] : existing.ports,
    };
    managedRuntimesRef.current = { ...managedRuntimesRef.current, [svcId]: nextRuntime };
    setManagedRuntimes(managedRuntimesRef.current);
    setData(current => ({
      ...current,
      workspaces: current.workspaces.map(workspace => workspace.id !== wsId ? workspace : {
        ...workspace,
        services: workspace.services.map(service => service.id !== svcId ? service : {
          ...service,
          url,
          port,
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
        if (runtime.status === "starting" || runtime.status === "running" || runtime.status === "restarting") {
          next[svcId] = {
            ...runtime,
            status: "stopped",
            pid: null,
            startedAt: null,
            ports: [],
            urls: [],
            cpu: 0,
            memoryMb: 0,
          };
        } else {
          next[svcId] = runtime;
        }
        continue;
      }
      next[svcId] = {
        status: "running",
        pid: service.pid,
        startedAt: service.started_at_ms,
        ports: service.ports,
        urls: service.urls,
        cpu: service.cpu_usage,
        memoryMb: service.memory_mb,
      };
    }

    for (const service of managed) {
      if (next[service.service_id]) continue;
      next[service.service_id] = {
        status: "running",
        pid: service.pid,
        startedAt: service.started_at_ms,
        ports: service.ports,
        urls: service.urls,
        cpu: service.cpu_usage,
        memoryMb: service.memory_mb,
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
      const profile = resolveEnvProfile(envProfilesRef.current, svc.repo_path, svc.env_profile_id);
      await tauriApi.startService(svc.id, svc.repo_path, svc.cmd, toServiceEnvironment(profile));
    } catch (err) {
      setManagedServiceStatus(wsId, svcId, "failed");
      pushLog(svcId, String(err), "error");
      toast(`Failed to start ${svc.name}`, "error");
    }
  }

  async function startProjectScript(project: Repo, script: Script, configuredService?: Service) {
    configuredService ??= allServices.find(service =>
      service.repo_path === project.path
      && (service.cmd === script.cmd || service.name === script.name)
    );
    if (configuredService?._ws && configuredService._ws !== DIRECT_PROJECT_WORKSPACE && configuredService._ws !== EXTERNAL_PROCESS_WORKSPACE) {
      await startService(configuredService._ws, configuredService.id);
      return;
    }
    if (configuredService?.status === "running") {
      toast(`${project.name} · ${script.name} is already running`, "info");
      return;
    }
    const serviceId = directProjectServiceId(project, script);
    setManagedServiceStatus(DIRECT_PROJECT_WORKSPACE, serviceId, "starting");
    pushLog(serviceId, `> ${script.cmd}`, "info");
    toast(`Starting ${project.name} · ${script.name}`, "info");
    try {
      const profile = resolveEnvProfile(envProfilesRef.current, project.path);
      const pid = await tauriApi.startService(
        serviceId,
        project.path,
        script.cmd,
        toServiceEnvironment(profile),
      );
      const startedAt = Date.now();
      setManagedServiceStatus(DIRECT_PROJECT_WORKSPACE, serviceId, "running", pid);
      setManagedServices(current => [
        ...current.filter(service => service.service_id !== serviceId),
        {
          service_id: serviceId,
          cwd: project.path,
          cmd: script.cmd,
          pid,
          started_at_ms: startedAt,
          uptime_ms: 0,
          cpu_usage: 0,
          memory_mb: 0,
          ports: [],
          urls: [],
        },
      ]);
    } catch (error) {
      setManagedServiceStatus(DIRECT_PROJECT_WORKSPACE, serviceId, "failed");
      pushLog(serviceId, String(error), "error");
      toast(`Failed to start ${project.name} · ${script.name}`, "error");
    }
  }

  async function stopProjectService(service: Service) {
    if (service._ws !== DIRECT_PROJECT_WORKSPACE && service._ws !== EXTERNAL_PROCESS_WORKSPACE) {
      if (service._ws) await stopService(service._ws, service.id);
      return;
    }
    try {
      if (service._ws === EXTERNAL_PROCESS_WORKSPACE) {
        if (!service.pid) throw new Error("The external process no longer has a PID.");
        await tauriApi.killProcess(service.pid);
        setLiveProcesses(current => current.filter(process => process.pid !== service.pid));
      } else {
        await tauriApi.stopManagedService(service.id);
        setManagedServices(current => current.filter(item => item.service_id !== service.id));
        setManagedServiceStatus(DIRECT_PROJECT_WORKSPACE, service.id, "stopped");
      }
      toast(`Stopped ${service.name}`, "info");
    } catch (error) {
      pushLog(service.id, String(error), "error");
      toast(`Failed to stop ${service.name}`, "error");
    }
  }

  async function restartProjectService(service: Service) {
    if (service._ws !== DIRECT_PROJECT_WORKSPACE) {
      if (service._ws && service._ws !== EXTERNAL_PROCESS_WORKSPACE) {
        await restartService(service._ws, service.id);
      }
      return;
    }
    setManagedServiceStatus(DIRECT_PROJECT_WORKSPACE, service.id, "restarting");
    toast(`Restarting ${service.name}`, "info");
    try {
      const pid = await tauriApi.restartManagedService(service.id);
      setManagedServiceStatus(DIRECT_PROJECT_WORKSPACE, service.id, "running", pid);
      setManagedServices(current => current.map(item =>
        item.service_id === service.id
          ? { ...item, pid, started_at_ms: Date.now(), uptime_ms: 0 }
          : item
      ));
    } catch (error) {
      setManagedServiceStatus(DIRECT_PROJECT_WORKSPACE, service.id, "failed");
      pushLog(service.id, String(error), "error");
      toast(`Failed to restart ${service.name}`, "error");
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
    const svc = data.workspaces.find((w) => w.id === wsId)?.services.find((s) => s.id === svcId);
    if (!svc) return;
    setManagedServiceStatus(wsId, svcId, "restarting");
    toast(`Restarting ${svc.name}`, "info");
    try {
      await tauriApi.restartManagedService(svc.id);
    } catch (err) {
      setManagedServiceStatus(wsId, svcId, "failed");
      pushLog(svcId, String(err), "error");
      toast(`Failed to restart ${svc.name}`, "error");
    }
  }

  async function startAll(wsId: string) {
    const stored = storedWsRef.current.find((workspace) => workspace.id === wsId);
    const live = data.workspaces.find((workspace) => workspace.id === wsId);
    if (!stored || !live || stored.services.length === 0) return;

    live.services.forEach((service) => {
      if (service.status !== "running") {
        setManagedServiceStatus(wsId, service.id, "starting");
      }
    });
    toast(`Booting workspace ${stored.name}`, "info");

    try {
      const result = await tauriApi.startWorkspace(
        wsId,
        stored.services.map((service, index) => ({
          service_id: service.id,
          cwd: service.repo_path,
          cmd: service.cmd,
          run_mode: service.run_mode ?? "parallel",
          order: service.order ?? index,
          environment: toServiceEnvironment(resolveEnvProfile(
            envProfilesRef.current,
            service.repo_path,
            service.env_profile_id,
          )),
        })),
      );
      result.started.forEach((serviceId) => {
        setManagedServiceStatus(wsId, serviceId, "running");
      });
      result.already_running.forEach((serviceId) => {
        const service = live.services.find((item) => item.id === serviceId);
        setManagedServiceStatus(wsId, serviceId, "running", service?.pid ?? null);
      });
      result.failed.forEach(({ service_id, error }) => {
        setManagedServiceStatus(wsId, service_id, "failed");
        pushLog(service_id, error, "error");
      });
      if (result.failed.length > 0) {
        toast(`${result.failed.length} service${result.failed.length === 1 ? '' : 's'} failed to start`, "error");
      }
    } catch (error) {
      live.services.forEach((service) => {
        if (service.status !== "running") setManagedServiceStatus(wsId, service.id, "failed");
      });
      pushLog(wsId, String(error), "error");
      toast(`Failed to boot ${stored.name}`, "error");
    }
  }

  async function stopAll(wsId: string) {
    const w = data.workspaces.find((x) => x.id === wsId);
    if (!w || w.services.length === 0) return;
    toast(`Stopping workspace ${w.name}`, "warn");
    try {
      const result = await tauriApi.stopWorkspace(
        wsId,
        w.services.map((service) => ({
          service_id: service.id,
          pid: service.pid ?? null,
        })),
      );
      [...result.stopped, ...result.not_running].forEach((serviceId) => {
        setManagedServiceStatus(wsId, serviceId, "stopped");
      });
      result.failed.forEach(({ service_id, error }) => {
        pushLog(service_id, error, "error");
      });
      if (result.failed.length > 0) {
        toast(`${result.failed.length} service${result.failed.length === 1 ? '' : 's'} failed to stop`, "error");
      }
    } catch (error) {
      pushLog(wsId, String(error), "error");
      toast(`Failed to stop ${w.name}`, "error");
    }
  }

  function openLogsForSources(serviceIds: string[]) {
    const selected = new Set(serviceIds);
    setSources(Object.fromEntries(allServices.map((service) => [service.id, selected.has(service.id)])));
    setView("logs");
  }

  function openWorkspaceLogs(wsId: string) {
    const workspace = data.workspaces.find((item) => item.id === wsId);
    openLogsForSources(workspace?.services.map((service) => service.id) ?? []);
  }

  async function openLocalUrl(url: string) {
    try {
      await tauriApi.openUrl(url);
    } catch (error) {
      pushLog("system", String(error), "error");
      toast("Could not open the local URL", "error");
    }
  }

  async function openProjectInEditor(path: string) {
    try {
      await tauriApi.openInEditor(path);
    } catch (error) {
      pushLog("system", String(error), "error");
      toast("Could not open the project in your editor", "error");
    }
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
        projects={repos}
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
        onCreateProject={() => setCreateProjectOpen(true)}
        onGitChanged={refreshRepoGitStatus}
        onOpenProject={(id) => { setProject(id); setView("project"); }}
        onRunScript={(repo, script) => void startProjectScript(repo, script)}
      />
    );
    if (view === "github-repos") return <GitHubReposView />;
    if (view === "health") return <HealthView repos={repos} />;
    if (view === "workspace" && !currentWs) return (
      <WorkspaceView
        workspace={null}
        onStartSvc={startService}
        onStopSvc={stopService}
        onRestartSvc={restartService}
        onStartAll={startAll}
        onStopAll={stopAll}
        onOpenLogs={(serviceId) => openLogsForSources([serviceId])}
        onOpenWorkspaceLogs={openWorkspaceLogs}
        onOpenUrl={openLocalUrl}
        onDeleteWorkspace={deleteWorkspace}
        onUpdateWorkspace={updateWorkspace}
        onRemoveService={removeServiceFromWorkspace}
        onUpdateService={updateWorkspaceService}
        onAddService={() => setView("repos")}
        repos={repos}
        envProfiles={envProfiles}
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
        onOpenLogs={(serviceId) => openLogsForSources([serviceId])}
        onOpenWorkspaceLogs={openWorkspaceLogs}
        onOpenUrl={openLocalUrl}
        onDeleteWorkspace={deleteWorkspace}
        onUpdateWorkspace={updateWorkspace}
        onRemoveService={removeServiceFromWorkspace}
        onUpdateService={updateWorkspaceService}
        onAddService={() => setView("repos")}
        repos={repos}
        envProfiles={envProfiles}
        onAddToWorkspace={addServiceToWorkspace}
      />
    );
    if (view === "ports") return (
      <PortsView
        ports={data.ports}
        edges={data.portEdges}
        workspaces={data.workspaces}
        services={allServices}
        onOpenUrl={openLocalUrl}
      />
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
      const proj = repos.find((repo) => repo.id === project) ?? repos[0];
      if (!proj) return null;
      return (
        <ProjectView
          project={proj}
          services={allServices}
          ports={data.ports}
          logs={logs}
          onBack={() => setView("repos")}
          onStartScript={startProjectScript}
          onStopService={stopProjectService}
          onRestartService={restartProjectService}
          onOpenLogs={openLogsForSources}
          onOpenUrl={openLocalUrl}
          onOpenEditor={openProjectInEditor}
          onConfigureScripts={() => setView("repos")}
          onManageGit={() => setView("repos")}
          envProfiles={envProfiles.filter(profile => profile.project_path === proj.path)}
          onSaveEnvProfiles={saveProjectEnvProfiles}
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
        projects={repos}
        onRunScript={(wsId, svcId) => startService(wsId, svcId)}
        onRunProjectScript={(repo, script) => void startProjectScript(repo, script)}
        onSwitchWs={(id) => { setWs(id); setView("workspace"); }}
        onOpenView={(v) => setView(v)}
        onOpenProject={(id) => { setProject(id); setView("project"); }}
        onOpenUrl={openLocalUrl}
      />
      <CreateProjectDialog
        open={createProjectOpen}
        onClose={() => setCreateProjectOpen(false)}
        onCreated={handleProjectCreated}
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
