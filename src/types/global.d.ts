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
  };
  processes: {
    active: () => Promise<ActiveProcessInfo[]>;
    kill: (pid: number) => Promise<{ success: boolean; error?: string }>;
  };
  logs: {
    export: (payload: { contents: string; suggestedName?: string }) => Promise<{ saved: boolean; filePath?: string }>;
  };
  dialog: {
    selectDirectory: () => Promise<{ canceled: boolean; path: string | null }>;
  };
  scripts: {
    run: (payload: { projectPath: string; script: string; projectId?: string }) => Promise<RunScriptResult>;
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
  };
  git: {
    status: (projectPath: string) => Promise<GitStatusInfo>;
     commit: (payload: { projectPath: string; message: string; stageAll?: boolean }) => Promise<{ output: string }>;
     pull: (payload: { projectPath: string; remote?: string; branch?: string }) => Promise<{ output: string }>;
     push: (payload: { projectPath: string; remote?: string; branch?: string; setUpstream?: boolean }) => Promise<{ output: string }>;
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
    onStatus: (callback: (payload: { workspaceId: number; activeRunCount: number }) => void) => () => void;
  };
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
