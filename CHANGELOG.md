# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Performance

- Stopped rebuilding the whole process table on every poll, and fixed the CPU column
  it broke. Localhost Hub refreshes every five seconds, and each tick built a fresh
  `System`, called `refresh_all()` — which also walks disks, networks and components
  that nothing reads — and did it twice, because scanning ports rebuilt the same table
  again to name the processes holding them.
  - The correctness half matters more than the cost. sysinfo derives CPU usage from
    the difference between two refreshes, so a table constructed per call had nothing
    to compare against and reported `0.0%` for every process. That is what the
    interface displayed, including for a `cargo` that was busy compiling. One shared
    table makes the figure real; a test creates load and asserts it is found.
  - Measured on an idle machine with 92 processes: a refresh went from 9.4ms to about
    3ms, and there is now one per tick instead of two. The gap widens with the process
    count, and a developer's machine runs several hundred.

- Reopening from the tray now shows current state at once, instead of up to five
  seconds of whatever was true when the window was hidden — which, after an afternoon
  in the tray, can mean presenting a service as running that died hours ago. Rust
  announces window visibility, because Rust is what hides the window and
  `document.hidden` is reported inconsistently by platform webviews for exactly this
  case.
  - This was built to stop the polling while hidden, and measurement showed there was
    nothing to stop: the webview already suspends those timers, at zero polls over
    thirty seconds hidden to the tray. The check stays for the freshness it buys, and
    the code says so rather than claiming a saving it does not make.

### Removed

- Deleted 2,015 lines that nothing referenced: four locale files under
  `src/translations/` totalling 1,828 lines, wired to no internationalisation of any
  kind, and `src/data.ts`, a 187-line mock dataset imported by nothing. The built
  bundle is byte-identical afterwards, which is the point — this was never reaching
  users, only readers.

### Security

