/**
 * Thin wrapper around Tauri invoke calls with browser fallbacks.
 * Import and call these instead of directly using @tauri-apps/api.
 * In a browser (vite dev without tauri), all calls return empty/null
 * so the app works in both environments.
 */
import type { GitCommitResult, GitDiff, GitRepositoryInfo, GitStatus } from "./types";

type InvokeFn = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

let _invoke: InvokeFn | null = null;

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri) return Promise.resolve(null as T);
  if (!_invoke) {
    const mod = await import("@tauri-apps/api/core");
    _invoke = mod.invoke as InvokeFn;
  }
  return _invoke<T>(cmd, args);
}

// ── Types mirroring Rust structs ──────────────────────────────────────────────

export interface LivePort {
  port: number;
  pid: number | null;
  process_name: string | null;
  protocol: string;
  bind_address: string;
  url: string;
}

export interface ProcessInfo {
  pid: number;
  name: string;
  cmd: string[];
  cwd: string | null;
  cpu_usage: number;
  memory_kb: number;
  status: string;
}

export interface SystemStats {
  cpu_usage: number;
  memory_used_mb: number;
  memory_total_mb: number;
  load_avg: [number, number, number];
}

export interface DetectedProject {
  id: string;
  path: string;
  name: string;
  framework: string;
  package_manager: string;
  scripts: Array<{
    name: string;
    cmd: string;
    raw_cmd: string;
    runner: string;
    description: string | null;
  }>;
  has_git: boolean;
  git_root: string | null;
  has_env: boolean;
  env_files: string[];
  manifests: string[];
}

export interface WorkspaceGroup {
  id: string;
  name: string;
  path: string;
  projects: DetectedProject[];
}

export interface EnvEntry {
  key: string;
  value: string;
  redacted: boolean;
}

export interface ServiceEvent {
  service_id: string;
  kind: "starting" | "started" | "restarting" | "stdout" | "stderr" | "url" | "exited" | "error" | "stopped";
  message: string;
  pid: number | null;
  code: number | null;
}

export interface ManagedServiceInfo {
  service_id: string;
  cwd: string;
  cmd: string;
  pid: number;
  started_at_ms: number;
  uptime_ms: number;
  cpu_usage: number;
  memory_mb: number;
  ports: number[];
  urls: string[];
}

export interface WorkspaceServiceSpec {
  service_id: string;
  cwd: string;
  cmd: string;
  run_mode: "parallel" | "sequential";
  order: number;
}

export interface WorkspaceStopSpec {
  service_id: string;
  pid: number | null;
}

export interface WorkspaceRunResult {
  workspace_id: string;
  started: string[];
  already_running: string[];
  stopped: string[];
  not_running: string[];
  failed: Array<{ service_id: string; error: string }>;
}

export interface GitHubRepo {
  name: string;
  full_name: string;
  html_url: string;
  clone_url: string;
  ssh_url: string;
  private: boolean;
  description: string | null;
  default_branch: string;
  updated_at: string;
  language: string | null;
}

// ── Commands ──────────────────────────────────────────────────────────────────

export const tauriApi = {
  scanPorts: () => invoke<LivePort[]>("scan_ports"),

  getProcesses: () => invoke<ProcessInfo[]>("get_processes"),

  killProcess: (pid: number) => invoke<void>("kill_process", { pid }),

  startService: (serviceId: string, cwd: string, cmd: string) =>
    invoke<number>("start_service", { serviceId, cwd, cmd }),

  stopManagedService: (serviceId: string) =>
    invoke<void>("stop_service", { serviceId }),

  restartManagedService: (serviceId: string) =>
    invoke<number>("restart_service", { serviceId }),

  listManagedServices: () =>
    invoke<ManagedServiceInfo[]>("list_managed_services"),

  startWorkspace: (workspaceId: string, workspaceServices: WorkspaceServiceSpec[]) =>
    invoke<WorkspaceRunResult>("start_workspace", { workspaceId, workspaceServices }),

  stopWorkspace: (workspaceId: string, workspaceServices: WorkspaceStopSpec[]) =>
    invoke<WorkspaceRunResult>("stop_workspace", { workspaceId, workspaceServices }),

  getSystemStats: () => invoke<SystemStats>("get_system_stats"),

  getGitStatus: (path: string) => invoke<GitStatus | null>("get_git_status", { path }),

  getGitDiff: (path: string, filePath: string | null, staged: boolean) =>
    invoke<GitDiff>("get_git_diff", { path, filePath, staged }),

  stageGitFiles: (path: string, files: string[]) =>
    invoke<GitStatus>("stage_git_files", { path, files }),

  unstageGitFiles: (path: string, files: string[]) =>
    invoke<GitStatus>("unstage_git_files", { path, files }),

  commitGitChanges: (path: string, message: string) =>
    invoke<GitCommitResult>("commit_git_changes", { path, message }),

  getGitRepositoryInfo: (path: string, historyLimit = 30) =>
    invoke<GitRepositoryInfo>("get_git_repository_info", { path, historyLimit }),

  createGitBranch: (path: string, name: string) =>
    invoke<GitStatus>("create_git_branch", { path, name }),

  checkoutGitBranch: (path: string, name: string) =>
    invoke<GitStatus>("checkout_git_branch", { path, name }),

  deleteGitBranch: (path: string, name: string) =>
    invoke<void>("delete_git_branch", { path, name }),

  addGitRemote: (path: string, name: string, url: string) =>
    invoke<GitRepositoryInfo>("add_git_remote", { path, name, url }),

  renameGitRemote: (path: string, currentName: string, newName: string) =>
    invoke<GitRepositoryInfo>("rename_git_remote", { path, currentName, newName }),

  removeGitRemote: (path: string, name: string) =>
    invoke<GitRepositoryInfo>("remove_git_remote", { path, name }),

  listGitHubRepos: () => invoke<GitHubRepo[]>("github_list_repos"),

  scanWorkspaces: (root: string, maxDepth?: number, ignorePatterns?: string[]) =>
    invoke<DetectedProject[]>("scan_workspaces", { root, maxDepth, ignorePatterns }),

  scanWorkspaceGroups: (roots: string[], maxDepth?: number, ignorePatterns?: string[]) =>
    invoke<WorkspaceGroup[]>("scan_workspace_groups", { roots, maxDepth, ignorePatterns }),

  findDefaultWorkspaceRoots: () =>
    invoke<string[]>("find_default_workspace_roots"),

  openInEditor: (path: string) => invoke<void>("open_in_editor", { path }),

  openUrl: (url: string) => invoke<void>("open_url", { url }),

  readEnvFile: (path: string) => invoke<EnvEntry[]>("read_env_file", { path }),
};

export async function listenToServiceEvents(handler: (event: ServiceEvent) => void): Promise<() => void> {
  if (!isTauri) return () => {};
  const mod = await import("@tauri-apps/api/event");
  return mod.listen<ServiceEvent>("service://event", (event) => handler(event.payload));
}
