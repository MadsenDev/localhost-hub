import { describe, expect, it } from 'vitest';
import { buildProjectRuntimeServices, directProjectServiceId } from '../project-runtime';
import type { Repo, Script, Service } from '../types';
import type { LivePort, ManagedServiceInfo, ProcessInfo } from '../tauri-api';

const script: Script = { name: 'dev', cmd: 'npm run dev' };
const repo: Repo = {
  id: 'repo::/code/hub',
  name: 'Hub',
  path: '/code/hub',
  framework: 'React',
  package_manager: 'npm',
  scripts: [script],
  has_env: false,
  has_git: true,
  git_root: '/code/hub',
  manifests: ['package.json'],
  git_status: null,
  is_running: false,
  running_port: null,
  cpu: 0,
  mem: 0,
};

describe('project runtime adapter', () => {
  it('uses a stable service id for direct project scripts', () => {
    expect(directProjectServiceId(repo, script)).toBe('project::repo::/code/hub::dev');
  });

  it('presents directly managed services with live runtime data', () => {
    const managed: ManagedServiceInfo = {
      service_id: directProjectServiceId(repo, script),
      cwd: repo.path,
      cmd: script.cmd,
      pid: 42,
      started_at_ms: 1,
      uptime_ms: 12_000,
      cpu_usage: 2.5,
      memory_mb: 80,
      ports: [5173],
      urls: ['http://localhost:5173'],
    };

    const [service] = buildProjectRuntimeServices([repo], [], [managed], [], []);

    expect(service).toMatchObject({
      id: managed.service_id,
      name: 'dev',
      status: 'running',
      pid: 42,
      port: 5173,
      uptime: 12,
      _ws: '__project__',
    });
  });

  it('reconnects to the port-owning external process without duplicating its helpers', () => {
    const processes: ProcessInfo[] = [
      { pid: 10, name: 'npm', cmd: ['npm', 'run', 'dev'], cwd: repo.path, cpu_usage: 0.2, memory_kb: 1024, status: 'Run' },
      { pid: 11, name: 'node', cmd: ['node', 'vite'], cwd: repo.path, cpu_usage: 1.2, memory_kb: 64 * 1024, status: 'Run' },
    ];
    const ports: LivePort[] = [{
      port: 5173,
      pid: 11,
      process_name: 'node',
      protocol: 'tcp',
      bind_address: '127.0.0.1',
      url: 'http://localhost:5173',
    }];

    const services = buildProjectRuntimeServices([repo], [], [], processes, ports);

    expect(services).toHaveLength(1);
    expect(services[0]).toMatchObject({
      id: 'external::11',
      name: 'node',
      pid: 11,
      port: 5173,
      _ws: '__external__',
    });
  });

  it('does not duplicate processes already represented by workspace services', () => {
    const workspaceService = {
      id: 'workspace-dev',
      pid: 11,
    } as Service;
    const process: ProcessInfo = {
      pid: 11,
      name: 'node',
      cmd: ['node', 'vite'],
      cwd: repo.path,
      cpu_usage: 1,
      memory_kb: 1024,
      status: 'Run',
    };

    expect(buildProjectRuntimeServices([repo], [workspaceService], [], [process], [])).toEqual([]);
  });

  it('attributes a monorepo process to the matching package instead of a sibling sharing its Git root', () => {
    const packageA = { ...repo, id: 'repo-a', path: '/code/hub/packages/a' };
    const packageB = { ...repo, id: 'repo-b', path: '/code/hub/packages/b' };
    const process: ProcessInfo = {
      pid: 90,
      name: 'node',
      cmd: ['node', 'server.js'],
      cwd: packageA.path,
      cpu_usage: 1,
      memory_kb: 1024,
      status: 'Run',
    };

    const [service] = buildProjectRuntimeServices([packageB, packageA], [], [], [process], []);

    expect(service.project).toBe('repo-a');
    expect(service.repo_path).toBe(packageA.path);
  });
});