- Validated process identifiers before signalling anything. `kill_process` accepts a
  pid from the interface, and `4294967295` was accepted and reported as success: it
  truncates to a `pid_t` of `-1`, which `kill(2)` reads as *every process the caller
  may signal*, and `/bin/kill` takes it without complaint. Workspace stop
  specifications carry a caller-supplied pid across the same boundary. `0` (the
  caller's own process group), `1` (init) and anything above `i32::MAX` are now
  refused before a signal is sent. This is not an authorization change — killing a
  process Hub did not start is what the Ports view is for — it is a check that the
  number is a process identifier rather than an alias for a broadcast.
  Found by writing the first tests for the IPC surface.

### Added

- Rebuilt the Sessions view on recorded runs. It was the one view presenting invented
  data as though it were history: hardcoded event markers reading "Bench panic" and
  "ngrok → https://…", spans positioned from a hash of the service name, and two
  statistics — "14 builds, avg 482ms" and "218 requests" — for telemetry Localhost Hub
  has never collected.
  - None of it could be reached. The array the view read from was filled with `[]` on
    every code path, so the timeline was unreachable and the view rendered nothing at
    all. Which also means the sidebar carried an entry for a feature that could not
    work.
  - Sessions are now reconstructed from `history/runs.json`: runs are grouped into
    bursts of work separated by half an hour of quiet, each service gets a track with
    its real spans, and each marker is a real outcome — started, exited, failed,
    stopped, or interrupted, with a clean exit distinguished from a non-zero one. The
    counts are of real records, and the scrubber's "failures before this point" is
    computed from real timestamps.
  - The derivation lives in `src/sessions.ts`, apart from the view, with 16 tests
    covering the clustering rules — including that a long-lived server spanning a quiet
    period keeps one session open rather than splitting it.
  - The density strip above the scrubber is now measured against the number of
    services rather than against its own busiest point, and is hidden when every
    bucket is identical. Normalising to the peak drew a solid full-height bar across
    the width for the common case of everything running start to finish, which is a
    chart that says nothing.

- Added tests for the IPC boundary, which had none. `src-tauri/src/command_tests.rs`
  sends real invoke requests through the same handler list the application registers,
  so it covers what calling the functions directly cannot: that a command is reachable
  at all, that its arguments bind from the payload the interface sends, and that
  rejected input comes back as an error rather than unwinding across the boundary. A
  command can be written, exported and completely unreachable, because defining it and
  registering it are two separate acts; the registration check reads the source and so
  covers every command, including the ones the test runtime cannot invoke.

- Routed workspace events through the same sink as service events, in a new
  `events.rs`. Workspace progress went straight to the webview, so it could not be
  delivered anywhere else, and a caller that was not the webview would also have
  missed every line of output its own run produced. Both kinds now go to one
  caller-supplied destination — the third precondition the Companion plan sets, and
  what lets a Companion server observe a run it started.

- Added the Localhost Companion threat model and pairing design in
  `docs/COMPANION_SECURITY.md`. Design only; no server, pairing or device credential code
  exists yet. It is the fourth precondition the Companion plan sets for starting
  implementation, and writing it first was deliberate: the feature puts a network
  listener in front of process control, so the security model should be reviewable before
  there is a socket to attack.
  - Its central conclusion is a constraint on the future API: it must not proxy the Tauri
    commands. `start_service` takes the command line, working directory and environment
    variables from its caller, which is reasonable for a local webview and is remote code
    execution over a socket. The Companion API therefore speaks in stored identifiers and
    resolves commands from configuration, so nothing executable crosses the wire.
  - Also settled: which of the 50 commands may ever be exposed and which may not, with
    reasons; certificate pinning through the pairing QR code, so an attacker present
    during pairing cannot become the permanent host; a pairing handshake whose transcript
    is bound into its challenge; device credentials as phone-generated non-exportable
    keypairs, leaving no authentication secret at rest on the desktop; revocation that
    terminates live sessions rather than only blocking new ones; and the residual risks,
    including that streamed service output can leak secrets Hub has no way to identify.

- Added **Start at login**. Closing to the tray keeps Localhost Hub alive once it is
  running; this is what gets it running, launching it straight to the tray at login
  without putting a window on screen. It exists for the cases where something other
  than the window needs Hub present — a workspace booted before sitting down at the
  computer, or a remote such as Localhost Companion having a host to reach.
  - The operating system owns the truth. A login item can be removed in System
    Settings, Task Manager or a desktop environment's startup panel, entirely outside
    Hub, so the setting is read back from the OS rather than trusted from the config
    file. The stored value records intent, and is re-applied at startup if the two
    have drifted apart. Toggling reports back whatever the OS actually did, so a
    refusal shows as the control not moving rather than as an interface that disagrees
    with the system.
  - Starting at login while closing the window still quits is a half-measure, so
    Settings says so rather than silently changing the other setting.

- Added a system tray icon and an option to close to it. Localhost Hub supervises
  long-running development servers, so closing the window usually means getting it out
  of the way rather than killing everything it is running. With **On window close** set
  to keep the application in the tray, closing hides the window and leaves services
  running; the tray icon reopens it, and its menu quits properly. The default is still
  to quit, since that is what closing a window is expected to do until asked otherwise.
  The window is only ever hidden when a tray icon actually exists, so a platform
  without one cannot leave the application running with no way to reach it.
- Added persisted run history. Nothing about a run previously outlived the process:
  closing the application discarded every record of what had run, when, and whether it
  succeeded. Each service run is now recorded with its command, working directory,
  process identifier, timing, and outcome, and its output is written to a per-run log
  file. A new Run history view lists past runs newest first and loads a run's stored
  output on demand.
  - History is bounded: the newest two hundred runs are kept and each log stops at two
    megabytes, with truncation stated rather than left to look like silence.
  - Runs still marked running at startup belonged to a previous session, since the
    process table lives in memory. Those are marked interrupted and the interface says
    so, rather than presenting a dead process as live. Adopting a process by its
    recorded identifier is deliberately not attempted, because identifiers are recycled
    and claiming to manage an unrelated process would be worse than admitting the
    outcome is unknown.
  - Recording is best effort. A service that cannot write its history still runs.
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
  - Define service prerequisites, validate missing/self/cyclic dependencies, and launch independent services in topological layers.
  - Wait for configured prerequisite readiness before unlocking dependents, and report downstream services as blocked when a prerequisite fails.
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
- Added safe environment-file workflows and temporary run overrides:
  - Imports bounded `.env`, `.env.*`, and `*.env` files through a Rust parser without shell or variable expansion, preserving real values in a new unsaved profile for review.
  - Exports reviewed profiles through Rust with escaped values, duplicate-key validation, symbolic-link protection, and owner-only permissions on Unix.
  - Detects likely secret keys for masking while keeping imported and exported values out of logs.
  - Runs project or configured workspace scripts once with validated temporary variables layered over their selected/default profile without changing saved configuration.
  - Keeps temporary variables for a managed restart of that run, then removes them when the service is stopped and started normally.
- Added service-start port conflict protection:
  - Checks configured ports, `PORT` environment values, and explicit `--port` command arguments before direct or workspace services start.
  - Enforces the same check in Rust immediately before process creation so frontend callers cannot accidentally bypass it.
  - Identifies the listening address, process name, and PID when the operating system exposes them.
  - Lets users cancel, explicitly start anyway, or terminate known port owners and retry.
  - Adds a persisted expected-port field to workspace services for commands whose port cannot be inferred safely.
- Added configurable sequential workspace readiness:
  - Replaces the fixed startup pause with an optional per-service delay of up to two minutes.
  - Optionally waits up to five minutes for every expected TCP port to be genuinely owned by the managed process tree before starting the next sequential service.
  - Keeps stdout URL detection separate from readiness so printing a URL cannot falsely mark a service ready.
  - Reports early exits and readiness timeouts as warnings while preserving the real running state and continuing the workspace plan.
  - Preserves zero-delay, no-readiness behavior for existing workspace configuration.
- Added native JavaScript package management to Project Detail:
  - Reads runtime, development, peer, and optional dependencies from `package.json` and compares them with installed top-level package versions.
  - Detects npm, pnpm, Yarn, and Bun from lockfiles or the manifest declaration.
  - Installs project dependencies, adds runtime or development packages, updates and removes packages, audits dependencies, checks outdated versions, and regenerates lockfiles.
  - Runs package managers directly from Rust with typed arguments, input validation, bounded execution time, and capped command output instead of shell interpolation.
  - Treats audit and outdated non-zero exit codes as valid reports while preserving real mutation failures.
- Expanded the live log viewer:
  - Filters combined output by service and severity, with bulk source selection and per-level counts.
  - Searches service names, source identifiers, and messages, including `/` focus and Escape-to-clear shortcuts.
  - Copies or exports exactly the visible filtered lines with timestamps, severity, and resolved service names.
  - Uses real millisecond timestamps, keeps a larger bounded in-memory history, and renders untrusted process output as text rather than injected HTML.
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

- Rewrote the README around what the application actually does, with screenshots taken
  from a real run against real scanned projects. Removed two pieces of guidance that no
  longer applied: a Minimize animations setting that went with the Electron interface,
  and two Chromium environment variables that do nothing under WebKitGTK, replaced with
  the WebKit equivalents.

- Drove desktop packaging from Releases instead of from pull requests. The previous
  trigger listed the application sources, so publishing installers for all three
  platforms plus an Arch container build ran on very nearly every pull request.
  Publishing a GitHub release now builds every platform and attaches the installers
  to that release, manual runs still produce artifacts on demand, and pull requests
  build Linux only when they change the packaging definition itself.

- Generated the TypeScript types for every value crossing the command boundary from
  the Rust structs themselves, using ts-rs, and re-exported them from the modules
  that previously declared them by hand. The two sides were mirrored manually across
  three separate files, so a renamed Rust field surfaced only at runtime as an
  undefined value. A renamed field now fails typechecking, and continuous integration
  fails if the committed bindings do not match the current Rust definitions.
  Reconciling the two sides also corrected the stored run mode, which was an
  unvalidated string rather than the same enumeration the workspace runner already
  used, and one caller that relied on backend defaults instead of sending a complete
  service definition.
- Added ESLint (TypeScript, React Hooks) and wired lint, typechecking, and Clippy
  into CI. Correctness rules fail the build; pre-existing `any` usage and React Hook
  dependency findings are reported as warnings so they stay visible without
  blocking. Removed the dead bindings this surfaced.
- Removed `@babel/parser`, `@babel/traverse`, and `fast-glob` from the production
  dependencies. Nothing imported them, and dropping `fast-glob` clears the only
  advisory in the production dependency tree. Moved `toml`, used solely by the
  version-sync script, to the development dependencies.
- Established `MadsenDev/localhost-hub` as the canonical active repository and the original Hub feature set as the behavioral parity reference.
- Moved operating-system work and long-running process ownership behind Rust service boundaries while keeping React responsible for interface and presentation state.
- Kept Git and GitHub as separate product domains: local repository operations use `git2`; remote platform information uses the GitHub integration.
- Reworked the Repos view around detected local projects, runnable scripts, native Git controls, and workspace service creation.
- Set the migration version line to `0.9.0-alpha`, preserving `0.8.x` as the final Electron-first line and reserving `1.0.0` for the unified production release.

### Removed

- Removed the Electron implementation, completing the migration to Tauri. This takes
  out the Electron main and preload processes, its IPC contracts, the `sql.js` storage
  layer, the Electron interface and its hooks and plugin gallery, the Electron entry
  point, and `electron-builder` with its configuration: roughly 15,300 lines of source.
  Ten development dependencies went with it, removing 386 packages from the install
  tree. The package no longer declares an Electron entry point and is now ESM rather
  than CommonJS, which only Electron required.
- Deleted `TODO.md`. Every remaining item in it described the Electron implementation
  and cited files that no longer exist, so a contributor following it would have
  rebuilt shipped features. `docs/IMPLEMENTATION_BACKLOG.md` already tracks planned
  work against the current architecture. `PROJECT.md` is kept, marked as the original
  brief, since its product intent and entity model outlived its architecture section.

### Fixed

- Exiting no longer orphans supervised services. Every child process Localhost Hub had
  started outlived it: reparented to init, still holding its port, with nothing left to
  manage it — and the next launch marked those runs interrupted while they were in fact
  still alive and serving. Confirmed by closing Hub with three servers running, then
  finding all three still answering HTTP 200 with no Hub process anywhere. Hub started
  them, so Hub stops them on the way out. Closing to the tray is the option that keeps
  them running, and it is unaffected.

- Hiding the window now requires a tray that can actually be reached. A successful tray
  build was taken as proof one existed, but building the icon succeeded on a session
  with no message bus and no panel at all, so Hub could hide itself somewhere with no
  window and no icon. On Linux the icon is published over the session bus, so a missing
  bus now counts as no tray. This is a necessary condition rather than a sufficient one —
  a bus can exist with nothing hosting the icon — but it rules out the case that
  actually strands the application.

- Fixed the Settings segmented controls sizing themselves to a hardcoded three options,
  which left the two-option **On window close** with a dead third column, and stretching
  to the height of whatever shared their grid row, which made one control nearly twice
  the height of the identical ones above it.

- Stopped the Sessions view taking the whole application down with it. Its initial state
  read `sessions[0].id`, so with no sessions recorded it threw, and because nothing
  caught the error React unmounted everything — the window went blank, title bar and
  sidebar included, with no message and no way to navigate out. Sessions now shows an
  empty state, and a boundary around the view area keeps any future failure of one view
  from blanking the rest; it resets when you switch views, so the application recovers
  without a restart.

- Switched off the platform webview's own button rendering once, globally, rather than
  in each component. Buttons carry a fill, a border and a drop shadow until that is
  explicitly reset, which left every component having to remember to override all of it.
  The project page tabs did not, and rendered as pale filled boxes on the dark title
  bar — the same defect as the window controls below. The reset is deliberately limited
  to that decorative chrome: an earlier, broader version also normalised typography and
  alignment, which left the Settings segmented controls with their labels shoved to the
  left, so it now leaves both alone.

- Fixed information being cut off in a narrow window:
  - **Project overview cards** clipped `PACKAGE MANAGER` to `PACK…` and pushed the
    values out of sight. These cards sit in a side column around 260px wide at *any*
    window size, so the viewport breakpoint that was meant to collapse them never fired
    when it mattered. They now respond to their own container's width instead, which is
    the only thing that actually determines whether two columns fit.
  - **Repository health rows** demanded roughly 710px against the ~630px available at
    the 900px minimum window width, so `Active today` became `Activ` and the expand
    chevron disappeared entirely. The repository path also wrapped to six lines because
    it asked for an ellipsis without `white-space: nowrap`, which does nothing on its
    own.
  - **The Logs stream** pushed its level filters and the Unlock button off the right of
    the window, and gave the whole page a horizontal scrollbar: its header could not
    wrap and its grid track would not shrink below the header's width.
  - **The project tab strip** ran GITHUB and HEALTH off the edge. The tabs now wrap onto
    a second row, because a tab nobody can see is a tab nobody can reach.
  - **Ports topology nodes** hung off the left edge with their labels cut to `port`. A
    node is a fixed 168px box centred on its coordinate, but the first column was
    pinned to a hardcoded 18% — only 83px across a narrow canvas, less than the node's
    own half-width. Columns are now fractions of a band inset by half a node at each
    end. A single workspace is also centred rather than pinned to the left, which the
    old spread formula did by accident when dividing by `max(1, n - 1)`.

- Fixed the window controls in the title bar, which were drawn by the platform webview
  rather than by the application. Their stylesheet never reset the default button
  appearance, so minimise, maximise and close rendered as three pale filled boxes with
  drop shadows and a barely visible mark inside each — the opposite of the flat dark
  chrome around them. They are now flat glyphs that light up on hover, with close
  turning red. The four glyphs were also drawn at three different sizes against a fixed
  stroke width, which gave each button a different stroke weight and optical size; they
  now share one size and one weight, and maximise is a square rather than a rounded
  blob. Added `aria-label` to each control, and a focus outline for keyboard use.

- Fixed a settings label running into its own description. Two fields wrap their label
  and hint in an element outside the field's grid gap, and both are inline, so they
  rendered as a single run-on line — `CLOSING TO THE TRAYKeeps supervised services…`.

- Corrected version and storage labels in the interface. The title bar and sidebar
  showed a hardcoded `v2.0`, and the sidebar described local storage as `sqlite`, which
  left with the Electron implementation. Both now reflect reality: the version comes
  from `package.json` at build time, so it cannot drift again. Also stopped a
  prerelease version string from wrapping the title bar and sidebar footer onto two
  lines.

- Pinned the Rust toolchain so Clippy's `-D warnings` gate is reproducible. Because
  continuous integration tracked the floating stable channel, Rust 1.97 introduced
  lints that 1.94 did not have and failed the build on code nobody had touched. The
  three findings are corrected, and local checks now use the same compiler as
  continuous integration, so a Clippy upgrade becomes a deliberate change.
- Kept service log streaming alive when a process writes output that is not valid
  UTF-8. Reading lines through a UTF-8 decoder returned an error that ended the
  reader, so a single stray byte silenced a service's logs for as long as it kept
  running. Output is now decoded lossily.
- Made carriage-return progress output visible while it happens. Tools that redraw
  progress with `\r` and never emit a newline previously buffered their entire run
  as one unterminated line, so nothing appeared until the process finished. Long
  lines are also flushed at a bound instead of growing without limit, and `\r\n` is
  treated as a single terminator so blank lines survive.
- Restored `findGitExecutable` on Windows, which referenced a platform flag that was
  never declared, and corrected four `execSync` calls that passed a boolean for the
  `shell` option, which expects a shell path.
- Stopped `tsc -p tsconfig.json` from emitting JavaScript beside every source file
  by marking that project typecheck-only.
- Restored the Electron parity reference so it can actually be run. The Electron UI
  had no entry point: `index.html` was the only one and it mounts the Tauri
  application, so both `npm run dev:electron` and the packaged Electron build
  rendered the Tauri interface against a backend that was not there. The original
  Electron shell was recovered from history and is now mounted by
  `index.electron.html` → `src/main.electron.tsx` → `src/ElectronApp.tsx`, with the
  Electron build and main process pointed at that entry.
- Stopped the Tauri command wrapper from resolving `null` in violation of its own
  type signatures. Read commands used by the polling and startup paths now return
  type-correct empty values, and commands that cannot be completed without the
  native backend reject with an explicit error instead of appearing to succeed.
  Previously every call resolved `null` outside Tauri, which crashed the first
  refresh tick in browser development.
- Corrected `tsconfig.app.json` to typecheck the whole `src/` tree. The `include`
  patterns were not recursive, so `src/components`, `src/hooks`, `src/plugins`, and
  `src/utils` were never checked; the resulting type errors are fixed.

### Security

- Moved the GitHub access token and every environment variable marked secret out of
  `config.json` and into the operating system credential store: Keychain on macOS,
  Credential Manager on Windows, and the Secret Service on Linux. A token with
  repository scope in a plaintext file was readable by any process running as the
  user, which includes the tooling in every project the application scans. Existing
  configurations are migrated on first load and the file is rewritten without them.
  Where no credential store is available, such as a Linux session without a Secret
  Service provider, the values fall back to a file restricted to the current user
  account — including a proper access control list on Windows, which the previous
  code left to inherit from its parent directory — and the settings panel states
  which of the two is in use rather than implying the credential store always is.
- Enabled a Content Security Policy for the desktop window, which was previously
  disabled. The policy allows only same-origin scripts and styles, restricts images
  to the application, data URLs, and GitHub avatars, and blocks objects and frames
  outright. Inline styles remain permitted because the interface animates through
  them. Verified by loading the production bundle in a browser with the policy
  enforced and confirming no violations.
- Made environment profiles that do not inherit the system environment behave
  predictably. The service command previously ran through a login shell, which
  sources the user's profile files and re-exported the environment that clearing it
  was meant to remove, so what a service saw depended on the user's dotfiles. A
  non-inheriting profile now runs without the login shell over a documented minimal
  baseline. The same correction was applied to the Electron script runner, which
  passed an entirely empty environment and therefore left no `PATH` for the command
  to resolve against.
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
