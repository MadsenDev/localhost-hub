//! System tray, and closing to it instead of exiting.
//!
//! Localhost Hub supervises long-running dev servers, so closing the window
//! usually means "get out of my way", not "kill everything I have running".
//! Closing to the tray keeps those services alive and the window one click away.
//!
//! Two safety rules shape this:
//!
//! - The window is only ever hidden when a tray icon exists. Hiding it with no
//!   tray would leave a running application with no way to reach it.
//! - Quitting from the tray sets an explicit flag first, so the close handler
//!   knows to let the window close rather than hiding it again.

use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, WindowEvent,
};

/// Set when the user chooses Quit, so the close handler stops intercepting.
static QUITTING: AtomicBool = AtomicBool::new(false);

/// Whether a tray icon was successfully created. Closing to the tray is only
/// honoured when this is true.
static TRAY_AVAILABLE: AtomicBool = AtomicBool::new(false);

const MAIN_WINDOW: &str = "main";

/// Whether hiding the window would leave a way back to it.
///
/// A successful `TrayIconBuilder::build` is not enough on its own. Building the
/// icon succeeded on a session with no message bus and no panel at all — nothing
/// was drawn and nothing could have hosted it — so trusting the build alone let
/// Hub hide itself somewhere unreachable, with no window and no icon.
///
/// On Linux the tray is published over the session bus, so no session bus means
/// no tray, definitively. That is a necessary condition rather than a sufficient
/// one: a bus can exist with no panel hosting the icon, and this cannot tell that
/// case apart. It rules out the case that actually strands the application —
/// headless sessions, containers, a bare X server — and everything it lets
/// through is at least capable of showing a tray.
pub fn is_available() -> bool {
    if !TRAY_AVAILABLE.load(Ordering::SeqCst) {
        return false;
    }
    #[cfg(target_os = "linux")]
    {
        if std::env::var_os("DBUS_SESSION_BUS_ADDRESS").is_none() {
            return false;
        }
    }
    true
}

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn toggle_main_window(app: &AppHandle) {
    let Some(window) = app.get_webview_window(MAIN_WINDOW) else {
        return;
    };
    if window.is_visible().unwrap_or(false) {
        let _ = window.hide();
    } else {
        show_main_window(app);
    }
}

/// Builds the tray icon. A failure is logged and left non-fatal: the application
/// is perfectly usable without a tray, it simply will not close to one.
pub fn init(app: &AppHandle) {
    let show = match MenuItem::with_id(app, "show", "Show Localhost Hub", true, None::<&str>) {
        Ok(item) => item,
        Err(error) => {
            log::warn!("could not build the tray menu: {error}");
            return;
        }
    };
    let quit = match MenuItem::with_id(app, "quit", "Quit", true, None::<&str>) {
        Ok(item) => item,
        Err(error) => {
            log::warn!("could not build the tray menu: {error}");
            return;
        }
    };
    let menu = match Menu::with_items(app, &[&show, &quit]) {
        Ok(menu) => menu,
        Err(error) => {
            log::warn!("could not build the tray menu: {error}");
            return;
        }
    };

    let mut builder = TrayIconBuilder::with_id("main")
        .tooltip("Localhost Hub")
        .menu(&menu)
        // The menu belongs on right-click; a left click toggles the window.
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => show_main_window(app),
            "quit" => {
                // Set before exiting so the close handler lets the window go.
                QUITTING.store(true, Ordering::SeqCst);
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                toggle_main_window(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }

    match builder.build(app) {
        Ok(_) => TRAY_AVAILABLE.store(true, Ordering::SeqCst),
        Err(error) => log::warn!("could not create the system tray: {error}"),
    }
}

/// Intercepts the window close so it hides instead of exiting.
///
/// Whether to stay resident is not decided here — see [`crate::lifetime`], which
/// owns that question so a second reason to stay alive cannot end up disagreeing
/// with this one.
pub fn handle_window_event(app: &AppHandle, event: &WindowEvent) {
    let WindowEvent::CloseRequested { api, .. } = event else {
        return;
    };
    if QUITTING.load(Ordering::SeqCst) {
        return;
    }
    if !crate::lifetime::should_stay_resident(app).stays_resident() {
        return;
    }
    api.prevent_close();
    if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
        let _ = window.hide();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Guards the invariant that matters: without somewhere to close to, the
    /// window must be allowed to close normally, or Hub ends up running with no
    /// window and no icon.
    ///
    /// Kept as a single test because both halves move the same global flag, and
    /// tests in one binary run in parallel.
    #[test]
    fn closing_to_the_tray_requires_a_reachable_tray() {
        let restore = TRAY_AVAILABLE.load(Ordering::SeqCst);

        TRAY_AVAILABLE.store(false, Ordering::SeqCst);
        assert!(!is_available(), "no tray was built, so there is nothing to close to");

        TRAY_AVAILABLE.store(true, Ordering::SeqCst);
        if cfg!(target_os = "linux") {
            // The builder reporting success is not the whole answer here: the icon
            // is published over the session bus, so without one there is no tray
            // however well the build went. Asserted against the real environment so
            // this holds both on a desktop and on a headless runner.
            let has_bus = std::env::var_os("DBUS_SESSION_BUS_ADDRESS").is_some();
            assert_eq!(is_available(), has_bus);
        } else {
            assert!(is_available());
        }

        TRAY_AVAILABLE.store(restore, Ordering::SeqCst);
    }
}
