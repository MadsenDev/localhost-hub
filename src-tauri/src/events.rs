//! Where Localhost Hub's live events go.
//!
//! The desktop's answer is "the webview", but that must not be the only answer.
//! Localhost Companion needs the same service output and the same workspace
//! progress delivered over a socket instead, and a Companion server driving a
//! workspace has to see the service events that workspace produces — not just the
//! workspace ones. So every emitter takes a sink rather than an `AppHandle`, and
//! the transport is somebody else's decision.
//!
//! This is the third of the Companion preconditions: logs and events subscribable
//! without depending on React or on Tauri window state. `TauriEventSink` is one
//! implementation of it, not the mechanism itself.

use tauri::{AppHandle, Emitter};

use crate::services::ServiceEvent;
use crate::workspace::WorkspaceEvent;

/// A destination for events. Implementations must be cheap to call and must not
/// block: emitters call this from the middle of process supervision.
pub trait EventSink: Send + Sync {
    fn service(&self, event: ServiceEvent);
    fn workspace(&self, event: WorkspaceEvent);
}

/// Delivers events to the webview. Failures are ignored deliberately: a window
/// that has gone away is not a reason to interrupt a running service.
#[derive(Clone)]
pub struct TauriEventSink(pub AppHandle);

impl EventSink for TauriEventSink {
    fn service(&self, event: ServiceEvent) {
        let _ = self.0.emit("service://event", event);
    }

    fn workspace(&self, event: WorkspaceEvent) {
        let _ = self.0.emit("workspace://event", event);
    }
}

/// Drops everything. Used while shutting down, where there is no interface left
/// to deliver to, and in tests that do not assert on events.
pub struct NoopEventSink;

impl EventSink for NoopEventSink {
    fn service(&self, _event: ServiceEvent) {}
    fn workspace(&self, _event: WorkspaceEvent) {}
}

/// Tells the interface whether it has a window on screen.
///
/// Not a cost saving, though it was built as one: the platform webview already
/// suspends the interface's timers while the window is hidden. Measured on
/// WebKitGTK, hidden to the tray, with the interface's own check removed — zero
/// polls over thirty seconds.
///
/// What it is for is freshness on the way back. Reopening from the tray showed
/// whatever was current when the window was hidden, for up to five seconds; after an
/// afternoon in the tray that can mean presenting a service as running that died
/// hours ago. Knowing it became visible lets the interface refresh at once.
///
/// Rust announces it because Rust is what hides and shows the window. The obvious
/// alternative, `document.hidden`, is reported inconsistently by platform webviews
/// for a window hidden to a tray — which is precisely the case that matters.
pub fn emit_window_visibility(app: &AppHandle, visible: bool) {
    let _ = app.emit("window://visibility", visible);
}
