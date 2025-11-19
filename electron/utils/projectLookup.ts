import { resolve } from 'node:path';

export function normalizePath(pathValue: string): string {
  try {
    return resolve(pathValue);
  } catch {
    return pathValue;
  }
}

type ProjectLike = {
  id: string;
  path: string;
};

export function findProjectIdByPath(
  projectPath: string,
  cachedProjects: ProjectLike[],
  loadProjects: () => ProjectLike[]
): string | null {
  const normalized = normalizePath(projectPath);

  const fromCache = cachedProjects.find((project) => normalizePath(project.path) === normalized);
  if (fromCache) {
    return fromCache.id;
  }

  const storedProjects = loadProjects();
  const stored = storedProjects.find((project) => normalizePath(project.path) === normalized);
  return stored?.id ?? null;
}

