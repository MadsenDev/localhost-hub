import { app, BrowserWindow, dialog, ipcMain, shell, Tray, nativeImage, Notification } from 'electron';
import { randomUUID } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);
import { scanProjects, type ProjectInfo } from './projectScanner';
import { getGitStatus } from './gitStatus';
import {
  initializeDatabase,
  loadProjects,
  saveProjects,
  getEnvProfiles,
  createEnvProfile,
  updateEnvProfile,
  deleteEnvProfile,
  setEnvVars,
  getSetting,
  setSetting,
  getAllSettings,
  deleteSetting,
  getScriptExpectedPort,
  setScriptExpectedPort,
  getAllScriptExpectedPorts,
  getWorkspaces,
  getWorkspaceById,
  createWorkspace,
  updateWorkspace,
  deleteWorkspace,
  addWorkspaceItem,
  updateWorkspaceItem,
  removeWorkspaceItem,
  type WorkspaceRecord,
  type WorkspaceItemRecord
} from './database';
import { findProjectIdByPath as findProjectIdByPathHelper } from './utils/projectLookup';
import { scanExternalProcesses } from './externalProcessScanner';

const __dirname = dirname(fileURLToPath(import.meta.url));

process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';

const isMac = process.platform === 'darwin';
let mainWindow: BrowserWindow | null = null;
let appTray: Tray | null = null;
let isQuitting = false;

const getIconAssetPath = (fileName: string) => {
  const packagedPath = join(process.resourcesPath, fileName);
  const buildResourcePath = join(process.cwd(), 'buildResources', fileName);
  const fallbackMap: Record<string, string> = {
    'icon.png': join(process.cwd(), 'public', 'logo-icons', 'desktop', 'icon-256.png'),
    'icon.ico': join(process.cwd(), 'public', 'logo-icons', 'windows', 'app.ico'),
    'icon.icns': join(process.cwd(), 'public', 'logo-icons', 'ios', 'AppIcon~ios-marketing.png')
  };

  if (app.isPackaged && existsSync(packagedPath)) {
    return packagedPath;
  }

  if (!app.isPackaged && existsSync(buildResourcePath)) {
    return buildResourcePath;
  }

  const fallbackPath = fallbackMap[fileName];
  if (fallbackPath && existsSync(fallbackPath)) {
    return fallbackPath;
  }

  return app.isPackaged ? packagedPath : buildResourcePath;
};

type ActiveProcess = {
  id: string;
  script: string;
  command: string;
  projectPath: string;
  startedAt: number;
  child: ReturnType<typeof spawn>;
  workspaceId?: number;
  workspaceItemId?: number;
  runMode?: 'parallel' | 'sequential';
  customCommand?: string | null;
  commandArray?: string[];
};

const activeProcesses = new Map<string, ActiveProcess>();
const stoppedProcesses = new Set<string>();
const workspaceRunMap = new Map<number, Set<string>>();
const runWorkspaceMap = new Map<string, { workspaceId: number; itemId?: number; runMode: 'parallel' | 'sequential' }>();

function createWindow() {
  const windowIcon = getIconAssetPath('icon.png');
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1000,
    minHeight: 640,
    title: 'Localhost Hub',
    backgroundColor: '#0f172a',
    frame: false,
    titleBarStyle: 'hidden',
    icon: windowIcon,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    window.loadURL(devServerUrl);
    window.webContents.openDevTools({ mode: 'detach' });
  } else {
    const rendererPath = join(__dirname, '../renderer/index.html');
    const distRendererPath = join(__dirname, '../dist/renderer/index.html');
    const loadPath = existsSync(rendererPath) ? rendererPath : distRendererPath;
    window.loadFile(loadPath);
  }

  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Handle minimize to tray
  window.on('minimize', () => {
    const minimizeToTray = getSetting('minimizeToTray') === 'true';
    if (minimizeToTray && appTray) {
      window.hide();
    }
  });

  // Handle window close
  window.on('close', (event) => {
    const minimizeToTray = getSetting('minimizeToTray') === 'true';
    if (minimizeToTray && appTray && !isQuitting) {
      event.preventDefault();
      window.hide();
    }
  });

  mainWindow = window;
}

