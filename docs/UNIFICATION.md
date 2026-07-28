# Localhost Hub unification

`MadsenDev/localhost-hub` is the canonical repository.

The target combines:

- the newer Localhost Hub UI;
- React 19, Vite 7, and TypeScript 5.9;
- Tauri 2 with a Rust/Tokio backend;
- the mature behavior from the Electron application;
- selected GitHub and repository-health capabilities from the former V2 effort.

The original Electron implementation is the behavioral reference. It must not
be removed until the Tauri implementation has verified feature parity.

## Architecture boundary

React owns interface state and presentation.

Rust owns filesystem access, project detection, processes, stdout/stderr,
resource metrics, ports, Git, GitHub API calls, persistence, and workspace
orchestration.

Local Git operations remain independent from GitHub platform features.

## Migration stages

1. **Tauri shell and new UI**
   - Port the newer interface into the canonical repository.
   - Keep React 19 and Vite 7.
   - Retain the Electron path temporarily.
2. **Project discovery parity**
   - Roots, recursive scanning, frameworks, package managers, scripts, and Git.
3. **Process parity**
   - Start, stop, restart, kill, logs, PID, CPU, memory, uptime, and exit state.
4. **Workspace parity**
   - Multiple repositories, parallel/sequential start, combined logs, and stop all.
5. **Ports**
   - System inspection plus useful localhost/URL parsing from process output.
6. **Git parity**
   - Branch, dirty state, ahead/behind, diff, staging, commits, history, and remotes.
7. **Project creation**
   - Port the existing wizard and move filesystem work into Rust.
8. **GitHub**
   - OAuth, repository metadata, pull requests, issues, CI, and workflow failures.
9. **Repository health**
   - Useful local/remote maintenance signals after core parity.
10. **Electron removal**
    - Remove Electron, its IPC contracts, and its packaging dependencies only after parity.

## Versioning

- `0.8.x`: final Electron-first line;
- `0.9.0-alpha`: Tauri and new-UI migration;
- `0.9.x`: parity and stabilization;
- `1.0.0`: first production-quality unified release.

## V2 repository

`MadsenDev/localhost-hub-v2` remains unarchived until every useful piece has
been migrated. It should then receive a historical-repository notice and be
archived, not deleted.
