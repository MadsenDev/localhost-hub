# Localhost Companion

## Decision

Localhost Companion should exist as an aggressively focused Android remote for
Localhost Hub.

It is **not** Localhost Hub for Android. The desktop remains the place for
project management and configuration. Companion exists to observe and control
development work that Hub already understands.

This is a post-parity product direction. It must not delay reliable project
discovery, process management, workspaces, ports, logs, or Git on the desktop.

## Product Definition

> Localhost Companion is an Android remote for Localhost Hub.

The useful moments are deliberately mundane:

- Stop a forgotten development server without returning to the computer.
- Restart a backend while testing a responsive app on the phone.
- Start a full workspace before sitting down at the computer.
- Open a LAN-reachable development site on the phone.
- Receive a notification when a managed service crashes or fails to start.

## MVP Scope

### Pairing and connectivity

- QR pairing from Localhost Hub
- LAN discovery with `_localhost-hub._tcp.local` over mDNS
- Automatic reconnect
- Encrypted, authenticated local connection
- No cloud account or Localhost Hub relay

### Projects and Git state

- List discovered projects
- Show running state
- Show branch, clean/dirty state, and ahead/behind counts

### Services and workspaces

- Start, stop, and restart a managed service
- List workspaces
- Start and stop a workspace

### Logs, ports, and notifications

- Stream live logs
- Filter logs by service
- Show detected ports and URLs
- Notify when a process exits unexpectedly or startup fails
- Open a reachable development URL on the phone

When Hub detects `http://localhost:5173`, Companion should offer the equivalent
LAN address, such as `http://192.168.1.34:5173`, only after Hub verifies that the
service is bound to a reachable interface.

## Explicit Non-Goals

The first Companion releases should not include:

- Project creation
- Environment-variable editing
- Package management
- Git commit, pull, or push
- File editing
- Repository management
- Full terminal access
- GitHub OAuth configuration
- Desktop settings administration

These are desktop tasks. Reproducing them on a small screen would weaken the
product boundary and multiply security risk.

## Architecture Direction

```text
Localhost Companion (Android / Compose)
                    |
          WebSocket events + HTTP
                    |
       encrypted authenticated LAN link
                    |
Localhost Hub (Tauri / Rust)
  Companion Server
  |- discovery and pairing
  |- device authentication and permissions
  |- projects and Git status
  |- services and workspaces
  |- logs and process events
  `- ports and reachable URLs
```

The strategic value is the service boundary:

```text
Hub Core
  |- Tauri commands  -> desktop UI
  `- Companion API   -> Android remote
```

Core project-control logic must not be duplicated in HTTP handlers. Tauri
commands and the Companion API should call the same Rust application services.
This separation can later support a CLI client, IDE integration, a web
dashboard, another desktop, or an SSH-connected Hub without rebuilding process
and project behavior.

## Pairing and Security

Companion access is disabled by default. Enabling it starts a small LAN server
and displays a one-time QR code containing connection and pairing information.

Pairing creates a revocable device credential stored securely on Android. Hub
stores the paired-device record and explicit permissions, for example:

- View projects
- Control services
- View logs
- Control workspaces

Requirements:

- Bind only to explicitly selected local interfaces.
- Use short-lived pairing challenges.
- Encrypt transport.
- Never put reusable credentials directly in a QR code.
- Allow devices to be named, inspected, and revoked on desktop.
- Rate-limit pairing and authentication attempts.
- Do not expose unrestricted shell or filesystem access.

Remote access beyond the LAN should prefer Tailscale, WireGuard, or SSH rather
than a custom cloud relay.

## Android Information Architecture

Keep navigation limited to:

- **Home** — connected Hub, running services, and workspace controls
- **Projects** — project state, services, ports, and basic Git state
- **Logs** — live output filtered by project or service

The UI should prioritize one-handed status and control, not dashboard density.

## Release Shape

### 0.1

- Pairing, LAN discovery, and reconnect
- Projects and basic Git state
- Service start/stop/restart
- Workspace start/stop
- Live filtered logs
- Ports and open-on-phone
- Crash and startup-failure notifications

### 0.2

- Favorites
- Android widgets
- Notification actions
- Workspace shortcuts

### 0.3

- Tailscale/SSH-oriented remote access
- Multiple Hub machines

### 1.0

- Mature per-device permissions
- History
- Richer diagnostics

## Preconditions

Companion implementation begins only after:

1. The unified Tauri app reaches core desktop parity.
2. Rust process and workspace state have stable application-service APIs.
3. Logs/events can be subscribed to without depending on React or Tauri window
   state.
4. The threat model and device-revocation flow are documented.

