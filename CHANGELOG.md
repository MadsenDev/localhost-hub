# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Added the animated Localhost Hub brand lockup to first-run onboarding, with a reduced-motion fallback.
- Began the `0.9.x` Tauri unification in the canonical `localhost-hub` repository:
  - Ported the newer Localhost Hub V2 interface to React 19, Vite 7, and the Tauri 2 desktop shell.
  - Added native Rust modules and Tauri commands for projects, processes, services, ports, workspaces, Git, GitHub, configuration, and project scaffolding.
- Added recursive workspace and project discovery in Rust:
  - Detects JavaScript, TypeScript, Rust, Go, Python, Ruby, and PHP projects from their manifests.
  - Detects frameworks, package managers, runnable scripts, Git roots, and environment files.
  - Supports configurable workspace roots, scan depth, and ignored directories.
- Added Rust/Tokio-managed development services:
  - Start, stop, restart, and terminate real project commands.
  - Stream stdout, stderr, lifecycle events, detected URLs, and exit state to the interface.
  - Report PID, CPU, memory, uptime, ports, and URLs for managed services.
- Added first-class workspace orchestration:
  - Create named workspaces containing services from multiple repositories.
  - Start services in parallel or sequential order.
  - Stop all services, inspect combined runtime state, and filter combined logs.
- Added unified port and localhost URL detection:
  - Combines listening-socket inspection with URLs parsed from service output.
  - Associates detected ports and URLs with managed service processes.
  - Normalizes and safely opens local HTTP and HTTPS URLs.
- Added native Git support with `git2`:
  - Branch, clean/dirty, staged, unstaged, untracked, conflict, ahead/behind, and latest-commit status.
  - Worktree and staged diffs, file staging and unstaging, and local commits.
  - Branch creation, checkout, and deletion.
  - Commit history plus remote listing, add, rename, and removal.
  - Fetch, fast-forward pull, and push with explicit remote selection and non-interactive authentication behavior.
- Added the project creation workflow to the V2 interface:
  - React/Vite, Node HTTP, and minimal starters in JavaScript or TypeScript.
  - npm, pnpm, yarn, and Bun package-manager support.
  - Optional Tailwind CSS v4, icon packages, additional dependencies, development dependencies, and custom scripts.
  - Optional README generation, Git initialization, dependency installation, and automatic project rescan.
  - Rust-owned input validation and filesystem generation, including path traversal and existing-target protection.
- Added Localhost Companion product and architecture notes in `docs/LOCALHOST_COMPANION.md`, defining a focused Android remote for services, workspaces, logs, ports, and basic Git state after desktop parity.
- Added GitHub device-flow and repository-awareness foundations carried forward from the V2 architecture.
- Connected local projects to their GitHub repository context:
  - Resolves HTTPS and SSH `github.com` remotes in Rust, preferring `origin`.
  - Shows the pull request associated with the current local branch.
  - Shows open pull requests, open issues, and check runs for the local HEAD commit on demand.
  - Keeps incomplete API permissions non-fatal by displaying available repository data with scoped warnings.
  - Opens only validated HTTPS links hosted on `github.com`.
  - Writes the Rust-owned configuration with owner-only permissions on Unix so the stored OAuth token is not left world-readable.
- Added native repository-health analysis and a dedicated Health view:
  - Scores local repositories from activity, working-tree age, unpushed commits, inactive branches, README and license presence, dependency manifests, and common CI configuration.
  - Surfaces healthy, needs-attention, and at-risk summaries with expandable signal details.
  - Runs filesystem and Git inspection in Rust while keeping presentation and refresh state in React.
- Added a live Project Detail experience backed by scanned repositories:
  - Opens projects from Home, Repos, and the command palette without relying on the legacy synthetic project fixture.
  - Shows real overview, scripts, managed services, streamed logs, detected ports, Git status, GitHub context, and repository-health signals.
  - Starts, stops, and restarts workspace services from detected scripts, while routing unconfigured scripts through explicit workspace setup.
  - Removed fabricated run history, build timing, environment values, port history, and placeholder project panels.
- Added direct project script execution and runtime reconciliation:
  - Runs scanned scripts through the Rust service manager without requiring or silently creating a workspace.
  - Exposes direct Run actions from Project Detail, repository cards, and the command palette.
  - Rehydrates directly managed services from the Rust service registry after frontend refreshes.
  - Detects matching development processes started outside Hub, preferring the process that owns the listening port.
  - Labels externally owned processes separately and permits explicit termination without offering an unsafe synthetic restart.
  - Includes direct and external services in global runtime counts, logs, ports, and project views.
- Added Rust-owned environment-profile execution:
  - Creates and edits per-project profiles in the V2 Project Detail interface, including masked secret fields and one project default.
  - Applies the default profile to direct project scripts and lets each workspace service select a specific profile.
  - Validates environment keys in Rust, extends the inherited system environment, and preserves the same environment snapshot across managed restarts.
  - Keeps profile values out of Hub lifecycle events while documenting that locally stored secret-marked values are masked rather than encrypted.
  - Preserves compatibility with existing configuration files that predate environment profiles.
