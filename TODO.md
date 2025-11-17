# TODO

## 1. High-level concept
- [x] Ship an Electron + React desktop shell with project discovery, script execution, and live logging so the core "control center" loop is already usable for previewing flows.【F:README.md†L1-L20】【F:src/App.tsx†L514-L587】
- [x] Discover `package.json` files inside user-selected directories, parse their scripts, infer project type/tags, and persist the resulting catalog in SQLite for reuse across launches.【F:src/App.tsx†L142-L183】【F:electron/projectScanner.ts†L35-L166】【F:electron/database.ts†L55-L238】
- [ ] Add restart buttons, workspace orchestration, environment profile storage, richer port inspection, and optional Docker integrations that are still called out in the product brief but not implemented yet.【F:PROJECT.md†L5-L20】

## 2. Core user flows
### 2.1 First-time setup
- [x] Show a first-launch setup modal where users choose directories (including via OS folder picker), persist that selection, and trigger an initial recursive scan for projects.【F:src/App.tsx†L296-L340】【F:src/App.tsx†L401-L424】【F:src/components/SetupModal.tsx†L1-L92】
- [x] Surface discovered projects in the sidebar with name, type, path, and tags, and cache them in SQLite so relaunches can skip a rescan until requested.【F:src/components/ProjectSidebar.tsx†L36-L125】【F:electron/database.ts†L117-L238】
- [ ] Expand the scanner so it also records Dockerfiles, compose files, and git metadata that the spec expects during the initial crawl.【F:PROJECT.md†L33-L56】【F:electron/projectScanner.ts†L71-L112】

### 2.2 Project view
- [x] Render a project detail header plus Scripts and Logs panels where users can run or stop npm scripts and inspect their output with status badges and history popovers.【F:src/App.tsx†L514-L600】【F:src/components/ScriptsPanel.tsx†L1-L37】【F:src/components/ProjectSidebar.tsx†L32-L135】
- [ ] Include repo status indicators and other metadata in the project detail view as described in the spec (current `ProjectInfo` only tracks id/name/path/type/tags/scripts).【F:PROJECT.md†L62-L70】【F:src/types/global.d.ts†L15-L27】
- [ ] Add a "Restart" action and a "Run with env profile" entry point alongside Run/Stop so scripts can be relaunched or executed with custom contexts.【F:PROJECT.md†L70-L79】【F:src/components/ScriptsPanel.tsx†L13-L36】
- [ ] Build the Env Profiles, Ports & Processes, and Settings tabs that are still missing from the renderer layout (today only Scripts and Logs are rendered).【F:PROJECT.md†L82-L92】【F:src/App.tsx†L562-L585】
- [ ] Persist environment profiles (including secret masking) and allow scripts to select/remember a profile per spec; the current database schema only covers projects and scripts.【F:PROJECT.md†L164-L189】【F:electron/database.ts†L76-L163】
- [ ] Expand the processes UI so ports, PIDs, and kill actions are available in a dedicated panel instead of only a lightweight sidebar popover.【F:PROJECT.md†L193-L213】【F:src/components/ProjectSidebar.tsx†L32-L135】

### 2.3 Running scripts
- [x] Spawn npm scripts from the Electron main process, stream stdout/stderr over IPC, and let the renderer pause auto-scroll, clear, copy, or export logs while persisting recent run history.【F:electron/main.ts†L125-L242】【F:src/App.tsx†L185-L363】【F:src/components/LogsPanel.tsx†L1-L52】
- [x] Allow users to stop active runs, with SIGTERM followed by SIGKILL escalation, and refresh the live process list so the UI reflects real-time state.【F:electron/main.ts†L190-L224】【F:src/App.tsx†L334-L363】
- [ ] Support pnpm/yarn/deno commands, project-level defaults, and merged env vars (system + global defaults + chosen profile) when spawning scripts—the main process currently shells out to `npm run` with `process.env` only.【F:PROJECT.md†L103-L116】【F:electron/main.ts†L125-L137】

### 2.4 Workspaces
- [ ] Implement workspace entities that bundle multiple (project, script, env_profile) entries with start/stop controls and aggregated status; nothing in the renderer, IPC, or database references workspaces yet.【F:PROJECT.md†L141-L160】【F:electron/database.ts†L76-L163】

### 2.5 Env profiles
- [ ] Create CRUD UI and storage for per-project env profiles, including sensitive flag handling and default profile selection when running scripts; currently the app only keeps a simple in-memory/localStorage run history.【F:PROJECT.md†L164-L189】【F:src/App.tsx†L63-L140】

### 2.6 Ports & processes
- [x] Poll both internally launched scripts and OS processes to show a live badge/popover of active dev servers so users can see what's running at a glance.【F:electron/main.ts†L208-L224】【F:electron/externalProcessScanner.ts†L6-L190】【F:src/components/ProjectSidebar.tsx†L32-L135】
- [ ] Promote port monitoring into a full tab that shows expected ports, owning PIDs, and kill/inspect actions per spec (the backend exposes a read-only list and the UI only surfaces a minimal popover).【F:PROJECT.md†L193-L213】【F:src/App.tsx†L562-L585】

### 2.7 Docker (optional)
- [ ] Detect Dockerfiles/compose files during scans and expose compose controls + logs in the UI; no Docker detection or IPC exists yet.【F:PROJECT.md†L219-L236】【F:electron/projectScanner.ts†L71-L112】

## 3. Tech stack & architecture
- [x] Use contextIsolation with a typed preload bridge so the renderer never talks to `ipcRenderer` directly, matching the architecture section of the spec.【F:PROJECT.md†L269-L289】【F:electron/main.ts†L38-L44】【F:electron/preload.ts†L1-L61】
- [ ] Adopt the rest of the recommended renderer stack (e.g., Framer Motion) and expand the preload API surface as new modules (workspaces, env profiles, docker) come online; those packages and IPC handlers do not exist yet.【F:PROJECT.md†L259-L289】【F:package.json†L1-L32】

## 4. Database design
- [x] Provide a lightweight sql.js-powered database that stores projects and their scripts on disk so scans persist between sessions.【F:electron/database.ts†L55-L238】
- [ ] Flesh out the remaining entities from the database plan (workspaces, workspace_items, env_profiles, env_vars, process_instances, log_chunks, scan_roots, settings, docker tables) so future features have a persistent backing store.【F:PROJECT.md†L314-L400】【F:electron/database.ts†L76-L163】
