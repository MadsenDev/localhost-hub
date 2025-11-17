import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { randomUUID } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { scanProjects, type ProjectInfo } from './projectScanner';

const __dirname = dirname(fileURLToPath(import.meta.url));

process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';

const isMac = process.platform === 'darwin';
let mainWindow: BrowserWindow | null = null;

type ActiveProcess = {
  id: string;
  script: string;
  command: string;
  projectPath: string;
  startedAt: number;
  child: ReturnType<typeof spawn>;
};

const activeProcesses = new Map<string, ActiveProcess>();

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1000,
    minHeight: 640,
    title: 'Localhost Hub',
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: join(__dirname, '../preload.js'),
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
    window.loadFile(join(__dirname, '../renderer/index.html'));
  }

  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow = window;
}

app.whenReady().then(() => {
  createWindow();

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
  cachedProjects = await scanProjects(scanRoots);
  return cachedProjects;
}

ipcMain.handle('projects:list', async () => {
  if (cachedProjects.length === 0) {
    await performProjectScan();
  }
  return cachedProjects;
});

ipcMain.handle('projects:scan', async (_event, directories?: string[]) => {
  return performProjectScan(directories);
});

ipcMain.handle('scripts:run', async (_event, payload: { projectPath: string; script: string }) => {
  const { projectPath, script } = payload ?? {};
  if (!projectPath || !script) {
    throw new Error('A project path and script name are required');
  }

  const command = ['npm', 'run', script];
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
    script,
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
      script,
      projectPath,
      message: error.message,
      startedAt,
      timestamp: Date.now()
    });
    activeProcesses.delete(runId);
  });

  child.once('close', (code) => {
    activeProcesses.delete(runId);
    broadcast('scripts:exit', {
      runId,
      exitCode: code,
      finishedAt: Date.now(),
      script,
      command: commandString,
      projectPath,
      startedAt
    });
  });

  return { runId, startedAt, command: commandString, script, projectPath };
});

ipcMain.handle('scripts:stop', async (_event, runId: string) => {
  const active = activeProcesses.get(runId);
  if (!active) {
    return { success: false };
  }

  active.child.kill('SIGTERM');
  setTimeout(() => {
    if (!active.child.killed) {
      active.child.kill('SIGKILL');
    }
  }, 3000);

  return { success: true };
});

ipcMain.handle('processes:active', () => {
  return Array.from(activeProcesses.values()).map(({ id, script, command, projectPath, startedAt }) => ({
    id,
    script,
    command,
    projectPath,
    startedAt
  }));
});

ipcMain.handle('logs:export', async (_event, payload: { contents?: string; suggestedName?: string }) => {
  const window = BrowserWindow.getFocusedWindow() ?? mainWindow ?? undefined;
  const suggestedName = payload?.suggestedName ?? `localhost-hub-log-${new Date().toISOString()}.txt`;
  const result = await dialog.showSaveDialog(window, {
    title: 'Save logs',
    defaultPath: suggestedName,
    filters: [{ name: 'Text Files', extensions: ['txt', 'log'] }]
  });

  if (result.canceled || !result.filePath) {
    return { saved: false };
  }

  await writeFile(result.filePath, payload?.contents ?? '', 'utf8');
  return { saved: true, filePath: result.filePath };
});