- Added native JavaScript package management to Project Detail:
  - Reads runtime, development, peer, and optional dependencies from `package.json` and compares them with installed top-level package versions.
  - Detects npm, pnpm, Yarn, and Bun from lockfiles or the manifest declaration.
  - Installs project dependencies, adds runtime or development packages, updates and removes packages, audits dependencies, checks outdated versions, and regenerates lockfiles.
  - Runs package managers directly from Rust with typed arguments, input validation, bounded execution time, and capped command output instead of shell interpolation.
  - Treats audit and outdated non-zero exit codes as valid reports while preserving real mutation failures.
- Refined the Localhost Companion direction from the supplied design prototype:
  - Fixed the implementation target as a native Kotlin and Jetpack Compose Android app; the HTML prototype remains a design reference only.
  - Captured its pairing, permission, Home, Projects, Logs, Ports, confirmation, and crash-alert flows.
  - Preserved the focused remote-control boundary with no shell, filesystem, or Git-write access.
- Added cross-platform Tauri packaging through GitHub Actions:
  - Builds AppImage, DEB, RPM, and Arch `.pkg.tar.zst` packages for broad Linux distribution coverage.
  - Builds a universal macOS DMG/app for Intel and Apple Silicon.
  - Builds MSI and NSIS installers for Windows.
  - Retains packages as workflow artifacts and creates draft releases from matching version tags.
  - Rejects releases when the npm, Tauri, Cargo, and Git tag versions disagree.

### Changed

- Established `MadsenDev/localhost-hub` as the canonical active repository and the original Hub feature set as the behavioral parity reference.
- Moved operating-system work and long-running process ownership behind Rust service boundaries while keeping React responsible for interface and presentation state.
- Kept Git and GitHub as separate product domains: local repository operations use `git2`; remote platform information uses the GitHub integration.
- Reworked the Repos view around detected local projects, runnable scripts, native Git controls, and workspace service creation.
- Set the migration version line to `0.9.0-alpha`, preserving `0.8.x` as the final Electron-first line and reserving `1.0.0` for the unified production release.

### Security

- Rejects unsafe project names, path traversal, invalid package specifications, and attempts to overwrite existing project paths.
- Restricts browser opening to normalized local HTTP and HTTPS URLs.
- Runs package installation without a shell and disables interactive Git credential prompts for background network operations.

## [0.8.0] - 2025-12-19

### Added
- Custom script management: users can now add, save, and delete custom scripts for any project
  - "Add custom script" button in Scripts section to create persistent custom scripts
  - Custom scripts are saved to the database and persist across rescans
  - Delete button (trash icon) shown only for custom scripts
  - Custom scripts are distinguished from detected scripts with `runner = 'custom'`
  - Custom scripts cannot overwrite detected scripts with the same name
- Cargo script support: detection and execution of Rust/Cargo projects
  - Automatic detection of `Cargo.toml` files
  - Support for running cargo commands (build, test, run, etc.)
  - Cargo scripts displayed alongside npm/yarn/pnpm scripts

