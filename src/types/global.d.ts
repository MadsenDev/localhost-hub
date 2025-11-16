export type ScriptInfo = {
  name: string;
  command: string;
  description?: string;
};

export type ProjectInfo = {
  id: string;
  name: string;
  path: string;
  type: string;
  tags: string[];
  scripts: ScriptInfo[];
};

export type RunScriptResult = {
  exitCode: number | null;
  output: string;
  command: string;
  startedAt: number;
  finishedAt: number;
};

export interface ElectronAPI {
  ping: () => Promise<string>;
  projects: {
    list: () => Promise<ProjectInfo[]>;
    scan: (directories?: string[]) => Promise<ProjectInfo[]>;
  };
  scripts: {
    run: (payload: { projectPath: string; script: string }) => Promise<RunScriptResult>;
  };
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
