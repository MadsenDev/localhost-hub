export type CreateProjectPayload = {
  name: string;
  directory: string;
  description?: string;
  packages: string[];
  devPackages: string[];
  scripts: Record<string, string>;
  packageManager: 'npm' | 'yarn' | 'pnpm' | 'bun';
  installDependencies: boolean;
  language: 'javascript' | 'typescript';
  includeSampleCode: boolean;
  sampleCodeStyle: 'console' | 'http';
  initializeGit: boolean;
  includeReadme: boolean;
  readmeNotes?: string;
  stylingPreset: 'none' | 'tailwind-v4' | 'tailwind-v3';
  iconPacks: string[];
};
export type ScriptInfo = {
  name: string;
  command: string;
  description?: string;
};

export type ActiveProcessInfo = {
  id: string;
  script: string;
  command: string;
  projectPath: string;
  startedAt: number;
  isExternal?: boolean;
  pid?: number;
  port?: number;
};

export type ProjectInfo = {
  id: string;
  name: string;
  path: string;
  type: string;
  tags: string[];
  scripts: ScriptInfo[];
};

export type RunHistory = {
  id: string;
  script: string;
  status: 'Success' | 'Failed' | 'Stopped';
  startedAt: number;
  finishedAt: number;
  exitCode: number | null;
};

export type RunScriptResult = {
  runId: string;
  startedAt: number;
  command: string;
  script: string;
  projectPath: string;
  projectId?: string;
};

export type ScriptLogChunk = {
  runId: string;
  chunk: string;
  source: 'stdout' | 'stderr';
  timestamp: number;
  projectId?: string;
  script?: string;
};

export type ScriptExitEvent = {
  runId: string;
  exitCode: number | null;
  finishedAt: number;
  startedAt: number;
  script: string;
  command: string;
  projectPath: string;
  wasStopped?: boolean;
  workspaceId?: number;
  projectId?: string;
};

export type ScriptErrorEvent = {
  runId: string;
  message: string;
  script: string;
  projectPath: string;
  startedAt: number;
  projectId?: string;
};

export type EnvVar = {
  id: number;
  envProfileId: number;
  key: string;
  value: string;
  isSecret: boolean;
};

export type EnvProfile = {
  id: number;
  projectId: string;
  name: string;
  description?: string;
  isDefault: boolean;
  createdAt: number;
  updatedAt: number;
  vars: EnvVar[];
};

export type WorkspaceItem = {
  id: number;
  workspaceId: number;
  projectId: string;
  projectPath: string;
  projectName: string;
  scriptName: string;
  command: string;
  envProfileId?: number;
  envProfileName?: string;
  orderIndex: number;
  runMode: 'parallel' | 'sequential';
};

export type Workspace = {
  id: number;
  name: string;
  description?: string;
  favorite: boolean;
  createdAt: number;
  updatedAt: number;
  items: WorkspaceItem[];
  activeRunCount?: number;
};

export type GitChange = {
  path: string;
  indexStatus: string;
  worktreeStatus: string;
};

export type GitStatusInfo = {
  isRepo: boolean;
  branch?: string;
  ahead?: number;
  behind?: number;
  dirty?: boolean;
  upstream?: string;
  changes?: GitChange[];
  lastCommit?: {
    hash: string;
    message: string;
    relativeTime: string;
  };
};

