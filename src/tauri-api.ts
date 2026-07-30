/**
 * Thin wrapper around Tauri invoke calls.
 * Import and call these instead of directly using @tauri-apps/api.
 *
 * Outside Tauri (plain `vite` dev in a browser, or the Electron shell) there is
 * no native backend. Commands are split by how they can honestly degrade:
 *
 * - `query` — reads that the polling and startup paths depend on. These return a
 *   type-correct empty value so the interface renders an empty state instead of
 *   crashing. Never returns null for a non-nullable type.
 * - `action` — mutations, and one-shot reads with no meaningful empty value.
 *   These reject, so the caller surfaces a real error rather than silently
 *   appearing to succeed.
 */
import type { GitCommitResult, GitDiff, GitNetworkResult, GitRepositoryInfo, GitStatus } from "./types";

type InvokeFn = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

let _invoke: InvokeFn | null = null;

async function rawInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!_invoke) {
    const mod = await import("@tauri-apps/api/core");
    _invoke = mod.invoke as InvokeFn;
  }
  return _invoke<T>(cmd, args);
}

/** Read-only command with a type-correct fallback when no backend is present. */
async function query<T>(
  cmd: string,
  args: Record<string, unknown> | undefined,
  fallback: T,
): Promise<T> {
  if (!isTauri) return fallback;
  return rawInvoke<T>(cmd, args);
}

/** Command that cannot be faked without a backend, so it rejects instead. */
async function action<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri) {
    throw new Error(
      `Localhost Hub's native backend is unavailable outside the desktop app (${cmd}).`,
    );
  }
  return rawInvoke<T>(cmd, args);
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

export interface EnvFileVariable {
  key: string;
  value: string;
  is_secret: boolean;
}

export interface EnvFileImport {
  path: string;
  variables: EnvFileVariable[];
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
  depends_on: string[];
  run_mode: "parallel" | "sequential";
  order: number;
  environment: ServiceEnvironment;
  expected_ports: number[];
  allow_port_conflicts: boolean;
  startup_delay_ms: number;
  readiness_timeout_ms: number;
}

export interface ServiceEnvironment {
  inherit_system: boolean;
  vars: Array<{ key: string; value: string }>;
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
  warnings: Array<{ service_id: string; warning: string }>;
  blocked: Array<{ service_id: string; reason: string }>;
}

export type SecretBackend = "keyring" | "file";

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

export interface GitHubProjectContext {
  repository: {
    name: string;
    full_name: string;
    html_url: string;
    private: boolean;
    archived: boolean;
    fork: boolean;
    description: string | null;
    default_branch: string;
    open_issues_count: number;
    updated_at: string;
  };
  remote_name: string;
  remote_url: string;
  current_branch: string | null;
  head_sha: string | null;
  pull_requests: Array<{
    number: number;
    title: string;
    html_url: string;
    draft: boolean;
    head_ref: string;
    base_ref: string;
    author: string;
    updated_at: string;
  }>;
  issues: Array<{
    number: number;
    title: string;
    html_url: string;
    author: string;
    labels: Array<{ name: string; color: string }>;
    updated_at: string;
  }>;
  checks: Array<{
    name: string;
    status: string;
    conclusion: string | null;
    html_url: string | null;
    app_name: string | null;
    started_at: string | null;
    completed_at: string | null;
  }>;
  warnings: string[];
}

export type ProjectTemplate = "empty" | "node-http" | "react-vite";
export type ProjectLanguage = "javascript" | "typescript";
export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

export interface CreateProjectPayload {
  name: string;
  directory: string;
  description: string;
  template: ProjectTemplate;
  language: ProjectLanguage;
  package_manager: PackageManager;
  dependencies: string[];
  dev_dependencies: string[];
  scripts: Record<string, string>;
  styling: "none" | "tailwind-v4";
  icon_packs: string[];
  include_readme: boolean;
  readme_notes: string;
  initialize_git: boolean;
  install_dependencies: boolean;
}

