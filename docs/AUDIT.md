# Localhost Hub — Repository Audit

**Audited commit:** `69fe308` (`claude/repo-audit-ltpeqa`, branched from `main`)
**Version:** `0.9.0-alpha.0`
**Date:** 2026-07-30
**Scope:** features, functionality, security, code quality, testing, release readiness

---

## 1. Executive summary

Localhost Hub is a ~33,400-line local-first desktop control center mid-migration from
Electron to Tauri 2. The Rust backend is the strongest part of the codebase: it is
consistently defensive, with real input validation on nearly every command boundary,
credential redaction, timeouts, and symlink/path-traversal checks. The release
tooling (version synchronization across five manifests, cross-platform packaging
matrix) is more disciplined than most projects at `0.9.0-alpha`.

The blocking problems are not in the Rust. They are in the **migration's integrity**:

1. The Electron implementation — documented in `README.md` and `docs/UNIFICATION.md`
   as the behavioral reference that must be preserved until parity is verified —
   **cannot actually be run.** Its entire UI layer is unreachable. The parity safety
   net that the migration plan depends on does not exist.
2. The Tauri IPC wrapper resolves `null` for every call when not running under Tauri,
   in violation of its own type signatures. This **crashes the app** in the
   browser-dev mode that `README.md` documents, and is what the Electron shell now
   renders.

Neither is hard to fix, but until they are, "verify feature parity before removing
Electron" (UNIFICATION.md stage 10) is not an executable plan.

> **Status: every Critical and High finding is closed**, along with **M2**, **M3**,
> **M4**, **M7**, **M8**, and **M1** in part, plus three defects the audit could not
> have seen because no gate covered the code they live in (**F1**, **F2**, **F3**).
> Each finding keeps its original text, with a *Resolution* note appended where work
> landed. Still open: **M5** (polling cost), **M6** (unused locales), and the
> `commands.rs` half of **M4**.
>
> C1 was ultimately resolved twice: first by making the Electron reference runnable,
> then — once parity had been compared against it — by removing Electron entirely,
> which completed `UNIFICATION.md` stage 10 and retired **M2** with it.

### Release-readiness verdict

| Line | Status |
| --- | --- |
| `0.9.x` alpha / internal | **Ready**, once C1 and C2 are resolved |
| `1.0.0` production | **Not ready.** Blocked on C1, C2, H1–H3, code signing, and test depth |

### Verified by execution

| Check | Result |
| --- | --- |
| `npx tsc -p tsconfig.app.json --noEmit` | **Pass**, 0 errors — but see **F1**: the config only covered the top level of `src/`, so this result was far narrower than it appears |
| `npx vitest run` | **Pass**, 41/41 tests, 15 files, 6.6 s |
| `npm run check:version` | **Pass**, `0.9.0-alpha.0` synchronized across all 5 manifests |
| `cargo test --manifest-path src-tauri/Cargo.toml` | **Not run** — audit container lacks GTK (`gdk-3.0`) system libraries. Environment limitation, not a repo defect. CI installs these and does run it. 53 Rust tests counted statically. |
| `npm audit` | 41 vulnerabilities (4 critical, 27 high, 8 moderate, 2 low) |

---

## 2. Architecture

```
index.html → src/main.tsx → src/App.tsx        ← the ONLY live UI (Tauri)
    ├── src/view-*.tsx, sidebar, chrome, *-panel, *-dialog
    └── src/tauri-api.ts → invoke() → src-tauri/src/commands.rs (48 commands)

src/components/** + src/hooks/**   ← 9,791 LOC, 227 window.electronAPI calls
                                     NO ENTRY POINT — unreachable (see C1)
electron/**                        ← 4,762 LOC, still builds
```

Boundary discipline (per `UNIFICATION.md`: React owns presentation, Rust owns
filesystem/processes/persistence) is **respected** in the live tree. The renderer
never touches Node APIs; all privileged work crosses a typed `invoke` boundary.

### Feature inventory (live Tauri path)

| Area | Rust module | State |
| --- | --- | --- |
| Project/workspace discovery | `workspace.rs` (1,549) | Recursive scan; JS/TS, Rust, Go, Python, Ruby, PHP manifests; framework + package-manager + script detection |
| Managed services | `services.rs` (1,117) | Start/stop/restart, process-group kill w/ SIGTERM→SIGKILL escalation, stdout/stderr streaming, CPU/mem/uptime/PID, URL scraping |
| Workspace orchestration | `workspace.rs` | Parallel/sequential, `depends_on` with cycle + self-reference validation, topological layers, readiness gating, blocked-downstream reporting |
| Git (local) | `git.rs` (1,236) | Status, diff, stage/unstage, commit, branches, remotes, fetch/pull/push |
| GitHub (platform) | `github.rs` (562) | OAuth device flow, repos, PRs, issues, check runs |
| Ports | `ports.rs` (377) | `ss`/`lsof`/`netstat` parsing, conflict preflight, localhost URL normalization |
| Packages | `packages.rs` (453) | Manager detection, add/remove/update/audit/outdated |
| Scaffolding | `scaffold.rs` (674) | Project creation wizard backend |
| Repo health | `health.rs` (643) | Local/remote maintenance signals |
| Env files | `env_files.rs` (334) | `.env` import/export |
| Config | `config.rs` (209) | JSON persistence, `0600` on Unix |

This is a substantial and coherent feature set. The `depends_on` orchestration with
cycle detection and readiness gating is notably more sophisticated than the README's
description of it.

---

## 3. Critical findings

### C1 — The Electron "behavioral reference" cannot be run

