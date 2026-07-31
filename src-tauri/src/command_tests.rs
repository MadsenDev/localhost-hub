//! Tests for the IPC boundary itself.
//!
//! `commands.rs` had no tests, which the audit called out: it is the whole surface
//! between the interface and everything privileged. It was untested for a practical
//! reason rather than a careless one — most entry points take `AppHandle` or
//! `State<T>` and so cannot simply be called.
//!
//! What is deliberately *not* here: the validators. `normalize_local_url`,
//! `open_github_link` and `validate_run_id` already have direct tests beside their
//! implementations, and repeating them through IPC would add assertions without
//! adding coverage.
//!
//! What is here is the part nothing covered — the boundary rather than the logic
//! behind it:
//!
//! - **Registration.** A command can be written, exported and completely
//!   unreachable, because adding it to `commands.rs` and adding it to
//!   `generate_handler!` are two separate acts. Calling the function in a test
//!   passes; the interface fails at runtime with "command not found".
//! - **Argument binding.** `tauri-api.ts` sends `camelCase` for parameters Rust
//!   spells `snake_case`, and nothing asserted the conversion holds. It does — and
//!   both spellings bind, which the test found rather than assumed.
//! - **Error propagation.** That a rejected input comes back as an error a caller
//!   can display, rather than unwinding across the boundary.
//!
//! ## Coverage limit, stated plainly
//!
//! `tauri::test` runs on `MockRuntime`, and 17 of the 50 commands ask for a
//! concrete `AppHandle` (`AppHandle<Wry>`), so the mock handler cannot accept them.
//! Reaching those needs the commands made generic over `R: Runtime` — a refactor
//! through `commands.rs`, `config.rs`, `services.rs` and the rest, not a test. The
//! 33 runtime-free commands are drivable today and include every one that validates
//! untrusted input. The registration test below covers all 50 regardless, because
//! it reads the source rather than invoking anything.

use serde_json::{json, Value};
use tauri::ipc::{CallbackFn, InvokeBody};
use tauri::test::{get_ipc_response, mock_builder, mock_context, noop_assets, INVOKE_KEY};
use tauri::webview::InvokeRequest;
use tauri::WebviewWindowBuilder;

/// The runtime-free subset, registered so it can be driven through real IPC.
///
/// Deliberately a separate list from `command_handler!`: that one contains commands
/// this harness cannot accept. `every_registered_command_exists` keeps the two from
/// drifting into disagreement about what exists.
macro_rules! testable_handler {
    () => {
        tauri::generate_handler![
            crate::commands::open_url,
            crate::commands::open_github_url,
            crate::commands::check_port_conflicts,
            crate::commands::scan_workspaces,
            crate::commands::get_git_status,
            crate::commands::kill_process,
            crate::commands::get_system_stats,
            crate::commands::secret_storage_backend,
        ]
    };
}

fn invoke(command: &str, args: Value) -> Result<Value, Value> {
    let app = mock_builder()
        .invoke_handler(testable_handler!())
        .build(mock_context(noop_assets()))
        .expect("mock app builds");
    let webview = WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .expect("webview builds");
    get_ipc_response(
        &webview,
        InvokeRequest {
            cmd: command.to_string(),
            callback: CallbackFn(0),
            error: CallbackFn(1),
            url: "tauri://localhost".parse().expect("url"),
            body: InvokeBody::Json(args),
            headers: Default::default(),
            invoke_key: INVOKE_KEY.to_string(),
        },
    )
    .map(|body| body.deserialize::<Value>().expect("json result"))
}

fn error_of(result: Result<Value, Value>) -> String {
    match result {
        Ok(value) => panic!("expected an error, got {value:?}"),
        Err(value) => value
            .as_str()
            .map(str::to_string)
            .unwrap_or_else(|| value.to_string()),
    }
}

// ── Registration ──────────────────────────────────────────────────────────────

/// Every `#[tauri::command]` is reachable, and every name in the handler list
/// exists. Reads the source, so it covers all 50 including the ones this harness
/// cannot invoke.
#[test]
fn every_command_is_registered_and_every_registration_exists() {
    let commands_src = include_str!("commands.rs");
    let lib_src = include_str!("lib.rs");

    let mut defined = Vec::new();
    let mut rest = commands_src;
    while let Some(at) = rest.find("#[tauri::command]") {
        rest = &rest[at + "#[tauri::command]".len()..];
        // `create_project` is `pub async fn`, so matching only "pub fn " skipped
        // past it and mis-associated every name after it.
        let plain = rest.find("pub fn ");
        let asyncd = rest.find("pub async fn ");
        let (fn_at, keyword) = match (plain, asyncd) {
            (Some(p), Some(a)) if a < p => (a, "pub async fn "),
            (Some(p), _) => (p, "pub fn "),
            (None, Some(a)) => (a, "pub async fn "),
            (None, None) => break,
        };
        let after = &rest[fn_at + keyword.len()..];
        let name: String = after
            .chars()
            .take_while(|c| c.is_alphanumeric() || *c == '_')
            .collect();
        if !name.is_empty() {
            defined.push(name);
        }
    }
    assert!(
        defined.len() > 40,
        "expected to find the command definitions, found {}",
        defined.len()
    );

    let start = lib_src
        .find("macro_rules! command_handler")
        .expect("the handler macro");
    let end = lib_src[start..].find("\n}\n").expect("end of the macro") + start;
    let registered = &lib_src[start..end];

    let missing: Vec<&String> = defined
        .iter()
        .filter(|name| !registered.contains(&format!("commands::{name},")))
        .filter(|name| !registered.contains(&format!("commands::{name}\n")))
        .collect();
    assert!(
        missing.is_empty(),
        "these commands exist but are not registered, so the interface cannot call them: {missing:?}"
    );

    for name in registered
        .lines()
        .filter_map(|line| line.trim().strip_prefix("$crate::commands::"))
        .map(|line| line.trim_end_matches(','))
    {
        assert!(
            defined.iter().any(|defined| defined == name),
            "{name} is registered but no longer exists"
        );
    }
}

