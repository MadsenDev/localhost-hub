# Localhost Hub Implementation Backlog

This backlog captures the current product direction in implementation order. Keep it updated as work lands.

## Phase 1: Foundation

### Real service management

- [x] Add initial Rust-managed process start/stop path for workspace services.
- [x] Add shell command execution in the repo cwd for npm, pnpm, yarn, bun, cargo, and arbitrary commands.
- [x] Add initial Tauri service events for started, stdout, stderr, exited, error, and stopped.
- [x] Stop Unix services by process group so child dev servers are not left behind.
- [x] Show initial PID and real uptime for managed services.
- [x] Add fallback stop-by-PID for services detected from process scanning but not started by the manager.
- [x] Add Rust query command for currently managed services so frontend state can recover after refresh/missed events.
- [x] Track service lifecycle states: stopped, starting, running, failed, crashed, exited, restarting.
- [x] Track cwd, command, memory, CPU, uptime, and detected ports per managed service.
- [x] Implement backend-owned restart and bounded process-tree termination.
- [x] Add Linux lifecycle tests for start, streamed output, duplicate protection, stop, and restart.
- [ ] Reconnect UI state to already-running matching processes where practical.
- [ ] Add persisted service run history/state as needed.

### Real logs

- [x] Stream stdout/stderr from Rust to frontend.
- [x] Store per-service logs in frontend state.
- [x] Add workspace-combined logs with workspace-scoped source filtering.
- [ ] Add timestamps, filtering, search, error highlighting, copy/export.

### Workspace orchestration

- [x] Move workspace start-all and stop-all orchestration from frontend timers into Rust.
- [x] Preserve per-service parallel and ordered sequential startup modes.
- [x] Continue workspace startup after individual service failures and report partial results.
- [x] Stop managed process trees and externally detected matching services from one workspace command.
- [x] Stop workspace services before deleting a workspace.
- [ ] Add configurable startup delays and readiness/health checks.
- [ ] Add service dependencies and dependency-aware startup ordering.
- [ ] Add workspace environment profiles.

### Ports and local URLs

- [x] Inspect listening TCP ports on Linux, macOS, and Windows.
- [x] Attribute ports and resource usage across each managed process tree.
- [x] Parse local HTTP/HTTPS URLs from stdout and stderr, including ANSI-coloured output.
- [x] Combine socket inspection with output-detected ports and URLs.
- [x] Open detected local URLs from workspace rows, the ports view, and command palette.
- [x] Reject non-local URLs in the backend browser-opening command.
- [ ] Detect port conflicts before starting a service.
- [ ] Add explicit user-managed watched ports.

### Persist app preferences

- [x] Persist theme in config.
- [x] Persist density in config.
- [x] Persist accent color in config.
- [x] Persist sidebar width in config.
- [ ] Add editor path setting.
- [ ] Add terminal path setting.

### Project detail and metadata

- [x] Discover manifest-based projects without requiring a Git repository.
- [x] Continue scanning inside repositories so nested monorepo packages are found.
- [x] Detect package managers from declarations and lockfiles.
- [x] Return directly runnable package scripts with raw command and runner metadata.
- [x] Detect Git ownership for nested projects.
- [x] Detect JavaScript, Rust, Go, Python, Ruby, and PHP project foundations.
- [ ] Populate `data.projects` from scanned repos.
- [ ] Make Project Detail work with live scanned data.
- [ ] Add project tabs: Overview, Scripts, Git, GitHub, Ports, Logs, Health.
- [ ] Detect README/license files.
- [ ] Detect Docker/devcontainer files.
- [ ] Detect languages and dependency manifests.

### Project structure cleanup

- [x] Decide whether `dist/` should be committed or ignored consistently.
- [x] Stop tracking generated `dist/` and `node_modules/` files while keeping them ignored and present locally.
- [x] Remove or use unused `is_port_open`.
- [ ] Audit placeholder views and mark future-only surfaces clearly.
- [x] Keep generated build artifacts out of normal development diffs where possible.

## Phase 2: Git Foundation

### Repository operations

