import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProjectView } from '../view-project';
import type { EnvProfile, LogLine, Port, Repo, Service } from '../types';

const project: Repo = {
  id: 'repo-localhost-hub',
  name: 'Localhost Hub',
  path: '/code/localhost-hub',
  framework: 'React',
  package_manager: 'npm',
  scripts: [
    { name: 'dev', cmd: 'npm run dev' },
    { name: 'test', cmd: 'npm test' },
  ],
  has_env: true,
  has_git: true,
  git_root: '/code/localhost-hub',
  manifests: ['package.json', 'Cargo.toml'],
  git_status: {
    branch: 'feat/live-project-detail',
    ahead: 1,
    behind: 0,
    changed: 2,
    staged: 1,
    unstaged: 1,
    untracked: 0,
    conflicted: 0,
    clean: false,
    files: [{ path: 'src/App.tsx', index_status: 'modified', worktree_status: null, conflicted: false }],
    last_commit_message: 'Connect live project data',
    last_commit_hash: 'abc1234',
    last_commit_author: 'Dev',
    last_commit_timestamp: 1,
  },
  is_running: true,
  running_port: 1420,
  cpu: 1.5,
  mem: 64,
};

const service: Service = {
  id: 'service-dev',
  project: 'localhost-hub',
  name: 'dev',
  cmd: 'npm run dev',
  repo_path: '/code/localhost-hub',
  port: 1420,
  url: 'http://localhost:1420',
  status: 'running',
  uptime: 60,
  pid: 1234,
  pkg: 'npm',
  cpu: 1.5,
  mem: 64,
  framework: 'React',
  _ws: 'workspace-main',
};

const port: Port = {
  id: 'port-1420',
  port: 1420,
  svc: 'service-dev',
  host: '127.0.0.1',
  url: 'http://localhost:1420',
  status: 'running',
  ws: 'workspace-main',
  group: 'web',
};

const log: LogLine = {
  ts: '10:42:00',
  src: 'service-dev',
  msg: 'ready in 184ms',
  kind: 'ok',
};

function renderProject({
  services = [service],
  onStartScript = vi.fn(),
  envProfiles = [],
}: {
  services?: Service[];
  onStartScript?: ReturnType<typeof vi.fn>;
  envProfiles?: EnvProfile[];
} = {}) {
  return render(
    <ProjectView
      project={project}
      services={services}
      ports={[port]}
      logs={[log]}
      onBack={vi.fn()}
      onStartScript={onStartScript}
      onStopService={vi.fn()}
      onRestartService={vi.fn()}
      onOpenLogs={vi.fn()}
      onOpenUrl={vi.fn()}
      onOpenEditor={vi.fn()}
      onConfigureScripts={vi.fn()}
      onManageGit={vi.fn()}
      envProfiles={envProfiles}
      onSaveEnvProfiles={vi.fn()}
    />,
  );
}

describe('ProjectView', () => {
  it('renders scanned project and live service data without synthetic metrics', () => {
    renderProject();

    expect(screen.getByRole('heading', { name: 'Localhost Hub' })).toBeInTheDocument();
    expect(screen.getByText('/code/localhost-hub')).toBeInTheDocument();
    expect(screen.getByText('PID 1234 · :1420')).toBeInTheDocument();
    expect(screen.getByText('React')).toBeInTheDocument();
    expect(screen.queryByText('Recent runs')).not.toBeInTheDocument();
    expect(screen.queryByText('Build times')).not.toBeInTheDocument();
  });

  it('connects scripts, logs, ports, and Git tabs to live state', () => {
    renderProject();

    fireEvent.click(screen.getByRole('button', { name: /Scripts/ }));
    expect(screen.getByText('npm run dev')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Restart/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Logs/ }));
    expect(screen.getByText('ready in 184ms')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Ports/ }));
    expect(screen.getByText(':1420')).toBeInTheDocument();

    const gitTab = screen.getAllByRole('button').find(button =>
      button.textContent?.trim().startsWith('Git') && !button.textContent.includes('GitHub')
    );
    expect(gitTab).toBeDefined();
    fireEvent.click(gitTab!);
    expect(screen.getByText('Connect live project data')).toBeInTheDocument();
    expect(screen.getByText('src/App.tsx')).toBeInTheDocument();
  });

  it('runs a detected script directly when it is not configured in a workspace', () => {
    const onStartScript = vi.fn();
    renderProject({ services: [], onStartScript });

    fireEvent.click(screen.getByRole('button', { name: /Scripts/ }));
    const runButtons = screen.getAllByRole('button', { name: /^Run$/ });
    fireEvent.click(runButtons[0]);

    expect(onStartScript).toHaveBeenCalledWith(project, project.scripts[0]);
    expect(screen.getAllByRole('button', { name: /Add to workspace/ })).toHaveLength(2);
  });

  it('shows masked project environment profiles', () => {
    renderProject({
      envProfiles: [{
        id: 'development',
        project_path: project.path,
        name: 'Development',
        description: 'Local API',
        is_default: true,
        vars: [{ key: 'API_TOKEN', value: 'private-value', is_secret: true }],
      }],
    });

    fireEvent.click(screen.getByRole('button', { name: /Environment/ }));
    expect(screen.getByDisplayValue('Development')).toBeInTheDocument();
    expect(screen.getByLabelText('API_TOKEN value')).toHaveAttribute('type', 'password');
  });
});
