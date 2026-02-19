mod commands;
mod compression;
mod log;
mod platform;
mod processor;
mod tray;
mod watcher;
use std::sync::atomic::{AtomicBool, AtomicU8, Ordering};
use tauri::Manager;
use tauri_plugin_notification::NotificationExt;

pub const DEFAULT_QUALITY: u8 = 80;
pub static QUALITY: AtomicU8 = AtomicU8::new(DEFAULT_QUALITY);
pub static HAS_NOTIFIED_ON_CLOSE: AtomicBool = AtomicBool::new(false);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![
            commands::set_quality,
            commands::get_quality,
            commands::get_compression_history,
            commands::clear_compression_history,
            commands::delete_original_images,
            commands::recompress,
            commands::compress_files,
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

                    if !HAS_NOTIFIED_ON_CLOSE.load(Ordering::Relaxed) {
                        let _ = app_handle.notification()
                            .builder()
                            .title("Hat")
                            .body("Hat is compressing images as they arrive in the background.")
                            .show();
                        HAS_NOTIFIED_ON_CLOSE.store(true, Ordering::Relaxed);
                    }
                }
            });

            log::init_compression_log(app.handle());
            watcher::start_downloads_watcher(app.handle());
            tray::setup_tray(app, icon)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
