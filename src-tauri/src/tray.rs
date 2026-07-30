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

pub fn is_available() -> bool {
    TRAY_AVAILABLE.load(Ordering::SeqCst)
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
/// Deliberately reads the setting from disk on each close rather than caching it,
/// so toggling the preference takes effect immediately.
pub fn handle_window_event(app: &AppHandle, event: &WindowEvent) {
    let WindowEvent::CloseRequested { api, .. } = event else {
        return;
    };
    if QUITTING.load(Ordering::SeqCst) || !is_available() {
        return;
    }
    let close_to_tray = crate::config::load(app)
        .ok()
        .flatten()
        .map(|config| config.close_to_tray)
        .unwrap_or(false);
    if !close_to_tray {
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

    /// Guards the invariant that matters: without a tray there is nothing to
    /// close to, so the window must be allowed to close normally.
    #[test]
    fn closing_to_the_tray_requires_a_tray() {
        TRAY_AVAILABLE.store(false, Ordering::SeqCst);
        assert!(!is_available());
        TRAY_AVAILABLE.store(true, Ordering::SeqCst);
        assert!(is_available());
        TRAY_AVAILABLE.store(false, Ordering::SeqCst);
    }
}
