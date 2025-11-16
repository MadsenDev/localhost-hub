1. High-level Concept

Localhost Hub is a desktop app that acts as a control center for all your dev projects:

Discover projects (auto-scan + manual)

See all package.json scripts

Run/stop/restart scripts with buttons

Stream logs in a nice UI

Group scripts into “workspaces” (e.g. full stack dev environment)

Store env profiles and presets per project

Inspect ports + kill processes

Optionally integrate Docker


No AI. All local, file-based + process-based.


---

2. Core User Flows

2.1 First-time setup

1. On first launch:

Show a wizard:

Choose base directories to scan (e.g. ~/dev, ~/work).


Run a recursive scan for package.json, Dockerfile, docker-compose.yml, maybe .git.



2. Detected projects appear in a Project List with:

Name (from folder or package.json name)

Type (Node, Node+Docker, etc.)

Path

Tags (optional)




All this is stored in SQLite.


---

2.2 Project view

Clicking a project opens a Project Detail panel:

Basic info: Name, path, repo status (if git), type.

Scripts: Parsed from package.json:

Each script: name, command, description (from scripts-meta field or custom field).

Actions:

Run

Stop

Restart

“Run with env profile…”



Tabs:

Scripts

Logs

Env Profiles

Ports & Processes

Settings




---

2.3 Running scripts

When user clicks Run on a script:

Electron main spawns a child process:

npm run dev (or pnpm dev, etc., depending on project settings)

With working directory = project path

With environment vars merged from:

System env

Global defaults

Selected env profile



Main process streams stdout/stderr via IPC to the renderer.

Renderer shows logs in a scrollable pane with:

Real-time appending

Pause / resume auto-scroll

Clear

Copy



Stopping:

Sends SIGINT or SIGTERM, with option to force SIGKILL if not exiting.



---

2.4 Workspaces

User can define Workspaces like:

> “Frontend Dev”: run web-dev and storybook scripts
“Full Stack”: run backend dev + frontend dev + maybe DB (docker-compose up)



Workspace = named collection of (project, script, env_profile) items.

Actions:

“Start workspace”: runs all scripts in sequence or parallel.

“Stop workspace”: stops all associated processes.

See overall status: X/Y scripts running.



---

2.5 Env profiles

Per project:

Define env profiles:

dev, staging, prod, local-test, etc.


Each profile:

Key/value pairs

Optionally marked as “sensitive” (hidden in UI)


When running a script, you can:

Choose an env profile

Default profile per script



All stored locally in SQLite (you might add optional encryption later).


---

2.6 Ports & Processes

The app can:

Track ports that are expected (e.g. project config says dev server on 3000).

Periodically query the system (platform-dependent) for open ports and owning PIDs.

For each running script:

Show its PID

Show guessed ports it’s using (based on start command or environment / logs / scanning).


Provide actions:

“Kill process”

“Check port usage”




---

2.7 Docker (optional module)

Per project:

Detect Dockerfile / docker-compose.yml.

Show:

Available compose services.

Buttons: docker-compose up, down, restart.

Basic logs for services.



This can be just “execute docker commands and stream logs” — no need for deep Docker API integration initially.


---

3. Tech Stack & Architecture

3.1 Electron structure

Main process (Node.js):

Window management

Process spawning (scripts, docker commands)

File system access (scan, reading package.json)

Port & process inspection

SQLite DB access

IPC handlers


Renderer process (React app):

Built with Vite + React + TypeScript + Tailwind + Framer Motion

UI, state management, components

Uses IPC via contextBridge + preload script



3.2 IPC & preload

Use contextIsolation: true and a preload script that exposes a typed API like window.localhub.

Example:


// preload.ts
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('localhub', {
  scanProjects: (basePaths: string[]) => ipcRenderer.invoke('scan-projects', basePaths),
  getProjects: () => ipcRenderer.invoke('get-projects'),
  runScript: (scriptInstanceId: number) => ipcRenderer.invoke('run-script', scriptInstanceId),
  stopScript: (scriptInstanceId: number) => ipcRenderer.invoke('stop-script', scriptInstanceId),
  onLogChunk: (cb: (chunk) => void) => ipcRenderer.on('log-chunk', (_, chunk) => cb(chunk)),
  // etc...
});

Renderer never calls ipcRenderer directly — only through this API.


---

3.3 Project structure (example)

root/
  package.json
  electron/
    main.ts
    preload.ts
  src/              // React app
    main.tsx
    components/
    pages/
    hooks/
    state/
  db/
    migrations/
  scripts/
  build/


---

4. Database Design (SQLite)