`README.md` and `docs/UNIFICATION.md` (stage 10) both state that Electron is retained
as the behavioral reference and "must not be removed until the Tauri implementation
has verified feature parity." In practice it is already gone:

- `index.html` is the **only** HTML entry point in the repo, and it loads
  `/src/main.tsx` → `src/App.tsx` — the **Tauri** UI.
- The Electron UI is `src/components/**` + `src/hooks/**`: 9,791 LOC making 227
  `window.electronAPI` calls. Its root, `src/components/ProjectView.tsx`, is
  imported by **nothing** outside `src/components/__tests__/`.
- `npm run dev:electron` therefore launches an Electron window that renders the
  *Tauri* UI. Packaged Electron does the same — `electron/main.ts:347-350` resolves
  to `dist/renderer/index.html`, built from that same single entry.
- In that window `isTauri` (`src/tauri-api.ts:11`) is `false`, so every backend call
  resolves `null` (see C2) and the app breaks.

**Impact:** the migration's stated safety net does not exist. Parity cannot be
verified by comparing behavior, because the reference implementation has no
reachable UI. Meanwhile 9,791 LOC of unreachable code is still typechecked and
maintained, and `electron/main.ts` (2,208 LOC) plus `electron/database.ts` (1,280
LOC) remain live-looking but unreachable from any UI.

**Fix — pick one, explicitly:**
- **Preserve the reference:** add a second Vite entry (e.g. `index.electron.html` →
  `src/main.electron.tsx` rendering `components/ProjectView`), point the electron
  mode build at it, and confirm it runs. This restores real parity testing.
- **Or drop the pretense:** accept that Electron is already superseded, delete
  `src/components/**`, `src/hooks/**`, `electron/**`, the Electron devDependencies
  and `build:*` scripts, and update `UNIFICATION.md` stage 10 to reflect that parity
  was verified by other means (tests + manual QA) rather than by A/B comparison.

The second is likely the honest choice — but it should be a decision, not a drift.

**Both were done, in order.** The reference was restored first so parity could actually
be compared (below), and once it had been, Electron was removed — which is the sequence
the migration plan called for and could not previously execute.

**Resolution (this branch): preserved the reference.** The Electron app shell had not
been rewritten into the Tauri `App.tsx` — it was *replaced*, and the original was
still in history at `0e4fd9f:src/App.tsx` (the last commit before
`3a2cfc7 Begin Tauri unification`). It was recovered rather than reconstructed, so
the reference is the real prior behavior and not an approximation:

- `src/ElectronApp.tsx` — the recovered shell (1,855 lines), default export renamed
  from `App` to `ElectronApp` to keep the two roots distinguishable.
- `src/main.electron.tsx`, `index.electron.html` — a second entry mounting it.
- `vite.config.ts` — electron mode builds `index.electron.html` as its input; the
  Tauri build is untouched.
- `electron/main.ts` — loads `index.electron.html` in both dev and packaged paths.

The recovered code referenced `plugin.launch.projectAction`, a field the manifest type
had since renamed to `projectActions?: PluginProjectAction[]`. It turned out to sit in a
`useMemo` whose result was never read — a dead near-duplicate of the live
`projectPluginActions` immediately above it — so the binding was removed rather than
adapted. Still the drift an unrunnable reference invites, but a stale computation
rather than a user-facing bug.

Verified: the two bundles are cleanly separated — the Electron bundle has 30
`electronAPI` references and 0 Tauri internals; the Tauri bundle is the reverse (0
and 7). Both dev entries resolve (`/` → `src/main.tsx`, `/index.electron.html` →
`src/main.electron.tsx`).

### C2 — `invoke()` violates its own type signatures and crashes the app

`src/tauri-api.ts:15-22`:

```ts
async function invoke<T>(cmd: string, args?): Promise<T> {
  if (!isTauri) return Promise.resolve(null as T);   // ← type lie
  ...
}
```

Every one of the 40 wrappers is typed to return real data — `scanPorts(): Promise<LivePort[]>`,
`getProcesses(): Promise<ProcessInfo[]>` — but resolves `null` outside Tauri. None
normalize it.

Call sites guard with `.catch()`, which cannot help: `null` is a **resolved** value,
not a rejection. `src/App.tsx:339-343`:

```ts
const [processes, ports, managed] = await Promise.all([
  tauriApi.getProcesses().catch(() => [] as ProcessInfo[]),   // still null
  tauriApi.scanPorts().catch(() => [] as LivePort[]),         // still null
  ...
]);
liveProcessesRef.current = processes;                          // null
setRepos(buildRepos(liveGroupsRef.current, processes, ports, ...));
```

**Verified empirically.** Calling the real downstream consumer with these values:

```
buildProjectRuntimeServices([], [], null, null, null)
  → THREW: Cannot read properties of null (reading 'map')
```

**Impact:** `npm run dev` — the plain browser dev mode the file header advertises
("so the app works in both environments") and `README.md` documents — crashes on
first refresh tick. Same for the Electron shell per C1. The `isTauri` fallback
achieves the opposite of its stated goal.

**Fix:** return type-correct empty values instead of `null`. Either give each wrapper
an explicit fallback, or make the contract honest:

```ts
async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T | null>
```

and let TypeScript surface the call sites that need handling. The second is more
work but converts a runtime crash class into compile-time errors. Add a test that
renders `App` with `isTauri === false`.

**Resolution (this branch):** the single `invoke` was split by how each command can
*honestly* degrade, so no signature lies any more:

- **`query<T>(cmd, args, fallback)`** — the 11 reads that the polling and startup
  paths depend on. Each supplies a type-correct empty value (arrays → `[]`,
  `getSystemStats` → a zeroed `SystemStats`, `getGitStatus` → `null`, which its
  signature already permitted). Browser dev mode now renders an empty state instead
  of crashing.
