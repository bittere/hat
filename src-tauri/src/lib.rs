mod commands;
mod compression;
mod log;
mod platform;
mod processor;
mod tray;
mod watcher;
use std::sync::atomic::AtomicU8;
use tauri::Manager;

pub const DEFAULT_QUALITY: u8 = 80;
pub static QUALITY: AtomicU8 = AtomicU8::new(DEFAULT_QUALITY);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
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

            log::init_compression_log(app.handle());
            watcher::start_downloads_watcher(app.handle());
            tray::setup_tray(app, icon)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
