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

// Types owned by the Rust backend.
//
// Generated from the Rust structs by ts-rs (`cargo test` in src-tauri/).
// Re-exported here so existing imports keep working while the compiler,
// not a convention, keeps the two sides in agreement.
import type { CreateProjectPayload } from './generated/CreateProjectPayload';
import type { CreateProjectResult } from './generated/CreateProjectResult';
import type { DependencyKind } from './generated/DependencyKind';
import type { DetectedProject } from './generated/DetectedProject';
import type { EnvFileImport } from './generated/EnvFileImport';
import type { EnvFileVariable } from './generated/EnvFileVariable';
import type { GitHubProjectContext } from './generated/GitHubProjectContext';
import type { GitHubRepo } from './generated/GitHubRepo';
import type { HealthSignalState } from './generated/HealthSignalState';
import type { LivePort } from './generated/LivePort';
import type { ManagedServiceInfo } from './generated/ManagedServiceInfo';
import type { PackageAction } from './generated/PackageAction';
import type { PackageActionPayload } from './generated/PackageActionPayload';
import type { PackageActionResult } from './generated/PackageActionResult';
import type { PackageManager } from './generated/PackageManager';
import type { ProcessInfo } from './generated/ProcessInfo';
import type { ProjectLanguage } from './generated/ProjectLanguage';
import type { ProjectPackage } from './generated/ProjectPackage';
import type { ProjectPackages } from './generated/ProjectPackages';
import type { ProjectTemplate } from './generated/ProjectTemplate';
import type { RepositoryHealth } from './generated/RepositoryHealth';
import type { RepositoryHealthStatus } from './generated/RepositoryHealthStatus';
import type { RunLog } from './generated/RunLog';
import type { RunOutcome } from './generated/RunOutcome';
import type { RunRecord } from './generated/RunRecord';
import type { SecretBackend } from './generated/SecretBackend';
import type { ServiceEnvironment } from './generated/ServiceEnvironment';
import type { ServiceEvent } from './generated/ServiceEvent';
import type { SystemStats } from './generated/SystemStats';
import type { WorkspaceGroup } from './generated/WorkspaceGroup';
import type { WorkspaceRunResult } from './generated/WorkspaceRunResult';
import type { WorkspaceServiceSpec } from './generated/WorkspaceServiceSpec';
import type { WorkspaceStopSpec } from './generated/WorkspaceStopSpec';

export type {
  CreateProjectPayload,
  CreateProjectResult,
  DependencyKind,
  DetectedProject,
  EnvFileImport,
  EnvFileVariable,
  GitHubProjectContext,
  GitHubRepo,
  HealthSignalState,
  LivePort,
  ManagedServiceInfo,
  PackageAction,
  PackageActionPayload,
  PackageActionResult,
  PackageManager,
  ProcessInfo,
  ProjectLanguage,
  ProjectPackage,
  ProjectPackages,
  ProjectTemplate,
  RepositoryHealth,
  RepositoryHealthStatus,
  RunLog,
  RunOutcome,
  RunRecord,
  SecretBackend,
  ServiceEnvironment,
  ServiceEvent,
  SystemStats,
  WorkspaceGroup,
  WorkspaceRunResult,
  WorkspaceServiceSpec,
  WorkspaceStopSpec,
};

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

  // Read from the operating system, not from the saved preference: a login item
  // can be removed outside Localhost Hub, so the stored value records intent
  // rather than state. Both of these return what the OS reports afterwards, so a
  // refusal shows as the toggle not moving.
  getStartAtLogin: () => query<boolean>("get_start_at_login", undefined, false),

  setStartAtLogin: (enabled: boolean) =>
    action<boolean>("set_start_at_login", { enabled }),

  listRunHistory: () => query<RunRecord[]>("list_run_history", undefined, []),

  readRunLog: (runId: string, limit?: number) =>
    query<RunLog>("read_run_log", { runId, limit }, { run_id: runId, lines: [], truncated: false }),

  clearRunHistory: () => action<void>("clear_run_history"),

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
