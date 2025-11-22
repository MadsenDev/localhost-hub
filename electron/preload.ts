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
    scan: (directories?: string[]) => ipcRenderer.invoke('projects:scan', directories),
    create: (payload: {
      name: string;
      directory: string;
      description?: string;
      packages: string[];
      packageManager: 'npm' | 'yarn' | 'pnpm' | 'bun';
      installDependencies: boolean;
    }) => ipcRenderer.invoke('projects:create', payload)
  },
  git: {
    status: (projectPath: string) => ipcRenderer.invoke('git:status', projectPath)
  },
  processes: {
    active: () => ipcRenderer.invoke('processes:active'),
    kill: (pid: number) => ipcRenderer.invoke('processes:kill', pid)
  },
  logs: {
    export: (payload: { contents: string; suggestedName?: string }) => ipcRenderer.invoke('logs:export', payload)
  },
  dialog: {
    selectDirectory: (options?: { title?: string }) => ipcRenderer.invoke('dialog:selectDirectory', options)
  },
  scripts: {
    run: (payload: { projectPath: string; script: string; projectId?: string }) => ipcRenderer.invoke('scripts:run', payload),
    stop: (runId: string) => ipcRenderer.invoke('scripts:stop', runId),
    install: (payload: { projectPath: string; packageManager?: string }) => ipcRenderer.invoke('scripts:install', payload),
    detectPackageManager: (projectPath: string) => ipcRenderer.invoke('scripts:detectPackageManager', projectPath),
    getExpectedPort: (payload: { projectId: string; scriptName: string }) => ipcRenderer.invoke('scripts:getExpectedPort', payload),
    setExpectedPort: (payload: { projectId: string; scriptName: string; port: number | null }) => ipcRenderer.invoke('scripts:setExpectedPort', payload),
    getAllExpectedPorts: (projectId: string) => ipcRenderer.invoke('scripts:getAllExpectedPorts', projectId),
    onLog: (callback: (payload: { runId: string; chunk: string; source: 'stdout' | 'stderr'; timestamp: number; projectId?: string; script?: string }) => void) =>
      registerListener<{ runId: string; chunk: string; source: 'stdout' | 'stderr'; timestamp: number; projectId?: string; script?: string }>(
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
        workspaceId?: number;
        projectId?: string;
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
        workspaceId?: number;
        projectId?: string;
      }>('scripts:exit', (_event, payload) => callback(payload)),
    onError: (
      callback: (payload: { runId: string; message: string; script: string; projectPath: string; startedAt: number; projectId?: string }) => void
    ) =>
      registerListener<{ runId: string; message: string; script: string; projectPath: string; startedAt: number; projectId?: string }>(
        'scripts:error',
        (_event, payload) => callback(payload)
      )
  },
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized')
  },
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url)
  },
  envProfiles: {
    list: (projectId: string) => ipcRenderer.invoke('envProfiles:list', projectId),
    create: (payload: { projectId: string; name: string; description?: string; isDefault?: boolean }) =>
      ipcRenderer.invoke('envProfiles:create', payload),
    update: (payload: { id: number; name?: string; description?: string; isDefault?: boolean }) =>
      ipcRenderer.invoke('envProfiles:update', payload),
    delete: (profileId: number) => ipcRenderer.invoke('envProfiles:delete', profileId),
    setVars: (payload: { profileId: number; vars: Array<{ key: string; value: string; isSecret?: boolean }> }) =>
      ipcRenderer.invoke('envProfiles:setVars', payload)
  },
  settings: {
    get: (key: string) => ipcRenderer.invoke('settings:get', key),
    set: (payload: { key: string; value: string }) => ipcRenderer.invoke('settings:set', payload),
    getAll: () => ipcRenderer.invoke('settings:getAll'),
    delete: (key: string) => ipcRenderer.invoke('settings:delete', key)
  },
  packages: {
    getDependencies: (projectPath: string) => ipcRenderer.invoke('packages:getDependencies', projectPath),
    scanNodeModules: (projectPath: string) => ipcRenderer.invoke('packages:scanNodeModules', projectPath),
    installPackage: (payload: { projectPath: string; packageName: string; version?: string; isDev?: boolean; packageManager?: string }) => ipcRenderer.invoke('packages:installPackage', payload)
  },
  workspaces: {
    list: () => ipcRenderer.invoke('workspaces:list'),
    create: (payload: { name: string; description?: string; favorite?: boolean }) => ipcRenderer.invoke('workspaces:create', payload),
    update: (payload: { id: number; name?: string; description?: string; favorite?: boolean }) => ipcRenderer.invoke('workspaces:update', payload),
    delete: (workspaceId: number) => ipcRenderer.invoke('workspaces:delete', workspaceId),
    addItem: (payload: { workspaceId: number; projectId: string; scriptName: string; envProfileId?: number | null; runMode?: 'parallel' | 'sequential' }) =>
      ipcRenderer.invoke('workspaceItems:add', payload),
    updateItem: (payload: { id: number; envProfileId?: number | null; runMode?: 'parallel' | 'sequential'; orderIndex?: number }) =>
      ipcRenderer.invoke('workspaceItems:update', payload),
    removeItem: (itemId: number) => ipcRenderer.invoke('workspaceItems:remove', itemId),
    start: (workspaceId: number) => ipcRenderer.invoke('workspaces:start', workspaceId),
    stop: (workspaceId: number) => ipcRenderer.invoke('workspaces:stop', workspaceId),
    onStatus: (callback: (payload: { workspaceId: number; activeRunCount: number }) => void) =>
      registerListener<{ workspaceId: number; activeRunCount: number }>('workspaces:status', (_event, payload) => callback(payload))
  }
});