export interface CreateProjectResult {
  path: string;
  files: string[];
  git_initialized: boolean;
  dependencies_installed: boolean;
  warnings: string[];
}

export type RepositoryHealthStatus = "healthy" | "attention" | "risk";
export type HealthSignalState = "good" | "info" | "warn" | "bad";

export interface RepositoryHealth {
  path: string;
  score: number;
  status: RepositoryHealthStatus;
  signals: Array<{
    id: string;
    label: string;
    state: HealthSignalState;
    detail: string;
  }>;
  has_readme: boolean;
  has_license: boolean;
  has_ci: boolean;
  dependency_manifests: string[];
  uncommitted_changes: number;
  oldest_uncommitted_days: number | null;
  unpushed_commits: number;
  last_commit_timestamp: number | null;
  days_since_last_commit: number | null;
  stale_branches: Array<{
    name: string;
    last_commit_timestamp: number;
    days_since_commit: number;
    merged_into_head: boolean;
  }>;
}

export type DependencyKind = "dependency" | "dev_dependency" | "peer_dependency" | "optional_dependency";
export type PackageAction = "install_all" | "add" | "remove" | "update" | "audit" | "outdated" | "regenerate_lockfile";

export interface ProjectPackage {
  name: string;
  requested_version: string;
  installed_version: string | null;
  kind: DependencyKind;
}

export interface ProjectPackages {
  package_manager: PackageManager;
  packages: ProjectPackage[];
  installed_count: number;
  missing_count: number;
}

export interface PackageActionPayload {
  project_path: string;
  action: PackageAction;
  package_name?: string | null;
  version?: string | null;
  dev?: boolean;
}

export interface PackageActionResult {
  package_manager: PackageManager;
  command: string;
  success: boolean;
  exit_code: number | null;
  stdout: string;
  stderr: string;
}

// ── Commands ──────────────────────────────────────────────────────────────────