function createTray() {
  try {
    const trayIconName = process.platform === 'win32' ? 'icon.ico' : process.platform === 'darwin' ? 'icon.icns' : 'icon.png';
    const iconPath = getIconAssetPath(trayIconName);
    const icon = existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();
    
    appTray = new Tray(icon);
    
    const Menu = require('electron').Menu;
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Show Localhost Hub',
        click: () => {
          if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
          }
        }
      },
      {
        label: 'Quit',
        click: () => {
          isQuitting = true;
          app.quit();
        }
      }
    ]);
    
    appTray.setToolTip('Localhost Hub');
    appTray.setContextMenu(contextMenu);
    
    appTray.on('click', () => {
      if (mainWindow) {
        if (mainWindow.isVisible()) {
          mainWindow.hide();
        } else {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    });
  } catch (error) {
    console.error('Failed to create system tray:', error);
  }
}

let autoScanInterval: NodeJS.Timeout | null = null;

function startAutoScan() {
  // Clear existing interval
  if (autoScanInterval) {
    clearInterval(autoScanInterval);
    autoScanInterval = null;
  }
  
  const intervalSeconds = parseInt(getSetting('autoScanInterval') || '0', 10);
  if (intervalSeconds > 0) {
    autoScanInterval = setInterval(async () => {
      try {
        await performProjectScan();
        broadcast('projects:updated', cachedProjects);
      } catch (error) {
        console.error('Auto-scan error:', error);
      }
    }, intervalSeconds * 1000);
  }
}

app.whenReady().then(async () => {
  await initializeDatabase();
  cachedProjects = loadProjects();
  
  // Create system tray if minimize to tray is enabled
  const minimizeToTray = getSetting('minimizeToTray') === 'true';
  if (minimizeToTray) {
    createTray();
  }
  
  // Check start minimized setting
  const startMinimized = getSetting('startMinimized') === 'true';
  createWindow();
  if (startMinimized && mainWindow) {
    mainWindow.minimize();
  }
  
  // Start auto-scan if enabled
  startAutoScan();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (!isMac) {
    app.quit();
  }
});

ipcMain.handle('ping', () => 'pong');

function broadcast(channel: string, payload: unknown) {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(channel, payload);
  }
}

let cachedProjects: ProjectInfo[] = [];

function findProjectId(projectPath: string): string | null {
  return findProjectIdByPathHelper(projectPath, cachedProjects, () => loadProjects());
}

async function getDefaultScanDirectories() {
  const fromEnv = process.env.LOCALHOST_HUB_SCAN_DIRS;
  if (fromEnv) {
    return fromEnv
      .split(process.platform === 'win32' ? ';' : ':')
      .map((segment) => segment.trim())
      .filter(Boolean);
  }
  return [process.cwd()];
}

async function performProjectScan(directories?: string[]) {
  const scanRoots = (directories && directories.length > 0 ? directories : await getDefaultScanDirectories()).map((dir) =>
    resolve(dir)
  );
  const scannedAt = Date.now();
  
  // Get scan settings
  const scanDepth = getSetting('scanDepth');
  const ignorePatterns = getSetting('ignorePatterns');
  const maxDepth = scanDepth ? parseInt(scanDepth, 10) : undefined;
  const ignoreList = ignorePatterns ? ignorePatterns.split(',').map(p => p.trim()).filter(Boolean) : undefined;
  
  cachedProjects = await scanProjects(scanRoots, { maxDepth, ignorePatterns: ignoreList });
  saveProjects(cachedProjects, scannedAt);
  return cachedProjects;
}

ipcMain.handle('projects:list', async () => {
  if (cachedProjects.length === 0) {
    cachedProjects = loadProjects();
  }
  if (cachedProjects.length === 0) {
    await performProjectScan();
  }
  return cachedProjects;
});

ipcMain.handle('projects:scan', async (_event, directories?: string[]) => {
  return performProjectScan(directories);
});

type LaunchScriptOptions = {
  projectPath: string;
  script: string;
  projectId?: string | null;
  workspaceId?: number;
  workspaceItemId?: number;
  runMode?: 'parallel' | 'sequential';
  customCommand?: string;
};

