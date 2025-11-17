import Database from 'better-sqlite3';
import { app } from 'electron';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { ProjectInfo, ScriptInfo } from './projectScanner';

let database: Database.Database | null = null;

export type StoredProject = ProjectInfo & {
  lastScannedAt: number;
};

function getDatabasePath() {
  const userData = app.getPath('userData');
  return join(userData, 'storage', 'localhost-hub.db');
}

function ensureDirectory(path: string) {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}

export function initializeDatabase() {
  if (database) {
    return database;
  }
  const dbPath = getDatabasePath();
  ensureDirectory(dirname(dbPath));
  const instance = new Database(dbPath);
  instance.pragma('journal_mode = WAL');
  instance.pragma('foreign_keys = ON');

  instance.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]',
      last_scanned_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS project_scripts (
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      command TEXT NOT NULL,
      description TEXT,
      PRIMARY KEY (project_id, name),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
  `);

  database = instance;
  return instance;
}

function getDatabase() {
  return database ?? initializeDatabase();
}

export function saveProjects(projects: ProjectInfo[], scannedAt = Date.now()) {
  const db = getDatabase();
  if (projects.length === 0) {
    db.exec('DELETE FROM project_scripts; DELETE FROM projects;');
    return;
  }
  const insertProject = db.prepare(`
    INSERT INTO projects (id, name, path, type, tags, last_scanned_at)
    VALUES (@id, @name, @path, @type, @tags, @last_scanned_at)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      path = excluded.path,
      type = excluded.type,
      tags = excluded.tags,
      last_scanned_at = excluded.last_scanned_at;
  `);
  const deleteScripts = db.prepare('DELETE FROM project_scripts WHERE project_id = ?');
  const insertScript = db.prepare(`
    INSERT INTO project_scripts (project_id, name, command, description)
    VALUES (@project_id, @name, @command, @description)
    ON CONFLICT(project_id, name) DO UPDATE SET
      command = excluded.command,
      description = excluded.description;
  `);

  const transaction = db.transaction((entries: ProjectInfo[]) => {
    for (const project of entries) {
      insertProject.run({
        id: project.id,
        name: project.name,
        path: project.path,
        type: project.type,
        tags: JSON.stringify(project.tags ?? []),
        last_scanned_at: scannedAt
      });
      deleteScripts.run(project.id);
      for (const script of project.scripts ?? []) {
        insertScript.run({
          project_id: project.id,
          name: script.name,
          command: script.command,
          description: script.description ?? null
        });
      }
    }
  });

  transaction(projects);
}

export function loadProjects(): StoredProject[] {
  const db = getDatabase();
  const projectRows = db
    .prepare<[], { id: string; name: string; path: string; type: string; tags: string; last_scanned_at: number }>(
      'SELECT * FROM projects ORDER BY name ASC'
    )
    .all();
  const scriptRows = db
    .prepare<[], { project_id: string; name: string; command: string; description: string | null }>(
      'SELECT * FROM project_scripts'
    )
    .all();
  const scriptsByProject = new Map<string, ScriptInfo[]>();
  for (const row of scriptRows) {
    const list = scriptsByProject.get(row.project_id) ?? [];
    list.push({ name: row.name, command: row.command, description: row.description ?? undefined });
    scriptsByProject.set(row.project_id, list);
  }

  return projectRows.map((row) => ({
    id: row.id,
    name: row.name,
    path: row.path,
    type: row.type,
    tags: safeParseTags(row.tags),
    scripts: scriptsByProject.get(row.id) ?? [],
    lastScannedAt: row.last_scanned_at
  }));
}

function safeParseTags(value: unknown): string[] {
  if (typeof value !== 'string') {
    return [];
  }
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed.filter((tag) => typeof tag === 'string') as string[]) : [];
  } catch {
    return [];
  }
}
