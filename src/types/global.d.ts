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
};

export type ScriptLogChunk = {
  runId: string;
  chunk: string;
  source: 'stdout' | 'stderr';
  timestamp: number;
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
};

export type ScriptErrorEvent = {
  runId: string;
  message: string;
  script: string;
  projectPath: string;
  startedAt: number;
};

export interface ElectronAPI {
  ping: () => Promise<string>;
  projects: {
    list: () => Promise<ProjectInfo[]>;
    scan: (directories?: string[]) => Promise<ProjectInfo[]>;
  };
  processes: {
    active: () => Promise<ActiveProcessInfo[]>;
  };
  logs: {
    export: (payload: { contents: string; suggestedName?: string }) => Promise<{ saved: boolean; filePath?: string }>;
  };
  dialog: {
    selectDirectory: () => Promise<{ canceled: boolean; path: string | null }>;
  };
  scripts: {
    run: (payload: { projectPath: string; script: string }) => Promise<RunScriptResult>;
    stop: (runId: string) => Promise<{ success: boolean }>;
    onLog: (callback: (payload: ScriptLogChunk) => void) => () => void;
    onExit: (callback: (payload: ScriptExitEvent) => void) => () => void;
    onError: (callback: (payload: ScriptErrorEvent) => void) => () => void;
  };
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