async function launchScriptProcess(options: LaunchScriptOptions) {
  const { projectPath, script } = options;
  if (!projectPath || !script) {
    throw new Error('A project path and script name are required');
  }

  let command: string[] | null = null;
  if (!options.customCommand) {
    const autoDetect = getSetting('autoDetectPackageManager') === 'true';
    const defaultPM = getSetting('defaultPackageManager') || '';
    let packageManager = defaultPM || 'npm';

    if (autoDetect || !defaultPM) {
      packageManager = detectPackageManager(projectPath);
    }

    command =
      packageManager === 'yarn'
        ? ['yarn', script]
        : packageManager === 'pnpm'
        ? ['pnpm', 'run', script]
        : packageManager === 'bun'
        ? ['bun', 'run', script]
        : ['npm', 'run', script];
  }

  const inheritSystemEnv = getSetting('inheritSystemEnv') !== 'false';
  const env = inheritSystemEnv ? { ...process.env } : {};
  const runId = randomUUID();
  const startedAt = Date.now();
  const commandString = options.customCommand ?? command?.join(' ') ?? '';
  const projectId = options.projectId ?? findProjectId(projectPath);

  const child = options.customCommand
    ? spawn(options.customCommand, [], {
        cwd: projectPath,
        env,
        shell: true
      })
    : spawn(command![0], command!.slice(1), {
        cwd: projectPath,
        env,
        shell: process.platform === 'win32'
      });

  const record: ActiveProcess = {
    id: runId,
    script,
    command: commandString,
    projectPath,
    startedAt,
    child,
    workspaceId: options.workspaceId,
    workspaceItemId: options.workspaceItemId,
    runMode: options.runMode,
    customCommand: options.customCommand ?? null,
    commandArray: command ?? undefined
  };
  (record as any).inheritSystemEnv = inheritSystemEnv;
  (record as any).projectId = projectId ?? undefined;
  activeProcesses.set(runId, record);

  if (options.workspaceId) {
    registerWorkspaceRun(runId, options.workspaceId, options.workspaceItemId, options.runMode ?? 'parallel');
  }

  child.stdout?.on('data', (chunk) => {
    broadcast('scripts:log', {
      runId,
      chunk: chunk.toString(),
      source: 'stdout',
      timestamp: Date.now(),
      projectId: projectId ?? undefined,
      script
    });
  });

  child.stderr?.on('data', (chunk) => {
    broadcast('scripts:log', {
      runId,
      chunk: chunk.toString(),
      source: 'stderr',
      timestamp: Date.now(),
      projectId: projectId ?? undefined,
      script
    });
  });

  child.once('error', (error) => {
    broadcast('scripts:error', {
      runId,
      script,
      projectPath,
      message: error.message,
      startedAt,
      timestamp: Date.now(),
      projectId: projectId ?? undefined
    });
    activeProcesses.delete(runId);
    unregisterWorkspaceRun(runId);
  });

  child.once('close', (code) => {
    const wasStopped = stoppedProcesses.has(runId);
    activeProcesses.delete(runId);
    stoppedProcesses.delete(runId);
    unregisterWorkspaceRun(runId);

    const enableNotifications = getSetting('enableNotifications') === 'true';
    if (enableNotifications && !wasStopped) {
      const status = code === 0 ? 'completed' : 'failed';
      if (Notification.isSupported()) {
        new Notification({
          title: `Script ${status}`,
          body: `${script} ${status === 'completed' ? 'completed successfully' : `exited with code ${code}`}`,
          silent: false
        }).show();
      }
    }

    const autoRestartAllowed = !options.workspaceId && getSetting('autoRestartOnCrash') === 'true';
    if (autoRestartAllowed && code !== 0 && !wasStopped) {
      setTimeout(() => {
        launchScriptProcess({
          projectPath,
          script,
          projectId: projectId ?? undefined,
          customCommand: options.customCommand
        })
          .then((restartResult) => {
            broadcast('scripts:log', {
              runId: restartResult.runId,
              chunk: `\n[Auto-restart] Restarting ${script}...\n`,
              source: 'stdout',
              timestamp: Date.now()
            });
          })
          .catch((err) => {
            broadcast('scripts:log', {
              runId,
              chunk: `\n[Auto-restart] Failed to restart ${script}: ${err instanceof Error ? err.message : String(err)}\n`,
              source: 'stderr',
              timestamp: Date.now()
            });
          });
      }, 2000);
    }

    broadcast('scripts:exit', {
      runId,
      exitCode: code,
      finishedAt: Date.now(),
      script,
      command: commandString,
      projectPath,
      startedAt,
      wasStopped,
      projectId: projectId ?? undefined,
      workspaceId: options.workspaceId
    });
  });

  return { runId, startedAt, command: commandString, script, projectPath, projectId: projectId ?? undefined };
}

ipcMain.handle('scripts:run', async (_event, payload: { projectPath: string; script: string; projectId?: string }) => {
  return launchScriptProcess({
    projectPath: payload?.projectPath,
    script: payload?.script,
    projectId: payload?.projectId
  });
});