// ── Argument binding ──────────────────────────────────────────────────────────

/// `tauri-api.ts` sends `maxDepth` for a parameter Rust spells `max_depth`, and
/// nothing asserted that the conversion holds.
///
/// Both spellings bind, which is what this found rather than what it assumed: Tauri
/// accepts the Rust name too. Worth pinning down, because it means the interface
/// cannot be caught out by choosing the wrong one — and if that ever changes, the
/// interface breaks silently, so the test names both.
#[test]
fn both_the_wire_and_rust_spellings_of_an_argument_bind() {
    for spelling in ["maxDepth", "max_depth"] {
        let result = invoke(
            "scan_workspaces",
            json!({ "root": "/nonexistent-for-tests", spelling: 2 }),
        );
        assert!(result.is_ok(), "{spelling} should bind: {result:?}");
    }

    // `max_depth` is an `Option`, so a name that is neither spelling is ignored and
    // the parameter defaults — it does not fail. Worth knowing: a typo in an
    // optional argument is silent, and only the required ones are enforced.
    let unknown = invoke(
        "scan_workspaces",
        json!({ "root": "/nonexistent-for-tests", "depthMax": 2 }),
    );
    assert!(
        unknown.is_ok(),
        "an unknown optional argument should be ignored, not rejected: {unknown:?}"
    );

    // A missing *required* argument is enforced, which is what makes the above safe.
    assert!(invoke("scan_workspaces", json!({ "maxDepth": 2 })).is_err());
}

#[test]
fn a_missing_required_argument_is_reported_rather_than_defaulted() {
    let error = error_of(invoke("get_git_status", json!({})));
    assert!(
        error.contains("path") || error.contains("missing") || error.contains("invalid"),
        "the error should name the missing argument: {error}"
    );
}

#[test]
fn a_typed_argument_rejects_the_wrong_type() {
    let error = error_of(invoke("kill_process", json!({ "pid": "not-a-number" })));
    assert!(
        error.contains("pid") || error.contains("invalid") || error.contains("expected"),
        "unexpected error: {error}"
    );
}

#[test]
fn an_array_argument_deserializes() {
    let conflicts = invoke("check_port_conflicts", json!({ "expectedPorts": [1, 2, 3] }))
        .expect("check_port_conflicts");
    assert!(
        conflicts.is_array(),
        "expected an array of conflicts, got {conflicts:?}"
    );
}

// ── Errors reach the caller as errors ─────────────────────────────────────────

#[test]
fn rejected_input_returns_an_error_rather_than_unwinding() {
    let error = error_of(invoke("open_url", json!({ "url": "file:///etc/passwd" })));
    assert!(
        error.contains("local HTTP"),
        "expected the validation message, got {error}"
    );
}

#[test]
fn a_path_that_is_not_a_repository_is_not_a_panic() {
    // `get_git_status` returns Option, so "not a repository" is None rather than an
    // error — the assertion is that it answers at all instead of unwinding.
    let status = invoke("get_git_status", json!({ "path": "/nonexistent-for-tests" }))
        .expect("get_git_status answers");
    assert!(status.is_null(), "expected null, got {status:?}");
}

/// Found by this test: `4294967295` was accepted and reported success. It
/// truncates to `pid_t` `-1`, and `kill(-1, …)` means every process the caller may
/// signal — `/bin/kill` takes it without complaint. `kill_process` carries a pid
/// straight from the interface, so it is now validated before any signal is sent.
#[test]
fn a_pid_that_aliases_a_broadcast_target_is_refused() {
    for pid in [0u32, 1, 2147483648, 4294967295] {
        let error = error_of(invoke("kill_process", json!({ "pid": pid })));
        assert!(
            error.contains("not a valid process identifier"),
            "{pid} should be refused, got {error:?}"
        );
    }
}

#[test]
fn a_command_that_is_not_registered_is_refused() {
    // Guards the harness: without this, a typo in any `invoke` above would look
    // like a passing assertion about behaviour.
    let error = error_of(invoke("not_a_real_command", json!({})));
    assert!(
        error.contains("not found") || error.contains("not allowed"),
        "unexpected error for a missing command: {error}"
    );
}
