//! Whether Localhost Hub should keep running with no window on screen.
//!
//! This is deliberately one function rather than a condition spread across the
//! close handler, the tray and whatever comes next. Hub is growing a second
//! reason to stay alive: Localhost Companion needs a host to reach, so "the user
//! ticked close to tray" will stop being the only answer. Two independent
//! switches where one silently defeats the other is the failure this avoids —
//! a paired phone losing its host because closing the window still exited.
//!
//! When the Companion server lands it adds a clause to [`should_stay_resident`]
//! and nothing else has to change.

use tauri::AppHandle;

/// Why Hub is staying resident, or why it is not.
///
/// Carried rather than reduced to a bool so callers can explain themselves: the
/// close handler needs to know whether to hide the window, and a future
/// "quitting would disconnect your phone" confirmation needs to know which
/// reason applied.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Residency {
    /// Nothing needs Hub without its window, so closing the window exits.
    ExitOnClose,
    /// The user asked for closing to leave supervised services running.
    CloseToTray,
}

impl Residency {
    pub fn stays_resident(self) -> bool {
        matches!(self, Residency::CloseToTray)
    }
}

/// Decides whether closing the window should hide Hub rather than exit it.
///
/// Reads the preference from disk on each call rather than caching it, so
/// toggling the setting takes effect on the very next close.
///
/// A tray icon is required: hiding the window without one would leave Hub
/// running with no way to reach it and no way to quit it. That check lives here,
/// with the decision, rather than at the call site — any future reason to stay
/// resident needs it just as much.
pub fn should_stay_resident(app: &AppHandle) -> Residency {
    if !crate::tray::is_available() {
        return Residency::ExitOnClose;
    }
    let close_to_tray = crate::config::load(app)
        .ok()
        .flatten()
        .map(|config| config.close_to_tray)
        .unwrap_or(false);
    if close_to_tray {
        Residency::CloseToTray
    } else {
        Residency::ExitOnClose
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_close_to_tray_stays_resident() {
        assert!(!Residency::ExitOnClose.stays_resident());
        assert!(Residency::CloseToTray.stays_resident());
    }
}