function broadcastWorkspaceStatus(workspaceId: number) {
  const activeRunCount = workspaceRunMap.get(workspaceId)?.size ?? 0;
  broadcast('workspaces:status', { workspaceId, activeRunCount });
}

function registerWorkspaceRun(runId: string, workspaceId: number, itemId?: number, runMode: 'parallel' | 'sequential' = 'parallel') {
  const existing = workspaceRunMap.get(workspaceId) ?? new Set<string>();
  existing.add(runId);
  workspaceRunMap.set(workspaceId, existing);
  runWorkspaceMap.set(runId, { workspaceId, itemId, runMode });
  broadcastWorkspaceStatus(workspaceId);
}

function unregisterWorkspaceRun(runId: string) {
  const meta = runWorkspaceMap.get(runId);
  if (!meta) {
    return;
  }
  runWorkspaceMap.delete(runId);
  const runSet = workspaceRunMap.get(meta.workspaceId);
  if (runSet) {
    runSet.delete(runId);
    if (runSet.size === 0) {
      workspaceRunMap.delete(meta.workspaceId);
    }
  }
  broadcastWorkspaceStatus(meta.workspaceId);
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function resolveWorkspaceProjectPath(item: WorkspaceItemRecord): string {
  if (item.projectPath) {
    return item.projectPath;
  }
  const project = cachedProjects.find((p) => p.id === item.projectId);
  if (!project) {
    throw new Error('Project path could not be resolved for workspace item');
  }
  return project.path;
}

async function launchWorkspaceItem(workspaceId: number, item: WorkspaceItemRecord, runMode: 'parallel' | 'sequential') {
  const projectPath = resolveWorkspaceProjectPath(item);
  const scriptLabel = item.scriptName || item.command || 'workspace-command';
  const shouldUseCustomCommand = !item.scriptName && Boolean(item.command);
  console.log('[workspaces] launching', { workspaceId, script: scriptLabel, runMode, projectPath });

  return launchScriptProcess({
    projectPath,
    script: scriptLabel,
    projectId: item.projectId,
    workspaceId,
    workspaceItemId: item.id,
    runMode,
    customCommand: shouldUseCustomCommand ? item.command : undefined
  });
}

async function launchSequentialItems(workspaceId: number, items: WorkspaceItemRecord[]) {
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    await launchWorkspaceItem(workspaceId, item, 'sequential');
    if (index < items.length - 1) {
      await delay(250);
    }
  }
}

function stopActiveRun(runId: string): boolean {
  const active = activeProcesses.get(runId);
  if (!active) {
    return false;
  }
  stoppedProcesses.add(runId);
  try {
    active.child.kill('SIGTERM');
  } catch {
    // ignore
  }
  const killTimeout = Math.max(1, parseInt(getSetting('killTimeout') || '5', 10)) * 1000;
  setTimeout(() => {
    if (!active.child.killed) {
      try {
        active.child.kill('SIGKILL');
      } catch {
        // Process already exited
      }
    }
  }, killTimeout);
  return true;
}

async function stopWorkspaceRuns(workspaceId: number) {
  const runIds = workspaceRunMap.get(workspaceId);
  if (!runIds) {
    return;
  }
  for (const runId of Array.from(runIds)) {
    stopActiveRun(runId);
  }
}

ipcMain.handle('scripts:stop', async (_event, runId: string) => {
  return { success: stopActiveRun(runId) };
});

// Helper to detect port for a PID
async function detectPortForPid(pid: number | undefined): Promise<number | null> {
  if (!pid) return null;
  
  try {
    if (process.platform === 'win32') {
      const { stdout } = await execAsync(`netstat -ano | findstr LISTENING | findstr ${pid} || echo`);
      const lines = stdout.trim().split('\n').filter(Boolean);
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        const addressPart = parts.find(p => p.includes(':'));
        if (addressPart) {
          const portMatch = addressPart.match(/:(\d+)$/);
          if (portMatch) {
            const port = parseInt(portMatch[1], 10);
            if (port >= 1 && port <= 65535) {
              return port;
            }
          }
        }
      }
    } else {
      // Linux/macOS
      const { stdout } = await execAsync(`lsof -p ${pid} -i -P -n | grep LISTEN | head -1 || true`);
      const portMatch = stdout.match(/:(\d+)\s*\(LISTEN\)/);
      if (portMatch) {
        const port = parseInt(portMatch[1], 10);
        if (port >= 1 && port <= 65535) {
          return port;
        }
      }
    }
  } catch {
    // Ignore errors
  }
  return null;
}