- [ ] Clone repo by URL.
- [ ] Clone repo from GitHub search.
- [ ] Select local clone destination.
- [ ] Initialize repo.
- [ ] Open existing repo.
- [x] Add remote.
- [x] Remove remote.
- [x] Rename remote.
- [ ] Add post-clone actions: install dependencies, create workspace, open editor, run dev script.

### Git status

- [x] Show clean/dirty state.
- [x] Show staged files.
- [x] Show unstaged files.
- [x] Show untracked files.
- [x] Show conflicted files.
- [ ] Optionally show ignored files.
- [x] Show file counts and change type indicators.
- [x] Show ahead/behind counts.

### Staging and commits

- [x] Stage file.
- [x] Unstage file.
- [x] Stage all.
- [x] Unstage all.
- [x] Commit with message input.
- [ ] Amend last commit later.
- [ ] Signed commits later.
- [ ] Stage hunks later.
- [ ] Stage selected lines later.

### Diff viewer

- [x] Text diff.
- [ ] Syntax highlighting.
- [x] Additions/removals.
- [x] File sidebar.
- [ ] Side-by-side diff later.
- [ ] Image diff later.
- [ ] Markdown preview diff later.

### Branches and remotes

- [x] Show current branch.
- [x] Switch branch.
- [x] Create branch.
- [x] Delete branch.
- [ ] Search branches.
- [x] Show upstream tracking state.
- [ ] Fetch.
- [ ] Pull.
- [ ] Push.
- [ ] Force push with warning.
- [ ] Pull with rebase later.

### History

- [x] Commit history.
- [ ] Commit details.
- [x] Author/date.
- [x] Changed files.
- [ ] Commit search later.

## Phase 3: GitHub Intelligence

- [ ] Fetch repo metadata.
- [ ] Show GitHub linked state per repo.
- [ ] Show open PR for current branch.
- [ ] Show CI/check status.
- [ ] Show open issues.
- [ ] Show workflow failures.
- [ ] Show repo visibility.
- [ ] Open repo in browser.
- [ ] Open PR in browser.
- [ ] Copy repo URL.
- [ ] Create PR later.
- [ ] Add GitHub dashboard widgets: assigned PRs, review requests, failing workflows, recent repos.
- [ ] Add notifications later.

## Phase 4: Repo Health

- [ ] Track last commit age.
- [ ] Track uncommitted changes age.
- [ ] Track unpushed commits.
- [ ] Detect stale branches.
- [ ] Detect README presence.
- [ ] Detect license presence.
- [ ] Detect dependency files.
- [ ] Detect archived GitHub state.
- [ ] Classify repos as active, quiet, dirty, unpushed, stale, archived, experimental.
- [ ] Add health warnings to Home and Repos.
- [ ] Add optional metrics: commit frequency, contributor count, branch age, PR age, issue age.

## Phase 5: Optional AI Layer

- [ ] Generate commit messages from diffs.
- [ ] Explain diffs.
- [ ] Summarize repos.
- [ ] Summarize branch purpose.
- [ ] Explain logs/errors.
- [ ] Generate README summaries.
- [ ] Generate handoff summaries.
- [ ] Create Cursor/Codex task briefs.
- [ ] Answer "What was I working on?"
- [ ] Answer "What changed recently?"
- [ ] Design BYOK-compatible provider settings.

## Implementation Principles

- Keep local Git functionality independent from GitHub functionality.
- Prefer local-first behavior.
- Use Rust/Tauri for real process, filesystem, Git, and OS integration.
- Use GitHub APIs only for GitHub metadata and remote intelligence.
- Avoid overengineering; use `git2` where useful and system `git` where more reliable.
- Preserve a Linux-native, fast, information-dense workflow.

## Post-Parity: Localhost Companion

See [Localhost Companion](LOCALHOST_COMPANION.md).

- [ ] Extract reusable Rust application services beneath Tauri commands.
- [ ] Define the Companion API threat model.
- [ ] Add opt-in LAN server lifecycle.
- [ ] Add QR pairing with revocable device credentials.
- [ ] Add mDNS discovery via `_localhost-hub._tcp.local`.
- [ ] Expose read-only project, Git status, port, and log APIs.
- [ ] Expose permission-scoped service and workspace controls.
- [ ] Translate verified LAN-reachable development URLs for open-on-phone.
- [ ] Build the Android/Compose 0.1 client only after desktop core parity.
