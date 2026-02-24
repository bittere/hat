mod commands;
mod compression;
mod config;
mod log;
mod platform;
mod processor;
mod tray;
mod watcher;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Mutex,
};
use tauri::Manager;
use tauri_plugin_notification::NotificationExt;

pub const DEFAULT_QUALITY: u8 = 80;
pub static HAS_NOTIFIED_ON_CLOSE: AtomicBool = AtomicBool::new(false);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::set_quality,
            commands::get_quality,
            commands::get_compression_history,
            commands::clear_compression_history,
            commands::delete_original_images,
            commands::recompress,
            commands::compress_files,
            commands::get_watched_folders,
            commands::add_watched_folder,
            commands::remove_watched_folder,
            commands::search_directories,
            commands::get_show_background_notification,
            commands::set_show_background_notification,
            commands::get_show_system_notifications,
            commands::set_show_system_notifications,
        ])
        .setup(|app| {
            let window = app.get_webview_window("main").unwrap();
            let icon = platform::load_icon();
            window.set_icon(icon.clone())?;

            let window_clone = window.clone();
            let app_handle = app.handle().clone();
            window.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    let _ = window_clone.hide();
                    api.prevent_close();

                    let config = app_handle.state::<Mutex<crate::config::ConfigManager>>();
                    let show_notif = if let Ok(c) = config.lock() {
                        c.config.show_background_notification
                    } else {
                        true
                    };

                    if show_notif && !HAS_NOTIFIED_ON_CLOSE.load(Ordering::Relaxed) {
                        let _ = app_handle
                            .notification()
                            .builder()
                            .title("Hat")
                            .body("Hat is compressing images as they arrive in the background.")
                            .show();
                        HAS_NOTIFIED_ON_CLOSE.store(true, Ordering::Relaxed);
                    }
                }
            });

            tray::setup_tray(app, icon)?;

            // Initialize Managed State
            let config_path = app
                .path()
                .app_config_dir()
                .expect("config dir")
                .join("config.json");
            let config_manager = crate::config::ConfigManager::load(config_path);
            app.manage(Mutex::new(config_manager));

            let log_path = app
                .path()
                .app_config_dir()
                .expect("config dir")
                .join("compression_log.json");
            let compression_log = crate::log::CompressionLog::load(log_path);
            app.manage(Mutex::new(compression_log));

            watcher::init_watcher(app.handle());

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