ipcMain.handle('processes:active', async () => {
  // Get external processes first (they have port info)
  const externalProcesses = await scanExternalProcesses();
  const externalPidToPort = new Map<number, number>();
  externalProcesses.forEach(p => {
    if (p.pid && p.port) {
      externalPidToPort.set(p.pid, p.port);
    }
  });
  
  // Get internal processes (scripts run through the app)
  const internalProcessesPromises = Array.from(activeProcesses.values()).map(async ({ id, script, command, projectPath, startedAt, child }) => {
    const pid = child.pid;
    // Check if this PID has a port in external processes
    let port = externalPidToPort.get(pid || 0);
    
    // If not found in external, try to detect it
    if (!port && pid) {
      port = await detectPortForPid(pid) || undefined;
    }
    
    return {
      id,
      script,
      command,
      projectPath,
      startedAt,
      isExternal: false,
      pid,
      port
    };
  });
  
  const internalProcesses = await Promise.all(internalProcessesPromises);
  
  // Combine and return
  return [...internalProcesses, ...externalProcesses];
});

ipcMain.handle('processes:kill', async (_event, pid: number) => {
  try {
    if (process.platform === 'win32') {
      // Windows: use taskkill
      const { exec } = require('node:child_process');
      const { promisify } = require('node:util');
      const execAsync = promisify(exec);
      await execAsync(`taskkill /PID ${pid} /F`);
    } else {
      // Unix-like: use kill
      process.kill(pid, 'SIGTERM');
      // Give it a moment, then force kill if needed
      setTimeout(() => {
        try {
          process.kill(pid, 'SIGKILL');
        } catch {
          // Process already dead, ignore
        }
      }, 3000);
    }
    return { success: true };
  } catch (error) {
    console.error('Error killing process:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
});

ipcMain.handle('logs:export', async (_event, payload: { contents?: string; suggestedName?: string }) => {
  const window = BrowserWindow.getFocusedWindow() ?? mainWindow ?? undefined;
  const suggestedName = payload?.suggestedName ?? `localhost-hub-log-${new Date().toISOString()}.txt`;
  const dialogOptions = {
    title: 'Save logs',
    defaultPath: suggestedName,
    filters: [{ name: 'Text Files', extensions: ['txt', 'log'] }]
  };
  const result = window ? await dialog.showSaveDialog(window, dialogOptions) : await dialog.showSaveDialog(dialogOptions);

  if (result.canceled || !result.filePath) {
    return { saved: false };
  }

  await writeFile(result.filePath, payload?.contents ?? '', 'utf8');
  return { saved: true, filePath: result.filePath };
});

ipcMain.handle('dialog:selectDirectory', async () => {
  const window = BrowserWindow.getFocusedWindow() ?? mainWindow ?? undefined;
  const result = window
    ? await dialog.showOpenDialog(window, {
        properties: ['openDirectory'],
        title: 'Select directory to scan for projects'
      })
    : await dialog.showOpenDialog({
        properties: ['openDirectory'],
        title: 'Select directory to scan for projects'
      });

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true, path: null };
  }

  return { canceled: false, path: result.filePaths[0] };
});

ipcMain.handle('window:minimize', () => {
  const window = BrowserWindow.getFocusedWindow() ?? mainWindow;
  if (window) {
    window.minimize();
  }
});

ipcMain.handle('window:maximize', () => {
  const window = BrowserWindow.getFocusedWindow() ?? mainWindow;
  if (window) {
    if (window.isMaximized()) {
      window.unmaximize();
    } else {
      window.maximize();
    }
    return { isMaximized: window.isMaximized() };
  }
  return { isMaximized: false };
});

ipcMain.handle('window:close', () => {
  const window = BrowserWindow.getFocusedWindow() ?? mainWindow;
  if (window) {
    window.close();
  }
});

ipcMain.handle('window:isMaximized', () => {
  const window = BrowserWindow.getFocusedWindow() ?? mainWindow;
  return window ? window.isMaximized() : false;
});

// Environment Profiles IPC handlers
ipcMain.handle('envProfiles:list', async (_event, projectId: string) => {
  return getEnvProfiles(projectId);
});

ipcMain.handle('envProfiles:create', async (_event, payload: { projectId: string; name: string; description?: string; isDefault?: boolean }) => {
  const profileId = createEnvProfile(payload.projectId, payload.name, payload.description, payload.isDefault ?? false);
  return { id: profileId };
});