- **`action<T>(cmd, args)`** — the other 29: mutations, plus one-shot reads with no
  meaningful empty value. These **reject** with
  `"Localhost Hub's native backend is unavailable outside the desktop app (<cmd>)"`,
  so a caller cannot mistake a missing backend for success.

All four affected one-shot-read call sites already had `try`/`catch` or `.catch()`
that surface `error.message` to the UI, so rejection is handled. Notably
`packages-panel.tsx:37` carried a hand-written
`if (!packages) throw new Error('Package inspection is available in the desktop app.')`
— a workaround for exactly this bug, now redundant.

Regression coverage added in `src/__tests__/TauriApiFallbacks.test.ts` (6 tests),
including one that reproduces the original crash path and asserts it no longer
throws.

### F1 — `tsconfig.app.json` typechecked only the top level of `src/`

Surfaced while fixing C1, and not visible to the original audit: the config's
`include` was

```json
"include": ["src/*.ts", "src/*.tsx", "src/assets"]
```

`src/*.tsx` is **not recursive**. TypeScript additionally pulls in whatever those
files import — and because nothing at the top level imported the Electron UI (C1),
`src/components/**`, `src/hooks/**`, `src/plugins/**`, and `src/utils/**` were
**never typechecked at all**. That is ~9,800 lines outside the compiler's reach, and
it is why the "typecheck passes, 0 errors" result above was much weaker than it read.

The tree had silently accumulated 11 type errors — 10 in `LoadingScreen.tsx` (unannotated
`Variants` locals widening `ease: 'easeInOut'` to `string`) plus the
`projectAction`/`projectActions` drift in the recovered shell. Adding the Electron
entry point pulled them all in at once.

Both defects compound: dead code is not typechecked, so it rots; and because it rots,
reviving it looks harder than it is.

### F2 — `electron/` was never typechecked either

`tsconfig.json` does include `electron`, but **no script or CI job ever invoked it** —
`npm run typecheck` and `npm run build` both point at `tsconfig.app.json`, and
`tsconfig.node.json` covers only `vite.config.ts`. So the Electron main process had no
typecheck gate at all.

It was hiding two real defects:

- **`findGitExecutable` was broken on Windows.** It referenced an `isWindows` flag
  that no longer existed in its scope, so the function could not compile — meaning
  the Windows Git-path lookup was dead. (Found by ESLint flagging the *other*,
  genuinely-unused declaration, then confirmed against `git show HEAD`.)
- **Four `execSync` calls passed `shell: true`.** Node types that option as a shell
  *path*, and `execSync` already runs through a shell, so the argument was both a
  type error and a no-op. Removed, preserving behavior.

**Fixed:** `noEmit` added to `tsconfig.json`, both defects corrected, and
`npm run typecheck` now runs `tsconfig.app.json` **and** `tsconfig.json`, so the
renderer, the Electron main process, and the tests are all covered.

### F3 — `tsconfig.json` emitted JavaScript into the source tree

`tsconfig.json` lacked `"noEmit": true` (unlike `tsconfig.app.json`). The moment it
was wired into a script it wrote 113 `.js` files next to their sources — and Vitest
promptly collected the compiled copies alongside the originals, reporting 94 tests
across 32 files where there are 47 across 16.

Latent rather than active, since nothing invoked that project before. Worth recording
because it is what makes F2's fix safe to keep: without `noEmit`, adding the gate
would have quietly polluted the tree on every run.

**Fixed:** `include` is now `["src/**/*.ts", "src/**/*.tsx", "src/assets"]` and the
full tree — application code and tests — typechecks clean. Worth keeping recursive
even if C1 is later resolved by deleting Electron, so the next unreferenced module
cannot drift out of the compiler's view.

---

## 4. Security

The Rust backend is **well built**. Documented for balance, because the findings
below are exceptions rather than the rule:

- `open_url` (`commands.rs:387`) restricts to `http`/`https` on
  `localhost`/`127.0.0.1`/`::1` only, rejecting userinfo (`@`) — blocks credential
  phishing via crafted URLs.
- `validate_github_url` (`github.rs`) requires scheme `https` **and** host exactly
  `github.com`; tested against `github.com.example.test` and `example.test/github.com`.
- `run_git_command` sets `GIT_TERMINAL_PROMPT=0`, applies a 120 s timeout,
  `kill_on_drop`, and pipes all output through `redact_url_credentials` so tokens
  in remote URLs never reach the UI or logs.
- `validate_repo_path` rejects absolute paths and any non-`Normal` path component —
  correct traversal defense.
- `validate_export_path` refuses to overwrite symlinks and constrains the filename.
- `packages.rs` builds argv arrays directly (**no shell**) and validates package
  names and versions before use.
- The GitHub token is deliberately kept in Rust and never returned to the frontend
  (`commands.rs:63-73`) — a good design decision.
- DevTools open only under `#[cfg(debug_assertions)]`.
- No `dangerouslySetInnerHTML`, `innerHTML`, `eval`, or `new Function` anywhere in
  `src/` or `electron/`. No hardcoded credentials committed.

Note on threat model: this app runs arbitrary user shell commands by design
(`start_service` → `sh -lc <cmd>`). "Local user can execute code" is a feature, not
a vulnerability. The findings below are therefore scoped to what matters — protecting
**secrets at rest** and preventing **untrusted remote content** (GitHub API strings,
process stdout, git metadata) from gaining privilege.

### H1 — Content Security Policy disabled

`src-tauri/tauri.conf.json`: `"security": { "csp": null }`.