Use SQLite with something like better-sqlite3 or knex/Sequelize. I’ll describe entities and their relations.

4.1 Entities Overview

projects

scripts

workspaces

workspace_items (workspace ↔ script mapping)

env_profiles

env_vars

process_instances

log_chunks

scan_roots

settings

docker_configs (optional, per project)

docker_services (optional, per project or compose service)



---

4.2 Tables in detail

projects

Represents a development project folder.

CREATE TABLE projects (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  name             TEXT NOT NULL,
  path             TEXT NOT NULL UNIQUE,
  type             TEXT,               -- e.g. 'node', 'node+docker', 'docker-only', 'custom'
  detected_at      DATETIME NOT NULL,
  last_scanned_at  DATETIME,
  package_json_path TEXT,             -- nullable if no package.json
  git_repo         INTEGER DEFAULT 0, -- 0/1 flag
  notes            TEXT,              -- free-form description
  favorite         INTEGER DEFAULT 0, -- 0/1 flag
  tags             TEXT               -- comma-separated tags or JSON
);

scripts

Represents a package.json script or a custom command associated with a project.

CREATE TABLE scripts (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id       INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,        -- 'dev', 'build', 'lint'
  command          TEXT NOT NULL,        -- actual command run, e.g. 'npm run dev' or 'pnpm dev'
  raw_script       TEXT,                 -- raw value from package.json "scripts" field
  description      TEXT,                 -- custom user-provided description
  is_default       INTEGER DEFAULT 0,    -- mark main dev script
  created_at       DATETIME NOT NULL,
  updated_at       DATETIME NOT NULL
);

You might derive command from project settings:

e.g. prefer pnpm dev if pnpm-lock.yaml exists.

Store that resolution result here to avoid recalculating.


env_profiles

Env profiles for a specific project.

CREATE TABLE env_profiles (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id       INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,        -- 'dev', 'staging', 'prod', 'local'
  description      TEXT,
  is_default       INTEGER DEFAULT 0,    -- default profile for this project
  created_at       DATETIME NOT NULL,
  updated_at       DATETIME NOT NULL
);

env_vars

Key/value pairs for a given env profile.

CREATE TABLE env_vars (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  env_profile_id   INTEGER NOT NULL REFERENCES env_profiles(id) ON DELETE CASCADE,
  key              TEXT NOT NULL,
  value            TEXT,                 -- plain text initially, consider encryption later
  is_secret        INTEGER DEFAULT 0,    -- hide in UI
  UNIQUE(env_profile_id, key)
);

workspaces

Named collections of scripts (potentially across projects).

CREATE TABLE workspaces (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  name             TEXT NOT NULL,
  description      TEXT,
  created_at       DATETIME NOT NULL,
  updated_at       DATETIME NOT NULL,
  favorite         INTEGER DEFAULT 0
);

workspace_items

Associates a workspace with script(s) and optionally a specific env profile.

CREATE TABLE workspace_items (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id     INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  script_id        INTEGER NOT NULL REFERENCES scripts(id) ON DELETE CASCADE,
  env_profile_id   INTEGER REFERENCES env_profiles(id), -- nullable
  order_index      INTEGER DEFAULT 0,                    -- for ordering
  run_mode         TEXT DEFAULT 'parallel'               -- 'parallel' or 'sequential' or 'delayed'
);

process_instances

Represents a single run of a script (past or current).

CREATE TABLE process_instances (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  script_id        INTEGER NOT NULL REFERENCES scripts(id) ON DELETE CASCADE,
  workspace_id     INTEGER REFERENCES workspaces(id), -- nullable
  env_profile_id   INTEGER REFERENCES env_profiles(id), -- env used when starting
  pid              INTEGER,                           -- OS PID
  status           TEXT NOT NULL,                     -- 'starting','running','stopped','error','killed'
  exit_code        INTEGER,                           -- nullable if still running
  started_at       DATETIME NOT NULL,
  stopped_at       DATETIME,
  last_log_at      DATETIME,
  port_hint        INTEGER,                           -- port we think it's using
  command_executed TEXT NOT NULL                      -- full command with args
);

This lets you show history (e.g. how often the script was run, last time, etc.).

log_chunks

Logs for each process stored in chunks, not one huge blob.

CREATE TABLE log_chunks (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  process_instance_id INTEGER NOT NULL REFERENCES process_instances(id) ON DELETE CASCADE,
  timestamp          DATETIME NOT NULL,
  stream             TEXT NOT NULL,   -- 'stdout' or 'stderr'
  content            TEXT NOT NULL
);

