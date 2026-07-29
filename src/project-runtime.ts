import type { Repo, Script, Service } from './types';
import type { LivePort, ManagedServiceInfo, ProcessInfo } from './tauri-api';

export const DIRECT_PROJECT_WORKSPACE = '__project__';
export const EXTERNAL_PROCESS_WORKSPACE = '__external__';

function normalizedPath(path: string) {
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '');
  return /^[a-z]:\//i.test(normalized) ? normalized.toLowerCase() : normalized;
}

function pathContains(parent: string, child: string) {
  const normalizedParent = normalizedPath(parent);
  const normalizedChild = normalizedPath(child);
  return normalizedChild === normalizedParent || normalizedChild.startsWith(`${normalizedParent}/`);
}

function repoForPath(repos: Repo[], path: string | null) {
  if (!path) return null;
  const direct = repos
    .filter(repo => pathContains(repo.path, path))
    .sort((left, right) => normalizedPath(right.path).length - normalizedPath(left.path).length);
  if (direct.length > 0) return direct[0];
  return repos.find(repo => repo.git_root && pathContains(repo.git_root, path)) ?? null;
}

function scriptForCommand(repo: Repo, command: string) {
  const normalized = command.toLowerCase();
  return repo.scripts.find(script =>
    normalized === script.cmd.toLowerCase()
    || normalized.includes(script.cmd.toLowerCase())
  ) ?? null;
}

export function directProjectServiceId(project: Repo, script: Script) {
  return `project::${project.id}::${script.name}`;
}

export function buildProjectRuntimeServices(
  repos: Repo[],
  workspaceServices: Service[],
  managedServices: ManagedServiceInfo[],
  processes: ProcessInfo[],
  ports: LivePort[],
): Service[] {
  const claimedIds = new Set(workspaceServices.map(service => service.id));
  const claimedPids = new Set(
    workspaceServices.map(service => service.pid).filter((pid): pid is number => pid != null)
  );
  const managedPids = new Set(managedServices.map(service => service.pid));
  const portByPid = new Map(
    ports.filter(port => port.pid != null).map(port => [port.pid as number, port])
  );

  const direct = managedServices.flatMap((managed): Service[] => {
    if (claimedIds.has(managed.service_id)) return [];
    const repo = repoForPath(repos, managed.cwd);
    if (!repo) return [];
    const script = scriptForCommand(repo, managed.cmd);
    return [{
      id: managed.service_id,
      project: repo.id,
      name: script?.name ?? managed.service_id.split('::').slice(-1)[0] ?? 'service',
      cmd: managed.cmd,
      repo_path: managed.cwd,
      port: managed.ports[0] ?? null,
      url: managed.urls[0] ?? null,
      status: 'running',
      uptime: Math.floor(managed.uptime_ms / 1000),
      pid: managed.pid,
      pkg: repo.package_manager,
      cpu: managed.cpu_usage,
      mem: managed.memory_mb,
      framework: repo.framework,
      _ws: DIRECT_PROJECT_WORKSPACE,
    }];
  });

  const unclaimed = processes.filter(process =>
    !claimedPids.has(process.pid)
    && !managedPids.has(process.pid)
    && repoForPath(repos, process.cwd) != null
  );
  const reposWithPortProcesses = new Set(
    unclaimed
      .filter(process => portByPid.has(process.pid))
      .map(process => repoForPath(repos, process.cwd)?.id)
      .filter((id): id is string => Boolean(id))
  );
  const fallbackSeen = new Set<string>();

  const external = unclaimed.flatMap((process): Service[] => {
    const repo = repoForPath(repos, process.cwd);
    if (!repo) return [];
    const port = portByPid.get(process.pid);
    if (!port && reposWithPortProcesses.has(repo.id)) return [];
    if (!port) {
      if (fallbackSeen.has(repo.id)) return [];
      fallbackSeen.add(repo.id);
    }
    const command = process.cmd.join(' ').trim() || process.name;
    const script = scriptForCommand(repo, command);
    return [{
      id: `external::${process.pid}`,
      project: repo.id,
      name: script?.name ?? process.name,
      cmd: command,
      repo_path: process.cwd ?? repo.path,
      port: port?.port ?? null,
      url: port?.url ?? null,
      status: 'running',
      uptime: 0,
      pid: process.pid,
      pkg: repo.package_manager,
      cpu: process.cpu_usage,
      mem: Math.round(process.memory_kb / 1024),
      framework: repo.framework,
      _ws: EXTERNAL_PROCESS_WORKSPACE,
    }];
  });

  return [...direct, ...external];
}
