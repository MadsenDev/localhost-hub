# Localhost Hub

Localhost Hub is a desktop “mission control” for running everything in your local dev universe. Scan directories for projects, launch scripts (individually or as saved workspaces), inspect logs, verify Git status, and scaffold new repos without leaving an Electron shell that feels like a native IDE.

![Localhost Hub hero](./public/logo.svg)

---

## Table of Contents
1. [Highlights](#highlights)
2. [Getting Started](#getting-started)
3. [Project Scanner & Data Model](#project-scanner--data-model)
4. [Script Runner & Workspaces](#script-runner--workspaces)
5. [Projects, Git, Ports & Packages](#projects-git-ports--packages)
6. [Create Project Wizard](#create-project-wizard)
7. [Architecture](#architecture)
8. [Build, Package & Release](#build-package--release)
9. [Testing](#testing)
10. [Troubleshooting](#troubleshooting)
11. [Roadmap Ideas](#roadmap-ideas)
12. [License](#license)

---

## Highlights

- **Zero-config project discovery** – recursively scans folders for `package.json` files, tags frameworks, and surfaces scripts automatically.
- **Workspace orchestration** – create named “workflows” spanning multiple repos; launch scripts sequentially or in parallel with staggered boot to avoid port clashes.
- **Deep process insight** – live logs with per-project history, toast alerts, Open-In-Browser buttons that parse stdout for URLs/ports, and terminal pop-outs.
- **Git awareness** – branch, dirty/ahead/behind status, last commit summary, and change lists right from the project header/tab.
- **New project scaffolding** – step-based creator with templates, dependencies, script planner, Tailwind presets (4.x Oxide or classic 3.4 stack), icon packs, README/git automation, and optional dependency installs.
- **Cross-platform packaging** – one `npm run build:*` pipeline that produces signed/unsigned installers for Linux, macOS, and Windows with consistent iconography.

---

## Getting Started

### Requirements
- Node.js 20+
- npm 10+ (pnpm/yarn/bun supported inside projects; the app itself uses npm)
- Git

### Install & run in dev
```bash
npm install
npm run dev
```

`npm run dev` boots Vite + Electron with live reload for the renderer, main, and preload bundles. The renderer opens automatically once compilation completes.

### Recommended dev loop
1. `npm run dev`
2. Toggle DevTools inside the Electron window (`Ctrl/Cmd+Shift+I`) when needed.
3. Use the Setup dialog to add directories under active development.

---

## Project Scanner & Data Model

Localhost Hub stores metadata in `electron/database.ts` (sqlite via sql.js). Each scan populates:

| Table | Purpose |
| --- | --- |
| `projects` | Basic id/name/path/type info |
| `project_scripts` / `scripts` | Normalized script definitions |
| `workspaces`, `workspace_items` | Multi-project runbooks |
| `env_profiles`, `env_vars` | Project-specific environment sets |
| `settings` | UI + behavior preferences |

Scanner highlights:
- Depth-limited recursion with ignore patterns.
- Tagging for frameworks (Vite, Next.js, etc.) based on `package.json`.
- Scripts persisted so workspaces keep referencing them even if rescans happen.

---

## Script Runner & Workspaces

- Individual scripts run via `scripts:run` IPC, spawning child processes with environment overrides and streaming logs back to the renderer.
- Workspace sequencing:
  - **Parallel**: slight stagger to avoid race conditions on port binding.
  - **Sequential**: fire-and-forget order (does **not** wait for termination—ideal for dev servers).
- Logs, exit/error events, and history entries always carry the originating `projectId`, allowing the UI to display cross-workspace output correctly.
- **Terminal modal**: open any running process in a floating terminal with pause/scroll controls.

---

## Projects, Git, Ports & Packages

- **Sidebar indicators** – see branch/alive/running status at a glance.
- **Project tabs** – Scripts, Logs, Env Profiles, Ports, Packages, Git.
- **Port intelligence** – heuristics gather expected/detected ports plus `localhost:` URLs scraped from stdout.
- **Packages panel** – paginate dependencies, scan `node_modules`, and trigger install operations with package manager detection.

---

## Create Project Wizard

Launch via **“Create New Project”** in the sidebar or empty state.

1. **Basics** – name, directory, optional description.
2. **Stack** – starter templates, curated dependency presets, script planner, package manager, styling + icon packs.
3. **Extras** – choose language (JS/TS), sample code (CLI vs HTTP server), README + git init, notes.
4. **Review** – confirm before scaffolding.

Backend scaffolding handles:
- Directories & `package.json` creation
- Dependency/devDependency normalization
- Tailwind v3 vs v4 (Oxide) pipeline files
- Sample source files (`src/index.(ts|js)`)
- README sections describing scripts/styling/icon packs
- Optional `.gitignore` + `git init`
- Optional install command using the selected package manager
- Automatic project rescan so the new repo appears immediately

---

## Architecture

```
.
├── electron/
│   ├── main.ts          # Main process, IPC handlers, process runner
│   ├── preload.ts       # Secure bridge exposing limited API surface
│   ├── database.ts      # sql.js schema + CRUD helpers
│   └── utils/           # project scanning, lookup helpers, etc.
├── src/
│   ├── App.tsx          # React root, state orchestration
│   ├── components/      # Sidebar, panels, modals, toasts, etc.
│   ├── hooks/           # Data hooks (projects, workspaces, settings…)
│   └── types/           # Global TypeScript definitions
├── scripts/             # Build helpers (icon generation, cache clearing)
├── public/              # Icons, wordmarks
├── buildResources/      # Packaged app icons, entitlements
└── release/             # Generated installers (gitignored)
```

Key tech:
- **Renderer**: React 19 + Vite + Tailwind
- **Animations**: Framer Motion
- **DB**: sql.js (SQLite compiled to WASM)
- **IPC**: Electron contextBridge (no node integration in renderer)
- **Testing**: Vitest + Testing Library + jsdom

---

## Build, Package & Release

### Renderer/Main bundles
```bash
npm run build
```
Outputs:
- `dist/renderer` (Vite build)
- `dist-electron/{main,preload}.js`

### Platform packages
| Command | Output |
| --- | --- |
| `npm run build:linux` | `.AppImage` + `.deb` in `release/` |
| `npm run build:mac` | `.dmg` (requires macOS + signing cert for distribution) |
| `npm run build:win` | NSIS installer (signed when `WIN_SIGN=true`) |
| `npm run build:win:unsigned` | Unsigned `.zip` (no Wine required on Linux) |
| `npm run build:all` | mac + linux + signed Windows |
| `npm run build:all:unsigned` | mac + linux + unsigned Windows |

Behind the scenes:
- `npm run prebuild:electron` regenerates icons and clears `dist*` folders.
- `electron-builder` reads `build.config.cjs` (not `package.json`’s legacy `build` block) for multi-platform targets.
- Icons generated via `scripts/generate-icons.cjs` (includes Linux multi-size directory).

---

## Testing

Run once:
```bash
npm run test
```

Watch mode:
```bash
npm run test:watch
```

### What’s covered
- React component behavior (ProjectHeader, etc.)
- Utility logic (path normalization, project lookups)
- jsdom-based tests for UI conditionals

### Planned coverage
- Workspace runner integration tests (mocked child processes)
- IPC contract tests between renderer and main
- Snapshot or visual regression for key panels

---

## Troubleshooting

### Windows symlink / signing issues
1. `npm run clear:cache`
2. Enable **Developer Mode** (`Settings → Update & Security → For Developers`)
3. Or run the build terminal as Administrator

### `wine is required` when building Windows artifacts on Linux
- Install Wine/Mono packages per [electron.build guide](https://www.electron.build/multi-platform-build#linux).
- Alternatively run Windows builds on a Windows machine/VM.

### Vite chunk size warning
- Vite warns when a chunk exceeds 500 kB minified. Consider future code-splitting of rarely used panels if it becomes a perf problem; not currently blocking.

### Linux AppImage feels sluggish (Wayland/X11)
- Try `LOCALHOST_HUB_OZONE_PLATFORM=wayland` (or `x11`) to see which compositor performs better.
- If GPU drivers are flaky, test with `LOCALHOST_HUB_DISABLE_GPU=1`.
- In-app, enable **Minimize animations** for lighter UI transitions.

### Icon/resource mismatch
- Re-run `npm run generate:icons` if you change assets under `public/logo-icons`.
- Ensure `buildResources/` contains the generated `.icns`, `.ico`, `.png`, and `linux-icons/**`.

---

## Roadmap Ideas

- Editable environment profiles per workspace item
- SSH tunneling + remote project discovery
- Git actions (commit/pull/push) with OAuth device flow
- Pluggable script types (Docker compose, Make targets, etc.)
- Telemetry opt-in for better error diagnostics

---

## License

MIT © Christoffer Madsen

See [`LICENSE`](./LICENSE) for details.
