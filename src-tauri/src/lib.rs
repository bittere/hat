use log::{error, info, warn};
use notify::{Event, EventKind, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::SystemTime;
use tauri::{Manager, Emitter, AppHandle};

mod compressor;
use compressor::compress_image;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompressionTask {
    pub id: String,
    pub filename: String,
    pub original_path: String,
    pub status: String, // "pending", "compressing", "completed", "error", "reconverting"
    pub original_size: u64,
    pub compressed_size: Option<u64>,
    pub progress: u32,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct TaskEvent {
    pub id: String,
    pub status: String,
    pub progress: u32,
    pub compressed_size: Option<u64>,
    pub filename: Option<String>,
    pub original_size: Option<u64>,
}

pub struct TaskStoreInner {
    tasks: HashMap<String, CompressionTask>,
    app_handle: Option<AppHandle>,
}

type TaskStore = Arc<Mutex<TaskStoreInner>>;

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
    let mut results: Vec<_> = store.tasks.values().cloned().collect();
    results.sort_by(|a, b| b.id.cmp(&a.id));
    results
}

#[tauri::command]
fn clear_completed(tasks: tauri::State<'_, TaskStore>) {
    clear_completed_internal(&tasks);
}

fn clear_completed_internal(tasks: &tauri::State<'_, TaskStore>) {
    let mut store = tasks.lock().unwrap();
    let app_handle = store.app_handle.clone();
    
    let completed_ids: Vec<String> = store
        .tasks
        .iter()
        .filter(|(_, task)| task.status == "completed")
        .map(|(id, _)| id.clone())
        .collect();
    
    let count = completed_ids.len();
    for id in completed_ids {
        store.tasks.remove(&id);
        if let Some(app_handle) = &app_handle {
            if let Err(e) = app_handle.emit("task:deleted", TaskEvent {
                id: id.clone(),
                status: "deleted".to_string(),
                progress: 0,
                compressed_size: None,
                filename: None,
                original_size: None,
            }) {
                error!("Failed to emit task:deleted event: {:?}", e);
            }
        }
    }
    if count > 0 {
        info!("Cleared {} completed tasks", count);
    }
}

#[tauri::command]
fn delete_originals(tasks: tauri::State<'_, TaskStore>) -> Result<(), String> {
    let mut store = tasks.lock().unwrap();
    let app_handle = store.app_handle.clone();
    
    // Get list of completed task IDs and their original paths - all in one lock scope
    let tasks_to_delete: Vec<(String, String)> = store
        .tasks
        .iter()
        .filter(|(_, task)| task.status == "completed")
        .map(|(id, task)| (id.clone(), task.original_path.clone()))
        .collect();

    for (id, original_path) in tasks_to_delete {
        // Delete the file
        let path = PathBuf::from(&original_path);
        if path.exists() {
            if let Err(e) = fs::remove_file(&path) {
                error!("Failed to delete original file {:?}: {}", path, e);
            } else {
                info!("Deleted original file: {:?}", path);
            }
        }
        
        // Remove task from store and emit event - still within lock scope
        store.tasks.remove(&id);
        if let Some(app_handle_ref) = &app_handle {
            if let Err(e) = app_handle_ref.emit("task:deleted", TaskEvent {
                id: id.clone(),
                status: "deleted".to_string(),
                progress: 0,
                compressed_size: None,
                filename: None,
                original_size: None,
            }) {
                error!("Failed to emit task:deleted event: {:?}", e);
            }
        }
    }

    Ok(())
}

#[tauri::command]
fn delete_task(tasks: tauri::State<'_, TaskStore>, id: String) -> Result<(), String> {
    let mut store = tasks.lock().unwrap();
    let app_handle = store.app_handle.clone();
    
    if store.tasks.remove(&id).is_some() {
        if let Some(app_handle) = &app_handle {
            if let Err(e) = app_handle.emit("task:deleted", TaskEvent {
                id: id.clone(),
                status: "deleted".to_string(),
                progress: 0,
                compressed_size: None,
                filename: None,
                original_size: None,
            }) {
                error!("Failed to emit task:deleted event: {:?}", e);
            }
        }
        info!("Deleted task: {}", id);
        Ok(())
    } else {
        Err(format!("Task not found: {}", id))
    }
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

#[tauri::command]
async fn recompress_file(
    app_handle: tauri::AppHandle,
    tasks: tauri::State<'_, TaskStore>,
    settings: tauri::State<'_, SettingsStore>,
    task_id: String,
) -> Result<(), String> {
    // Get the original file path from the existing task
    let file_path = {
        let store = tasks.lock().unwrap();
        store.tasks.get(&task_id)
            .ok_or("Task not found")?
            .original_path.clone()
    };

    let path = PathBuf::from(&file_path);
    if !path.exists() {
        return Err("File does not exist".into());
    }

    // Check if file is already being processed
    {
        let store = tasks.lock().unwrap();
        for task in store.tasks.values() {
            if task.original_path == file_path && (task.status == "pending" || task.status == "compressing" || task.status == "reconverting") {
                return Err("File is already being processed".into());
            }
        }
    }

    let s = settings.lock().unwrap();
    let quality = s.quality;
    drop(s);

    let output_path = path.with_file_name(format!(
        "{}_compressed{}",
        path.file_stem()
            .map(|f| f.to_string_lossy())
            .unwrap_or_default(),
        path.extension()
            .map(|e| format!(".{}", e.to_string_lossy()))
            .unwrap_or_default()
    ));
    
    // Check if output file already exists (collision detection)
    if output_path.exists() {
        return Err(format!(
            "Compressed file already exists: {:?}. Delete it before recompressing.",
            output_path
        ));
    }
    
    let filename = path.file_name()
        .map(|f| f.to_string_lossy().to_string())
        .unwrap_or_else(|| "unknown".to_string());
    
    let original_size = fs::metadata(&path)
        .map_err(|e| e.to_string())?
        .len();

    let mut task = CompressionTask {
        id: task_id.clone(),
        filename: filename.clone(),
        original_path: file_path.clone(),
        status: "reconverting".to_string(),
        original_size,
        compressed_size: None,
        progress: 0,
        error: None,
    };

    let app_handle_for_emit = {
        let mut store = tasks.lock().unwrap();
        store.tasks.insert(task_id.clone(), task.clone());
        if let Some(app_handle) = &store.app_handle {
            if let Err(e) = app_handle.emit("task:status-changed", TaskEvent {
                id: task.id.clone(),
                status: task.status.clone(),
                progress: task.progress,
                compressed_size: task.compressed_size,
                filename: None,
                original_size: None,
            }) {
                error!("Failed to emit task:status-changed event: {:?}", e);
            }
        }
        store.app_handle.clone()
    };

    // Perform compression (blocking operation in async context)
    let compress_result = tokio::task::block_in_place(|| {
        compress_image(&app_handle, &path, &output_path, quality)
    });
    
    match compress_result {
        Ok(compressed_size) => {
            task.compressed_size = Some(compressed_size);
            task.progress = 100;
            task.status = "completed".to_string();
            info!("Recompressed {}: {} → {}", filename, original_size, compressed_size);
        }
        Err(e) => {
            task.status = "error".to_string();
            task.error = Some(e.to_string());
            error!("Recompression failed for {}: {}", filename, e);
        }
    }

    if let Some(app_handle) = app_handle_for_emit {
        let mut store = tasks.lock().unwrap();
        store.tasks.insert(task_id, task.clone());
        if let Err(e) = app_handle.emit("task:status-changed", TaskEvent {
            id: task.id.clone(),
            status: task.status.clone(),
            progress: task.progress,
            compressed_size: task.compressed_size,
            filename: None,
            original_size: None,
        }) {
            error!("Failed to emit task:status-changed event: {:?}", e);
        }
    } else {
        let mut store = tasks.lock().unwrap();
        store.tasks.insert(task_id, task);
    }

    Ok(())
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



async fn run_watcher_loop(
    rx: std::sync::mpsc::Receiver<Result<Event, notify::Error>>,
    tasks: TaskStore,
    settings: SettingsStore,
    app_handle: tauri::AppHandle,
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
                                handle_new_image(
                                    path,
                                    tasks.clone(),
                                    settings.clone(),
                                    app_handle.clone(),
                                )
                                .await;
                            }
                        }
                    }
                }
                _ => {}
            }
        }
    }
}

