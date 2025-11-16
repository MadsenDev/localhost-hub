import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { scanProjects, type ProjectInfo } from './projectScanner';

const __dirname = dirname(fileURLToPath(import.meta.url));

process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';

const isMac = process.platform === 'darwin';

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

  let output = '';

  child.stdout?.on('data', (chunk) => {
    output += chunk.toString();
  });
  child.stderr?.on('data', (chunk) => {
    output += chunk.toString();
  });

  return await new Promise<{ exitCode: number | null; output: string; command: string; startedAt: number; finishedAt: number }>(
    (resolvePromise, rejectPromise) => {
      child.once('error', (error) => rejectPromise(error));
      child.once('close', (code) => {
        resolvePromise({
          exitCode: code,
          output,
          command: command.join(' '),
          startedAt,
          finishedAt: Date.now()
        });
      });
    }
  );
});
