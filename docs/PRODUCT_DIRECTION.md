# Localhost Hub Product Direction

## Product Identity

Localhost Hub is a local-first desktop control center for development projects.

It should combine:

- Local project discovery
- Process and service management
- Ports, logs, and workspaces
- Git workflows
- GitHub integration
- Repo health intelligence
- Optional AI-assisted developer tooling

This is not just a GitHub Desktop clone. GitHub Desktop-like functionality belongs inside a broader local development orchestration platform.

The app should understand the whole local development environment:

- Repos
- Scripts
- Processes
- Ports
- Workspaces
- Git state
- GitHub metadata
- Local development environments

The central product principle is that Localhost Hub should understand and orchestrate local development work, not only Git repositories.

## Existing Foundation

Current stack:

- Frontend: React 19, TypeScript, Vite, CSS, Tauri JS APIs
- Backend: Tauri v2, Rust 2021, sysinfo, git2, reqwest, open, persisted config helpers

Currently implemented areas:

- Repo/project scanning
- Workspace roots
- Workspaces and services
- Process polling
- Port scanning
- GitHub OAuth device flow
- Settings
- Onboarding
- Local React routing/state
- Rust-managed service state and streamed process events
- Project grouping

This foundation should remain and expand.

## Architecture Layers

### Local Development Layer

Owns:

- Repo scanning
- Process management
- Services
- Ports
- Logs
- Workspaces
- Terminal/editor integration

### Git Layer

Owns local Git workflows:

- Status
- Diffs
- Staging
- Commits
- Pull, push, fetch
- Branches
- Remotes
- Ahead/behind
- History

This layer must work for generic Git repos, GitHub repos, and later self-hosted remotes.

### GitHub Layer

Owns optional GitHub awareness:

- OAuth
- PRs
- Issues
- Workflow runs
- CI/check status
- Branch-to-PR mapping
- Repo metadata

This layer must remain optional and separate from local Git functionality.

### AI Layer

Future optional layer.

Possible responsibilities:

- Commit message generation
- Diff explanation
- Repo summaries
- Log/error explanation
- Handoff summaries
- Task generation

Prefer optional and BYOK-compatible design later.

### Companion Layer

Future, post-parity layer.

Localhost Companion is a focused Android remote for observing and controlling
Hub-managed projects, services, workspaces, logs, ports, and basic Git state. It
must share Rust application services with Tauri commands rather than duplicate
business logic behind a second API.

It is not a mobile project manager. Project creation, environment editing,
package management, repository management, Git writes, and terminal access
remain desktop responsibilities.

See [Localhost Companion](LOCALHOST_COMPANION.md) for the product boundary,
security model, architecture, and release plan.

## Main Product Areas

### Local Project Discovery

Expand detection for:

- Git repos
- Frameworks
- Package managers
- Scripts
- Languages
- Docker presence
- Devcontainers
- README/license presence

Support:

- Favorite/pinned projects
- Tags/categories
- Hidden repos
- Ignored folders
- Recent projects

Per repo, track:

- Name
- Path
- Framework
- Package manager
- Current branch
- Git status
- Running services
- Active ports
- GitHub connection state

### Real Service And Process Management

Complete parity between the Rust-managed process layer and the mature Electron runner.

Support commands for:

- npm
- pnpm
- yarn
- bun
- cargo
- Arbitrary commands

Process lifecycle:

- Start
- Stop
- Restart
- Kill
- Auto-reconnect to existing processes where possible

Logging:

- Live stdout/stderr streaming
- Per-service logs
- Workspace-combined logs
- Timestamps
- Filtering
- Search
- Copy/export logs

Service states:

- Stopped
- Starting
- Running
- Crashed
- Exited
- Restarting

Track:

- PID
- cwd
- command
- uptime
- memory usage
- CPU usage
- detected ports

Workspace orchestration:

- Start all services
- Stop all services
- Restart all services
- Ordered startup later
- Environment variables later

### Git Integration

Localhost Hub should support everyday Git workflows:

- Clone repo
- Initialize repo
- Open existing repo
- Add/remove/rename remotes
- Status
- Staging
- Commit
- Diff viewer
- Branch management
- Fetch/pull/push
- Commit history

Clone flow should support:

- GitHub repo search
- URL clone
- Local destination selection
- Post-clone setup prompts

Post-clone actions:

- Install dependencies
- Create workspace
- Open in editor
- Run dev script

### GitHub Integration

Expand OAuth into full GitHub awareness:

- Repo metadata
- Open PRs
- Assigned issues
- Workflow runs
- CI/check status
- Branch PR detection
- Repo visibility
- Default branch
- Latest releases optionally

Per repo GitHub panel:

- GitHub linked state
- Open PR for current branch
- CI status
- Open issues
- Workflow failures
- Repo visibility
- Quick links

GitHub dashboard ideas:

- Assigned PRs
- Review requests
- Failing workflows
- Recently updated repos
- Notifications later

### Repo Health

Integrate repo intelligence concepts:

- Last commit age
- Uncommitted changes age
- Unpushed commits
- Stale branches
- README exists
- License exists
- Dependency file detection
- Archived state
- Activity classification

Possible repo states:

- Active
- Quiet
- Dirty
- Unpushed
- Stale
- Archived
- Experimental

Potential metrics:

- Commit frequency
- Contributor count
- Branch age
- PR age
- Issue age

### AI Features

Future optional features:

- Generate commit messages
- Explain diffs
- Summarize repo
- Summarize branch purpose
- Explain logs/errors
- Generate README summary
- Generate handoff summary
- Create Cursor/Codex task briefs
- Answer "What was I working on?"
- Answer "What changed recently?"

## Main Views

### Home

Central dashboard showing:

- Pinned repos
- Active workspaces
- Running services
- Dirty repos
- Unpushed repos
- Recent projects
- Port conflicts
- Crashed services
- GitHub status
- Health warnings

### Repos

Main repo browser showing:

- Repo cards/list
- Branch
- Status
- Running services
- Ports
- GitHub state
- Framework
- Health state

Filters:

- Dirty
- Running
- Stale
- GitHub connected
- Favorites
- Unpushed

### Project Detail

Primary working view.

Tabs:

- Overview
- Scripts
- Git
- GitHub
- Ports
- Logs
- Health
- AI/Handoff later

### Workspace

Group related projects/services.

Support:

- Service groups
- Start all
- Stop all
- Restart all
- Workspace logs
- Open all URLs

### Ports

Show:

- Port
- Process
- Service
- Repo
- URL
- Protocol

Actions:

- Open
- Copy URL
- Inspect process
- Kill process later

### Logs

Support:

- Live logs
- Filtering
- Search
- Timestamps
- Service grouping
- Error highlighting
- Export/copy

### Sessions

Future feature for tracking:

- Repos worked on
- Commits made
- Services started
- Ports opened
- Errors encountered

Useful for summaries and context restoration.

### Settings

Persist:

- Theme
- Density
- Accent color
- Sidebar width
- Editor path
- Terminal path
- GitHub auth
- Workspace roots
- AI provider settings later

## UX Philosophy

The app should feel:

- Linux-native
- Practical
- Fast
- Information-dense but clean
- Keyboard-friendly
- Developer-focused
- Local-first

Avoid:

- Excessive animations
- Web-dashboard bloat
- Enterprise SaaS styling
- Hiding critical repo state

Prioritize:

- Workflow clarity
- Quick actions
- Context awareness
- Reduced terminal/context switching
