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

// Helper function to safely add columns to existing tables
function addColumnIfNotExists(db: any, table: string, column: string, definition: string) {
  try {
    // Try to select the column - if it doesn't exist, this will fail
    db.exec(`SELECT ${column} FROM ${table} LIMIT 1`);
  } catch {
    // Column doesn't exist, add it
    try {
      db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    } catch (err) {
      // Ignore errors (column might already exist or table might not exist)
      console.warn(`Could not add column ${column} to ${table}:`, err);
    }
  }
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

  // Create/update projects table
  db.run(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]',
      last_scanned_at INTEGER NOT NULL
    );
  `);

  // Add new columns to projects table if they don't exist
  addColumnIfNotExists(db, 'projects', 'detected_at', 'INTEGER');
  addColumnIfNotExists(db, 'projects', 'package_json_path', 'TEXT');
  addColumnIfNotExists(db, 'projects', 'git_repo', 'INTEGER DEFAULT 0');
  addColumnIfNotExists(db, 'projects', 'notes', 'TEXT');
  addColumnIfNotExists(db, 'projects', 'favorite', 'INTEGER DEFAULT 0');

  // Keep project_scripts for backward compatibility
  db.run(`
    CREATE TABLE IF NOT EXISTS project_scripts (
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      command TEXT NOT NULL,
      description TEXT,
      runner TEXT,
      PRIMARY KEY (project_id, name),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
  `);

  // Add expected_port column to project_scripts if it doesn't exist
  addColumnIfNotExists(db, 'project_scripts', 'expected_port', 'INTEGER');
  addColumnIfNotExists(db, 'project_scripts', 'runner', 'TEXT');

  // Create new scripts table (preferred going forward)
  db.run(`
    CREATE TABLE IF NOT EXISTS scripts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      command TEXT NOT NULL,
      runner TEXT,
      raw_script TEXT,
      description TEXT,
      is_default INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      UNIQUE(project_id, name)
    );
  `);

  addColumnIfNotExists(db, 'scripts', 'runner', 'TEXT');

  // Create env_profiles table
  db.run(`
    CREATE TABLE IF NOT EXISTS env_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      is_default INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      UNIQUE(project_id, name)
    );
  `);

  // Create env_vars table
  db.run(`
    CREATE TABLE IF NOT EXISTS env_vars (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      env_profile_id INTEGER NOT NULL,
      key TEXT NOT NULL,
      value TEXT,
      is_secret INTEGER DEFAULT 0,
      FOREIGN KEY (env_profile_id) REFERENCES env_profiles(id) ON DELETE CASCADE,
      UNIQUE(env_profile_id, key)
    );
  `);

  // Create workspaces table
  db.run(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      favorite INTEGER DEFAULT 0
    );
  `);

  // Create workspace_items table
  db.run(`
    CREATE TABLE IF NOT EXISTS workspace_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER NOT NULL,
      script_id INTEGER NOT NULL,
      env_profile_id INTEGER,
      order_index INTEGER DEFAULT 0,
      run_mode TEXT DEFAULT 'parallel',
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
      FOREIGN KEY (script_id) REFERENCES scripts(id) ON DELETE CASCADE,
      FOREIGN KEY (env_profile_id) REFERENCES env_profiles(id)
    );
  `);
  addColumnIfNotExists(db, 'workspace_items', 'project_id', 'TEXT');
  addColumnIfNotExists(db, 'workspace_items', 'project_path', 'TEXT');
  addColumnIfNotExists(db, 'workspace_items', 'script_name', 'TEXT');
  addColumnIfNotExists(db, 'workspace_items', 'command', 'TEXT');

  // Create process_instances table
  db.run(`
    CREATE TABLE IF NOT EXISTS process_instances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      script_id INTEGER NOT NULL,
      workspace_id INTEGER,
      env_profile_id INTEGER,
      pid INTEGER,
      status TEXT NOT NULL,
      exit_code INTEGER,
      started_at INTEGER NOT NULL,
      stopped_at INTEGER,
      last_log_at INTEGER,
      port_hint INTEGER,
      command_executed TEXT NOT NULL,
      FOREIGN KEY (script_id) REFERENCES scripts(id) ON DELETE CASCADE,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
      FOREIGN KEY (env_profile_id) REFERENCES env_profiles(id)
    );
  `);

  // Create log_chunks table
  db.run(`
    CREATE TABLE IF NOT EXISTS log_chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      process_instance_id INTEGER NOT NULL,
      timestamp INTEGER NOT NULL,
      stream TEXT NOT NULL,
      content TEXT NOT NULL,
      FOREIGN KEY (process_instance_id) REFERENCES process_instances(id) ON DELETE CASCADE
    );
  `);

  // Create scan_roots table
  db.run(`
    CREATE TABLE IF NOT EXISTS scan_roots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT NOT NULL UNIQUE,
      added_at INTEGER NOT NULL,
      last_scanned_at INTEGER
    );
  `);

  // Create settings table
  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  // Create docker_configs table
  db.run(`
    CREATE TABLE IF NOT EXISTS docker_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL,
      has_dockerfile INTEGER DEFAULT 0,
      has_compose INTEGER DEFAULT 0,
      compose_file_path TEXT,
      info TEXT,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      UNIQUE(project_id)
    );
  `);

  // Create docker_services table
  db.run(`
    CREATE TABLE IF NOT EXISTS docker_services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      docker_config_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      port_mapping TEXT,
      FOREIGN KEY (docker_config_id) REFERENCES docker_configs(id) ON DELETE CASCADE
    );
  `);

  // Save the schema
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
      db.run('DELETE FROM scripts;');
    } else {
      // Get existing projects to preserve detected_at
      const existingProjects = new Map<string, number>();
      try {
        const existingResult = db.exec('SELECT id, detected_at FROM projects');
        if (existingResult.length > 0) {
          const columns = existingResult[0].columns;
          const idIdx = columns.indexOf('id');
          const detectedAtIdx = columns.indexOf('detected_at');
          for (const row of existingResult[0].values) {
            const id = row[idIdx] as string;
            const detectedAt = row[detectedAtIdx] as number | null;
            if (detectedAt) {
              existingProjects.set(id, detectedAt);
            }
          }
        }
      } catch {
        // Table might not have detected_at column yet, ignore
      }

      // For sql.js, we'll use a simpler approach: delete and reinsert
      // First, preserve custom scripts (runner = 'custom')
      const customScriptsResult = db.exec("SELECT * FROM project_scripts WHERE runner = 'custom'");
      const customScripts: Array<{ project_id: string; name: string; command: string; description: string | null; runner: string }> = [];
      
      if (customScriptsResult.length > 0) {
        const scriptRows = customScriptsResult[0];
        const scriptColumns = scriptRows.columns;
        for (const row of scriptRows.values) {
          const script: any = {};
          scriptColumns.forEach((col: string, idx: number) => {
            script[col] = row[idx];
          });
          customScripts.push(script);
        }
      }

      // Delete all existing data (custom scripts will be re-added)
      db.run('DELETE FROM project_scripts;');
      db.run('DELETE FROM scripts;');
      db.run('DELETE FROM projects;');

      // Then insert all projects and scripts
      for (const project of projects) {
        // Preserve detected_at if project already existed, otherwise use current time
        const detectedAt = existingProjects.get(project.id) ?? scannedAt;

        db.run(
          'INSERT INTO projects (id, name, path, type, tags, last_scanned_at, detected_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [
            project.id,
            project.name,
            project.path,
            project.type,
            JSON.stringify(project.tags ?? []),
            scannedAt,
            detectedAt
          ]
        );

        for (const script of project.scripts ?? []) {
          db.run(
            'INSERT INTO project_scripts (project_id, name, command, description, runner) VALUES (?, ?, ?, ?, ?)',
            [project.id, script.name, script.command, script.description ?? null, script.runner ?? 'npm']
          );
          db.run(
            `INSERT INTO scripts (project_id, name, command, runner, raw_script, description, is_default, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              project.id,
              script.name,
              script.command,
              script.runner ?? 'npm',
              script.command,
              script.description ?? null,
              0,
              scannedAt,
              scannedAt
            ]
          );
        }
      }
      
      // Re-add custom scripts for projects that still exist
      for (const customScript of customScripts) {
        const projectExists = projects.some((p) => p.id === customScript.project_id);
        if (projectExists) {
          const escapedProjectId = customScript.project_id.replace(/'/g, "''");
          const escapedName = customScript.name.replace(/'/g, "''");
          const escapedCommand = customScript.command.replace(/'/g, "''");
          const escapedDescription = customScript.description ? customScript.description.replace(/'/g, "''") : 'NULL';
          
          // Check if a detected script with the same name exists (don't overwrite)
          const hasDetectedScript = projects
            .find((p) => p.id === customScript.project_id)
            ?.scripts?.some((s) => s.name === customScript.name);
          
          if (!hasDetectedScript) {
            db.run(
              `INSERT INTO project_scripts (project_id, name, command, description, runner) VALUES ('${escapedProjectId}', '${escapedName}', '${escapedCommand}', ${escapedDescription === 'NULL' ? 'NULL' : `'${escapedDescription}'`}, 'custom')`
            );
            db.run(
              `INSERT INTO scripts (project_id, name, command, runner, raw_script, description, is_default, created_at, updated_at) VALUES ('${escapedProjectId}', '${escapedName}', '${escapedCommand}', 'custom', '${escapedCommand}', ${escapedDescription === 'NULL' ? 'NULL' : `'${escapedDescription}'`}, 0, ${scannedAt}, ${scannedAt})`
            );
          }
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
        description: script.description ?? undefined,
        runner: script.runner ?? 'npm'
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

// Add a custom script to a project
export function addCustomScript(projectId: string, name: string, command: string, description?: string): void {
  const db = getDatabase();
  const dbPath = getDatabasePath();
  
  try {
    const escapedProjectId = projectId.replace(/'/g, "''");
    const escapedName = name.replace(/'/g, "''");
    const escapedCommand = command.replace(/'/g, "''");
    const escapedDescription = description ? description.replace(/'/g, "''") : 'NULL';
    const now = Date.now();
    
    // Check if script already exists
    const existingResult = db.exec(`SELECT name FROM project_scripts WHERE project_id = '${escapedProjectId}' AND name = '${escapedName}'`);
    if (existingResult.length > 0 && existingResult[0].values.length > 0) {
      throw new Error(`Script "${name}" already exists`);
    }
    
    // Insert into project_scripts (for compatibility)
    db.run(
      `INSERT INTO project_scripts (project_id, name, command, description, runner) VALUES ('${escapedProjectId}', '${escapedName}', '${escapedCommand}', ${escapedDescription === 'NULL' ? 'NULL' : `'${escapedDescription}'`}, 'custom')`
    );
    
    // Insert into scripts table
    db.run(
      `INSERT INTO scripts (project_id, name, command, runner, raw_script, description, is_default, created_at, updated_at) VALUES ('${escapedProjectId}', '${escapedName}', '${escapedCommand}', 'custom', '${escapedCommand}', ${escapedDescription === 'NULL' ? 'NULL' : `'${escapedDescription}'`}, 0, ${now}, ${now})`
    );
    
    saveDatabase(db, dbPath);
  } catch (error) {
    console.error('Error adding custom script:', error);
    throw error;
  }
}

// Delete a custom script from a project
export function deleteCustomScript(projectId: string, name: string): void {
  const db = getDatabase();
  const dbPath = getDatabasePath();
  
  try {
    const escapedProjectId = projectId.replace(/'/g, "''");
    const escapedName = name.replace(/'/g, "''");
    
    // Only delete if it's a custom script (runner = 'custom')
    const checkResult = db.exec(`SELECT runner FROM project_scripts WHERE project_id = '${escapedProjectId}' AND name = '${escapedName}'`);
    if (checkResult.length === 0 || checkResult[0].values.length === 0) {
      throw new Error(`Script "${name}" not found`);
    }
    
    const runner = checkResult[0].values[0][0];
    if (runner !== 'custom') {
      throw new Error(`Cannot delete detected script "${name}". Only custom scripts can be deleted.`);
    }
    
    // Delete from both tables
    db.run(`DELETE FROM project_scripts WHERE project_id = '${escapedProjectId}' AND name = '${escapedName}'`);
    db.run(`DELETE FROM scripts WHERE project_id = '${escapedProjectId}' AND name = '${escapedName}'`);
    
    saveDatabase(db, dbPath);
  } catch (error) {
    console.error('Error deleting custom script:', error);
    throw error;
  }
}

// Environment Profile Types
export type EnvProfile = {
  id: number;
  projectId: string;
  name: string;
  description?: string;
  isDefault: boolean;
  createdAt: number;
  updatedAt: number;
};

export type EnvVar = {
  id: number;
  envProfileId: number;
  key: string;
  value: string;
  isSecret: boolean;
};

export type EnvProfileWithVars = EnvProfile & {
  vars: EnvVar[];
};

// Get all env profiles for a project
export function getEnvProfiles(projectId: string): EnvProfileWithVars[] {
  const db = getDatabase();

  try {
    // Use exec with proper escaping for parameterized query
    const escapedProjectId = projectId.replace(/'/g, "''");
    const profilesResult = db.exec(`SELECT * FROM env_profiles WHERE project_id = '${escapedProjectId}' ORDER BY is_default DESC, name ASC`);
    
    if (profilesResult.length === 0) {
      return [];
    }

    const profiles: EnvProfileWithVars[] = [];
    const columns = profilesResult[0].columns;

    for (const row of profilesResult[0].values) {
      const profile: any = {};
      columns.forEach((col: string, idx: number) => {
        profile[col] = row[idx];
      });

      // Get env vars for this profile
      const escapedProfileId = String(profile.id).replace(/'/g, "''");
      const varsResult = db.exec(`SELECT * FROM env_vars WHERE env_profile_id = ${escapedProfileId} ORDER BY key ASC`);
      const vars: EnvVar[] = [];

      if (varsResult.length > 0) {
        const varColumns = varsResult[0].columns;
        for (const varRow of varsResult[0].values) {
          const envVar: any = {};
          varColumns.forEach((col: string, idx: number) => {
            envVar[col] = varRow[idx];
          });
          vars.push({
            id: envVar.id,
            envProfileId: envVar.env_profile_id,
            key: envVar.key,
            value: envVar.value || '',
            isSecret: Boolean(envVar.is_secret)
          });
        }
      }

      profiles.push({
        id: profile.id,
        projectId: profile.project_id,
        name: profile.name,
        description: profile.description || undefined,
        isDefault: Boolean(profile.is_default),
        createdAt: profile.created_at,
        updatedAt: profile.updated_at,
        vars
      });
    }

    return profiles;
  } catch (error) {
    console.error('Error getting env profiles:', error);
    return [];
  }
}

// Create an env profile
export function createEnvProfile(projectId: string, name: string, description?: string, isDefault = false): number {
  const db = getDatabase();
  const dbPath = getDatabasePath();

  db.run('BEGIN TRANSACTION;');

  try {
    // If this is set as default, unset other defaults for this project
    if (isDefault) {
      const escapedProjectId = projectId.replace(/'/g, "''");
      db.run(`UPDATE env_profiles SET is_default = 0 WHERE project_id = '${escapedProjectId}'`);
    }

    const now = Date.now();
    const escapedProjectId = projectId.replace(/'/g, "''");
    const escapedName = name.replace(/'/g, "''");
    const escapedDescription = description ? description.replace(/'/g, "''") : 'NULL';
    db.run(
      `INSERT INTO env_profiles (project_id, name, description, is_default, created_at, updated_at) VALUES ('${escapedProjectId}', '${escapedName}', ${escapedDescription === 'NULL' ? 'NULL' : `'${escapedDescription}'`}, ${isDefault ? 1 : 0}, ${now}, ${now})`
    );

    const result = db.exec('SELECT last_insert_rowid() as id');
    const profileId = result[0].values[0][0] as number;

    db.run('COMMIT;');
    saveDatabase(db, dbPath);

    return profileId;
  } catch (error) {
    db.run('ROLLBACK;');
    throw error;
  }
}

// Update an env profile
export function updateEnvProfile(profileId: number, updates: { name?: string; description?: string; isDefault?: boolean }): void {
  const db = getDatabase();
  const dbPath = getDatabasePath();

  db.run('BEGIN TRANSACTION;');

  try {
    // Get current profile to check project_id
    const escapedProfileId = String(profileId).replace(/'/g, "''");
    const currentResult = db.exec(`SELECT project_id FROM env_profiles WHERE id = ${escapedProfileId}`);
    if (currentResult.length === 0 || currentResult[0].values.length === 0) {
      throw new Error('Profile not found');
    }
    const projectId = currentResult[0].values[0][0] as string;

    // If setting as default, unset other defaults
    if (updates.isDefault) {
      const escapedProjectId = projectId.replace(/'/g, "''");
      db.run(`UPDATE env_profiles SET is_default = 0 WHERE project_id = '${escapedProjectId}'`);
    }

    // Build the SQL with escaped values
    const setParts: string[] = [];
    
    if (updates.name !== undefined) {
      const escapedName = String(updates.name).replace(/'/g, "''");
      setParts.push(`name = '${escapedName}'`);
    }
    if (updates.description !== undefined) {
      const escapedDesc = updates.description ? String(updates.description).replace(/'/g, "''") : 'NULL';
      setParts.push(`description = ${escapedDesc === 'NULL' ? 'NULL' : `'${escapedDesc}'`}`);
    }
    if (updates.isDefault !== undefined) {
      setParts.push(`is_default = ${updates.isDefault ? 1 : 0}`);
    }
    setParts.push(`updated_at = ${Date.now()}`);

    db.run(`UPDATE env_profiles SET ${setParts.join(', ')} WHERE id = ${escapedProfileId}`);

    db.run('COMMIT;');
    saveDatabase(db, dbPath);
  } catch (error) {
    db.run('ROLLBACK;');
    throw error;
  }
}

// Delete an env profile
export function deleteEnvProfile(profileId: number): void {
  const db = getDatabase();
  const dbPath = getDatabasePath();

  db.run('BEGIN TRANSACTION;');

  try {
    // Cascade delete will handle env_vars
    const escapedProfileId = String(profileId).replace(/'/g, "''");
    db.run(`DELETE FROM env_profiles WHERE id = ${escapedProfileId}`);
    db.run('COMMIT;');
    saveDatabase(db, dbPath);
  } catch (error) {
    db.run('ROLLBACK;');
    throw error;
  }
}

// Set env vars for a profile (replaces all existing vars)
export function setEnvVars(profileId: number, vars: Array<{ key: string; value: string; isSecret?: boolean }>): void {
  const db = getDatabase();
  const dbPath = getDatabasePath();

  db.run('BEGIN TRANSACTION;');

  try {
    // Delete existing vars
    const escapedProfileId = String(profileId).replace(/'/g, "''");
    db.run(`DELETE FROM env_vars WHERE env_profile_id = ${escapedProfileId}`);

    // Insert new vars
    for (const envVar of vars) {
      const escapedKey = envVar.key.replace(/'/g, "''");
      const escapedValue = envVar.value.replace(/'/g, "''");
      db.run(
        `INSERT INTO env_vars (env_profile_id, key, value, is_secret) VALUES (${escapedProfileId}, '${escapedKey}', '${escapedValue}', ${envVar.isSecret ? 1 : 0})`
      );
    }

    db.run('COMMIT;');
    saveDatabase(db, dbPath);
  } catch (error) {
    db.run('ROLLBACK;');
    throw error;
  }
}

type WorkspaceRunMode = 'parallel' | 'sequential';

export type WorkspaceItemRecord = {
  id: number;
  workspaceId: number;
  scriptId: number | null;
  projectId: string;
  projectPath: string;
  projectName: string;
  scriptName: string;
  command: string;
  envProfileId?: number;
  envProfileName?: string;
  orderIndex: number;
  runMode: WorkspaceRunMode;
};

export type WorkspaceRecord = {
  id: number;
  name: string;
  description?: string;
  favorite: boolean;
  createdAt: number;
  updatedAt: number;
  items: WorkspaceItemRecord[];
};

function normalizeRunMode(value?: string | null): WorkspaceRunMode {
  return value === 'sequential' ? 'sequential' : 'parallel';
}

function hydrateWorkspaces(result: Array<{ columns: string[]; values: any[][] }>): WorkspaceRecord[] {
  if (!result || result.length === 0) {
    return [];
  }

  const rows = result[0];
  if (!rows || rows.values.length === 0) {
    return [];
  }

  const workspaces = new Map<number, WorkspaceRecord>();
  const columns = rows.columns;

  for (const row of rows.values) {
    const data: Record<string, any> = {};
    columns.forEach((col, idx) => {
      data[col] = row[idx];
    });

    const workspaceId = data.workspace_id as number;
    if (!workspaces.has(workspaceId)) {
      workspaces.set(workspaceId, {
        id: workspaceId,
        name: data.workspace_name as string,
        description: data.workspace_description ?? undefined,
        favorite: Boolean(data.workspace_favorite),
        createdAt: data.workspace_created_at as number,
        updatedAt: data.workspace_updated_at as number,
        items: []
      });
    }

    const workspace = workspaces.get(workspaceId)!;
    if (data.item_id !== null && data.item_id !== undefined) {
      const scriptName = (data.item_script_name as string) ?? '';
      workspace.items.push({
        id: data.item_id as number,
        workspaceId,
        scriptId: (data.item_script_id as number) ?? null,
        projectId: (data.item_project_id as string) ?? '',
        projectPath: (data.item_project_path as string) ?? (data.project_path as string) ?? '',
        projectName: (data.project_name as string) ?? '',
        scriptName,
        command: (data.item_command as string) ?? (scriptName ? `npm run ${scriptName}` : ''),
        envProfileId: (data.item_env_profile_id as number) ?? undefined,
        envProfileName: (data.env_profile_name as string) ?? undefined,
        orderIndex: typeof data.item_order_index === 'number' ? (data.item_order_index as number) : 0,
        runMode: normalizeRunMode(data.item_run_mode as string | null)
      });
    }
  }

  return Array.from(workspaces.values());
}

function touchWorkspaceTimestamp(db: any, workspaceId: number) {
  const escapedId = String(workspaceId).replace(/'/g, "''");
  db.run(`UPDATE workspaces SET updated_at = ${Date.now()} WHERE id = ${escapedId}`);
}

export function getWorkspaces(): WorkspaceRecord[] {
  const db = getDatabase();
  const result = db.exec(`
    SELECT 
      w.id AS workspace_id,
      w.name AS workspace_name,
      w.description AS workspace_description,
      w.favorite AS workspace_favorite,
      w.created_at AS workspace_created_at,
      w.updated_at AS workspace_updated_at,
      wi.id AS item_id,
      wi.script_id AS item_script_id,
      wi.env_profile_id AS item_env_profile_id,
      wi.order_index AS item_order_index,
      wi.run_mode AS item_run_mode,
      wi.project_id AS item_project_id,
      wi.project_path AS item_project_path,
      wi.script_name AS item_script_name,
      wi.command AS item_command,
      p.name AS project_name,
      p.path AS project_path,
      ep.name AS env_profile_name
    FROM workspaces w
    LEFT JOIN workspace_items wi ON wi.workspace_id = w.id
    LEFT JOIN projects p ON p.id = wi.project_id
    LEFT JOIN env_profiles ep ON ep.id = wi.env_profile_id
    ORDER BY w.favorite DESC, w.name ASC, wi.order_index ASC, wi.id ASC;
  `);
  return hydrateWorkspaces(result).map((workspace) => ({
    ...workspace,
    items: workspace.items.sort((a, b) => a.orderIndex - b.orderIndex || a.id - b.id)
  }));
}

export function getWorkspaceById(workspaceId: number): WorkspaceRecord | null {
  const db = getDatabase();
  const escapedId = String(workspaceId).replace(/'/g, "''");
  const result = db.exec(`
    SELECT 
      w.id AS workspace_id,
      w.name AS workspace_name,
      w.description AS workspace_description,
      w.favorite AS workspace_favorite,
      w.created_at AS workspace_created_at,
      w.updated_at AS workspace_updated_at,
      wi.id AS item_id,
      wi.script_id AS item_script_id,
      wi.env_profile_id AS item_env_profile_id,
      wi.order_index AS item_order_index,
      wi.run_mode AS item_run_mode,
      wi.project_id AS item_project_id,
      wi.project_path AS item_project_path,
      wi.script_name AS item_script_name,
      wi.command AS item_command,
      p.name AS project_name,
      p.path AS project_path,
      ep.name AS env_profile_name
    FROM workspaces w
    LEFT JOIN workspace_items wi ON wi.workspace_id = w.id
    LEFT JOIN projects p ON p.id = wi.project_id
    LEFT JOIN env_profiles ep ON ep.id = wi.env_profile_id
    WHERE w.id = ${escapedId}
    ORDER BY wi.order_index ASC, wi.id ASC;
  `);
  const [workspace] = hydrateWorkspaces(result);
  return workspace ?? null;
}

export function createWorkspace(payload: { name: string; description?: string; favorite?: boolean }): number {
  const db = getDatabase();
  const dbPath = getDatabasePath();
  const now = Date.now();

  db.run('BEGIN TRANSACTION;');

  try {
    db.run(
      'INSERT INTO workspaces (name, description, favorite, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      [payload.name, payload.description ?? null, payload.favorite ? 1 : 0, now, now]
    );
    const result = db.exec('SELECT last_insert_rowid() AS id');
    const workspaceId = result[0].values[0][0] as number;
    db.run('COMMIT;');
    saveDatabase(db, dbPath);
    return workspaceId;
  } catch (error) {
    db.run('ROLLBACK;');
    throw error;
  }
}

export function updateWorkspace(workspaceId: number, updates: { name?: string; description?: string; favorite?: boolean }): void {
  const db = getDatabase();
  const dbPath = getDatabasePath();

  const setParts: string[] = [];
  if (updates.name !== undefined) {
    const escapedName = updates.name.replace(/'/g, "''");
    setParts.push(`name = '${escapedName}'`);
  }
  if (updates.description !== undefined) {
    if (updates.description === null || updates.description === '') {
      setParts.push('description = NULL');
    } else {
      const escapedDescription = updates.description.replace(/'/g, "''");
      setParts.push(`description = '${escapedDescription}'`);
    }
  }
  if (updates.favorite !== undefined) {
    setParts.push(`favorite = ${updates.favorite ? 1 : 0}`);
  }
  setParts.push(`updated_at = ${Date.now()}`);

  const escapedId = String(workspaceId).replace(/'/g, "''");
  db.run(`UPDATE workspaces SET ${setParts.join(', ')} WHERE id = ${escapedId}`);
  saveDatabase(db, dbPath);
}

export function deleteWorkspace(workspaceId: number): void {
  const db = getDatabase();
  const dbPath = getDatabasePath();
  const escapedId = String(workspaceId).replace(/'/g, "''");
  db.run(`DELETE FROM workspaces WHERE id = ${escapedId}`);
  saveDatabase(db, dbPath);
}

function resolveProjectDetails(db: any, projectId: string, scriptName: string) {
  const escapedProjectId = projectId.replace(/'/g, "''");
  const escapedScriptName = scriptName.replace(/'/g, "''");

  const projectResult = db.exec(`SELECT name, path FROM projects WHERE id = '${escapedProjectId}' LIMIT 1`);
  if (projectResult.length === 0 || projectResult[0].values.length === 0) {
    throw new Error('Project not found');
  }
  const projectColumns = projectResult[0].columns;
  const projectRow = projectResult[0].values[0];
  const projectName = projectRow[projectColumns.indexOf('name')] as string;
  const projectPath = projectRow[projectColumns.indexOf('path')] as string;

  const scriptResult = db.exec(`SELECT command FROM project_scripts WHERE project_id = '${escapedProjectId}' AND name = '${escapedScriptName}' LIMIT 1`);
  let command = '';
  if (scriptResult.length > 0 && scriptResult[0].values.length > 0) {
    const scriptColumns = scriptResult[0].columns;
    command = (scriptResult[0].values[0][scriptColumns.indexOf('command')] as string) ?? '';
  }

  const scriptIdResult = db.exec(`SELECT id FROM scripts WHERE project_id = '${escapedProjectId}' AND name = '${escapedScriptName}' LIMIT 1`);
  const scriptId =
    scriptIdResult.length > 0 && scriptIdResult[0].values.length > 0
      ? ((scriptIdResult[0].values[0][scriptIdResult[0].columns.indexOf('id')] as number) ?? null)
      : null;

  if (scriptId === null) {
    throw new Error(`Script "${scriptName}" was not found for the selected project.`);
  }

  return {
    projectName,
    projectPath,
    command: command || `npm run ${scriptName}`,
    scriptId
  };
}

export function addWorkspaceItem(payload: {
  workspaceId: number;
  projectId: string;
  scriptName: string;
  envProfileId?: number | null;
  runMode?: WorkspaceRunMode;
}): number {
  const db = getDatabase();
  const dbPath = getDatabasePath();
  const scriptName = payload.scriptName.trim();

  db.run('BEGIN TRANSACTION;');

  try {
    const workspaceExists = db.exec(`SELECT id FROM workspaces WHERE id = ${payload.workspaceId} LIMIT 1`);
    if (workspaceExists.length === 0 || workspaceExists[0].values.length === 0) {
      throw new Error('Workspace not found');
    }

    const { projectPath, command, scriptId } = resolveProjectDetails(db, payload.projectId, scriptName);

    const orderResult = db.exec(`SELECT MAX(order_index) AS max_index FROM workspace_items WHERE workspace_id = ${payload.workspaceId}`);
    const nextOrder =
      orderResult.length > 0 && orderResult[0].values.length > 0 && orderResult[0].values[0][0] !== null
        ? (orderResult[0].values[0][0] as number) + 1
        : 0;

    db.run(
      `INSERT INTO workspace_items (workspace_id, script_id, env_profile_id, order_index, run_mode, project_id, project_path, script_name, command)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        payload.workspaceId,
        scriptId,
        payload.envProfileId ?? null,
        nextOrder,
        payload.runMode ?? 'parallel',
        payload.projectId,
        projectPath,
        scriptName,
        command
      ]
    );

    touchWorkspaceTimestamp(db, payload.workspaceId);

    const result = db.exec('SELECT last_insert_rowid() AS id');
    const itemId = result[0].values[0][0] as number;
    db.run('COMMIT;');
    saveDatabase(db, dbPath);
    return itemId;
  } catch (error) {
    db.run('ROLLBACK;');
    throw error;
  }
}

