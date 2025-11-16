import { createHash } from 'node:crypto';
import type { Dirent } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

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

type PackageJson = {
  name?: string;
  description?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  workspaces?: string[] | Record<string, string[]>;
  ['scripts-meta']?: Record<string, { description?: string } | string>;
  scriptsMeta?: Record<string, { description?: string } | string>;
};

const DEFAULT_MAX_DEPTH = Number(process.env.LOCALHOST_HUB_SCAN_DEPTH ?? '2');
const IGNORED_DIRS = new Set(['.git', 'node_modules', 'dist', 'build']);

export async function scanProjects(scanRoots: string[]): Promise<ProjectInfo[]> {
  const maxDepth = Number.isFinite(DEFAULT_MAX_DEPTH) ? DEFAULT_MAX_DEPTH : 2;
  const projects: ProjectInfo[] = [];
  const seenPaths = new Set<string>();

  for (const root of scanRoots) {
    const absoluteRoot = resolve(root.trim());
    if (!absoluteRoot || seenPaths.has(absoluteRoot)) {
      continue;
    }
    seenPaths.add(absoluteRoot);
    const fromRoot = await findProjectsInDirectory(absoluteRoot, maxDepth);
    projects.push(...fromRoot);
  }

  const uniqueByPath = new Map(projects.map((project) => [project.path, project] as const));
  return Array.from(uniqueByPath.values()).sort((a, b) => a.name.localeCompare(b.name));
}

async function findProjectsInDirectory(root: string, maxDepth: number): Promise<ProjectInfo[]> {
  const results: ProjectInfo[] = [];
  await walk(root, 0);
  return results;

  async function walk(directory: string, depth: number) {
    if (depth > maxDepth) {
      return;
    }

    let entries: Dirent[] = [];
    try {
      entries = (await readdir(directory, { withFileTypes: true })) as Dirent[];
    } catch (error) {
      return;
    }

    const hasPackageJson = entries.some((entry) => entry.isFile() && normalizeName(entry.name) === 'package.json');
    if (hasPackageJson) {
      try {
        const project = await createProjectFromDirectory(directory);
        results.push(project);
      } catch (error) {
        // ignore parse errors and continue walking
      }
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const entryName = normalizeName(entry.name);
      if (IGNORED_DIRS.has(entryName)) {
        continue;
      }
      await walk(join(directory, entryName), depth + 1);
    }
  }
}

function normalizeName(name: string | Buffer) {
  return typeof name === 'string' ? name : name.toString();
}

async function createProjectFromDirectory(directory: string): Promise<ProjectInfo> {
  const packageJsonPath = join(directory, 'package.json');
  const packageJson = await loadPackageJson(packageJsonPath);
  const scripts = extractScripts(packageJson);
  const detectedType = detectProjectType(packageJson);
  const tags = buildTags(packageJson);

  return {
    id: hashPath(directory),
    name: packageJson.name ?? basename(directory),
    path: directory,
    type: detectedType,
    tags,
    scripts
  };
}

async function loadPackageJson(path: string): Promise<PackageJson> {
  const fileContents = await readFile(path, 'utf-8');
  return JSON.parse(fileContents) as PackageJson;
}

function extractScripts(packageJson: PackageJson): ScriptInfo[] {
  const scripts = packageJson.scripts ?? {};
  const meta = packageJson['scripts-meta'] ?? packageJson.scriptsMeta ?? {};

  return Object.entries(scripts).map(([name, command]) => ({
    name,
    command,
    description: typeof meta[name] === 'string' ? (meta[name] as string) : (meta[name]?.description ?? undefined)
  }));
}

function detectProjectType(packageJson: PackageJson): string {
  const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
  if (!deps) {
    return 'Node Project';
  }
  if (deps.electron) {
    return 'Electron';
  }
  if (deps.next) {
    return 'Next.js';
  }
  if (deps.react && deps.vite) {
    return 'React + Vite';
  }
  if (deps.react) {
    return 'React';
  }
  if (deps.typescript) {
    return 'TypeScript';
  }
  return 'Node Project';
}

function buildTags(packageJson: PackageJson): string[] {
  const tags = new Set<string>();
  if (packageJson.dependencies?.typescript || packageJson.devDependencies?.typescript) {
    tags.add('TypeScript');
  }
  if (packageJson.dependencies?.electron || packageJson.devDependencies?.electron) {
    tags.add('Electron');
  }
  if (packageJson.workspaces) {
    tags.add('Workspace');
  }
  return Array.from(tags);
}

function hashPath(input: string) {
  return createHash('sha1').update(input).digest('hex').slice(0, 12);
}
