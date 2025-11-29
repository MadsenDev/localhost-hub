
import { app, ipcMain } from 'electron';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { existsSync } from 'node:fs';

type PluginSource = 'builtin' | 'user';

type LaunchTarget = {
  path: string;
  args?: string[];
  cwd?: string;
};

type PluginProjectAction = {
  id: string;
  label: string;
  description?: string;
  requiredContext?: string[];
};

type LaunchConfig = {
  requiredContext?: string[];
  gallery?: boolean;
  targets?: Partial<Record<NodeJS.Platform, LaunchTarget>>;
  projectActions?: PluginProjectAction[];
};

export type RawPluginManifest = {
  id: string;
  name: string;
  description?: string;
  version?: string;
  author?: string;
  icon?: string;
  homepage?: string;
  capabilities?: string[];
  minHostVersion?: string;
  type?: 'embedded' | 'externalApp';
  launch?: LaunchConfig;
};

type PluginRecord = {
  manifest: RawPluginManifest;
  source: PluginSource;
  baseDir: string;
  iconPath?: string;
};

type SerializedPlugin = RawPluginManifest & {
  source: PluginSource;
  iconDataUrl?: string | null;
};

const pluginRegistry = new Map<string, PluginRecord>();
let lastScan = 0;
const SCAN_INTERVAL_MS = 5_000;

const getPluginRoots = () => {
  const devRoot = path.join(process.cwd(), 'plugins');
  const userRoot = path.join(app.getPath('userData'), 'plugins');
  const packagedRoot = path.join(process.resourcesPath, 'plugins');

  const roots: Array<{ dir: string; source: PluginSource }> = [];

  if (app.isPackaged) {
    roots.push({ dir: packagedRoot, source: 'builtin' });
  } else {
    roots.push({ dir: devRoot, source: 'builtin' });
  }

  roots.push({ dir: userRoot, source: 'user' });
  return roots;
};

async function readManifest(manifestPath: string): Promise<RawPluginManifest | null> {
  try {
    const raw = await fs.readFile(manifestPath, 'utf-8');
    const parsed = JSON.parse(raw) as RawPluginManifest;
    if (!parsed.id || !parsed.name) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function encodeIcon(iconPath?: string) {
  if (!iconPath || !existsSync(iconPath)) return null;
  try {
    const data = await fs.readFile(iconPath);
    const ext = path.extname(iconPath).replace('.', '') || 'png';
    const mime = ext === 'svg' ? 'image/svg+xml' : `image/${ext}`;
    return `data:${mime};base64,${data.toString('base64')}`;
  } catch {
    return null;
  }
}

async function scanPlugins(force = false) {
  const now = Date.now();
  if (!force && now - lastScan < SCAN_INTERVAL_MS) {
    return;
  }
  pluginRegistry.clear();

  for (const { dir, source } of getPluginRoots()) {
    if (!existsSync(dir)) continue;
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const baseDir = path.join(dir, entry.name);
      const manifestPath = path.join(baseDir, 'manifest.json');
      if (!existsSync(manifestPath)) continue;
      const manifest = await readManifest(manifestPath);
      if (!manifest) continue;

      const iconPath = manifest.icon ? path.resolve(baseDir, manifest.icon) : undefined;

      pluginRegistry.set(manifest.id, {
        manifest,
        source,
        baseDir,
        iconPath: iconPath && existsSync(iconPath) ? iconPath : undefined,
      });
    }
  }
  lastScan = Date.now();
}

function resolveExecutablePath(inputPath: string, baseDir: string) {
  let target = inputPath.trim();
  if (target.startsWith('~')) {
    target = path.join(os.homedir(), target.slice(1));
  }
  if (!path.isAbsolute(target)) {
    target = path.resolve(baseDir, target);
  }
  target = target.replace(/%([^%]+)%/g, (_, key) => process.env[key] ?? '');
  target = target.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (_, key) => process.env[key] ?? '');
  return target;
}

function substituteArg(template: string, context: Record<string, string>) {
  return template.replace(/\{([^}]+)\}/g, (_match, key) => context[key] ?? '');
}

function ensureLaunchTarget(manifest: RawPluginManifest) {
  const launch = manifest.launch;
  if (!launch || !launch.targets) {
    throw new Error('Plugin does not declare launch targets.');
  }
  const target = launch.targets[process.platform];
  if (!target) {
    throw new Error(`Plugin does not support platform "${process.platform}".`);
  }
  return target;
}

export function registerPluginHandlers() {
  ipcMain.handle('plugins:list', async () => {
    await scanPlugins();
    const results: SerializedPlugin[] = [];
    for (const record of pluginRegistry.values()) {
      const iconDataUrl = await encodeIcon(record.iconPath);
      results.push({
        ...record.manifest,
        source: record.source,
        iconDataUrl,
      });
    }
    return results;
  });

  ipcMain.handle(
    'plugins:launch-external',
    async (_event, payload: { pluginId: string; context?: Record<string, string> }) => {
      await scanPlugins();
      const record = pluginRegistry.get(payload.pluginId);
      if (!record) {
        throw new Error(`Plugin "${payload.pluginId}" not found`);
      }
      const target = ensureLaunchTarget(record.manifest);
      const context = payload.context ?? {};
      const required = record.manifest.launch?.requiredContext ?? [];
      for (const key of required) {
        if (!context[key]) {
          throw new Error(`Missing required context field "${key}" for plugin "${record.manifest.id}".`);
        }
      }
      const executablePath = resolveExecutablePath(target.path, record.baseDir);
      try {
        await fs.access(executablePath);
      } catch {
        throw new Error(`Executable not found: ${executablePath}`);
      }
      const args = (target.args ?? []).map((arg) => substituteArg(arg, context));
      const cwd = target.cwd ? resolveExecutablePath(target.cwd, record.baseDir) : undefined;
      const child = spawn(executablePath, args, {
        cwd,
        detached: true,
        stdio: 'ignore',
        shell: process.platform === 'win32',
      });
      child.unref();
    }
  );
}