ipcMain.handle('envProfiles:update', async (_event, payload: { id: number; name?: string; description?: string; isDefault?: boolean }) => {
  updateEnvProfile(payload.id, {
    name: payload.name,
    description: payload.description,
    isDefault: payload.isDefault
  });
  return { success: true };
});

ipcMain.handle('envProfiles:delete', async (_event, profileId: number) => {
  deleteEnvProfile(profileId);
  return { success: true };
});

ipcMain.handle('envProfiles:setVars', async (_event, payload: { profileId: number; vars: Array<{ key: string; value: string; isSecret?: boolean }> }) => {
  setEnvVars(payload.profileId, payload.vars);
  return { success: true };
});

// Workspace IPC handlers
ipcMain.handle('workspaces:list', async () => {
  return getWorkspaces().map((workspace) => ({
    ...workspace,
    activeRunCount: workspaceRunMap.get(workspace.id)?.size ?? 0
  }));
});

ipcMain.handle('workspaces:create', async (_event, payload: { name: string; description?: string; favorite?: boolean }) => {
  const id = createWorkspace(payload);
  return { id };
});

ipcMain.handle('workspaces:update', async (_event, payload: { id: number; name?: string; description?: string; favorite?: boolean }) => {
  updateWorkspace(payload.id, {
    name: payload.name,
    description: payload.description,
    favorite: payload.favorite
  });
  return { success: true };
});

ipcMain.handle('workspaces:delete', async (_event, workspaceId: number) => {
  await stopWorkspaceRuns(workspaceId);
  workspaceRunMap.delete(workspaceId);
  for (const [runId, meta] of runWorkspaceMap.entries()) {
    if (meta.workspaceId === workspaceId) {
      runWorkspaceMap.delete(runId);
    }
  }
  deleteWorkspace(workspaceId);
  return { success: true };
});

ipcMain.handle(
  'workspaceItems:add',
  async (_event, payload: { workspaceId: number; projectId: string; scriptName: string; envProfileId?: number | null; runMode?: 'parallel' | 'sequential' }) => {
    const id = addWorkspaceItem(payload);
    return { id };
  }
);

ipcMain.handle(
  'workspaceItems:update',
  async (_event, payload: { id: number; envProfileId?: number | null; runMode?: 'parallel' | 'sequential'; orderIndex?: number }) => {
    updateWorkspaceItem(payload.id, {
      envProfileId: payload.envProfileId,
      runMode: payload.runMode,
      orderIndex: payload.orderIndex
    });
    return { success: true };
  }
);

ipcMain.handle('workspaceItems:remove', async (_event, itemId: number) => {
  removeWorkspaceItem(itemId);
  return { success: true };
});

ipcMain.handle('workspaces:start', async (_event, workspaceId: number) => {
  const workspace = getWorkspaceById(workspaceId);
  if (!workspace) {
    throw new Error('Workspace not found');
  }
  if (workspace.items.length === 0) {
    throw new Error('Workspace has no scripts to run');
  }
  if ((workspaceRunMap.get(workspaceId)?.size ?? 0) > 0) {
    throw new Error('Workspace is already running');
  }

  const sequentialItems = workspace.items
    .filter((item) => item.runMode === 'sequential')
    .sort((a, b) => a.orderIndex - b.orderIndex || a.id - b.id);
  const parallelItems = workspace.items.filter((item) => item.runMode !== 'sequential');

  const parallelPromises = parallelItems.map((item, index) =>
    delay(index * 50).then(() => launchWorkspaceItem(workspaceId, item, 'parallel'))
  );
  const sequentialPromise = sequentialItems.length > 0 ? launchSequentialItems(workspaceId, sequentialItems) : Promise.resolve();

  await Promise.all([...parallelPromises, sequentialPromise]);

  broadcastWorkspaceStatus(workspaceId);
  return { success: true };
});

ipcMain.handle('workspaces:stop', async (_event, workspaceId: number) => {
  await stopWorkspaceRuns(workspaceId);
  return { success: true };
});

// Settings IPC handlers
ipcMain.handle('settings:get', async (_event, key: string) => {
  return getSetting(key);
});

ipcMain.handle('settings:set', async (_event, payload: { key: string; value: string }) => {
  setSetting(payload.key, payload.value);
  
  // Restart auto-scan if interval changed
  if (payload.key === 'autoScanInterval') {
    startAutoScan();
  }
  
  return { success: true };
});

ipcMain.handle('settings:getAll', async () => {
  return getAllSettings();
});

ipcMain.handle('settings:delete', async (_event, key: string) => {
  deleteSetting(key);
  return { success: true };
});

