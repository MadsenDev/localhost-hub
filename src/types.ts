export type ServiceStatus = 'running' | 'starting' | 'stopped' | 'failed' | 'exited' | 'crashed' | 'restarting';

export interface Service {
  id: string;
  project: string;
  name: string;
  cmd: string;
  repo_path?: string;
  port: number | null;
  status: ServiceStatus;
  uptime: number;
  pid?: number | null;
  pkg: string;
  cpu: number;
  mem: number;
  framework: string;
  _ws?: string;
}

export interface Workspace {
  id: string;
  name: string;
  desc: string;
  swatch: string;
  path: string;
  projects: string[];
  services: Service[];
  sessions: number;
  lastOpened: string;
}

export interface GitInfo {
  branch: string;
  clean: boolean;
  ahead: number;
  behind: number;
  changed: number;
  last: string;
}

export interface EnvVar {
  k: string;
  v: string;
}

export interface Script {
  name: string;
  cmd: string;
  hot?: boolean;
}

export interface Project {
  id: string;
  name: string;
  workspace: string;
  path: string;
  icon: string;
  framework: string;
  language: string;
  pkg: string;
  node: string;
  git: GitInfo;
  scripts: Script[];
  env: EnvVar[];
  ports: number[];
  deps: number;
  dev: number;
}

export interface ActivityItem {
  ts: string;
  project: string;
  label: string;
  kind: 'ok' | 'info' | 'warn' | 'error';
}

export interface Session {
  id: string;
  title: string;
  when: string;
  duration: number;
  ws: string;
  projects: number;
  services: number;
  badge?: string;
}

export interface LogLine {
  ts: string;
  src: string;
  msg: string;
  kind: 'ok' | 'info' | 'warn' | 'error';
}

export interface Port {
  id: string;
  port: number;
  svc: string;
  host: string;
  status: ServiceStatus;
  ws: string;
  group: string;
}

export interface PortEdge {
  from: string;
  to: string;
}

export interface Repo {
  id: string;
  name: string;
  path: string;
  framework: string;
  package_manager: string;
  scripts: Script[];
  has_env: boolean;
  // live-derived
  is_running: boolean;
  running_port: number | null;
  cpu: number;
  mem: number;
}

export interface StoredService {
  id: string;
  name: string;
  repo_path: string;
  script: string;
  cmd: string;
}

export interface StoredWorkspace {
  id: string;
  name: string;
  color: string;
  services: StoredService[];
}

export interface HubDataShape {
  workspaces: Workspace[];
  projects: Record<string, Project>;
  activity: ActivityItem[];
  sessions: Session[];
  logSeeds: Record<string, { kind: LogLine['kind']; msg: string }[]>;
  ports: Port[];
  portEdges: PortEdge[];
}