export interface ElectronAPI {
  ping: () => Promise<string>;
  projects: {
    list: () => Promise<ProjectInfo[]>;
    scan: (directories?: string[]) => Promise<ProjectInfo[]>;
    create: (payload: CreateProjectPayload) => Promise<{ success: boolean; path: string }>;
  };
  processes: {
    active: () => Promise<ActiveProcessInfo[]>;
    kill: (pid: number) => Promise<{ success: boolean; error?: string }>;
    restart: (pid: number) => Promise<{ success: boolean; runId?: string; error?: string }>;
  };
  logs: {
    export: (payload: { contents: string; suggestedName?: string }) => Promise<{ saved: boolean; filePath?: string }>;
  };
  dialog: {
    selectDirectory: (options?: { title?: string }) => Promise<{ canceled: boolean; path: string | null }>;
  };
  scripts: {
    run: (payload: { projectPath: string; script: string; projectId?: string; envOverrides?: Record<string, string> }) => Promise<RunScriptResult>;
    runCustom: (payload: { projectPath: string; command: string; label?: string; projectId?: string; envOverrides?: Record<string, string> }) => Promise<RunScriptResult>;
    stop: (runId: string) => Promise<{ success: boolean }>;
    install: (payload: { projectPath: string; packageManager?: string }) => Promise<RunScriptResult>;
    detectPackageManager: (projectPath: string) => Promise<'npm' | 'pnpm' | 'yarn' | 'bun'>;
    getExpectedPort: (payload: { projectId: string; scriptName: string }) => Promise<number | null>;
    setExpectedPort: (payload: { projectId: string; scriptName: string; port: number | null }) => Promise<{ success: boolean }>;
    getAllExpectedPorts: (projectId: string) => Promise<Record<string, number>>;
    onLog: (callback: (payload: ScriptLogChunk) => void) => () => void;
    onExit: (callback: (payload: ScriptExitEvent) => void) => () => void;
    onError: (callback: (payload: ScriptErrorEvent) => void) => () => void;
  };
  window: {
    minimize: () => Promise<void>;
    maximize: () => Promise<{ isMaximized: boolean }>;
    close: () => Promise<void>;
    isMaximized: () => Promise<boolean>;
  };
  shell: {
    openExternal: (url: string) => Promise<{ success: boolean }>;
  };
  envProfiles: {
    list: (projectId: string) => Promise<EnvProfile[]>;
    create: (payload: { projectId: string; name: string; description?: string; isDefault?: boolean }) => Promise<{ id: number }>;
    update: (payload: { id: number; name?: string; description?: string; isDefault?: boolean }) => Promise<{ success: boolean }>;
    delete: (profileId: number) => Promise<{ success: boolean }>;
    setVars: (payload: { profileId: number; vars: Array<{ key: string; value: string; isSecret?: boolean }> }) => Promise<{ success: boolean }>;
  };
  envFiles: {
    list: (projectPath: string) => Promise<Array<{ name: string; exists: boolean }>>;
    read: (payload: { projectPath: string; file: string }) => Promise<string>;
    write: (payload: { projectPath: string; file: string; contents: string }) => Promise<{ success: boolean }>;
  };
  settings: {
    get: (key: string) => Promise<string | null>;
    set: (payload: { key: string; value: string }) => Promise<{ success: boolean }>;
    getAll: () => Promise<Record<string, string>>;
    delete: (key: string) => Promise<{ success: boolean }>;
  };
  packages: {
    getDependencies: (projectPath: string) => Promise<{ dependencies: Record<string, string>; devDependencies: Record<string, string>; peerDependencies: Record<string, string>; optionalDependencies: Record<string, string> }>;
    scanNodeModules: (projectPath: string) => Promise<Record<string, { version?: string; path: string }>>;
    installPackage: (payload: { projectPath: string; packageName: string; version?: string; isDev?: boolean; packageManager?: string }) => Promise<RunScriptResult>;
    audit: (projectPath: string) => Promise<{ output: string }>;
    outdated: (projectPath: string) => Promise<{ output: string }>;
    regenerateLockfile: (payload: { projectPath: string; packageManager?: string }) => Promise<{ success: boolean }>;
  };
  git: {
    status: (projectPath: string) => Promise<GitStatusInfo>;
    checkInstalled: () => Promise<{ installed: boolean }>;
    stageFiles: (payload: { projectPath: string; files: string[] }) => Promise<{ success: boolean }>;
    unstageFiles: (payload: { projectPath: string; files: string[] }) => Promise<{ success: boolean }>;
    commit: (payload: { projectPath: string; message: string }) => Promise<{ success: boolean }>;
    push: (payload: { projectPath: string; remote?: string; branch?: string; credentials?: { username: string; password: string }; rememberCredentials?: boolean }) => Promise<{ success: boolean; usedStoredCredentials?: boolean }>;
    checkout: (payload: { projectPath: string; branch: string }) => Promise<{ success: boolean }>;
    createBranch: (payload: { projectPath: string; branch: string }) => Promise<{ success: boolean }>;
    stashSave: (payload: { projectPath: string; message?: string }) => Promise<{ success: boolean }>;
    stashPop: (payload: { projectPath: string }) => Promise<{ success: boolean }>;
    getStoredCredentials: (projectPath: string) => Promise<{ hasCredentials: boolean; username?: string | null }>;
    clearStoredCredentials: (projectPath: string) => Promise<{ success: boolean }>;
  };
  workspaces: {
    list: () => Promise<Workspace[]>;
    create: (payload: { name: string; description?: string; favorite?: boolean }) => Promise<{ id: number }>;
    update: (payload: { id: number; name?: string; description?: string; favorite?: boolean }) => Promise<{ success: boolean }>;
    delete: (workspaceId: number) => Promise<{ success: boolean }>;
    addItem: (payload: { workspaceId: number; projectId: string; scriptName: string; envProfileId?: number | null; runMode?: 'parallel' | 'sequential' }) => Promise<{ id: number }>;
    updateItem: (payload: { id: number; envProfileId?: number | null; runMode?: 'parallel' | 'sequential'; orderIndex?: number }) => Promise<{ success: boolean }>;
    removeItem: (itemId: number) => Promise<{ success: boolean }>;
    start: (workspaceId: number) => Promise<{ success: boolean }>;
    stop: (workspaceId: number) => Promise<{ success: boolean }>;
    restart: (workspaceId: number) => Promise<{ success: boolean }>;
    restartItem: (payload: { workspaceId: number; itemId: number }) => Promise<{ success: boolean }>;
    onStatus: (callback: (payload: { workspaceId: number; activeRunCount: number }) => void) => () => void;
  };
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

declare module '*.svg' {
  const src: string;
  export default src;
}