async fn handle_new_image(
    path: PathBuf,
    tasks: TaskStore,
    settings: SettingsStore,
    app_handle: tauri::AppHandle,
) {
    info!("New image detected: {:?}", path);
    info!("File exists: {}", path.exists());

    // Wait a moment for file to be fully written
    std::thread::sleep(std::time::Duration::from_millis(500));

    let filename = path.file_name().unwrap().to_string_lossy().to_string();
    
    // Generate unique task ID with collision check
    let id = {
        let store = tasks.lock().unwrap();
        generate_unique_task_id(&store)
    };

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
        store.tasks.insert(id.clone(), task.clone());
        if let Some(app_handle) = &store.app_handle {
            if let Err(e) = app_handle.emit("task:created", TaskEvent {
                id: task.id.clone(),
                status: task.status.clone(),
                progress: task.progress,
                compressed_size: task.compressed_size,
                filename: Some(task.filename.clone()),
                original_size: Some(task.original_size),
            }) {
                error!("Failed to emit task:created event: {:?}", e);
            }
        }
    }
    info!("Added task for: {}", filename);

    let tasks_clone = tasks.clone();
    let settings_clone = settings.clone();
    let app_handle_clone = app_handle.clone();
    info!("Spawning compression task for: {}", filename);
    tokio::task::spawn_blocking(move || {
        info!("Compression task spawned and executing");
        compress_task(path, id, tasks_clone, settings_clone, app_handle_clone);
    });
    info!("Spawn call completed");
}

