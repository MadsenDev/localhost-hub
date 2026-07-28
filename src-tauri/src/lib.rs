mod commands;
mod ports;
mod processes;
mod git;
mod workspace;
mod config;
mod github;
mod services;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(services::ServiceManager::default())
        .plugin(tauri_plugin_log::Builder::default().level(log::LevelFilter::Info).build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let win = app.get_webview_window("main").unwrap();
            #[cfg(debug_assertions)]
            win.open_devtools();
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::scan_ports,
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
            commands::get_git_status,
            commands::read_env_file,
            commands::get_system_stats,
            commands::load_config,
            commands::save_config,
            commands::github_request_device_code,
            commands::github_poll_token,
            commands::github_list_repos,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
