# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/MadsenDev/localhost-hub/compare/v0.6.0...HEAD
[0.6.0]: https://github.com/MadsenDev/localhost-hub/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/MadsenDev/localhost-hub/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/MadsenDev/localhost-hub/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/MadsenDev/localhost-hub/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/MadsenDev/localhost-hub/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/MadsenDev/localhost-hub/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/MadsenDev/localhost-hub/releases/tag/v0.1.0