// Script port configuration IPC handlers
ipcMain.handle('scripts:getExpectedPort', async (_event, payload: { projectId: string; scriptName: string }) => {
  return getScriptExpectedPort(payload.projectId, payload.scriptName);
});

ipcMain.handle('scripts:setExpectedPort', async (_event, payload: { projectId: string; scriptName: string; port: number | null }) => {
  setScriptExpectedPort(payload.projectId, payload.scriptName, payload.port);
  return { success: true };
});

ipcMain.handle('scripts:getAllExpectedPorts', async (_event, projectId: string) => {
  return getAllScriptExpectedPorts(projectId);
});

ipcMain.handle('shell:openExternal', async (_event, url: string) => {
  await shell.openExternal(url);
  return { success: true };
});

ipcMain.handle('git:status', async (_event, projectPath: string) => {
  return getGitStatus(projectPath);
});

// Detect package manager from lock files
function detectPackageManager(projectPath: string): 'npm' | 'pnpm' | 'yarn' | 'bun' {
  if (existsSync(join(projectPath, 'pnpm-lock.yaml'))) {
    return 'pnpm';
  }
  if (existsSync(join(projectPath, 'yarn.lock'))) {
    return 'yarn';
  }
  if (existsSync(join(projectPath, 'bun.lockb'))) {
    return 'bun';
  }
  if (existsSync(join(projectPath, 'package-lock.json'))) {
    return 'npm';
  }
  // Default to npm if no lock file found
  return 'npm';
}

ipcMain.handle('scripts:detectPackageManager', async (_event, projectPath: string) => {
  return detectPackageManager(projectPath);
});

ipcMain.handle('scripts:install', async (_event, payload: { projectPath: string; packageManager?: string }) => {
  const { projectPath, packageManager } = payload ?? {};
  if (!projectPath) {
    throw new Error('A project path is required');
  }

  const pm = packageManager || detectPackageManager(projectPath);
  const command = pm === 'yarn' ? ['yarn'] : pm === 'pnpm' ? ['pnpm', 'install'] : pm === 'bun' ? ['bun', 'install'] : ['npm', 'install'];
  const startedAt = Date.now();
  const child = spawn(command[0], command.slice(1), {
    cwd: projectPath,
    env: process.env,
    shell: process.platform === 'win32'
  });

  const runId = randomUUID();
  const commandString = command.join(' ');
  const record: ActiveProcess = {
    id: runId,
    script: 'install',
    command: commandString,
    projectPath,
    startedAt,
    child
  };
  activeProcesses.set(runId, record);

  child.stdout?.on('data', (chunk) => {
    broadcast('scripts:log', { runId, chunk: chunk.toString(), source: 'stdout', timestamp: Date.now() });
  });

  child.stderr?.on('data', (chunk) => {
    broadcast('scripts:log', { runId, chunk: chunk.toString(), source: 'stderr', timestamp: Date.now() });
  });

  child.once('error', (error) => {
    broadcast('scripts:error', {
      runId,
      script: 'install',
      projectPath,
      message: error.message,
      startedAt,
      timestamp: Date.now()
    });
    activeProcesses.delete(runId);
  });

  child.once('close', (code) => {
    const wasStopped = stoppedProcesses.has(runId);
    activeProcesses.delete(runId);
    stoppedProcesses.delete(runId);
    broadcast('scripts:exit', {
      runId,
      exitCode: code,
      finishedAt: Date.now(),
      script: 'install',
      command: commandString,
      projectPath,
      startedAt,
      wasStopped
    });
  });

  return { runId, startedAt, command: commandString, script: 'install', projectPath };
});

// Package management IPC handlers
ipcMain.handle('packages:getDependencies', async (_event, projectPath: string) => {
  try {
    const packageJsonPath = join(projectPath, 'package.json');
    if (!existsSync(packageJsonPath)) {
      return { dependencies: {}, devDependencies: {}, peerDependencies: {}, optionalDependencies: {} };
    }
    const fileContents = await readFile(packageJsonPath, 'utf-8');
    const packageJson = JSON.parse(fileContents);
    return {
      dependencies: packageJson.dependencies || {},
      devDependencies: packageJson.devDependencies || {},
      peerDependencies: packageJson.peerDependencies || {},
      optionalDependencies: packageJson.optionalDependencies || {}
    };
  } catch (error) {
    console.error('Error reading package.json:', error);
    throw error;
  }
});

