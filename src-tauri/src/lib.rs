mod autostart;
mod commands;
mod ports;
mod processes;
mod git;
mod workspace;
mod config;
mod github;
mod services;
mod tray;
mod scaffold;
mod secrets;
mod health;
mod history;
mod lifetime;
mod packages;
mod env_files;
mod events;

use tauri::Manager;

/// The one list of IPC entry points.
///
/// Kept as a macro so the tests register exactly what the application registers.
/// A command added to `commands.rs` but forgotten here fails at runtime with
/// "command not found", which a test calling the function directly would never
/// catch — so the tests go through this same list.
macro_rules! command_handler {
    () => {
        tauri::generate_handler![
            $crate::commands::scan_ports,
            $crate::commands::check_port_conflicts,
            $crate::commands::get_processes,
            $crate::commands::kill_process,
            $crate::commands::start_service,
            $crate::commands::stop_service,
            $crate::commands::restart_service,
            $crate::commands::list_managed_services,
            $crate::commands::start_workspace,
            $crate::commands::stop_workspace,
            $crate::commands::open_in_editor,
            $crate::commands::open_url,
            $crate::commands::scan_workspaces,
            $crate::commands::scan_workspace_groups,
            $crate::commands::find_default_workspace_roots,
            $crate::commands::create_project,
            $crate::commands::analyze_repository_health,
            $crate::commands::get_project_packages,
            $crate::commands::run_package_action,
            $crate::commands::get_git_status,
            $crate::commands::get_git_diff,
            $crate::commands::stage_git_files,
            $crate::commands::unstage_git_files,
            $crate::commands::commit_git_changes,
            $crate::commands::get_git_repository_info,
            $crate::commands::create_git_branch,
            $crate::commands::checkout_git_branch,
            $crate::commands::delete_git_branch,
            $crate::commands::add_git_remote,
            $crate::commands::rename_git_remote,
            $crate::commands::remove_git_remote,
            $crate::commands::fetch_git_remote,
            $crate::commands::pull_git_remote,
            $crate::commands::push_git_remote,
            $crate::commands::import_env_file,
            $crate::commands::export_env_file,
            $crate::commands::get_system_stats,
            $crate::commands::load_config,
            $crate::commands::secret_storage_backend,
            $crate::commands::list_run_history,
            $crate::commands::read_run_log,
            $crate::commands::clear_run_history,
            $crate::commands::save_config,
            $crate::commands::github_request_device_code,
            $crate::commands::github_poll_token,
            $crate::commands::github_list_repos,
            $crate::commands::github_get_project_context,
            $crate::commands::open_github_url,
            $crate::commands::get_start_at_login,
            $crate::commands::set_start_at_login,
        ]
    };
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(services::ServiceManager::default())
        .plugin(tauri_plugin_log::Builder::default().level(log::LevelFilter::Info).build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        // The flag lets a login launch be told apart from the user opening Hub,
        // so it can go straight to the tray instead of throwing up a window.
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![autostart::AUTOSTART_FLAG]),
        ))
        .setup(|app| {
            // Run history needs the application data directory, which is only
            // resolvable once the app is built.
            match app.path().app_data_dir() {
                Ok(dir) => {
                    let history = history::History::new(&dir);
                    // Anything still marked running belongs to a previous
                    // session; the process table is in memory and did not
                    // survive. Resolve those before the interface reads them.
                    let interrupted = history.reconcile_interrupted_runs(
                        std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .map(|value| value.as_millis())
                            .unwrap_or(0),
                    );
                    if !interrupted.is_empty() {
                        log::info!(
                            "marked {} run(s) as interrupted from a previous session",
                            interrupted.len()
                        );
                    }
                    app.state::<services::ServiceManager>().attach_history(history);
                }
                Err(error) => {
                    // Recording runs is a convenience; not being able to is not
                    // a reason to refuse to start.
                    log::warn!("run history is unavailable: {error}");
                }
            }

            tray::init(app.handle());
            autostart::reconcile(app.handle());

            let win = app.get_webview_window("main").unwrap();
            #[cfg(debug_assertions)]
            win.open_devtools();

            // The window is configured hidden so a login launch does not flash one
            // up before hiding it again. Every other launch shows it here.
            //
            // The tray check is the safety net: without a tray icon there is no way
            // to reach a hidden Hub and no way to quit it, so the window is shown
            // regardless of how this process was started.
            if !autostart::launched_by_autostart() || !tray::is_available() {
                if autostart::launched_by_autostart() {
                    log::warn!("started at login but no tray is available; showing the window");
                }
                let _ = win.show();
                let _ = win.set_focus();
            } else {
                log::info!("started at login; staying in the tray");
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            tray::handle_window_event(window.app_handle(), event);
        })
        .invoke_handler(command_handler!())
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            // Exiting used to orphan every supervised service: the children were
            // reparented to init and carried on holding their ports, with nothing
            // left to manage them. Hub started them, so Hub stops them on the way
            // out. Closing to the tray is the option that keeps them running, and
            // it does not reach here.
            if let tauri::RunEvent::Exit = event {
                let stopped = app.state::<services::ServiceManager>().stop_all();
                if !stopped.is_empty() {
                    log::info!("stopped {} supervised service(s) while exiting", stopped.len());
                }
            }
        });
}

// Declared last so `command_handler!` is in scope: `macro_rules!` is visible
// only to items that follow its definition.
#[cfg(test)]
mod command_tests;
