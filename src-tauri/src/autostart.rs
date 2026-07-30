//! Starting Localhost Hub when the user logs in.
//!
//! Closing to the tray keeps Hub alive once it is running. This is the other
//! half: it gets Hub running in the first place, without the user opening it.
//! That matters for anything that needs the host present rather than the window
//! — starting a workspace before sitting down at the computer, or a remote such
//! as Localhost Companion having something to connect to.
//!
//! Two decisions worth stating:
//!
//! - **The operating system owns the truth.** A login item can be removed by the
//!   user in System Settings, Task Manager or a desktop environment's startup
//!   panel, entirely outside Hub. So the stored preference is never trusted as
//!   the answer to "is this enabled"; the registration is read back from the OS.
//!   The config field exists to record intent and to re-apply it, not to report
//!   state.
//! - **An autostarted launch is a hidden launch.** Being handed a window on
//!   every login is the reason people turn these things off again, so the login
//!   registration carries a flag and the launch that sees it goes to the tray.
//!   See `launched_by_autostart`.

use tauri::AppHandle;
use tauri_plugin_autostart::ManagerExt;

/// Passed to Hub by the login registration, so a login launch can be told apart
/// from the user opening the application themselves.
pub const AUTOSTART_FLAG: &str = "--autostart";

/// Whether this process was started by the login registration rather than by the
/// user.
///
/// Read from the real process arguments, so it stays correct however the OS
/// chooses to invoke the binary.
pub fn launched_by_autostart() -> bool {
    std::env::args().any(|argument| argument == AUTOSTART_FLAG)
}

/// Whether a login item is currently registered, according to the OS.
///
/// An error here means the answer is unknown rather than "no", so it is logged
/// and reported as `false` — the interface then shows the toggle off, which is
/// the safe direction: it invites the user to switch it on again rather than
/// claiming a registration that may not exist.
pub fn is_enabled(app: &AppHandle) -> bool {
    match app.autolaunch().is_enabled() {
        Ok(enabled) => enabled,
        Err(error) => {
            log::warn!("could not read the login item: {error}");
            false
        }
    }
}

/// Registers or removes the login item, returning what the OS reports afterwards.
///
/// The return value is deliberately the state read back rather than the state
/// requested, so a silent failure surfaces as the toggle refusing to move
/// instead of as an interface that disagrees with the system.
pub fn set_enabled(app: &AppHandle, enabled: bool) -> Result<bool, String> {
    let manager = app.autolaunch();
    if enabled {
        manager.enable().map_err(|error| error.to_string())?;
    } else {
        manager.disable().map_err(|error| error.to_string())?;
    }
    Ok(is_enabled(app))
}

/// Brings the OS registration back in line with the stored preference at startup.
///
/// Without this, a preference saved on one machine — or a registration removed
/// behind Hub's back — would leave the two permanently disagreeing. Failures are
/// logged and otherwise ignored: not being able to manage a login item is not a
/// reason to refuse to start.
pub fn reconcile(app: &AppHandle) {
    let Ok(Some(config)) = crate::config::load(app) else {
        return;
    };
    let wanted = config.start_at_login;
    if wanted == is_enabled(app) {
        return;
    }
    match set_enabled(app, wanted) {
        Ok(actual) if actual == wanted => {
            log::info!("login item set to {wanted} to match the saved preference");
        }
        Ok(actual) => {
            log::warn!("login item is {actual} but {wanted} was asked for");
        }
        Err(error) => log::warn!("could not apply the login item preference: {error}"),
    }
}
