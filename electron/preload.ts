import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  ping: () => ipcRenderer.invoke('ping'),
  projects: {
    list: () => ipcRenderer.invoke('projects:list'),
    scan: (directories?: string[]) => ipcRenderer.invoke('projects:scan', directories)
  },
  scripts: {
    run: (payload: { projectPath: string; script: string }) => ipcRenderer.invoke('scripts:run', payload)
  }
});
