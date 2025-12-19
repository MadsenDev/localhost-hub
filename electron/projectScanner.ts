import { createHash } from 'node:crypto';
import type { Dirent } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { parse as parseToml } from 'toml';

export type ScriptInfo = {
  name: string;
  command: string;
  description?: string;
  runner?: 'npm' | 'cargo' | 'custom';
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

type CargoToml = {
  package?: {
    name?: string;
    description?: string;
  };
  alias?: Record<string, string>;
};

const DEFAULT_MAX_DEPTH = Number(process.env.LOCALHOST_HUB_SCAN_DEPTH ?? '2');
const DEFAULT_IGNORED_DIRS = new Set(['.git', 'node_modules', 'dist', 'build']);

export async function scanProjects(
  scanRoots: string[],
  options?: { maxDepth?: number; ignorePatterns?: string[] }
): Promise<ProjectInfo[]> {
  const maxDepth = options?.maxDepth !== undefined 
    ? (Number.isFinite(options.maxDepth) ? options.maxDepth : DEFAULT_MAX_DEPTH)
    : DEFAULT_MAX_DEPTH;
  
  // Build ignore set from patterns
  const ignoredDirs = new Set(DEFAULT_IGNORED_DIRS);
  if (options?.ignorePatterns) {
    for (const pattern of options.ignorePatterns) {
      const trimmed = pattern.trim();
      if (trimmed) {
        ignoredDirs.add(trimmed);
      }
    }
  }
  
  const projects: ProjectInfo[] = [];
  const seenPaths = new Set<string>();

  for (const root of scanRoots) {
    const absoluteRoot = resolve(root.trim());
    if (!absoluteRoot || seenPaths.has(absoluteRoot)) {
      continue;
    }
    seenPaths.add(absoluteRoot);
    const fromRoot = await findProjectsInDirectory(absoluteRoot, maxDepth, ignoredDirs);
    projects.push(...fromRoot);
  }

  const uniqueByPath = new Map(projects.map((project) => [project.path, project] as const));
  return Array.from(uniqueByPath.values()).sort((a, b) => a.name.localeCompare(b.name));
}

async function findProjectsInDirectory(root: string, maxDepth: number, ignoredDirs: Set<string>): Promise<ProjectInfo[]> {
  const results: ProjectInfo[] = [];
  await walk(root, 0);
  return results;

  async function walk(directory: string, depth: number) {
    if (maxDepth > 0 && depth > maxDepth) {
      return;
    }

    let entries: Dirent[] = [];
    try {
      entries = (await readdir(directory, { withFileTypes: true })) as Dirent[];
    } catch (error) {
      return;
    }

    const hasPackageJson = entries.some((entry) => entry.isFile() && normalizeName(entry.name) === 'package.json');
    const hasCargoToml = entries.some((entry) =>
      entry.isFile() && normalizeName(entry.name).toLowerCase() === 'cargo.toml'
    );

    if (hasPackageJson || hasCargoToml) {
      try {
        const project = await createProjectFromDirectory(directory, { hasPackageJson, hasCargoToml });
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
      if (ignoredDirs.has(entryName)) {
        continue;
      }
      await walk(join(directory, entryName), depth + 1);
    }
  }
}

function normalizeName(name: string | Buffer) {
  return typeof name === 'string' ? name : name.toString();
}

async function createProjectFromDirectory(
  directory: string,
  manifests: { hasPackageJson: boolean; hasCargoToml: boolean }
): Promise<ProjectInfo> {
  const packageJsonPath = join(directory, 'package.json');
  const cargoTomlPath = join(directory, 'Cargo.toml');

  const packageJson = manifests.hasPackageJson ? await loadPackageJson(packageJsonPath) : undefined;
  const cargoToml = manifests.hasCargoToml ? await loadCargoToml(cargoTomlPath) : undefined;

  const scripts = [...extractScripts(packageJson), ...extractCargoScripts(cargoToml)];
  const detectedType = detectProjectType(packageJson, cargoToml);
  const tags = buildTags(packageJson, cargoToml);

  return {
    id: hashPath(directory),
    name: packageJson?.name ?? cargoToml?.package?.name ?? basename(directory),
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

async function loadCargoToml(path: string): Promise<CargoToml> {
  const fileContents = await readFile(path, 'utf-8');
  return parseToml(fileContents) as CargoToml;
}

function extractScripts(packageJson?: PackageJson): ScriptInfo[] {
  if (!packageJson) return [];

  const scripts = packageJson.scripts ?? {};
  const meta = packageJson['scripts-meta'] ?? packageJson.scriptsMeta ?? {};

  return Object.entries(scripts).map(([name, command]) => ({
    name,
    command,
    description: typeof meta[name] === 'string' ? (meta[name] as string) : (meta[name]?.description ?? undefined),
    runner: 'npm'
  }));
}

function extractCargoScripts(cargoToml?: CargoToml): ScriptInfo[] {
  if (!cargoToml) return [];

  const scripts = new Map<string, ScriptInfo>();
  const addScript = (script: ScriptInfo) => {
    scripts.set(script.name, { ...script, runner: 'cargo' });
  };

  const defaultCommands: Array<[string, string, string]> = [
    ['build', 'cargo build', 'Compile the current package and dependencies.'],
    ['check', 'cargo check', 'Type-check the package without producing binaries.'],
    ['run', 'cargo run', 'Build and run the current package.'],
    ['test', 'cargo test', 'Execute all tests.'],
    ['fmt', 'cargo fmt', 'Format the codebase using rustfmt.'],
    ['clippy', 'cargo clippy', 'Lint using Clippy.'],
    ['doc', 'cargo doc', 'Build documentation for the project.']
  ];

  for (const [name, command, description] of defaultCommands) {
    addScript({ name, command, description });
  }

  if (cargoToml.alias && typeof cargoToml.alias === 'object') {
    for (const [aliasName, aliasTarget] of Object.entries(cargoToml.alias)) {
      if (typeof aliasTarget !== 'string') continue;
      const trimmedTarget = aliasTarget.trim();
      const description = trimmedTarget ? `Alias for "${trimmedTarget}"` : undefined;
      addScript({ name: aliasName, command: `cargo ${aliasName}`, description });
    }
  }

  return Array.from(scripts.values());
}

function detectProjectType(packageJson?: PackageJson, cargoToml?: CargoToml): string {
  if (cargoToml && !packageJson) {
    return 'Rust (Cargo)';
  }

  const deps = { ...packageJson?.dependencies, ...packageJson?.devDependencies };
  if (!deps && !cargoToml) {
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
  if (cargoToml) {
    return 'Rust (Cargo)';
  }
  return 'Node Project';
}

function buildTags(packageJson?: PackageJson, cargoToml?: CargoToml): string[] {
  const tags = new Set<string>();
  if (packageJson?.dependencies?.typescript || packageJson?.devDependencies?.typescript) {
    tags.add('TypeScript');
  }
  if (packageJson?.dependencies?.electron || packageJson?.devDependencies?.electron) {
    tags.add('Electron');
  }
  if (packageJson?.workspaces) {
    tags.add('Workspace');
  }
  if (cargoToml) {
    tags.add('Rust');
  }
  return Array.from(tags);
}

function hashPath(input: string) {
  return createHash('sha1').update(input).digest('hex').slice(0, 12);
}
