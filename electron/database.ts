import { app } from 'electron';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { ProjectInfo, ScriptInfo } from './projectScanner';

// Use dynamic require to avoid bundling issues
let initSqlJs: any;
let Database: any;
let database: any = null;
let sqlJsModule: any = null;

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

async function initSqlJsModule() {
  if (!sqlJsModule) {
    // Dynamically require sql.js to avoid bundling issues
    if (!initSqlJs) {
      const sqljs = require('sql.js');
      initSqlJs = sqljs.default || sqljs;
      Database = sqljs.Database;
    }
    
    // sql.js will automatically find the .wasm file in node_modules
    // In Electron, we may need to provide the path explicitly
    const path = require('path');
    const sqlJsWasmPath = require.resolve('sql.js/dist/sql-wasm.wasm');
    sqlJsModule = await initSqlJs({
      locateFile: (file: string) => {
        // Return the path to the wasm file
        if (file.endsWith('.wasm')) {
          return sqlJsWasmPath;
        }
        // For other files, try to resolve them relative to sql.js
        const sqlJsDir = path.dirname(require.resolve('sql.js/package.json'));
        return path.join(sqlJsDir, 'dist', file);
      }
    });
  }
  return sqlJsModule;
}

export async function initializeDatabase() {
  if (database) {
    return database;
  }

  const SQL = await initSqlJsModule();
  const dbPath = getDatabasePath();
  ensureDirectory(dirname(dbPath));

  // Load existing database or create new one
  let db: any;
  if (existsSync(dbPath)) {
    const buffer = readFileSync(dbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  // Enable foreign keys
  db.run('PRAGMA foreign_keys = ON;');

  // Create tables
  db.run(`
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

  // Save the initial schema
  saveDatabase(db, dbPath);

  database = db;
  return db;
}

function saveDatabase(db: any, path: string) {
  const data = db.export();
  const buffer = Buffer.from(data);
  writeFileSync(path, buffer);
}

function getDatabase(): any {
  if (!database) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return database;
}

export async function saveProjects(projects: ProjectInfo[], scannedAt = Date.now()) {
  const db = getDatabase();
  const dbPath = getDatabasePath();

  // Begin transaction
  db.run('BEGIN TRANSACTION;');

  try {
    if (projects.length === 0) {
      db.run('DELETE FROM project_scripts;');
      db.run('DELETE FROM projects;');
    } else {
      // For sql.js, we'll use a simpler approach: delete and reinsert
      // First, delete all existing data
      db.run('DELETE FROM project_scripts;');
      db.run('DELETE FROM projects;');

      // Then insert all projects and scripts
      for (const project of projects) {
        db.run(
          'INSERT INTO projects (id, name, path, type, tags, last_scanned_at) VALUES (?, ?, ?, ?, ?, ?)',
          [
            project.id,
            project.name,
            project.path,
            project.type,
            JSON.stringify(project.tags ?? []),
            scannedAt
          ]
        );

        for (const script of project.scripts ?? []) {
          db.run(
            'INSERT INTO project_scripts (project_id, name, command, description) VALUES (?, ?, ?, ?)',
            [project.id, script.name, script.command, script.description ?? null]
          );
        }
      }
    }

    // Commit transaction
    db.run('COMMIT;');
    saveDatabase(db, dbPath);
  } catch (error) {
    db.run('ROLLBACK;');
    throw error;
  }
}

export function loadProjects(): StoredProject[] {
  const db = getDatabase();

  // Get all projects
  const projectResult = db.exec('SELECT * FROM projects ORDER BY name ASC');
  if (projectResult.length === 0) {
    return [];
  }

  const projectRows = projectResult[0];
  const projects: Array<{
    id: string;
    name: string;
    path: string;
    type: string;
    tags: string;
    last_scanned_at: number;
  }> = [];

  // sql.js returns results as arrays, we need to map column names
  const columns = projectRows.columns;
  for (const row of projectRows.values) {
    const project: any = {};
    columns.forEach((col: string, idx: number) => {
      project[col] = row[idx];
    });
    projects.push(project);
  }

  // Get all scripts
  const scriptResult = db.exec('SELECT * FROM project_scripts');
  const scriptsByProject = new Map<string, ScriptInfo[]>();

  if (scriptResult.length > 0) {
    const scriptRows = scriptResult[0];
    const scriptColumns = scriptRows.columns;
    for (const row of scriptRows.values) {
      const script: any = {};
      scriptColumns.forEach((col: string, idx: number) => {
        script[col] = row[idx];
      });
      const list = scriptsByProject.get(script.project_id) ?? [];
      list.push({
        name: script.name,
        command: script.command,
        description: script.description ?? undefined
      });
      scriptsByProject.set(script.project_id, list);
    }
  }

  return projects.map((row) => ({
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
