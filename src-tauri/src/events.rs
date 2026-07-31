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
