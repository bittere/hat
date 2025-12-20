use log::{error, info};
use notify::{Event, EventKind, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::SystemTime;
use tauri::Manager;

mod compressor;
use compressor::compress_image;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompressionTask {
    pub id: String,
    pub filename: String,
    pub original_path: String,
    pub status: String, // "pending", "compressing", "completed", "error"
    pub original_size: u64,
    pub compressed_size: Option<u64>,
    pub progress: u32,
    pub error: Option<String>,
}

type TaskStore = Arc<Mutex<HashMap<String, CompressionTask>>>;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GlobalSettings {
    pub quality: u8,
    pub watched_folders: Vec<PathBuf>,
}

type SettingsStore = Arc<Mutex<GlobalSettings>>;

struct WatcherHandle(Arc<Mutex<notify::RecommendedWatcher>>);

// Track processed files to avoid reprocessing
type ProcessedFiles = Arc<Mutex<HashMap<PathBuf, SystemTime>>>;

#[tauri::command]
fn get_compression_status(tasks: tauri::State<'_, TaskStore>) -> Vec<CompressionTask> {
    let store = tasks.lock().unwrap();
    let mut results: Vec<_> = store.values().cloned().collect();
    results.sort_by(|a, b| b.id.cmp(&a.id));
    results
}

#[tauri::command]
fn clear_completed(tasks: tauri::State<'_, TaskStore>) {
    let mut store = tasks.lock().unwrap();
    store.retain(|_, task| task.status != "completed");
}

#[tauri::command]
fn delete_originals(tasks: tauri::State<'_, TaskStore>) -> Result<(), String> {
    let store = tasks.lock().unwrap();

    for (_id, task) in store.iter() {
        if task.status == "completed" {
            let path = PathBuf::from(&task.original_path);
            if path.exists() {
                if let Err(e) = fs::remove_file(&path) {
                    error!("Failed to delete original file {:?}: {}", path, e);
                } else {
                    info!("Deleted original file: {:?}", path);
                }
            }
        }
    }

    Ok(())
}

#[tauri::command]
fn set_quality(settings: tauri::State<'_, SettingsStore>, quality: u8) {
    let mut s = settings.lock().unwrap();
    s.quality = quality;
    info!("Quality updated to: {}", quality);
}

#[tauri::command]
fn get_settings(settings: tauri::State<'_, SettingsStore>) -> GlobalSettings {
    settings.lock().unwrap().clone()
}

#[tauri::command]
async fn add_directory(
    _tasks: tauri::State<'_, TaskStore>,
    settings: tauri::State<'_, SettingsStore>,
    watcher_handle: tauri::State<'_, WatcherHandle>,
) -> Result<GlobalSettings, String> {
    let path = rfd::AsyncFileDialog::new()
        .set_title("Select Folder to Watch")
        .pick_folder()
        .await;

    if let Some(folder) = path {
        let path_buf = folder.path().to_path_buf();
        let mut s = settings.lock().unwrap();

        if !s.watched_folders.contains(&path_buf) {
            s.watched_folders.push(path_buf.clone());
            let mut watcher = watcher_handle.0.lock().unwrap();
            watcher
                .watch(&path_buf, RecursiveMode::NonRecursive)
                .map_err(|e| e.to_string())?;
            info!("Added directory to watch: {:?}", path_buf);
        }
        return Ok(s.clone());
    }

    Err("No folder selected".into())
}

#[tauri::command]
fn remove_directory(
    settings: tauri::State<'_, SettingsStore>,
    watcher_handle: tauri::State<'_, WatcherHandle>,
    path: String,
) -> Result<GlobalSettings, String> {
    let path_buf = PathBuf::from(path);
    let mut s = settings.lock().unwrap();

    if let Some(pos) = s.watched_folders.iter().position(|p| p == &path_buf) {
        s.watched_folders.remove(pos);
        let mut watcher = watcher_handle.0.lock().unwrap();
        let _ = watcher.unwatch(&path_buf);
        info!("Removed directory from watch: {:?}", path_buf);
    }

    Ok(s.clone())
}

fn get_downloads_dir() -> PathBuf {
    let downloads_dir = dirs::download_dir().unwrap_or_else(|| {
        dirs::home_dir()
            .expect("Could not find home directory")
            .join("Downloads")
    });
    info!("Downloads directory resolved to: {:?}", downloads_dir);
    downloads_dir
}

fn setup_watcher(
    _tasks: TaskStore,
    _settings: SettingsStore,
) -> (
    notify::RecommendedWatcher,
    std::sync::mpsc::Receiver<Result<Event, notify::Error>>,
) {
    let (tx, rx) = std::sync::mpsc::channel();
    let watcher = notify::recommended_watcher(move |res: Result<Event, _>| {
        let _ = tx.send(res);
    })
    .expect("Failed to create watcher");

    (watcher, rx)
}

async fn run_watcher_loop(
    rx: std::sync::mpsc::Receiver<Result<Event, notify::Error>>,
    tasks: TaskStore,
    settings: SettingsStore,
) {
    let processed_files: ProcessedFiles = Arc::new(Mutex::new(HashMap::new()));

    while let Ok(res) = rx.recv() {
        if let Ok(event) = res {
            info!("File system event: {:?} - {:?}", event.kind, event.paths);
            match event.kind {
                EventKind::Create(_) | EventKind::Modify(_) => {
                    for path in event.paths {
                        info!("Checking file: {:?}", path);
                        if is_image_file(&path) {
                            info!("Image file detected: {:?}", path);
                            let should_process = {
                                let mut processed = processed_files.lock().unwrap();
                                let now = SystemTime::now();
                                let process = processed
                                    .get(&path)
                                    .map(|last_time| {
                                        now.duration_since(*last_time).unwrap_or_default().as_secs()
                                            > 5
                                    })
                                    .unwrap_or(true);

                                if process {
                                    processed.insert(path.clone(), now);
                                }
                                process
                            };

                            if should_process {
                                info!("Processing image: {:?}", path);
                                handle_new_image(path, tasks.clone(), settings.clone()).await;
                            }
                        }
                    }
                }
                _ => {}
            }
        }
    }
}

async fn handle_new_image(path: PathBuf, tasks: TaskStore, settings: SettingsStore) {
    info!("New image detected: {:?}", path);
    info!("File exists: {}", path.exists());

    // Wait a moment for file to be fully written
    std::thread::sleep(std::time::Duration::from_millis(500));

    let filename = path.file_name().unwrap().to_string_lossy().to_string();
    let id = uuid::Uuid::new_v4().to_string();

    let original_size = match fs::metadata(&path) {
        Ok(m) => m.len(),
        Err(e) => {
            error!("Failed to get file metadata: {}", e);
            return;
        }
    };

    let task = CompressionTask {
        id: id.clone(),
        filename: filename.clone(),
        original_path: path.to_string_lossy().to_string(),
        status: "pending".to_string(),
        original_size,
        compressed_size: None,
        progress: 0,
        error: None,
    };

    {
        let mut store = tasks.lock().unwrap();
        store.insert(id.clone(), task.clone());
        info!("Added task for: {}", filename);
    }

    let tasks_clone = tasks.clone();
    let settings_clone = settings.clone();
    info!("Spawning compression task for: {}", filename);
    tokio::task::spawn_blocking(move || {
        info!("Compression task spawned and executing");
        compress_task(path, id, tasks_clone, settings_clone);
    });
    info!("Spawn call completed");
}

fn compress_task(path: PathBuf, id: String, tasks: TaskStore, settings: SettingsStore) {
    info!("Starting compression for: {:?}", path);

    // Update status to compressing
    {
        let mut store = tasks.lock().unwrap();
        if let Some(task) = store.get_mut(&id) {
            task.status = "compressing".to_string();
        }
    }

    let output_path = path.with_file_name(format!(
        "{}_compressed{}",
        path.file_stem().unwrap().to_string_lossy(),
        path.extension()
            .map(|e| format!(".{}", e.to_string_lossy()))
            .unwrap_or_default()
    ));

    info!("Output path: {:?}", output_path);

    let quality = {
        let s = settings.lock().unwrap();
        s.quality
    };

    match compress_image(&path, &output_path, quality) {
        Ok(new_size) => {
            let mut store = tasks.lock().unwrap();
            if let Some(task) = store.get_mut(&id) {
                task.status = "completed".to_string();
                task.compressed_size = Some(new_size);
                task.progress = 100;
                info!(
                    "Compressed {}: {} -> {}",
                    task.filename, task.original_size, new_size
                );
            }
        }
        Err(e) => {
            let mut store = tasks.lock().unwrap();
            if let Some(task) = store.get_mut(&id) {
                task.status = "error".to_string();
                task.error = Some(e.to_string());
                error!("Failed to compress {}: {}", task.filename, e);
            }
        }
    }
}

fn is_image_file(path: &Path) -> bool {
    let filename = path.file_name().unwrap_or_default().to_string_lossy();

    // Skip already compressed files
    if filename.contains("_compressed") {
        return false;
    }

    if let Some(ext) = path.extension() {
        let ext = ext.to_string_lossy().to_lowercase();
        matches!(ext.as_str(), "jpg" | "jpeg" | "png" | "webp")
    } else {
        false
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::Builder::from_default_env()
        .filter_level(log::LevelFilter::Info)
        .init();

    let tasks: TaskStore = Arc::new(Mutex::new(HashMap::new()));
    let tasks_clone = tasks.clone();

    let downloads_dir = get_downloads_dir();
    let settings: SettingsStore = Arc::new(Mutex::new(GlobalSettings {
        quality: 30,
        watched_folders: vec![downloads_dir.clone()],
    }));
    let settings_clone = settings.clone();

    let (mut watcher, rx) = setup_watcher(tasks_clone.clone(), settings_clone.clone());
    // Watch initial folder
    let _ = watcher.watch(&downloads_dir, RecursiveMode::NonRecursive);

    let watcher_handle = WatcherHandle(Arc::new(Mutex::new(watcher)));

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .manage(tasks)
        .manage(settings)
        .manage(watcher_handle)
        .setup(|app| {
            tauri::async_runtime::spawn(run_watcher_loop(rx, tasks_clone, settings_clone));

            // Create system tray
            let toggle_item =
                tauri::menu::MenuItem::with_id(app, "toggle", "Show/Hide", true, None::<&str>)?;
            let quit_item =
                tauri::menu::MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

            let tray_menu = tauri::menu::MenuBuilder::new(app)
                .items(&[&toggle_item, &quit_item])
                .build()?;

            let _tray = tauri::tray::TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&tray_menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "toggle" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = if window.is_visible().unwrap_or(false) {
                                window.hide()
                            } else {
                                window.show()
                            };
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .build(app)?;

            // Set window icon explicitly for taskbar
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_icon(app.default_window_icon().unwrap().clone());
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_compression_status,
            clear_completed,
            delete_originals,
            set_quality,
            get_settings,
            add_directory,
            remove_directory
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