You can decide:

Truncate older logs (e.g. only keep last N MB per process).

Or keep them all and add settings later.


scan_roots

Stores root directories to scan for projects.

CREATE TABLE scan_roots (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  path             TEXT NOT NULL UNIQUE,
  added_at         DATETIME NOT NULL,
  last_scanned_at  DATETIME
);

settings

App-wide settings (simple key/value).

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

Examples:

theme

default terminal command

default package manager preference

log retention policy


docker_configs (optional)

Per project Docker metadata.

CREATE TABLE docker_configs (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id        INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  has_dockerfile    INTEGER DEFAULT 0,
  has_compose       INTEGER DEFAULT 0,
  compose_file_path TEXT,
  info              TEXT            -- JSON blob for future expansion
);

docker_services (optional)

Specific services defined in docker-compose.

CREATE TABLE docker_services (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  docker_config_id  INTEGER NOT NULL REFERENCES docker_configs(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  description       TEXT,
  port_mapping      TEXT             -- e.g. '3000:3000', store raw or JSON
);


---

5. Process Lifecycle Management

5.1 Spawning

In Electron main:

Use child_process.spawn:

Args:

shell: true (for cross-platform script running) or call npm/pnpm directly.

cwd: project.path.

env: { ...process.env, ...envProfileVars }.



Immediately create a process_instances row with status starting.

Attach listeners:

child.stdout.on('data', ...)

child.stderr.on('data', ...)

child.on('exit', ...)

child.on('error', ...)



5.2 Logging

On each data chunk:

1. Convert to string.


2. Write log_chunks row with:

process_instance_id

timestamp (now)

stream ('stdout' / 'stderr')

content (the chunk)



3. Emit IPC event to renderer: { processInstanceId, stream, content, timestamp }.



Renderer:

Appends to log view for that process.

For collapsed projects, show a small status indicator (e.g., “logs incoming”).


5.3 Stopping / Killing

When user clicks Stop:

Send SIGINT first (child.kill('SIGINT')).

After timeout (e.g. 5–10s), if still running:

SIGKILL (child.kill('SIGKILL')).



Update DB:

status = 'stopped' or 'killed'

stopped_at = now

exit_code



---

6. Project Detection Logic

Scan algorithm:

BFS or DFS recursively from each scan_root.path:

If package.json found:

Check if already in projects.

If not, create a project record.


Parse package.json:

name → project name fallback.

scripts → create or update scripts rows.



Look for Dockerfile, docker-compose.yml in same or child directory:

mark docker_configs.



Rules to avoid insane recursion:

Depth limit

Exclude dirs: node_modules, .git, dist, build, coverage, etc.

Maybe a max number of projects per scan root (configurable).



Monorepos:

If package.json exists and contains workspaces (Yarn) or pnpm-workspace.yaml:

Treat root as a project.

Additionally detect sub-projects in apps/, packages/, etc.

You can either:

Model them each as a separate project, or

Model root as project, and subapps simply as scripts with path hints.





---

7. Security & Safety Notes

Use contextIsolation + preload — don’t expose Node directly to renderer.

Validate all IPC input on main side (paths, IDs, etc.).

Be careful with env vars:

Optionally mark secrets as is_secret and avoid showing full value.


Processes can run arbitrary commands (obviously) — but that’s in the dev’s own environment, so risk is local.



---

8. Possible UI Layout

Main layout:

Left sidebar:

Tabs: Projects / Workspaces / Processes / Settings

Search bar

List of projects (with status icons)

Favorites at top


Main content:

Project details:

Header: name, path, quick actions (Open in VS Code / Terminal / Finder, Open repo)

Tabs:

Scripts: list with Run/Stop, last run info

Logs: choose script + instance, show log viewer

Env Profiles: grid of profiles and key/values

Ports/Processes: port table + process info

Docker (if detected)




Bottom panel (optional):

A “running processes” status bar (like a task bar).

Click to jump to logs.




---

9. How to Feed This into Codex

When you set this up with Codex (or any codegen assistant), this spec gives you:

Entity list + relationships (for models/migrations)

IPC API surface

Main responsibilities per layer (Electron main vs React renderer)

Clear process handling logic


You can start by asking it to:

1. Initialize Electron + Vite + React + TS + Tailwind project.


2. Set up SQLite using your preferred ORM or query builder.


3. Implement DB schema based on the tables above.


4. Implement IPC APIs to:

scanProjects

getProjects

getScriptsByProject

runScript

stopScript

getProcessInstances

getLogsForProcess



5. Build basic UI to list projects and run scripts.
