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

use tauri::Manager;

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
        .invoke_handler(tauri::generate_handler![
            commands::scan_ports,
            commands::check_port_conflicts,
            commands::get_processes,
            commands::kill_process,
            commands::start_service,
            commands::stop_service,
            commands::restart_service,
            commands::list_managed_services,
            commands::start_workspace,
            commands::stop_workspace,
            commands::open_in_editor,
            commands::open_url,
            commands::scan_workspaces,
            commands::scan_workspace_groups,
            commands::find_default_workspace_roots,
            commands::create_project,
            commands::analyze_repository_health,
            commands::get_project_packages,
            commands::run_package_action,
            commands::get_git_status,
            commands::get_git_diff,
            commands::stage_git_files,
            commands::unstage_git_files,
            commands::commit_git_changes,
            commands::get_git_repository_info,
            commands::create_git_branch,
            commands::checkout_git_branch,
            commands::delete_git_branch,
            commands::add_git_remote,
            commands::rename_git_remote,
            commands::remove_git_remote,
            commands::fetch_git_remote,
            commands::pull_git_remote,
            commands::push_git_remote,
            commands::import_env_file,
            commands::export_env_file,
            commands::get_system_stats,
            commands::load_config,
            commands::secret_storage_backend,
            commands::list_run_history,
            commands::read_run_log,
            commands::clear_run_history,
            commands::save_config,
            commands::github_request_device_code,
            commands::github_poll_token,
            commands::github_list_repos,
            commands::github_get_project_context,
            commands::open_github_url,
            commands::get_start_at_login,
            commands::set_start_at_login,
        ])
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