### Changed
- Custom scripts are preserved during project rescans (they won't be deleted when scanning)
- Scripts panel now shows runner type (npm run, cargo, or command) for each script

## [0.7.0] - 2025-12-13

### Added
- Guided onboarding tour with 7-step interactive walkthrough
  - Welcome modal on first launch with option to start tour or skip
  - Demo project injection that safely showcases features without touching filesystem
  - Highlight overlay with callout bubbles that guide users through key UI elements
  - Keyboard navigation support (ESC to skip, arrow keys for next/back)
  - Tour steps covering: Projects sidebar, Project header, Scripts, Logs, Ports, Open in browser, and completion
- Onboarding state persistence in settings (onboarding_v1_completed, onboarding_v1_skipped, onboarding_v1_seen_at)
- Reset onboarding button in Settings panel About section
- Demo project protection: all destructive actions (run, stop, install, open folder, etc.) are disabled with informative toast messages
- Fake data for demo project: simulated git status, ports, and logs to provide realistic tour experience

## [0.6.0] - 2025-11-29

### Added
- Desktop plugin architecture that scans both bundled and user `plugins/` directories, surfaces manifests to the renderer, and launches external tooling through new `plugins:list`/`plugins:launch-external` IPC endpoints.
- Plugin gallery experience with enable/disable toggles, project-context validation, and a sidebar shortcut so plugins can be launched or wired into project menus without leaving Localhost Hub.
- Project-level plugin quick actions in the project header, including grouping by plugin, action descriptions, and context chips so you can see exactly what a plugin receives before launching.
- First built-in plugin (`LocaleForge`) plus locale resource files for English, French, Norwegian, and Swedish to kick off the upcoming localization work.

### Changed
- Redesigned the project header plugin menu with counts, icons, and richer hover states for a faster, more informative command palette.

## [0.5.0] - 2025-11-25

### Added
- "Open Folder" button in project header to open project directory in file explorer (Windows, macOS, Linux)
- "Buy Me a Coffee" support link in Settings panel About section
- Git installation detection modal for Windows with installation options (winget, Chocolatey, Scoop, manual download)
- "Check Again" button in Git installation modal to re-check after installation
- Enhanced About section in Settings with comprehensive app information, features, and tech stack
- Custom command runner so any arbitrary shell command can be launched from the Scripts tab
- Environment helpers: .env file editor plus per-script temporary env overrides
- Git tab upgrades: stage/unstage, commits, branch checkout/creation, push, and stash controls
- Optional encrypted storage for Git HTTPS credentials per project
- Utility workflows panel with one-click DB/d compose helpers powered by saved scripts or commands
- Packages tab now exposes npm audit/outdated and one-click lockfile regeneration
- Ports & Processes tab upgrades: per-service launch buttons, inline restarts for tracked dev servers, and clearer status badges

### Fixed
- Git detection on Windows now checks common installation paths when git is not in PATH
- Git status and git commands (stage, unstage, commit, push, etc.) now work on Windows even when git isn't in the system PATH
- Improved detached HEAD state detection on Windows for better branch display
- App icon now uses .ico format on Windows for proper display in file explorer (requires rebuild)
- Settings modal content area scrolling improvements

### Removed
- Embedded terminal tab and node-pty integration (feature reverted due to packaging instability)

## [0.4.0] - 2025-11-24

### Added
- Workspace restart controls and per-script restart actions within the Workspaces modal
- Project sidebar context menu for hiding projects plus hidden-project toggle + unhide list
- Exit-code hover tooltips in History modal describing common exit statuses

## [0.3.0] - 2025-11-22

### Added
- Step-based "Create Project" wizard with guided starters, dependency planners, script planner, and review step
  - Styling preset picker with Tailwind 4 (Oxide) or Tailwind 3.4 pipelines
  - Icon pack toggles (react-icons, lucide-react, @heroicons/react)
  - Extras step for sample code style, README generation, git init, and notes
- Backend scaffolding for the new wizard inputs
  - Automatically creates tsconfig, sample source files, README content, .gitignore, and optional git repo
  - Generates Tailwind/PostCSS configs or Oxide entry files based on preset
  - Installs icon packs and styling deps alongside user-selected packages

### Changed
- Windows build config cleaned up to remove unsupported `signDlls` option for electron-builder 26

## [0.2.0] - 2024-12-19

### Added
- Loading screen with animated SVG logo on app startup
  - Animated logo with rotating elements, pulsing circles, and gradient effects
  - Smooth fade-in animations and background gradient effects
- Pop-out terminal modal for script execution
  - Draggable and movable terminal window
  - Shows real-time script output
  - Can be closed without stopping the script
  - Logs remain accessible in the main Logs tab
- Create Project feature
  - Modal for creating new projects with package.json
  - Template selection (Empty, React, Node.js, TypeScript)
  - Package management (add/remove packages)
  - Package manager selection (npm, yarn, pnpm, bun)
  - Optional automatic dependency installation
  - Create Project button in sidebar and empty state
  - Automatically rescans after project creation

### Changed
- Loading screen now displays for minimum 1.5 seconds for better UX
- Window background color matches loading screen to prevent flash

## [0.1.1] - 2024-12-19

### Fixed
- Fixed Windows code signing build failures caused by symbolic link extraction errors
  - Added cache clearing script to resolve winCodeSign extraction issues
  - Updated build configuration with `signDlls: false` to simplify signing process
  - Added troubleshooting documentation for Windows builds

### Added
- Added `clear:cache` npm script to clear electron-builder cache
- Added `scripts/clear-electron-builder-cache.cjs` utility script
- Added Windows build troubleshooting section to README

### Changed
- Updated build configuration to handle Windows symlink extraction issues more gracefully

## [0.1.0] - 2024-12-19

### Added
- Initial release
- Electron + React desktop application shell
- Modern renderer UI with sidebar and panels
- Secure preload layer for IPC
- Build configuration for macOS, Windows, and Linux
- Development environment with Vite and live reloading

[Unreleased]: https://github.com/MadsenDev/localhost-hub/compare/v0.8.0...HEAD
[0.8.0]: https://github.com/MadsenDev/localhost-hub/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/MadsenDev/localhost-hub/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/MadsenDev/localhost-hub/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/MadsenDev/localhost-hub/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/MadsenDev/localhost-hub/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/MadsenDev/localhost-hub/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/MadsenDev/localhost-hub/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/MadsenDev/localhost-hub/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/MadsenDev/localhost-hub/releases/tag/v0.1.0
