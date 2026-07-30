
// Git types owned by the Rust backend.
//
// Generated from the Rust structs by ts-rs (`cargo test` in src-tauri/).
// Re-exported here so existing imports keep working while the compiler,
// not a convention, keeps the two sides in agreement.
import type { EnvProfile } from './generated/EnvProfile';
import type { EnvVariable } from './generated/EnvVariable';
import type { GitBranch } from './generated/GitBranch';
import type { GitCommitResult } from './generated/GitCommitResult';
import type { GitDiff } from './generated/GitDiff';
import type { GitFileStatus } from './generated/GitFileStatus';
import type { GitHistoryEntry } from './generated/GitHistoryEntry';
import type { GitNetworkResult } from './generated/GitNetworkResult';
import type { GitRemote } from './generated/GitRemote';
import type { GitRepositoryInfo } from './generated/GitRepositoryInfo';
import type { GitStatus } from './generated/GitStatus';
import type { StoredService } from './generated/StoredService';
import type { StoredWorkspace } from './generated/StoredWorkspace';

export type {
  EnvProfile,
  EnvVariable,
  GitBranch,
  GitCommitResult,
  GitDiff,
  GitFileStatus,
  GitHistoryEntry,
  GitNetworkResult,
  GitRemote,
  GitRepositoryInfo,
  GitStatus,
  StoredService,
  StoredWorkspace,
};

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

export interface HubDataShape {
  workspaces: Workspace[];
  projects: Record<string, Project>;
  activity: ActivityItem[];
  sessions: Session[];
  logSeeds: Record<string, { kind: LogLine['kind']; msg: string }[]>;
  ports: Port[];
  portEdges: PortEdge[];
}