fn compress_task(
    path: PathBuf,
    id: String,
    tasks: TaskStore,
    settings: SettingsStore,
    app_handle: tauri::AppHandle,
) {
    info!("Starting compression for: {:?}", path);

    // Check if task still exists and get quality in single lock scope
    let quality = {
        let mut store = tasks.lock().unwrap();
        
        // Verify task exists
        if !store.tasks.contains_key(&id) {
            warn!("Task {} disappeared before compression started", id);
            return;
        }
        
        // Update status to compressing
        if let Some(task) = store.tasks.get_mut(&id) {
            task.status = "compressing".to_string();
            task.progress = 10;
        }
        
        if let Some(app_handle_ref) = store.app_handle.as_ref() {
            if let Some(task) = store.tasks.get(&id) {
                if let Err(e) = app_handle_ref.emit("task:status-changed", TaskEvent {
                    id: task.id.clone(),
                    status: task.status.clone(),
                    progress: task.progress,
                    compressed_size: task.compressed_size,
                    filename: None,
                    original_size: None,
                }) {
                    error!("Failed to emit task:status-changed event: {:?}", e);
                }
            }
        }
        
        let s = settings.lock().unwrap();
        s.quality
    };

    let output_path = path.with_file_name(format!(
        "{}_compressed{}",
        path.file_stem().unwrap().to_string_lossy(),
        path.extension()
            .map(|e| format!(".{}", e.to_string_lossy()))
            .unwrap_or_default()
    ));

    info!("Output path: {:?}", output_path);
    
    // Check if output file already exists (avoid collision/overwrite)
    if output_path.exists() {
        let mut store = tasks.lock().unwrap();
        if let Some(task) = store.tasks.get_mut(&id) {
            task.status = "error".to_string();
            task.error = Some(format!("Compressed file already exists: {:?}", output_path));
            error!("Cannot compress {}: output file already exists", task.filename);
        }
        if let Some(app_handle_ref) = store.app_handle.as_ref() {
            if let Some(task) = store.tasks.get(&id) {
                let _ = app_handle_ref.emit("task:status-changed", TaskEvent {
                    id: task.id.clone(),
                    status: task.status.clone(),
                    progress: task.progress,
                    compressed_size: task.compressed_size,
                    filename: None,
                    original_size: None,
                });
            }
        }
        return;
    }

    match compress_image(&app_handle, &path, &output_path, quality) {
        Ok(new_size) => {
            let mut store = tasks.lock().unwrap();
            let task_to_emit = if let Some(task) = store.tasks.get_mut(&id) {
                task.status = "completed".to_string();
                task.compressed_size = Some(new_size);
                task.progress = 100;
                info!(
                    "Compressed {}: {} -> {}",
                    task.filename, task.original_size, new_size
                );
                Some(task.clone())
            } else {
                warn!("Task {} disappeared during compression", id);
                None
            };
            
            if let (Some(task), Some(app_handle_ref)) = (task_to_emit, store.app_handle.as_ref()) {
                if let Err(e) = app_handle_ref.emit("task:status-changed", TaskEvent {
                    id: task.id,
                    status: task.status,
                    progress: task.progress,
                    compressed_size: task.compressed_size,
                    filename: None,
                    original_size: None,
                }) {
                    error!("Failed to emit completion event: {:?}", e);
                }
            }
        }
        Err(e) => {
            let mut store = tasks.lock().unwrap();
            let task_to_emit = if let Some(task) = store.tasks.get_mut(&id) {
                task.status = "error".to_string();
                task.error = Some(e.to_string());
                error!("Failed to compress {}: {}", task.filename, e);
                Some(task.clone())
            } else {
                warn!("Task {} disappeared during error handling", id);
                None
            };
            
            if let (Some(task), Some(app_handle_ref)) = (task_to_emit, store.app_handle.as_ref()) {
                if let Err(emit_e) = app_handle_ref.emit("task:status-changed", TaskEvent {
                    id: task.id,
                    status: task.status,
                    progress: task.progress,
                    compressed_size: task.compressed_size,
                    filename: None,
                    original_size: None,
                }) {
                    error!("Failed to emit error event: {:?}", emit_e);
                }
            }
        }
    }
}

