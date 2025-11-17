import { contextBridge, ipcRenderer } from 'electron';

function registerListener<T>(channel: string, callback: (event: Electron.IpcRendererEvent, payload: T) => void) {
  const handler = (event: Electron.IpcRendererEvent, payload: T) => callback(event, payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld('electronAPI', {
  ping: () => ipcRenderer.invoke('ping'),
  projects: {
    list: () => ipcRenderer.invoke('projects:list'),
    scan: (directories?: string[]) => ipcRenderer.invoke('projects:scan', directories)
  },
  processes: {
    active: () => ipcRenderer.invoke('processes:active')
  },
  logs: {
    export: (payload: { contents: string; suggestedName?: string }) => ipcRenderer.invoke('logs:export', payload)
  },
  dialog: {
    selectDirectory: () => ipcRenderer.invoke('dialog:selectDirectory')
  },
  scripts: {
    run: (payload: { projectPath: string; script: string }) => ipcRenderer.invoke('scripts:run', payload),
    stop: (runId: string) => ipcRenderer.invoke('scripts:stop', runId),
    onLog: (callback: (payload: { runId: string; chunk: string; source: 'stdout' | 'stderr'; timestamp: number }) => void) =>
      registerListener<{ runId: string; chunk: string; source: 'stdout' | 'stderr'; timestamp: number }>(
        'scripts:log',
        (_event, payload) => callback(payload)
      ),
    onExit: (
      callback: (payload: {
        runId: string;
        exitCode: number | null;
        finishedAt: number;
        startedAt: number;
        script: string;
        command: string;
        projectPath: string;
        wasStopped?: boolean;
      }) => void
    ) =>
      registerListener<{
        runId: string;
        exitCode: number | null;
        finishedAt: number;
        startedAt: number;
        script: string;
        command: string;
        projectPath: string;
        wasStopped?: boolean;
      }>('scripts:exit', (_event, payload) => callback(payload)),
    onError: (
      callback: (payload: { runId: string; message: string; script: string; projectPath: string; startedAt: number }) => void
    ) =>
      registerListener<{ runId: string; message: string; script: string; projectPath: string; startedAt: number }>(
        'scripts:error',
        (_event, payload) => callback(payload)
      )
  }
});