No CSP is injected. The renderer displays plenty of externally-controlled text — PR
and issue titles, branch names, commit messages, process stdout. React escapes these,
and there is no `dangerouslySetInnerHTML`, so there is no *known* injection path
today. CSP is the defense-in-depth layer that keeps one future mistake — a Markdown
renderer, an `innerHTML` convenience, a compromised npm dependency — from becoming
remote code execution with full `fs` and shell reach.

**Fix:** set a restrictive policy, e.g.
`"csp": "default-src 'self'; img-src 'self' asset: https://avatars.githubusercontent.com data:; style-src 'self' 'unsafe-inline'; connect-src 'self' ipc: http://ipc.localhost"`.
Tune against the GitHub avatar loads and Tauri's IPC transport, then keep it.

**Resolution (this branch):**

```
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
img-src 'self' data: https://avatars.githubusercontent.com; font-src 'self' data:;
connect-src 'self' ipc: http://ipc.localhost; object-src 'none'; frame-src 'none';
base-uri 'self'; form-action 'none'
```

Derived from what the bundle actually loads, not from a template. `script-src` needs no
`'unsafe-inline'` because the built `index.html` contains no inline script with a body.
`style-src` does, because `tweaks-panel.tsx` injects a `<style>` element and 32 files
animate through inline `style={{…}}`. `connect-src` needs only IPC, since the renderer
makes **no** `fetch`, `XMLHttpRequest`, `WebSocket`, or `EventSource` call — every
GitHub request goes through Rust. The one remote resource anywhere in the renderer is
the GitHub avatar in `view-settings.tsx`.

**Verified in a browser, not by inspection.** The production bundle was served with the
policy applied as a real `Content-Security-Policy` response header and loaded in
Chromium, collecting console violations, blocked requests, and page errors: **0
violations, 0 console errors**, with the interface rendering — which incidentally also
demonstrates the C2 fix, since the shell renders with no backend instead of crashing.

That check caught a directive a source read had missed: `@fontsource` inlines several
font faces as `data:` URIs, so `font-src 'self'` alone blocked **9** font loads. `data:`
was added.

*Limitation:* the check exercises the shell and the first-run view. Deeper views are
unreachable without a backend, so a directive triggered only by a later view would not
appear. Residual risk is small — the avatar is the only remote resource in the tree —
but this is a smoke test, not proof.

### H2 — OAuth token and "secret" env vars stored in plaintext

`config.rs` writes `config.json` containing:
- `github_token` — a live `repo user read:org` OAuth token
- `env_profiles[].vars[]` — including entries flagged `is_secret: true`

`write_private_config` sets mode `0600` on Unix and re-applies it to pre-existing
files — good. But:

1. **No Windows protection.** The `#[cfg(unix)]` block is the only hardening; on
   Windows the file inherits directory ACLs.
2. **No OS keychain.** A `repo`-scoped GitHub token in a plaintext file is readable
   by any process running as the user — every dev tool, every `postinstall` script
   in every project this app scans.