ipcMain.handle('packages:scanNodeModules', async (_event, projectPath: string) => {
  try {
    const nodeModulesPath = join(projectPath, 'node_modules');
    if (!existsSync(nodeModulesPath)) {
      return {};
    }

    const installed: Record<string, { version?: string; path: string }> = {};
    
    // Read top-level packages in node_modules
    const entries = readdirSync(nodeModulesPath, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        const packagePath = join(nodeModulesPath, entry.name);
        const packageJsonPath = join(packagePath, 'package.json');
        
        if (existsSync(packageJsonPath)) {
          try {
            const packageJsonContent = await readFile(packageJsonPath, 'utf-8');
            const packageJson = JSON.parse(packageJsonContent);
            installed[entry.name] = {
              version: packageJson.version,
              path: packagePath
            };
          } catch {
            // Skip packages without valid package.json
            installed[entry.name] = { path: packagePath };
          }
        } else {
          // Scoped packages (e.g., @types/node)
          if (entry.name.startsWith('@')) {
            try {
              const scopedEntries = readdirSync(packagePath, { withFileTypes: true });
              for (const scopedEntry of scopedEntries) {
                if (scopedEntry.isDirectory()) {
                  const scopedPackagePath = join(packagePath, scopedEntry.name);
                  const scopedPackageJsonPath = join(scopedPackagePath, 'package.json');
                  if (existsSync(scopedPackageJsonPath)) {
                    try {
                      const packageJsonContent = await readFile(scopedPackageJsonPath, 'utf-8');
                      const packageJson = JSON.parse(packageJsonContent);
                      const fullName = `${entry.name}/${scopedEntry.name}`;
                      installed[fullName] = {
                        version: packageJson.version,
                        path: scopedPackagePath
                      };
                    } catch {
                      // Skip invalid packages
                    }
                  }
                }
              }
            } catch {
              // Skip if can't read scoped directory
            }
          }
        }
      }
    }
    
    return installed;
  } catch (error) {
    console.error('Error scanning node_modules:', error);
    return {};
  }
});

ipcMain.handle('packages:installPackage', async (_event, payload: { projectPath: string; packageName: string; version?: string; isDev?: boolean; packageManager?: string }) => {
  const { projectPath, packageName, version, isDev, packageManager } = payload ?? {};
  if (!projectPath || !packageName) {
    throw new Error('Project path and package name are required');
  }

  const pm = packageManager || detectPackageManager(projectPath);
  const packageSpec = version ? `${packageName}@${version}` : packageName;
  const command = pm === 'yarn' 
    ? ['yarn', 'add', ...(isDev ? ['--dev'] : []), packageSpec]
    : pm === 'pnpm'
    ? ['pnpm', 'add', ...(isDev ? ['--save-dev'] : []), packageSpec]
    : pm === 'bun'
    ? ['bun', 'add', ...(isDev ? ['--dev'] : []), packageSpec]
    : ['npm', 'install', ...(isDev ? ['--save-dev'] : []), packageSpec];
  
  const startedAt = Date.now();
  const child = spawn(command[0], command.slice(1), {
    cwd: projectPath,
    env: process.env,
    shell: process.platform === 'win32'
  });

  const runId = randomUUID();
  const commandString = command.join(' ');
  const record: ActiveProcess = {
    id: runId,
    script: `install-${packageName}`,
    command: commandString,
    projectPath,
    startedAt,
    child
  };
  activeProcesses.set(runId, record);

  child.stdout?.on('data', (chunk) => {
    broadcast('scripts:log', { runId, chunk: chunk.toString(), source: 'stdout', timestamp: Date.now() });
  });

  child.stderr?.on('data', (chunk) => {
    broadcast('scripts:log', { runId, chunk: chunk.toString(), source: 'stderr', timestamp: Date.now() });
  });

  child.once('error', (error) => {
    broadcast('scripts:error', {
      runId,
      script: `install-${packageName}`,
      projectPath,
      message: error.message,
      startedAt,
      timestamp: Date.now()
    });
    activeProcesses.delete(runId);
  });

  child.once('close', (code) => {
    const wasStopped = stoppedProcesses.has(runId);
    activeProcesses.delete(runId);
    stoppedProcesses.delete(runId);
    broadcast('scripts:exit', {
      runId,
      exitCode: code,
      finishedAt: Date.now(),
      script: `install-${packageName}`,
      command: commandString,
      projectPath,
      startedAt,
      wasStopped
    });
  });

  return { runId, startedAt, command: commandString, script: `install-${packageName}`, projectPath };
});
