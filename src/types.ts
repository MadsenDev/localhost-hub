export type ServiceStatus = 'running' | 'starting' | 'stopped' | 'failed' | 'blocked' | 'exited' | 'crashed' | 'restarting';

export interface Service {
  id: string;
  project: string;
  name: string;
  cmd: string;
  repo_path?: string;
  port: number | null;
  url?: string | null;
  status: ServiceStatus;
  uptime: number;
  pid?: number | null;
  pkg: string;
  cpu: number;
  mem: number;
  framework: string;
  depends_on?: string[];
  run_mode?: 'parallel' | 'sequential';
  order?: number;
  env_profile_id?: string | null;
  expected_port?: number | null;
  startup_delay_ms?: number;
  readiness_timeout_ms?: number;
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

export interface EnvVariable {
  key: string;
  value: string;
  is_secret: boolean;
}

export interface EnvProfile {
  id: string;
  project_path: string;
  name: string;
  description: string;
  is_default: boolean;
  vars: EnvVariable[];
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
  url?: string;
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
  has_git: boolean;
  git_root: string | null;
  manifests: string[];
  git_status: GitStatus | null;
  // live-derived
  is_running: boolean;
  running_port: number | null;
  cpu: number;
  mem: number;
}

export interface GitFileStatus {
  path: string;
  index_status: string | null;
  worktree_status: string | null;
  conflicted: boolean;
}

export interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  changed: number;
  staged: number;
  unstaged: number;
  untracked: number;
  conflicted: number;
  clean: boolean;
  files: GitFileStatus[];
  last_commit_message: string | null;
  last_commit_hash: string | null;
  last_commit_author: string | null;
  last_commit_timestamp: number | null;
}

export interface GitDiff {
  patch: string;
  files_changed: number;
  additions: number;
  deletions: number;
  truncated: boolean;
}

export interface GitCommitResult {
  hash: string;
  message: string;
}

export interface GitBranch {
  name: string;
  current: boolean;
  remote: boolean;
  upstream: string | null;
  ahead: number;
  behind: number;
}

export interface GitRemote {
  name: string;
  url: string | null;
  push_url: string | null;
}

export interface GitHistoryEntry {
  hash: string;
  full_hash: string;
  message: string;
  author: string;
  author_email: string | null;
  timestamp: number;
  parent_count: number;
  files_changed: number;
  additions: number;
  deletions: number;
}

export interface GitRepositoryInfo {
  branches: GitBranch[];
  remotes: GitRemote[];
  history: GitHistoryEntry[];
}

export interface GitNetworkResult {
  operation: 'fetch' | 'pull' | 'push';
  remote: string;
  branch: string;
  output: string;
  status: GitStatus;
}

export interface StoredService {
  id: string;
  name: string;
  repo_path: string;
  script: string;
  cmd: string;
  depends_on?: string[];
  run_mode?: 'parallel' | 'sequential';
  order?: number;
  env_profile_id?: string | null;
  expected_port?: number | null;
  startup_delay_ms?: number;
  readiness_timeout_ms?: number;
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