fn generate_unique_task_id(store: &TaskStoreInner) -> String {
    loop {
        let id = uuid::Uuid::new_v4().to_string();
        if !store.tasks.contains_key(&id) {
            return id;
        }
        // Extremely unlikely to reach here, but safeguard against collision
        warn!("UUID collision detected, generating new one");
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
        matches!(
            ext.as_str(),
            "jpg" | "jpeg" | "png" | "webp" | "jfif" | "bmp" | "tiff" | "tif" | "gif"
        )
    } else {
        false
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::Builder::from_default_env()
        .filter_level(log::LevelFilter::Info)
        .init();

    let downloads_dir = get_downloads_dir();
    let settings: SettingsStore = Arc::new(Mutex::new(GlobalSettings {
        quality: 30,
        watched_folders: vec![downloads_dir.clone()],
    }));
    let settings_clone = settings.clone();

    // Create watcher and channel for file system events
    let (tx, rx) = std::sync::mpsc::channel();
    let mut watcher = notify::recommended_watcher(move |res: Result<Event, _>| {
        let _ = tx.send(res);
    })
    .expect("Failed to create watcher");
    let _ = watcher.watch(&downloads_dir, RecursiveMode::NonRecursive);
    let watcher_handle = WatcherHandle(Arc::new(Mutex::new(watcher)));

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let app_handle = app.handle().clone();
            // Create TaskStore with AppHandle - this is the single source of truth
            let tasks: TaskStore = Arc::new(Mutex::new(TaskStoreInner {
                tasks: HashMap::new(),
                app_handle: Some(app_handle.clone()),
            }));
            let tasks_clone = tasks.clone();
            // Manage it so Tauri commands can access it
            app.manage(tasks);
            // Spawn the watcher loop with the same TaskStore
            tauri::async_runtime::spawn(run_watcher_loop(
                rx,
                tasks_clone,
                settings_clone,
                app_handle,
            ));

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

            app.manage(settings);
            app.manage(watcher_handle);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_compression_status,
            clear_completed,
            delete_originals,
            delete_task,
            set_quality,
            get_settings,
            add_directory,
            remove_directory,
            recompress_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
