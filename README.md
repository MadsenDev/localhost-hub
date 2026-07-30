# Localhost Hub

Localhost Hub is a local-first desktop control center for development projects. Discover projects, run services, inspect logs and ports, manage Git, and keep your local development environment under control from one app.

> [!IMPORTANT]
> The migration from Electron to Tauri 2 is complete on the `0.9.x` line: Tauri is the only shell, and the Electron implementation has been removed. See [the unification plan](docs/UNIFICATION.md) for what the migration covered.

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
- **Tauri migration** – the new interface is backed by Rust commands for project scanning, managed services, live process events, ports, Git status, settings, and GitHub authentication.
- **Cross-platform packaging** – Tauri builds AppImage, DEB, RPM, Arch, DMG, MSI, and NSIS packages from one codebase.

---

## Getting Started

### Requirements
- Node.js 20+
- npm 10+ (pnpm/yarn/bun supported inside projects; the app itself uses npm)
- Git
- Rust 1.77.2+ and the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for native development

### Install & run the Tauri app
```bash
npm install
npm run tauri:dev
```

Set `GITHUB_CLIENT_ID` at build time to enable the optional GitHub OAuth device flow. The app still builds and its local features remain available without it.

Running `npm run dev` serves the interface in a plain browser, without the native
backend. Read commands return empty values so the interface still renders; anything
that mutates state rejects with a clear error rather than appearing to succeed. Use
`npm run tauri:dev` for the real thing.

---

## Project Scanner & Data Model

Discovery is stateless: `scan_workspace_groups` walks the configured roots on demand
and returns what it finds, so nothing can go stale between a rescan and the interface.

Scanner highlights:
- Depth-limited recursion with ignore patterns.
- Detects JavaScript/TypeScript, Rust, Go, Python, Ruby, and PHP projects from their
  manifests, along with frameworks, package managers, runnable scripts, Git roots, and
  environment files.

What *is* persisted lives in `config.json` under the platform application data
directory, written by `src-tauri/src/config.rs`:

| Stored | Purpose |
| --- | --- |
| `workspace_roots` | Directories to scan |
| `user_workspaces` | Named workspaces and their service definitions |
| `env_profiles` | Per-project environment sets |
| `appearance` | Theme, accent, density, sidebar |
| `onboarding_complete` | First-run state |
| `github_user` | Connected account, for display |

The GitHub access token and any variable marked secret are held in the operating
system credential store rather than that file — see `src-tauri/src/secrets.rs`.

Run history lives alongside it, under `history/`: a bounded index of past runs plus one
append-only log per run. See the **Run history** view. Live process state is
deliberately not persisted — the process table is in memory, so runs still marked
running at startup are reported as interrupted rather than presented as live.

---

## Script Runner & Workspaces

- Services are started, stopped, and restarted by the Rust service manager
  (`src-tauri/src/services.rs`), which spawns each command in its own process group
  and streams stdout, stderr, lifecycle events, and detected URLs to the interface.
- Workspace sequencing:
  - **Parallel**: independent services launch together.
  - **Sequential**: ordered start for services that need it.
  - **Dependencies**: `depends_on` is validated for missing, self-referential, and
    cyclic entries, then launched in topological layers, waiting for prerequisite
    readiness before unlocking dependents and reporting downstream services as blocked
    when a prerequisite fails.
- Environment profiles apply per service, either extending the login shell environment
  or running over a documented minimal baseline.
- Stopping escalates from SIGTERM to SIGKILL across the whole process group, so a dev
  server's children do not survive it.

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
├── src-tauri/
│   ├── src/
│   │   ├── commands.rs      # Every command the interface can invoke
│   │   ├── workspace.rs     # Discovery and workspace orchestration
│   │   ├── services.rs      # Process lifecycle, output streaming
│   │   ├── git.rs           # Local Git via git2, plus network operations
│   │   ├── github.rs        # Device-flow auth and repository context
│   │   ├── ports.rs         # Listening sockets and localhost URL parsing
│   │   ├── packages.rs      # Package manager detection and actions
│   │   ├── scaffold.rs      # Project creation
│   │   ├── health.rs        # Repository health signals
│   │   ├── config.rs        # Persistence
│   │   └── secrets.rs       # Credential store, with a restricted-file fallback
│   └── rust-toolchain.toml  # Pinned build toolchain
├── src/
│   ├── App.tsx          # React root, state orchestration
│   ├── view-*.tsx       # Top-level views
│   ├── tauri-api.ts     # The command wrapper; the only path to the backend
│   └── generated/       # TypeScript types generated from the Rust structs
├── scripts/             # Build helpers (icon generation, version sync)
├── public/              # Icons, wordmarks
├── buildResources/      # Packaged app icons, entitlements
└── .github/workflows/   # CI and Release-driven packaging
```

Key tech:
- **Renderer**: React 19 + Vite
- **Native backend**: Tauri 2 + Rust + Tokio
- **Animations**: Framer Motion
- **Persistence**: JSON config plus the OS credential store for secrets
- **Bridge**: typed Tauri commands and events, with the TypeScript types generated
  from the Rust structs so the two cannot drift
- **Testing**: Vitest + Testing Library + jsdom

---

## Build, Package & Release

### Frontend bundle
```bash
npm run build
```
This writes the Vite production bundle to `dist/`.

### Tauri desktop package

```bash
npm run tauri:build
```

GitHub Actions builds and retains:

- Linux AppImage, DEB, RPM, and Arch `.pkg.tar.zst` packages
- A universal macOS DMG/app for Intel and Apple Silicon
- Windows MSI and NSIS installers

Publishing a GitHub release builds all three platforms and attaches the installers
to it. Manual workflow runs produce downloadable artifacts, and pull requests build
Linux only when they change the packaging definition itself.
See [Desktop Distribution](docs/DISTRIBUTION.md) for distro coverage, versioning,
and current signing limitations.

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

### Unsigned Windows and macOS packages

Development artifacts are currently unsigned. Windows SmartScreen and macOS
Gatekeeper may therefore require explicit approval. Production signing and
macOS notarization will be added once the release credentials are available.

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
- [Localhost Companion](docs/LOCALHOST_COMPANION.md), a focused Android remote after desktop parity
- Git actions (commit/pull/push) with OAuth device flow
- Pluggable script types (Docker compose, Make targets, etc.)
- Telemetry opt-in for better error diagnostics

---

## License

MIT © Christoffer Madsen

See [`LICENSE`](./LICENSE) for details.
