# Localhost Companion — Threat Model and Pairing Design

Status: **design, not implemented.** No server, pairing, or device credential code
exists yet. This document is the precondition for writing it, listed as item 4 in
[the Companion plan](LOCALHOST_COMPANION.md#preconditions).

Read [Host Lifetime](LOCALHOST_COMPANION.md#host-lifetime) first for how Hub stays
running without its window; that is what makes a reachable host possible at all.

---

## Contents

- [Why this needs a threat model](#why-this-needs-a-threat-model)
- [The central constraint](#the-central-constraint-the-companion-api-is-not-a-proxy)
- [What is being protected](#what-is-being-protected)
- [Adversaries](#adversaries)
- [Trust boundaries](#trust-boundaries)
- [The Companion vocabulary](#the-companion-vocabulary)
- [Transport](#transport)
- [Pairing](#pairing)
- [Device credentials](#device-credentials)
- [Permissions](#permissions)
- [Revocation](#revocation)
- [Abuse resistance](#abuse-resistance)
- [Visibility](#visibility)
- [Residual risk](#residual-risk)
- [Open questions](#open-questions)

---

## Why this needs a threat model

Localhost Hub starts and stops processes, reads and writes repositories, holds a
GitHub token, and knows every listening port on the machine. Today all of that is
reachable only from a webview that the person sitting at the computer opened.

Companion changes the shape of the problem: it puts a network listener in front
of those capabilities. The distance between "a dev tool on my laptop" and "remote
code execution as my user, on my home network" is exactly the quality of this
design.

That is not hypothetical alarm. It follows from what the existing command surface
actually accepts, which is the subject of the next section.

---

## The central constraint: the Companion API is not a proxy

**The Companion server must not forward Tauri commands, and must not accept a
command line, a working directory, or an environment variable from the network.**

This is the most important decision in the document, and it comes from reading
what the current commands take:

```rust
// src-tauri/src/commands.rs
pub fn start_service(
    app: AppHandle,
    services: State<ServiceManager>,
    service_id: String,
    cwd: String,                    // caller-supplied path
    cmd: String,                    // caller-supplied command line
    environment: ServiceEnvironment, // caller-supplied key=value pairs
    expected_ports: Vec<u16>,
    allow_port_conflicts: bool,
) -> Result<u32, String>
```

`start_workspace` is the same shape, taking `Vec<WorkspaceServiceSpec>` from the
caller rather than reading it from stored configuration.

For a local webview this is reasonable: the interface holding the config is the
one making the call, and both are the user. Exposed over a socket it is a remote
shell with extra steps — and `ServiceEnvironment` is a second, independent path to
the same place, since arbitrary environment variables include `LD_PRELOAD` and
`NODE_OPTIONS`. Authentication does not fix this. It means one compromised pairing
is total compromise rather than a bounded loss, and it means a bug in the pairing
code costs everything.

So the Companion API speaks a **separate, narrower vocabulary** in terms of
stored identifiers:

| Companion asks | Server does |
| --- | --- |
| `start_service { id }` | Looks the id up in `config.json`, uses the stored `cmd`, `cwd` and env profile |
| `start_workspace { id }` | Looks the workspace up in stored config |
| `stop_service { id }` | Only ids currently supervised by this Hub |

Nothing executable crosses the wire. The worst a fully compromised paired device
can do is start, stop and restart *commands the user already configured on the
desktop* — bounded by what they chose to put in their own workspaces.

The [architecture direction](LOCALHOST_COMPANION.md#architecture-direction)
already says core logic must not be duplicated in HTTP handlers, and the codebase
supports that: 40 of 50 commands are three lines or fewer, delegating to
`ServiceManager` and the modules. The Companion API is a second thin adapter over
the same services — a sibling of `commands.rs`, not a wrapper around it.

---

## What is being protected

| Asset | Where it lives | Exposure if lost |
| --- | --- | --- |
| Ability to run configured commands | `ServiceManager` | Code execution as the desktop user, bounded by stored config |
| Source repositories | The filesystem | Disclosure; modification if Git write were ever exposed |
| GitHub token | OS credential store | Account access under the user's identity |
| Environment profile secrets | OS credential store | Database credentials, API keys |
| Service output | `history/logs/*.log` and the live stream | Whatever services print — frequently secrets |
| Process table and ports | Live introspection | A map of everything running on the machine |
| Paired-device records | `config.json` | Ability to impersonate a device, if secrets were stored |

The last row is why [Device credentials](#device-credentials) chooses public keys:
there is then no secret in that file to steal.

---

## Adversaries

Ordered by how much they should shape the design.

**A1 — Another device on the same network.** The default adversary. Coffee shop
Wi-Fi, a flatmate's laptop, a compromised IoT device on the same VLAN. Can reach
the listener, can scan ports, can see mDNS advertisements, can attempt to pair,
can attempt to MITM. **Must not be able to pair, authenticate, or read traffic.**

**A2 — An active network attacker.** A1 plus the ability to spoof, relay, and
intercept: ARP spoofing, a rogue access point, DNS or mDNS poisoning. **Must not
be able to impersonate Hub during pairing** — the case a naive "trust the first
certificate you see" design loses.

**A3 — A malicious or compromised application on the paired phone.** Wants to read
Companion's stored credential and use it. Shapes the choice of hardware-backed,
non-exportable keys.

**A4 — A stolen or lost phone.** Still on the network, still holding a valid
credential. Shapes [Revocation](#revocation): it must work from the desktop
alone, must be immediate, and must terminate live sessions rather than only
blocking new ones.

**A5 — A user who pairs a device they should not have.** Someone with brief
physical access to an unlocked desktop. Bounded by making pairing deliberate and
visible, and by device records being inspectable after the fact.

### Explicitly out of scope

- **Malware already running as the desktop user.** It has the user's session; it
  does not need Companion. Defending against it here would be theatre.
- **A hostile operating system on either end.**
- **Physical attack on an unlocked desktop**, beyond the visibility in A5.
- **Traffic analysis.** That Hub exists and is busy is not treated as a secret.

---

## Trust boundaries

```text
┌─ Desktop, the user's session ─────────────────────────────┐
│  Hub core: ServiceManager, config, git, secrets           │
│  Tauri commands ──── webview (trusted: it is the user)    │
│  Companion API  ────┐                                     │
└─────────────────────│─────────────────────────────────────┘
                      │  ← THE boundary. Everything past
                      │    here is hostile until proven.
              ┌───────┴────────┐
              │  LAN            │  A1, A2 live here
              └───────┬────────┘
                      │
              ┌───────┴────────┐
              │  Paired phone   │  A3, A4 live here
              └────────────────┘
```

Two rules follow:

1. **Every request is authenticated and authorised at the boundary**, per request,
   default-deny. Not once at connection time.
2. **The webview's trust does not extend across it.** The Companion API validates
   independently; it does not inherit the assumption that the caller is the user.

---

## The Companion vocabulary

Default-deny: an operation is unreachable unless listed here. Classified against
the current 50 commands.

### Exposed

| Operation | Permission | Notes |
| --- | --- | --- |
| List projects, framework, branch, dirty state | `projects:read` | Read-only Git status |
| List workspaces and services with running state | `projects:read` | |
| Start / stop / restart a service by stored id | `services:control` | Command from config, never the wire |
| Start / stop a workspace by stored id | `workspaces:control` | |
| Stream live service output | `logs:read` | See [Residual risk](#residual-risk) on secrets |
| Read a stored run log by id | `logs:read` | |
| List ports belonging to supervised services | `projects:read` | Hub's own services only |
| Resolve a LAN-reachable URL for a service | `projects:read` | Only after Hub verifies the bind address |

### Never exposed

| Command | Why |
| --- | --- |
| `start_service`, `start_workspace` as they exist today | Take `cmd`, `cwd`, `environment` from the caller — remote code execution |
| `kill_process` | Kills an arbitrary PID; not limited to Hub's children |
| `get_processes` | The machine's entire process table |
| `scan_ports` | Every listening port, including software unrelated to Hub |
| `create_project`, `run_package_action` | Write to the filesystem; run package-manager lifecycle scripts |
| All `*_git_*` writes — `commit`, `stage`, `push`, `checkout`, branch and remote mutation | Repository modification. `LOCALHOST_COMPANION.md` already excludes Git writes |
| `import_env_file`, `export_env_file`, `save_config` | Read and write secrets, and reconfigure Hub |
| `load_config` | Returns the whole config, including profile structure |
| Everything `github_*` | Uses the stored token under the user's identity |
| `open_in_editor`, `open_url`, `open_github_url` | Launch local applications |
| `get_start_at_login`, `set_start_at_login`, `clear_run_history` | Desktop administration |

Where Companion needs something a broad command already returns — ports, for
instance — the Companion API implements a **narrowed** version rather than
exposing the wide one. Ports are filtered to services Hub supervises; the machine
at large is not described to the network.

---

## Transport

**TLS 1.3, with a certificate Hub generates on first enable** and stores with its
private key in the OS credential store via `secrets::set`.

There is no certificate authority on a LAN, so the certificate is self-signed and
authenticated **out of band**: its SPKI fingerprint is in the pairing QR code, and
Companion pins it. That is what defeats A2. Trusting whatever certificate answers
first would leave an attacker who is present during pairing able to become the
permanent "Hub" for that device.

- **Bind only to explicitly selected interfaces.** Never `0.0.0.0` implicitly.
  The desktop shows which interface and port are in use.
- **No listener until Companion is enabled**, and no mDNS advertisement either.
  Off is off.
- **Certificate rotation** re-pairs: a new fingerprint invalidates pins, and
  devices must pair again. Rotation is therefore explicit and rare, and the
  desktop says what will happen before doing it.
- **Protocol version** is negotiated in the first frame. An unknown version is
  refused with a version-mismatch error and nothing else; no attempt is made to
  serve an older shape.

---

## Pairing

Requirements from the plan: short-lived challenges, no reusable credential in the
QR code, rate-limited attempts.

The QR carries a **single-use pairing code**, not a credential. The code proves
the phone saw the desktop's screen; the credential is created afterwards, by the
phone, and never travels.

```text
Desktop                                              Phone
───────                                              ─────
User enables Companion, presses Pair
  ├ generate pairing code: 32 bytes from a CSPRNG
  ├ expires in 120s, single use
  └ display QR:
      { v, host_id, host_name, addr, port,
        spki_sha256, pairing_code }
                                     ─── scan ───▶
                                                  pin spki_sha256
                     ◀── TLS 1.3, cert pinned ───
  reject if fingerprint ≠ presented cert
                                                  generate keypair in
                                                  Android Keystore,
                                                  non-exportable
                     ◀── pair_request { device_pubkey, device_name }
  ├ challenge: 32 fresh random bytes
  └                  ─── pair_challenge { nonce } ──▶
                                                  mac = HMAC-SHA256(
                                                    pairing_code,
                                                    "companion-pair-v1"
                                                    ‖ host_id
                                                    ‖ spki_sha256
                                                    ‖ device_pubkey
                                                    ‖ nonce)
                     ◀── pair_response { mac, sig } ───
  ├ recompute mac, compare in constant time
  ├ verify sig over the same transcript with device_pubkey
  │   (proves possession of the private key)
  ├ burn the pairing code — single use, win or lose
  ├ store the device record
  └                  ─── paired { device_id, granted } ──▶
```

Why it is shaped this way:

- **The transcript is bound into the MAC.** Including `host_id`, the certificate
  fingerprint and the device public key stops a relay from taking a MAC computed
  for one session and replaying it into another, or substituting its own key.
- **The pairing code is burned on any completed attempt, successful or not.** A
  wrong MAC does not get a second guess against the same code; the user presses
  Pair again. Combined with 32 bytes of entropy, guessing is not a threat — the
  burn is there so a bug elsewhere cannot become one.
- **The MAC and the signature both matter.** The MAC proves the phone saw the
  screen. The signature proves the key it registered is one it actually holds,
  rather than a key it copied from somewhere.
- **Constant-time comparison** on the MAC, always.
- **No pairing while a pairing is already in flight.** One at a time, so there is
  never ambiguity about which device just paired.

An HMAC challenge over a pinned channel is chosen over a PAKE such as SPAKE2
deliberately. A PAKE would let a low-entropy code be safe; the pinned certificate
already authenticates Hub, and a 32-byte code needs no protection from offline
guessing. Fewer primitives, less to implement wrong. If the code ever becomes
short enough for a human to type, that trade reverses and a PAKE becomes the
right answer.

---

## Device credentials

**The phone generates a keypair; Hub only ever stores the public key.**

- Ed25519, generated in the Android Keystore, **non-exportable**. This is what
  bounds A3: a malicious app on the phone cannot lift the key, at best it can ask
  the OS to sign while it has access.
- Hub stores, per device, in `config.json` — no credential store needed, because
  none of it is secret:

  ```jsonc
  {
    "companion_devices": [{
      "device_id": "…",         // Hub-assigned
      "name": "Pixel 8",        // user-editable on the desktop
      "public_key": "…",        // Ed25519
      "permissions": ["projects:read", "services:control"],
      "paired_at": 0,
      "last_seen_at": 0
    }]
  }
  ```

- **Nothing secret at rest on Hub for authentication.** Reading `config.json`
  reveals which devices are paired, not how to become one. Compare a bearer-token
  design, where the file is enough to impersonate every device.
- **Every session authenticates by signature** over a fresh Hub-issued nonce,
  bound to the session. No long-lived bearer token is minted, so there is nothing
  to steal from a log, a crash dump, or a proxy.
- The pairing code and the session nonces are never written to disk.

---

## Permissions

Granted per device, at pairing, from the plan's four:

- `projects:read` — projects, workspaces, running state, ports, Git status
- `services:control` — start, stop, restart configured services
- `workspaces:control` — start and stop configured workspaces
- `logs:read` — live stream and stored run logs

Rules:

- **Default-deny**, checked per request at the boundary, never inferred from an
  earlier check in the same session.
- **Chosen explicitly during pairing**, on the desktop, shown as a list rather
  than accepted as a default.
- **Editable afterwards** without re-pairing. Narrowing takes effect on live
  sessions immediately, not at next connect.
- **No permission grants any write** to repositories, config, or secrets. There is
  no permission that could; those operations are not in the vocabulary at all,
  which is a stronger guarantee than a permission left ungranted.

---

## Revocation

Must work for A4 — a phone that is lost, still online, still holding a valid key.

- **From the desktop alone.** No cooperation from the phone, no network path to
  it, no cloud.
- **Immediate.** Deleting the device record removes the only public key that
  authenticates it. The next signature fails.
- **Terminates live sessions.** Revocation that only blocks new connections is
  useless against a device already streaming logs over an open socket. Revoking
  closes that socket.
- **Recorded.** A revoked device leaves a dated entry rather than vanishing, so
  the desktop can show that it happened.
- **Disabling Companion revokes nothing but stops everything**: the listener
  closes, sessions drop, mDNS stops. Device records survive so re-enabling does
  not force everyone to re-pair. "Forget all devices" is a separate, explicit
  action.

---

## Abuse resistance

Assume A1 is reaching the port continuously.

| Surface | Limit |
| --- | --- |
| Pairing attempts | One in flight; code single-use and 120s; a fixed small budget per pairing window |
| Authentication attempts | Per-address exponential backoff; per-device cap independent of address, so rotating source addresses does not reset it |
| Requests on an authenticated session | Per-session rate cap; oversized frames refused before parsing |
| Service control | Debounced per service id, so start/stop cannot be driven in a loop to thrash the machine |
| Log streaming | Bounded buffer per subscriber; a slow reader is dropped rather than allowed to grow Hub's memory |
| Connections | Cap concurrent sessions; cap unauthenticated connections far lower |

Failures are logged as security events (see below), and the same treatment applies
to malformed frames: refuse, count, and do not echo the parse error back in
detail.

---

## Visibility

The user should never have to wonder whether something is connected.

- Companion state is visible on the desktop: enabled or not, which interface and
  port, which devices are paired, when each was last seen.
- **A connected remote is indicated in the interface** — Hub is being driven from
  somewhere other than the keyboard, and that should be apparent.
- Security-relevant events are logged locally: pairing started, completed,
  failed; authentication failures with the source address; permission denials;
  revocations; the listener opening and closing.
- Logs stay local. Nothing is reported anywhere. Nothing in this design contacts
  a server the user did not choose.
- Service control performed by a device is attributed to that device in run
  history, so "who restarted the API" has an answer.

---

## Residual risk

Stated rather than buried.

- **A compromised paired device retains what it was granted.** Permissions bound
  the loss; they do not prevent it. The bound is meaningful — configured services
  only, no Git writes, no config, no secrets — but a hostile phone can still stop
  a colleague's demo.
- **Log streaming can leak secrets.** Service output is whatever the service
  printed, and development servers print connection strings and tokens. Hub cannot
  redact what it cannot identify. `logs:read` should be presented as the sensitive
  grant it is, and considered off by default.
- **Anyone at the unlocked desktop can pair a device.** The QR is on screen by
  design. Mitigated only by the pairing being deliberate and the device list being
  inspectable afterwards.
- **mDNS advertises that Hub exists**, with a hostname, to the local network.
  Treated as acceptable; it is only advertised while Companion is enabled.
- **The tray-reachability check is necessary, not sufficient.** On Linux a session
  bus can exist with no panel hosting the icon, so Hub can still end up harder to
  reach than intended. Documented in `tray.rs`.
- **Self-signed pinning has no revocation story of its own.** If Hub's private key
  leaks, the remedy is rotating the certificate and re-pairing every device.
- **This design has not been reviewed by anyone but its author, and no code
  implements it yet.** Both should change before Companion ships.

---

## Open questions

1. **Should `logs:read` be off by default?** It is the grant most likely to leak
   secrets and the one users will accept without thinking.
2. **Remote access beyond the LAN.** The plan prefers Tailscale, WireGuard or SSH
   over a relay. Does binding to a Tailscale interface need anything here, or does
   the pinned certificate plus device keys carry over unchanged?
3. **Multiple Hubs**, from `0.3`. Does `host_id` need to be stable across
   certificate rotation so a phone can recognise a machine it already knows?
4. **Attribution in run history** means the history schema grows a source field.
   Worth deciding before `history.rs` gains more callers.
5. **Does the desktop need a "panic" control** — revoke everything and close the
   listener in one action — or is disabling Companion enough?