3. **`is_secret` is UI masking only.** The flag hides the value in the interface and
   changes nothing at rest. `PROJECT.md` already flagged this ("plain text initially,
   consider encryption later"); it is still outstanding, and now applies to an OAuth
   token, not just local env vars.

**Fix:** move `github_token` and `is_secret` values to the OS keychain via
`keyring-rs` (Keychain / DPAPI-backed Credential Manager / libsecret), leaving
non-sensitive config in JSON. At minimum, restrict the Windows ACL and document that
`is_secret` is cosmetic.

**Resolution (this branch):** a new `secrets.rs` stores the OAuth token and every
`is_secret` value in the OS credential store via `keyring` 3.6 — Keychain on macOS,
Credential Manager on Windows, Secret Service on Linux. `config.json` keeps the
variable *keys* (not sensitive) and holds an empty string in place of each value.

`config.rs` gained four pieces around this:

- `redacted` — the on-disk form, with the token dropped and secret values blanked.
- `persist_secrets` / `hydrate_secrets` — write to and read from the store on every
  save and load, so `commands.rs` still works with `cfg.github_token` unchanged.
- `migrate_plaintext_secrets` — moves anything an older build left in the file, then
  `load` rewrites the file without it. An existing stored value wins, so re-reading a
  stale file cannot clobber a newer token. Migration is reported so the rewrite happens
  once rather than on every launch.
- `forget_removed_secrets` — diffs the incoming config against the file to delete
  values whose variable or profile is gone, so removing a secret in the interface also
  removes it from the store rather than orphaning it.

**On the fallback.** A credential store is not universal: a headless Linux session
without gnome-keyring or KWallet has none, and neither do most CI containers. Refusing
to save a token there would be worse than the status quo, so the module probes once and
falls back to a file with the tightest permissions the platform allows — mode `0600` on
Unix, and on Windows an `icacls /inheritance:r` ACL granting only the current user,
which closes the Windows gap this finding raised. A `secret_storage_backend` command
reports which backend is live, and the settings panel says so plainly instead of
implying the credential store is always in use.

**Nine tests**, all against the file backend, since that is the path that must work in
CI and on headless Linux. The load-bearing one asserts the serialized config contains
neither the token nor the secret value while keeping non-secret settings intact; the
others cover round-tripping, permission mode, per-profile key scoping, migration,
stale-file precedence, sign-out clearing the store, and orphan cleanup.

*Limitation:* the keyring path itself is not exercised here — this environment has no
Secret Service provider, so `cargo test` runs the fallback. The keyring branch is thin
(construct an `Entry`, get/set/delete) but it is unverified by execution and wants a
manual check on each desktop platform before `1.0`.

### H3 — `sh -lc` undermines `inherit_system: false`

`services.rs:608-612` spawns via `sh -lc` — a **login** shell — while
`start_with_sink` honors `inherit_system: false` with `command.env_clear()`.

These conflict. `env_clear()` empties the environment, then `sh -l` sources
`/etc/profile` and the user's profile, re-exporting `PATH`, `NODE_VERSION`, nvm/rbenv
shims and anything else those files set. The isolation the UI offers is not delivered,
and what survives depends on the user's dotfiles — so it is inconsistent across
machines rather than merely weaker. With `HOME` cleared, which profiles load at all
becomes unpredictable.

Using a login shell is a reasonable choice for a dev tool (it is how you pick up
version managers). The bug is pairing it with a promise of a clean environment.

**Fix:** use `sh -c` when `inherit_system` is false, or drop the option and document
that the service environment always extends the user's login shell. Add a test
asserting which variables survive.

**Resolution (this branch):** `shell_command` now takes the inheritance flag. An
inheriting profile keeps `sh -lc`, which is what picks up nvm/rbenv shims. A
non-inheriting profile uses plain `sh -c`, so no profile file runs and the result no
longer depends on the user's dotfiles.

That exposed a second problem the audit did not anticipate: `env_clear()` on its own
leaves **no `PATH`**, so no external program resolves and every real command fails. The
login shell had been quietly papering over this — which is precisely why the
contradiction went unnoticed. "Do not inherit" therefore now means *a documented minimal
baseline*, not *empty*: `PATH`, `HOME`, `USER`, `LOGNAME`, `SHELL`, `TMPDIR`, `TZ`,
`LANG` on Unix (plus a `PATH` fallback), and the equivalent set on Windows, carried from
the parent and nothing else. Profile variables layer on top. `cmd /S /C` sources no
profile, so Windows behavior is unchanged.

Five tests assert the behavior rather than assuming it: a parent variable does **not**
reach a non-inheriting profile, it **does** reach an inheriting one, a non-inheriting
profile can still resolve a program on `PATH`, profile variables still apply over the
baseline, and the baseline carries a `PATH` and nothing outside the allowlist.

Two things worth recording about scope:

- **The Tauri UI cannot currently reach this path.** `env-profiles.ts:30` hardcodes
  `inherit_system: true` and no control exposes it. The flag is part of the config
  schema and the IPC contract, so it is reachable by editing config or by future UI —
  the fix hardens a real path, but not one today's UI exercises.
- **Electron had the same defect, worse.** `electron/main.ts` used
  `inheritSystemEnv ? { ...process.env } : {}` and then `spawn`ed `npm` against that
  empty environment, so turning the setting off broke script running outright. Fixed
  with a baseline mirroring the Rust one, so the parity reference behaves the same —
  which is the whole point of keeping it runnable.

### H4 — Log streaming dies permanently on non-UTF-8 output

`services.rs:734-777` reads child output with `BufReader::lines()`:

- **Non-UTF-8 kills the stream.** `lines()` yields `Err` on invalid UTF-8, and the
  handler `break`s out of the loop. The service keeps running; its logs stop forever,
  with a single "failed to read process output" line as the only clue. Windows
  console encodings and tools emitting raw bytes or exotic ANSI hit this.
- **`\r`-only progress output buffers without bound.** `npm install`, `cargo build`,
  and webpack render progress with carriage returns and no newline. `lines()` waits
  for `\n`, so the entire progress stream accumulates as one unbounded `String` and
  nothing reaches the UI until it ends — in a log viewer whose purpose is live output.

**Fix:** read bytes and decode lossily (`String::from_utf8_lossy`) so invalid bytes
degrade to `U+FFFD` instead of terminating the stream; `continue` rather than `break`
on read errors; split on `\r` as well as `\n`, and flush partial lines above a size
cap (e.g. 8 KiB).

**Resolution (this branch):** `spawn_reader` now reads bytes rather than decoded lines.
Invalid UTF-8 becomes replacement characters via `String::from_utf8_lossy` instead of
ending the stream; `ErrorKind::Interrupted` continues rather than aborting; `\r` and
`\n` both terminate lines, with `\r\n` treated as one terminator so blank lines
survive; lines flush at `MAX_LOG_LINE_BYTES` (8 KiB); and output with no trailing
terminator is emitted at EOF.

Six tests cover the cases, and unlike the original audit these were **executed** — the
GTK libraries were installed in the audit environment, so the full Rust suite runs
here: **59 passed** (53 pre-existing + 6 new).

The renderer side is handled correctly — `App.tsx:487` caps at 5,000 lines — and URL
detection deduplicates, so unbounded growth there is not a concern.

### H5 — Dependency vulnerabilities

41 advisories: **4 critical, 27 high**, 8 moderate, 2 low.

Most sit under `electron-builder`/`@electron/rebuild` (dev-only, and retiring with
Electron). One is in the **production** dependency tree:

```
picomatch <=2.3.1  — HIGH — ReDoS via extglob quantifiers + method injection
  └── micromatch └── fast-glob
```

`fast-glob` is a declared production dependency that **nothing in the repo imports**
(0 references across `src/`, `electron/`, `scripts/`). Removing it eliminates the
advisory outright — see M7.

**Fix:** `npm audit fix`, drop `fast-glob`, and add `npm audit --omit=dev` to CI as a
non-blocking report so production-tree regressions surface on PRs.

**Resolution (this branch):** `@babel/parser`, `@babel/traverse`, and `fast-glob` were
removed (see M7). `npm audit --omit=dev` now reports **0 vulnerabilities** — dropping
the unused `fast-glob` was sufficient, with no version bumps needed. The dev-tree
advisories remain and retire with Electron.

### M1 — Filesystem capability over-grant

`src-tauri/capabilities/default.json` grants `fs:allow-read-text-file`,
`fs:allow-write-file`, `fs:allow-mkdir`, `fs:allow-read-dir` — but the frontend uses
only `writeTextFile` (log export, `view-logs.tsx:113`). `readTextFile`, `mkdir`, and
`readDir` have **zero** live call sites. No `fs:scope` is declared.

Least privilege: drop the three unused permissions and add an explicit scope for the
one that remains. Worth confirming the effective runtime scope of `fs:default` on
Tauri 2.11 while you are there, since scope semantics govern which paths those
commands can actually reach.

### M2 — Electron process hardening (dev-only, retiring)

For completeness, given Electron still builds. **Not shipped** — the
`desktop-builds.yml` release pipeline is Tauri-only — so these are low priority and
moot if C1 resolves toward deletion:

- `electron/main.ts:353-356` — `setWindowOpenHandler` calls
  `shell.openExternal(url)` with **no validation** (correctly returns
  `{action:'deny'}` afterward). Any `window.open` reaches the OS handler, including
  non-HTTP schemes. Contrast the Tauri side, which validates carefully.
- `electron/main.ts:1521` — the `shell:openExternal` IPC handler is likewise
  unvalidated, as is `shell:openPath` (1527), which will open arbitrary local paths.
- `webPreferences.sandbox: false` (`main.ts:338`) with `contextIsolation: true` and
  `nodeIntegration: false`. The latter two are right; the disabled sandbox is not.

---

## 5. Code quality

**Strengths.** Naming is consistent and descriptive. Rust modules have single clear
responsibilities. Validators are centralized and unit-tested rather than scattered.
Error messages are user-facing and actionable ("Commit or stash local changes before
pulling.", "Configure a Git credential helper or SSH agent if authentication is
required."). Comments explain *why*, not *what* (`ports.rs`: "Output parsing stays
separate because ss, lsof, and Windows netstat do not share a format"). Serde
`#[serde(default)]` is used consistently for backward-compatible config, with tests
proving old configs still load.

### M3 — No linter or formatter, on either side

There is **no** ESLint, Biome, Prettier, `rustfmt.toml`, or clippy configuration
anywhere in the repo, and CI runs none of them. For a 33k-line codebase with two
languages, this leaves unused imports, unused variables, floating promises, missing
`useEffect` dependencies, and hook-rule violations entirely uncaught — the exact
classes TypeScript's `--noEmit` does not detect. React 19 + a 1,427-line `App.tsx`
with many effects is precisely where `react-hooks/exhaustive-deps` earns its keep.

**Fix:** add ESLint (`typescript-eslint`, `react-hooks`) and `cargo clippy -- -D warnings`
plus `cargo fmt --check` to CI. Expect a meaningful first-run backlog; fix
incrementally with the gate on new code.

**Resolution (this branch):** ESLint 9 flat config (`eslint.config.mjs`) covering the
renderer (with `react-hooks`), the Electron main process, and the build scripts —
`.mjs` because the package is `type: commonjs` for Electron's sake. Clippy runs in CI
with `-D warnings`; its 6 mechanical lints were auto-fixed and the 3 remaining
`too_many_arguments` were annotated where the signature mirrors the IPC payload.

Severity was calibrated rather than blanket-set: correctness rules **fail** the build,
while 26 pre-existing `any` usages and 13 `react-hooks/exhaustive-deps` findings are
**warnings**. Typing away `any` and rewriting hook dependencies both change behavior,
and doing 39 of those blind is how a lint rollout introduces bugs. The result is
**0 errors, 42 warnings** with a real gate on new code.

`cargo fmt --check` is deliberately **not** gated yet: the tree predates rustfmt, so
enabling it needs a one-off `cargo fmt` touching every Rust file, which would bury this
diff. One command, whenever it suits.

The 13 hook-dependency warnings are the highest-value follow-up — they are the class of
latent bug the rule exists to catch.

### M4 — Oversized modules

`electron/main.ts` (2,208), `workspace.rs` (1,549), `App.tsx` (1,427),
`electron/database.ts` (1,280), `git.rs` (1,236), `CreateProjectModal.tsx` (1,166),
`services.rs` (1,117).

`App.tsx` is the one that matters — it is the live root, and it owns view routing,
polling timers, log buffering, service-event handling, workspace state, onboarding,
env-profile resolution, and port preflight simultaneously. Extract the polling/live-
state machinery into a hook (`useLiveRuntime`) and the service-event stream into
another; both are self-contained and would make the effects testable in isolation.

`workspace.rs` at 1,549 lines mixes scanning, group assembly, and orchestration — the
orchestration half (dependency layering, readiness) is the complex part and deserves
its own module.

### M5 — Polling cost

`App.tsx:356` runs `refreshLive` every **5 s**, and each tick calls
`list_managed_services` → `System::new_with_specifics(...)` + `refresh_all()`, plus
`scan_ports` → spawns `ss`/`lsof` (`netstat` on Windows). `refreshGitStatuses` runs
every 15 s across every discovered repo. So the app spawns a subprocess and walks the
full process table 12×/min, forever, plus `git2` status walks on every repo 4×/min.

For a tool meant to sit open all day on a laptop this is a real battery and CPU cost.
`refresh_all()` is also heavier than needed — the code only reads CPU, memory, and
parent PIDs.

**Fix:** narrow the `sysinfo` refresh to the fields used; back off polling when the
window is unfocused or hidden (`tauri::WindowEvent::Focused`); increase the interval
when no services are running; consider caching port scans between ticks.

### M6 — Unused i18n scaffolding

`src/translations/{en,fr,no,sv}.json` — four locale files, 457 lines each, 1,828
lines total. **Nothing in the codebase references them.** No i18n library is
installed; every UI string is hardcoded in JSX.

Four translations are maintained in parallel while having no effect, and will silently
drift from the real strings. Either wire up i18n or delete them until it is a real
priority; keeping them costs maintenance and implies a capability the app lacks.

### M7 — Dependency hygiene

Declared in `dependencies` (production) but **never imported anywhere**:
- `@babel/parser` — 0 references
- `@babel/traverse` — 0 references
- `fast-glob` — 0 references (and the source of the only production-tree CVE, H5)

Misplaced:
- `toml` — used solely by `scripts/check-version-sync.cjs`, a build script → belongs
  in `devDependencies`
- `sql.js` / `@types/sql.js` — used only by `electron/database.ts` → retires with
  Electron

**Resolution (this branch):** the three unused packages were removed and `toml` moved to
`devDependencies`; `npm run check:version` still passes, since `npm ci` installs dev
dependencies. Both dependency blocks are now alphabetically sorted. `sql.js` stays until
Electron goes.

`package.json` also lists dependencies out of alphabetical order (the two `@babel/*`
entries sit between `@tauri-apps/plugin-dialog` and `@tauri-apps/plugin-fs`),
suggesting they were added ad hoc — consistent with never being wired up.

`npm outdated` shows Electron 4 majors behind (39 → 43) and Tailwind 1 major behind
(3.4 → 4.3); the former is moot post-migration.

---

## 6. Testing

| Suite | Count | Notes |
| --- | --- | --- |
| Vitest (frontend) | **41** across 15 files | All pass, 6.6 s |
| Rust `#[test]` | **53** across 10 modules | Static count; not executed here (GTK unavailable) |
| **Total** | **~94** | For ~33,400 LOC |

**What is covered well.** The Rust validators are genuinely well tested and test the
right things — `github.rs` asserts that `github.com.example.test` and
`example.test/github.com` are both rejected; `config.rs` proves truncation on rewrite
*and* checks the `0600` mode; both prove old configs deserialize. These are
adversarial tests, not coverage theater.

**Gaps:**

- **`commands.rs`: 0 tests.** This is the entire IPC surface — the security
  boundary — untested. *(44 commands across 406 LOC at audit time; 50 across 472 now,
  after the persistence, credential-store and login-item work.)*

  **Resolution (partial).** `src/command_tests.rs` now drives commands through real
  `InvokeRequest`s using `tauri::test`, covering what direct function calls cannot:
  that a command is registered at all, that arguments bind from the payload the
  interface sends, and that rejected input returns an error rather than unwinding
  across the boundary. The registration check reads the source, so it covers all 50 —
  verified by deleting a registration and watching it name the command.

  Two things this found rather than assumed:
  - **`kill_process` accepted `4294967295` and reported success.** It truncates to
    `pid_t` `-1`, which `kill(2)` reads as *every process the caller may signal*, and
    `/bin/kill` takes it without complaint. `kill_process` and workspace stop
    specifications both carry a caller-supplied pid across IPC. Now validated before
    any signal is sent — `0`, `1` and anything above `i32::MAX` are refused.
  - Tauri binds **both** the `camelCase` and `snake_case` spellings of an argument,
    and an unknown *optional* argument is silently ignored while a missing required
    one is enforced. Worth knowing before relying on either.

  **Still open:** 17 of the 50 commands take a concrete `AppHandle` (`AppHandle<Wry>`),
  which `MockRuntime` cannot supply, so they are not drivable by this harness. Reaching
  them needs the commands generic over `R: Runtime` — a refactor through `commands.rs`,
  `config.rs` and `services.rs`, not a test. The 33 that are drivable include every one
  that validates untrusted input.
- **`processes.rs`: 0 tests.**
- **No IPC contract tests.** Nothing asserts that the TypeScript types in
  `tauri-api.ts` match the Rust `Serialize` structs. These are hand-mirrored across
  the boundary (`snake_case` in Rust, matching interfaces in TS), so a renamed Rust
  field is caught only at runtime, silently, as `undefined`. This is the highest-value
  missing test in the repo — consider generating the TS types from Rust
  (`ts-rs`/`specta`) and eliminating the class entirely.
- **C2 was never caught** because no test renders the app with `isTauri === false`,
  despite that being a documented supported mode.
- **1 of 15 frontend test files targets dead code** —
  `src/components/__tests__/ProjectHeader.test.tsx` (3 tests) exercises the
  unreachable Electron UI, so 3 of 41 passing tests validate code that cannot run.
- `README.md` lists "IPC contract tests" and "workspace runner integration tests"
  under *Planned coverage* — an accurate self-assessment that is still outstanding.

Given 48 IPC commands and 33k LOC, the suite is thin where it matters. `cargo test`
reports 158 tests, but 66 of those are binding-export tests generated by the ts-rs
derive — they guard the type contract, not behaviour — leaving 92 hand-written Rust
tests plus 47 frontend tests. Prioritize `commands.rs` and type-contract tests over
raw coverage percentage.

---

## 7. Release readiness

### Strong

- **Version synchronization is excellent.** `check-version-sync.cjs` validates
  `package.json`, `tauri.conf.json`, `Cargo.toml`, `PKGBUILD` (handling the
  `_`↔`-` Arch convention), and derives the Windows MSI 4-part version from the
  prerelease build number. It additionally verifies that a `v*` tag matches the app
  version when `GITHUB_REF_TYPE == tag`. This runs in **both** workflows. Verified
  passing.
- **Packaging breadth:** Linux AppImage/DEB/RPM/Arch, macOS universal (Intel +
  Apple Silicon), Windows MSI/NSIS.
- **CI** covers frontend build (which includes `tsc`), frontend tests, and
  `cargo test --locked`, with correct GTK system deps and Rust caching.
  `permissions: contents: read` is correctly minimal.
- `CHANGELOG.md` is genuinely well maintained under `[Unreleased]`, Keep-a-Changelog
  format, with real detail.
- **Release pipeline is Tauri-only** — Electron artifacts are not shipped, which
  correctly limits the blast radius of M2.

### Gaps

- **No code signing** (H-priority for 1.0, correctly documented in
  `docs/DISTRIBUTION.md` and `README.md`): macOS unsigned/un-notarized, Windows
  unsigned → SmartScreen, Linux unsigned repo. Users will hit Gatekeeper and
  SmartScreen warnings. Blocking for a credible 1.0.
- **CI has no lint, format, or audit stage** (M3, H5).
- `"targets": "all"` in `tauri.conf.json` is broader than the workflow's explicit
  per-runner targets — harmless but redundant; the workflow is authoritative.
- **No release checklist** in the repo, and no smoke-test step in the tagged-release
  path beyond artifact upload.

### M8 — `TODO.md` is substantially stale and now misleading

`TODO.md` still describes the **Electron** implementation and cites line numbers in
`src/components/**` — the unreachable tree. Multiple items are marked `[ ]` unimplemented
that are in fact **fully implemented in Rust**, including:

- "Implement workspace entities … nothing in the renderer, IPC, or database
  references workspaces yet" — `workspace.rs` implements workspaces with dependency
  ordering and readiness gating
- "Add restart buttons" / "Run with env profile" — `restart_service` and
  `ServiceEnvironment` both exist
- "Promote port monitoring into a full tab" — `view-ports.tsx` + `ports.rs`
- "Support pnpm/yarn/deno commands … merged env vars" — implemented in
  `services.rs`/`packages.rs`

A contributor reading `TODO.md` would rebuild shipped features. Either rewrite it
against the Tauri implementation or delete it and let `CHANGELOG.md` +
`docs/IMPLEMENTATION_BACKLOG.md` carry the load — `CHANGELOG.md` is already accurate,
so the duplication has no upside.

**Resolution (this branch): deleted.** Removing Electron invalidated every remaining
citation in it. `docs/IMPLEMENTATION_BACKLOG.md` is current and Tauri-oriented, so the
file was pure duplication. `PROJECT.md` was kept but marked as the historical brief,
since its product intent and entity model still have value even though its
architecture section describes the implementation that was just removed.

`README.md` and `docs/UNIFICATION.md` are otherwise accurate and well written; their
only defect is describing the Electron parity path as viable (C1).

---

## 8. Prioritized recommendations

### Blocking for `0.9.x`
1. **C2** — fix the `invoke()` null contract; add a test rendering `App` with
   `isTauri === false`. *Small, prevents a guaranteed crash.*
2. **C1** — decide Electron's fate explicitly: restore a working Electron entry
   point, or delete `src/components/**`, `src/hooks/**`, `electron/**` and their
   dependencies, and amend `UNIFICATION.md` stage 10. *Removes ~14k LOC of ambiguity.*

### Blocking for `1.0.0`
3. **H1** — define a Content Security Policy.
4. **H2** — move the OAuth token and `is_secret` values to the OS keychain; fix
   Windows file protection.
5. **Code signing** — Apple Developer ID + notarization, Windows Authenticode.
6. **H4** — make log streaming resilient to non-UTF-8 and `\r` progress output.
7. **M4-testing** — cover `commands.rs`; add Rust↔TS type-contract tests, ideally by
   generating the TS types.

### High value, low effort
8. **H5 / M7** — `npm audit fix`; drop `fast-glob`, `@babel/parser`, `@babel/traverse`;
   move `toml` to devDependencies. *Clears the only production CVE.*
9. **M3** — add ESLint + clippy + `cargo fmt --check` to CI.
10. **H3** — resolve the `sh -lc` / `inherit_system: false` contradiction.
11. **M1** — drop the three unused `fs:` permissions; add an explicit scope.
12. **M8** — rewrite or delete `TODO.md`.
13. **M6** — wire up or delete the four unused locale files.

### Ongoing
14. **M5** — narrow `sysinfo` refresh; back off polling when unfocused.
15. **M4** — extract `useLiveRuntime` and the service-event stream from `App.tsx`;
    split orchestration out of `workspace.rs`.
16. Add a release checklist and a packaged-artifact smoke test to the tag pipeline.

---

## 9. Closing assessment

The Rust backend is the work of someone who thought carefully about input validation,
and it shows in specifics: credential redaction in git output, `GIT_TERMINAL_PROMPT=0`,
symlink-overwrite refusal, argv-not-shell for package managers, host-exact URL
allowlisting, and tests that probe near-miss hostnames. The release tooling is
unusually disciplined for an alpha. Neither of these is the norm at this stage, and
both are worth preserving as the migration completes.

The weaknesses are concentrated in two places. First, the **migration is further
along than the documentation admits** — Electron is described as a living reference
but is already unreachable, and pretending otherwise costs 14k LOC of maintained
ambiguity and blocks the plan's own exit criteria. Second, **the seams are where the
bugs are**: the Tauri↔TypeScript boundary is hand-mirrored and untested, which is
exactly how C2 shipped and how the next field rename will too.

Fix C1 and C2, then generate the type bindings. That addresses the crash, the
ambiguity, and the mechanism that produced both.
