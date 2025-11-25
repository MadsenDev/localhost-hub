# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Custom command runner so any arbitrary shell command can be launched from the Scripts tab
- Environment helpers: .env file editor plus per-script temporary env overrides
- Git tab upgrades: stage/unstage, commits, branch checkout/creation, push, and stash controls
- Optional encrypted storage for Git HTTPS credentials per project
- Utility workflows panel with one-click DB/d compose helpers powered by saved scripts or commands
- Packages tab now exposes npm audit/outdated and one-click lockfile regeneration
- Ports & Processes tab upgrades: per-service launch buttons, inline restarts for tracked dev servers, and clearer status badges

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

[Unreleased]: https://github.com/MadsenDev/localhost-hub/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/MadsenDev/localhost-hub/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/MadsenDev/localhost-hub/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/MadsenDev/localhost-hub/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/MadsenDev/localhost-hub/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/MadsenDev/localhost-hub/releases/tag/v0.1.0

