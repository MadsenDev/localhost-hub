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
Localhost Companion (Kotlin / Jetpack Compose)
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

## Android Implementation Target

Companion should be a native Android application written in **Kotlin with
Jetpack Compose**. The supplied interactive HTML prototype is a product and
visual reference, not an application shell to embed or ship. Its flows should
be rebuilt as native Compose screens, navigation, sheets, permissions, and
notifications.

Prefer Android platform facilities where they improve reliability:

- Android Keystore-backed device credentials
- foreground-service behavior only when a sustained connection requires it
- native notifications and notification actions
- CameraX or the platform QR scanner for pairing
- Network Service Discovery for `_localhost-hub._tcp.local`
- lifecycle-aware WebSocket reconnect behavior

## Android Information Architecture

Keep navigation limited to:

- **Home** — connected Hub, running services, and workspace controls
- **Projects** — project state, services, ports, and basic Git state
- **Logs** — live output filtered by project or service
- **Ports** — reachable development URLs and open-on-device actions

The UI should prioritize one-handed status and control, not dashboard density.

## Supplied Design Reference

The July 2026 Companion prototype establishes the initial native screen map and
visual direction:

- Pairing progresses through discovery, QR scan, explicit device permissions,
  and a connected confirmation.
- Home shows the connected desktop, connection failures, running services,
  workspace controls, and LAN-reachable URLs.
- Projects leads to a focused project detail with service controls, ports,
  recent logs, and read-only Git state.
- Logs provides live service filtering.
- Ports is a fourth bottom-navigation destination for mobile testing.
- Destructive or disruptive controls use confirmation sheets.
- Unexpected process exits surface as a clear crash alert and native
  notification.

The visual language is intentionally close to the desktop V2 UI: dark charcoal
surfaces, restrained blue accents, compact status cards, monospace technical
values, and conspicuous running/warning/error states. Native accessibility,
touch targets, dynamic type, and Android back behavior take precedence over
pixel-identical reproduction of the prototype.

The permission boundary shown in the design remains authoritative: Companion
may view projects, control services, view logs, and control workspaces according
to its paired-device grants. It receives no shell, filesystem, or Git-write
capability.

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