export const tauriApi = {
  scanPorts: () => query<LivePort[]>("scan_ports", undefined, []),

  checkPortConflicts: (expectedPorts: number[]) =>
    query<LivePort[]>("check_port_conflicts", { expectedPorts }, []),

  getProcesses: () => query<ProcessInfo[]>("get_processes", undefined, []),

  killProcess: (pid: number) => action<void>("kill_process", { pid }),

  startService: (
    serviceId: string,
    cwd: string,
    cmd: string,
    environment: ServiceEnvironment,
    expectedPorts: number[],
    allowPortConflicts = false,
  ) => action<number>("start_service", {
    serviceId,
    cwd,
    cmd,
    environment,
    expectedPorts,
    allowPortConflicts,
  }),

  stopManagedService: (serviceId: string) =>
    action<void>("stop_service", { serviceId }),

  restartManagedService: (serviceId: string) =>
    action<number>("restart_service", { serviceId }),

  listManagedServices: () =>
    query<ManagedServiceInfo[]>("list_managed_services", undefined, []),

  startWorkspace: (workspaceId: string, workspaceServices: WorkspaceServiceSpec[]) =>
    action<WorkspaceRunResult>("start_workspace", { workspaceId, workspaceServices }),

  stopWorkspace: (workspaceId: string, workspaceServices: WorkspaceStopSpec[]) =>
    action<WorkspaceRunResult>("stop_workspace", { workspaceId, workspaceServices }),

  getSystemStats: () => query<SystemStats>("get_system_stats", undefined, {
    cpu_usage: 0,
    memory_used_mb: 0,
    memory_total_mb: 0,
    load_avg: [0, 0, 0],
  }),

  getGitStatus: (path: string) => query<GitStatus | null>("get_git_status", { path }, null),

  getGitDiff: (path: string, filePath: string | null, staged: boolean) =>
    action<GitDiff>("get_git_diff", { path, filePath, staged }),

  stageGitFiles: (path: string, files: string[]) =>
    action<GitStatus>("stage_git_files", { path, files }),

  unstageGitFiles: (path: string, files: string[]) =>
    action<GitStatus>("unstage_git_files", { path, files }),

  commitGitChanges: (path: string, message: string) =>
    action<GitCommitResult>("commit_git_changes", { path, message }),

  getGitRepositoryInfo: (path: string, historyLimit = 30) =>
    action<GitRepositoryInfo>("get_git_repository_info", { path, historyLimit }),

  createGitBranch: (path: string, name: string) =>
    action<GitStatus>("create_git_branch", { path, name }),

  checkoutGitBranch: (path: string, name: string) =>
    action<GitStatus>("checkout_git_branch", { path, name }),

  deleteGitBranch: (path: string, name: string) =>
    action<void>("delete_git_branch", { path, name }),

  addGitRemote: (path: string, name: string, url: string) =>
    action<GitRepositoryInfo>("add_git_remote", { path, name, url }),

  renameGitRemote: (path: string, currentName: string, newName: string) =>
    action<GitRepositoryInfo>("rename_git_remote", { path, currentName, newName }),

  removeGitRemote: (path: string, name: string) =>
    action<GitRepositoryInfo>("remove_git_remote", { path, name }),

  fetchGitRemote: (path: string, remote: string) =>
    action<GitNetworkResult>("fetch_git_remote", { path, remote }),

  pullGitRemote: (path: string, remote: string) =>
    action<GitNetworkResult>("pull_git_remote", { path, remote }),

  pushGitRemote: (path: string, remote: string) =>
    action<GitNetworkResult>("push_git_remote", { path, remote }),

  listGitHubRepos: () => query<GitHubRepo[]>("github_list_repos", undefined, []),

  // Where secrets are actually stored. "file" means no OS credential store was
  // available, so the interface should say so rather than imply otherwise.
  secretStorageBackend: () =>
    query<SecretBackend>("secret_storage_backend", undefined, "file"),

  getGitHubProjectContext: (path: string) =>
    action<GitHubProjectContext>("github_get_project_context", { path }),

  openGitHubUrl: (url: string) =>
    action<void>("open_github_url", { url }),

  scanWorkspaces: (root: string, maxDepth?: number, ignorePatterns?: string[]) =>
    query<DetectedProject[]>("scan_workspaces", { root, maxDepth, ignorePatterns }, []),

  scanWorkspaceGroups: (roots: string[], maxDepth?: number, ignorePatterns?: string[]) =>
    query<WorkspaceGroup[]>("scan_workspace_groups", { roots, maxDepth, ignorePatterns }, []),

  findDefaultWorkspaceRoots: () =>
    query<string[]>("find_default_workspace_roots", undefined, []),

  createProject: (payload: CreateProjectPayload) =>
    action<CreateProjectResult>("create_project", { payload }),

  analyzeRepositoryHealth: (paths: string[]) =>
    query<RepositoryHealth[]>("analyze_repository_health", { paths }, []),

  getProjectPackages: (path: string) =>
    action<ProjectPackages>("get_project_packages", { path }),

  runPackageAction: (payload: PackageActionPayload) =>
    action<PackageActionResult>("run_package_action", { payload }),

  openInEditor: (path: string) => action<void>("open_in_editor", { path }),

  openUrl: (url: string) => action<void>("open_url", { url }),

  importEnvFile: (path: string) =>
    action<EnvFileImport>("import_env_file", { path }),

  exportEnvFile: (path: string, variables: EnvFileVariable[]) =>
    action<void>("export_env_file", { path, variables }),
};

export async function listenToServiceEvents(handler: (event: ServiceEvent) => void): Promise<() => void> {
  if (!isTauri) return () => {};
  const mod = await import("@tauri-apps/api/event");
  return mod.listen<ServiceEvent>("service://event", (event) => handler(event.payload));
}