export function updateWorkspaceItem(
  itemId: number,
  updates: { envProfileId?: number | null; runMode?: WorkspaceRunMode; orderIndex?: number }
): void {
  const db = getDatabase();
  const dbPath = getDatabasePath();
  const escapedItemId = String(itemId).replace(/'/g, "''");

  const existingResult = db.exec(`SELECT workspace_id FROM workspace_items WHERE id = ${escapedItemId} LIMIT 1`);
  if (existingResult.length === 0 || existingResult[0].values.length === 0) {
    throw new Error('Workspace item not found');
  }
  const workspaceId = existingResult[0].values[0][0] as number;

  const setParts: string[] = [];
  if (updates.envProfileId !== undefined) {
    if (updates.envProfileId === null) {
      setParts.push('env_profile_id = NULL');
    } else {
      setParts.push(`env_profile_id = ${updates.envProfileId}`);
    }
  }
  if (updates.runMode !== undefined) {
    setParts.push(`run_mode = '${normalizeRunMode(updates.runMode)}'`);
  }
  if (updates.orderIndex !== undefined) {
    setParts.push(`order_index = ${updates.orderIndex}`);
  }

  if (setParts.length === 0) {
    return;
  }

  db.run(`UPDATE workspace_items SET ${setParts.join(', ')} WHERE id = ${escapedItemId}`);
  touchWorkspaceTimestamp(db, workspaceId);
  saveDatabase(db, dbPath);
}

export function removeWorkspaceItem(itemId: number): void {
  const db = getDatabase();
  const dbPath = getDatabasePath();
  const escapedItemId = String(itemId).replace(/'/g, "''");

  const existingResult = db.exec(`SELECT workspace_id FROM workspace_items WHERE id = ${escapedItemId} LIMIT 1`);
  if (existingResult.length === 0 || existingResult[0].values.length === 0) {
    throw new Error('Workspace item not found');
  }
  const workspaceId = existingResult[0].values[0][0] as number;

  db.run(`DELETE FROM workspace_items WHERE id = ${escapedItemId}`);
  touchWorkspaceTimestamp(db, workspaceId);
  saveDatabase(db, dbPath);
}

// Settings functions
export function getSetting(key: string): string | null {
  const db = getDatabase();
  try {
    const escapedKey = key.replace(/'/g, "''");
    const result = db.exec(`SELECT value FROM settings WHERE key = '${escapedKey}'`);
    if (result.length === 0 || result[0].values.length === 0) {
      return null;
    }
    return result[0].values[0][0] as string | null;
  } catch (error) {
    console.error('Error getting setting:', error);
    return null;
  }
}

export function setSetting(key: string, value: string): void {
  const db = getDatabase();
  const dbPath = getDatabasePath();
  try {
    const escapedKey = key.replace(/'/g, "''");
    const escapedValue = value.replace(/'/g, "''");
    db.run(`INSERT OR REPLACE INTO settings (key, value) VALUES ('${escapedKey}', '${escapedValue}')`);
    saveDatabase(db, dbPath);
  } catch (error) {
    console.error('Error setting setting:', error);
    throw error;
  }
}

export function getAllSettings(): Record<string, string> {
  const db = getDatabase();
  try {
    const result = db.exec('SELECT key, value FROM settings');
    if (result.length === 0) {
      return {};
    }
    const settings: Record<string, string> = {};
    const columns = result[0].columns;
    const keyIdx = columns.indexOf('key');
    const valueIdx = columns.indexOf('value');
    for (const row of result[0].values) {
      settings[row[keyIdx] as string] = (row[valueIdx] as string) || '';
    }
    return settings;
  } catch (error) {
    console.error('Error getting all settings:', error);
    return {};
  }
}

export function deleteSetting(key: string): void {
  const db = getDatabase();
  const dbPath = getDatabasePath();
  try {
    const escapedKey = key.replace(/'/g, "''");
    db.run(`DELETE FROM settings WHERE key = '${escapedKey}'`);
    saveDatabase(db, dbPath);
  } catch (error) {
    console.error('Error deleting setting:', error);
    throw error;
  }
}

// Script port configuration functions
export function getScriptExpectedPort(projectId: string, scriptName: string): number | null {
  const db = getDatabase();
  try {
    const escapedProjectId = projectId.replace(/'/g, "''");
    const escapedScriptName = scriptName.replace(/'/g, "''");
    const result = db.exec(`SELECT expected_port FROM project_scripts WHERE project_id = '${escapedProjectId}' AND name = '${escapedScriptName}'`);
    if (result.length === 0 || result[0].values.length === 0) {
      return null;
    }
    const port = result[0].values[0][0] as number | null;
    return port || null;
  } catch (error) {
    console.error('Error getting script expected port:', error);
    return null;
  }
}

export function setScriptExpectedPort(projectId: string, scriptName: string, port: number | null): void {
  const db = getDatabase();
  const dbPath = getDatabasePath();
  try {
    const escapedProjectId = projectId.replace(/'/g, "''");
    const escapedScriptName = scriptName.replace(/'/g, "''");
    if (port === null) {
      db.run(`UPDATE project_scripts SET expected_port = NULL WHERE project_id = '${escapedProjectId}' AND name = '${escapedScriptName}'`);
    } else {
      db.run(`UPDATE project_scripts SET expected_port = ${port} WHERE project_id = '${escapedProjectId}' AND name = '${escapedScriptName}'`);
    }
    saveDatabase(db, dbPath);
  } catch (error) {
    console.error('Error setting script expected port:', error);
    throw error;
  }
}

export function getAllScriptExpectedPorts(projectId: string): Record<string, number> {
  const db = getDatabase();
  try {
    const escapedProjectId = projectId.replace(/'/g, "''");
    const result = db.exec(`SELECT name, expected_port FROM project_scripts WHERE project_id = '${escapedProjectId}' AND expected_port IS NOT NULL`);
    if (result.length === 0) {
      return {};
    }
    const ports: Record<string, number> = {};
    const columns = result[0].columns;
    const nameIdx = columns.indexOf('name');
    const portIdx = columns.indexOf('expected_port');
    for (const row of result[0].values) {
      const port = row[portIdx] as number | null;
      if (port) {
        ports[row[nameIdx] as string] = port;
      }
    }
    return ports;
  } catch (error) {
    console.error('Error getting all script expected ports:', error);
    return {};
  }
}
