use log::{error, info, warn};
use notify::{Event, EventKind, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime};
use tauri::{AppHandle, Emitter, Manager};

mod compressor;
use compressor::compress_image_with_progress;

// ============================================================================
// Constants
// ============================================================================

const MAX_TASKS: usize = 10000;
const MAX_TASKS_THRESHOLD: usize = (MAX_TASKS * 90) / 100;
const TASK_SAVE_INTERVAL_SECS: u64 = 30;
const CLEANUP_INTERVAL_SECS: u64 = 300;
const PROCESSED_FILES_CLEANUP_INTERVAL_SECS: u64 = 10;
const PROCESSED_FILES_MAX_AGE_SECS: u64 = 5;
const FILE_WRITE_DELAY_MS: u64 = 500;
const DEFAULT_QUALITY: u8 = 30;

/// Task status constants
mod status {
    pub const PENDING: &str = "pending";
    pub const COMPRESSING: &str = "compressing";
    pub const COMPLETED: &str = "completed";
    pub const ERROR: &str = "error";
    pub const RECONVERTING: &str = "reconverting";
    pub const DELETED: &str = "deleted";
}

/// Supported image extensions
const IMAGE_EXTENSIONS: &[&str] = &["jpg", "jpeg", "png", "webp", "jfif", "tiff", "tif", "gif"];

// ============================================================================
// Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompressionTask {
    pub id: String,
    pub filename: String,
    pub original_path: String,
    pub compressed_path: Option<String>,
    pub status: String,
    pub original_size: u64,
    pub compressed_size: Option<u64>,
    pub progress: u32,
    pub error: Option<String>,
    pub quality: u8,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GlobalSettings {
    pub quality: u8,
    pub watched_folders: Vec<PathBuf>,
}

struct TaskStoreInner {
    tasks: HashMap<String, CompressionTask>,
    app_handle: Option<AppHandle>,
}

type TaskStore = Arc<Mutex<TaskStoreInner>>;
type SettingsStore = Arc<Mutex<GlobalSettings>>;
type ProcessedFiles = Arc<Mutex<HashMap<PathBuf, SystemTime>>>;

struct WatcherHandle(Arc<Mutex<notify::RecommendedWatcher>>);

// ============================================================================
// Utility Functions
// ============================================================================

/// Safely acquire locks and recover from poisoning
fn safe_lock<T>(mutex: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|poisoned| {
        error!("Mutex poisoned, recovering");
        poisoned.into_inner()
    })
}

/// Emit task event with full task data
fn emit_task_event(app_handle: &AppHandle, event_name: &str, task: &CompressionTask) {
    if let Err(e) = app_handle.emit(
        event_name,
        TaskEvent {
            id: task.id.clone(),
            status: task.status.clone(),
            progress: task.progress,
            compressed_size: task.compressed_size,
            filename: Some(task.filename.clone()),
            original_size: Some(task.original_size),
        },
    ) {
        error!("Failed to emit {} event: {:?}", event_name, e);
    }
}

/// Generate unique task ID with collision checking
fn generate_unique_task_id(store: &TaskStoreInner) -> String {
    loop {
        let id = uuid::Uuid::new_v4().to_string();
        if !store.tasks.contains_key(&id) {
            return id;
        }
        warn!("UUID collision detected, generating new one");
    }
}

/// Check if path is a supported image file
fn is_image_file(path: &Path) -> bool {
    let filename = path
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_lowercase();

    // Skip already compressed files
    if filename.contains("_compressed") {
        return false;
    }

    path.extension()
        .and_then(|e| e.to_str())
        .map(|ext| IMAGE_EXTENSIONS.contains(&ext.to_lowercase().as_str()))
        .unwrap_or(false)
}

/// Get downloads directory
fn get_downloads_dir() -> PathBuf {
    let downloads_dir = dirs::download_dir().unwrap_or_else(|| {
        dirs::home_dir()
            .expect("Could not find home directory")
            .join("Downloads")
    });
    info!("Downloads directory resolved to: {:?}", downloads_dir);
    downloads_dir
}

/// Get tasks persistence file path
fn get_tasks_file_path() -> io::Result<PathBuf> {
    let app_cache_dir = dirs::cache_dir()
        .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, "Cache directory not found"))?;
    let hat_cache = app_cache_dir.join("hat");
    fs::create_dir_all(&hat_cache)?;
    Ok(hat_cache.join("tasks.json"))
}

/// Generate versioned output path to avoid collisions
fn generate_output_path(input_path: &Path) -> PathBuf {
    let stem = input_path
        .file_stem()
        .map(|s| s.to_string_lossy())
        .unwrap_or_default();
    let ext = input_path
        .extension()
        .map(|e| format!(".{}", e.to_string_lossy()))
        .unwrap_or_default();
    let dir = input_path.parent().unwrap_or_else(|| Path::new("."));

    // Find next available version number
    let mut version = 1;
    loop {
        let candidate = dir.join(format!("{}_compressed_{}{}", stem, version, ext));
        if !candidate.exists() {
            return candidate;
        }
        version += 1;
    }
}

// ============================================================================
// Task Persistence
// ============================================================================

/// Save tasks to disk
fn save_tasks_to_disk(tasks: &HashMap<String, CompressionTask>) {
    let path = match get_tasks_file_path() {
        Ok(p) => p,
        Err(e) => {
            warn!("Could not determine tasks file path: {}", e);
            return;
        }
    };

    // Only save non-error tasks (errors are transient)
    let tasks_to_save: Vec<_> = tasks
        .values()
        .filter(|task| task.status != status::ERROR)
        .cloned()
        .collect();

    match serde_json::to_string(&tasks_to_save) {
        Ok(json) => match fs::write(&path, json) {
            Ok(_) => info!("Saved {} tasks to disk", tasks_to_save.len()),
            Err(e) => warn!("Failed to write tasks file: {}", e),
        },
        Err(e) => warn!("Failed to serialize tasks: {}", e),
    }
}

/// Load tasks from disk
fn load_tasks_from_disk() -> HashMap<String, CompressionTask> {
    let path = match get_tasks_file_path() {
        Ok(p) => p,
        Err(e) => {
            warn!("Could not determine tasks file path: {}", e);
            return HashMap::new();
        }
    };

    if !path.exists() {
        info!("No saved tasks file found");
        return HashMap::new();
    }

    match fs::read_to_string(&path) {
        Ok(json) => match serde_json::from_str::<Vec<CompressionTask>>(&json) {
            Ok(tasks) => {
                let map: HashMap<_, _> = tasks.into_iter().map(|t| (t.id.clone(), t)).collect();
                info!("Loaded {} tasks from disk", map.len());
                map
            }
            Err(e) => {
                warn!("Failed to deserialize tasks: {}", e);
                HashMap::new()
            }
        },
        Err(e) => {
            warn!("Failed to read tasks file: {}", e);
            HashMap::new()
        }
    }
}

// ============================================================================
// Task Management
// ============================================================================

/// Enforce max tasks limit by removing oldest completed tasks
fn enforce_max_tasks(store: &mut TaskStoreInner) {
    if store.tasks.len() <= MAX_TASKS {
        return;
    }

    let mut completed_ids: Vec<_> = store
        .tasks
        .iter()
        .filter(|(_, task)| task.status == status::COMPLETED)
        .map(|(id, _)| id.clone())
        .collect();

    if completed_ids.is_empty() {
        return;
    }

    completed_ids.sort();

    for id in completed_ids {
        if store.tasks.len() <= MAX_TASKS_THRESHOLD {
            break;
        }

        if store.tasks.remove(&id).is_some() {
            if let Some(app_handle) = &store.app_handle {
                emit_deleted_task_event(app_handle, &id);
            }
            info!("Removed completed task {} due to max tasks limit", id);
        }
    }
}

/// Emit task deleted event
fn emit_deleted_task_event(app_handle: &AppHandle, task_id: &str) {
    if let Err(e) = app_handle.emit(
        "task:deleted",
        TaskEvent {
            id: task_id.to_string(),
            status: status::DELETED.to_string(),
            progress: 0,
            compressed_size: None,
            filename: None,
            original_size: None,
        },
    ) {
        error!("Failed to emit task:deleted event: {:?}", e);
    }
}

// ============================================================================
// Tauri Commands
// ============================================================================

#[tauri::command]
fn get_compression_status(tasks: tauri::State<'_, TaskStore>) -> Vec<CompressionTask> {
    let store = safe_lock(&tasks);
    let mut results: Vec<_> = store.tasks.values().cloned().collect();
    results.sort_by(|a, b| b.id.cmp(&a.id));
    results
}

#[tauri::command]
fn clear_completed(tasks: tauri::State<'_, TaskStore>) {
    let mut store = safe_lock(&tasks);
    let app_handle = store.app_handle.clone();

    let completed_ids: Vec<_> = store
        .tasks
        .iter()
        .filter(|(_, task)| task.status == status::COMPLETED)
        .map(|(id, _)| id.clone())
        .collect();

    let count = completed_ids.len();
    for id in completed_ids {
        store.tasks.remove(&id);
        if let Some(ref app_handle) = app_handle {
            emit_deleted_task_event(app_handle, &id);
        }
    }

    if count > 0 {
        info!("Cleared {} completed tasks", count);
    }
}

#[tauri::command]
fn delete_originals(tasks: tauri::State<'_, TaskStore>) -> Result<(), String> {
    let mut store = safe_lock(&tasks);
    let app_handle = store.app_handle.clone();

    let tasks_to_delete: Vec<_> = store
        .tasks
        .iter()
        .filter(|(_, task)| task.status == status::COMPLETED)
        .map(|(id, task)| (id.clone(), task.original_path.clone()))
        .collect();

    for (id, original_path) in tasks_to_delete {
        let path = PathBuf::from(&original_path);
        if path.exists() {
            if let Err(e) = fs::remove_file(&path) {
                error!("Failed to delete original file {:?}: {}", path, e);
            } else {
                info!("Deleted original file: {:?}", path);
            }
        }

        store.tasks.remove(&id);
        if let Some(ref app_handle) = app_handle {
            emit_deleted_task_event(app_handle, &id);
        }
    }

    Ok(())
}

#[tauri::command]
fn delete_task(tasks: tauri::State<'_, TaskStore>, id: String) -> Result<(), String> {
    let mut store = safe_lock(&tasks);

    if store.tasks.remove(&id).is_some() {
        if let Some(ref app_handle) = store.app_handle {
            emit_deleted_task_event(app_handle, &id);
        }
        info!("Deleted task: {}", id);
        Ok(())
    } else {
        Err(format!("Task not found: {}", id))
    }
}

#[tauri::command]
fn set_quality(settings: tauri::State<'_, SettingsStore>, quality: u8) {
    let mut s = safe_lock(&settings);
    s.quality = quality;
    info!("Quality updated to: {}", quality);
}

#[tauri::command]
fn get_settings(settings: tauri::State<'_, SettingsStore>) -> GlobalSettings {
    safe_lock(&settings).clone()
}

#[tauri::command]
async fn add_directory(
    settings: tauri::State<'_, SettingsStore>,
    watcher_handle: tauri::State<'_, WatcherHandle>,
) -> Result<GlobalSettings, String> {
    let folder = rfd::AsyncFileDialog::new()
        .set_title("Select Folder to Watch")
        .pick_folder()
        .await
        .ok_or("No folder selected")?;

    let path_buf = folder.path().to_path_buf();
    let mut s = safe_lock(&settings);

    if !s.watched_folders.contains(&path_buf) {
        s.watched_folders.push(path_buf.clone());
        let mut watcher = safe_lock(&watcher_handle.0);
        watcher
            .watch(&path_buf, RecursiveMode::NonRecursive)
            .map_err(|e| e.to_string())?;
        info!("Added directory to watch: {:?}", path_buf);
    }

    Ok(s.clone())
}

#[tauri::command]
fn remove_directory(
    settings: tauri::State<'_, SettingsStore>,
    watcher_handle: tauri::State<'_, WatcherHandle>,
    path: String,
) -> Result<GlobalSettings, String> {
    let path_buf = PathBuf::from(path);
    let mut s = safe_lock(&settings);

    if let Some(pos) = s.watched_folders.iter().position(|p| p == &path_buf) {
        s.watched_folders.remove(pos);
        let mut watcher = safe_lock(&watcher_handle.0);
        let _ = watcher.unwatch(&path_buf);
        info!("Removed directory from watch: {:?}", path_buf);
    }

    Ok(s.clone())
}

#[tauri::command]
async fn recompress_file(
    app_handle: AppHandle,
    tasks: tauri::State<'_, TaskStore>,
    settings: tauri::State<'_, SettingsStore>,
    original_task_id: String,
) -> Result<(), String> {
    // Get original task and validate
    let (original_path, existing_compressed_path) = {
        let store = safe_lock(&tasks);
        let task = store.tasks.get(&original_task_id).ok_or("Task not found")?;
        (task.original_path.clone(), task.compressed_path.clone())
    };

    let path = PathBuf::from(&original_path);
    if !path.exists() {
        return Err("File does not exist".into());
    }

    // Check if file is already being processed
    {
        let store = safe_lock(&tasks);
        let is_processing = store.tasks.values().any(|task| {
            task.original_path == original_path
                && matches!(
                    task.status.as_str(),
                    status::PENDING | status::COMPRESSING | status::RECONVERTING
                )
        });
        if is_processing {
            return Err("File is already being processed".into());
        }
    }

    let quality = safe_lock(&settings).quality;
    info!("Recompress: using quality {} from settings", quality);

    // Determine output path
    let output_path = existing_compressed_path
        .map(PathBuf::from)
        .unwrap_or_else(|| generate_output_path(&path));

    // Update task to reconverting status
    {
        let mut store = safe_lock(&tasks);
        let app_handle_opt = store.app_handle.clone();

        if let Some(task) = store.tasks.get_mut(&original_task_id) {
            task.status = status::RECONVERTING.to_string();
            task.progress = 0;
            task.error = None;
            task.quality = quality;
            task.compressed_path = Some(output_path.to_string_lossy().to_string());

            if let Some(ref app_handle) = app_handle_opt {
                emit_task_event(app_handle, "task:status-changed", task);
            }
        }
    }

    // Perform compression
    let tasks_arc = Arc::clone(&*tasks);
    let task_id = original_task_id.clone();

    let compress_result = tokio::task::block_in_place(|| {
        compress_image_with_progress(&app_handle, &path, &output_path, quality, move |progress| {
            let mut store = safe_lock(&tasks_arc);
            let app_handle_opt = store.app_handle.clone();

            if let Some(task) = store.tasks.get_mut(&task_id) {
                task.progress = progress;
                if let Some(ref app_handle) = app_handle_opt {
                    emit_task_event(app_handle, "task:status-changed", task);
                }
            }
        })
    });

    // Update final status
    {
        let mut store = safe_lock(&tasks);
        let app_handle_opt = store.app_handle.clone();

        if let Some(task) = store.tasks.get_mut(&original_task_id) {
            match compress_result {
                Ok(compressed_size) => {
                    task.compressed_size = Some(compressed_size);
                    task.progress = 100;
                    task.status = status::COMPLETED.to_string();
                    info!(
                        "Recompressed {}: {} → {}",
                        task.filename, task.original_size, compressed_size
                    );
                }
                Err(e) => {
                    task.status = status::ERROR.to_string();
                    task.error = Some(e.to_string());
                    error!("Recompression failed for {}: {}", task.filename, e);
                }
            }

            if let Some(ref app_handle) = app_handle_opt {
                emit_task_event(app_handle, "task:status-changed", task);
            }
        }
    }

    Ok(())
}

// ============================================================================
// File Watching & Processing
// ============================================================================

/// Create file system watcher
fn create_watcher(
    watch_dir: &Path,
) -> (
    WatcherHandle,
    std::sync::mpsc::Receiver<Result<Event, notify::Error>>,
) {
    let (tx, rx) = std::sync::mpsc::channel();
    let mut watcher = notify::recommended_watcher(move |res| {
        let _ = tx.send(res);
    })
    .expect("Failed to create watcher");

    watcher
        .watch(watch_dir, RecursiveMode::NonRecursive)
        .expect("Failed to watch directory");

    info!("Watcher initialized for: {:?}", watch_dir);

    (WatcherHandle(Arc::new(Mutex::new(watcher))), rx)
}

/// Run file watcher loop
async fn run_watcher_loop(
    rx: std::sync::mpsc::Receiver<Result<Event, notify::Error>>,
    tasks: TaskStore,
    settings: SettingsStore,
    app_handle: AppHandle,
) {
    let processed_files = Arc::new(Mutex::new(HashMap::new()));

    // Spawn cleanup tasks
    spawn_cleanup_tasks(tasks.clone(), processed_files.clone());

    // Main event loop
    loop {
        match rx.recv() {
            Ok(Ok(event)) => {
                handle_fs_event(
                    event,
                    tasks.clone(),
                    settings.clone(),
                    app_handle.clone(),
                    processed_files.clone(),
                )
                .await;
            }
            Ok(Err(e)) => {
                error!("File watcher error: {:?}", e);
            }
            Err(_) => {
                error!("File watcher channel disconnected");
                tokio::time::sleep(Duration::from_secs(1)).await;
            }
        }
    }
}

/// Handle file system events
async fn handle_fs_event(
    event: Event,
    tasks: TaskStore,
    settings: SettingsStore,
    app_handle: AppHandle,
    processed_files: ProcessedFiles,
) {
    info!("File system event: {:?} - {:?}", event.kind, event.paths);

    if !matches!(event.kind, EventKind::Create(_) | EventKind::Modify(_)) {
        return;
    }

    for path in event.paths {
        if !is_image_file(&path) {
            continue;
        }

        info!("Image file detected: {:?}", path);

        let should_process = {
            let mut processed = safe_lock(&processed_files);
            let now = SystemTime::now();
            let process = processed
                .get(&path)
                .map(|last_time| {
                    now.duration_since(*last_time).unwrap_or_default().as_secs()
                        > PROCESSED_FILES_MAX_AGE_SECS
                })
                .unwrap_or(true);

            if process {
                processed.insert(path.clone(), now);
            }
            process
        };

        if should_process {
            info!("Processing image: {:?}", path);
            handle_new_image(path, tasks.clone(), settings.clone(), app_handle.clone()).await;
        }
    }
}

/// Handle new image file
async fn handle_new_image(
    path: PathBuf,
    tasks: TaskStore,
    settings: SettingsStore,
    app_handle: AppHandle,
) {
    info!("New image detected: {:?}", path);

    // Wait for file to be fully written
    tokio::time::sleep(Duration::from_millis(FILE_WRITE_DELAY_MS)).await;

    let filename = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "unknown".to_string());

    let quality = safe_lock(&settings).quality;

    let original_size = match fs::metadata(&path) {
        Ok(m) => m.len(),
        Err(e) => {
            error!("Failed to get file metadata: {}", e);
            return;
        }
    };

    let task = {
        let mut store = safe_lock(&tasks);
        let id = generate_unique_task_id(&store);

        let task = CompressionTask {
            id: id.clone(),
            filename: filename.clone(),
            original_path: path.to_string_lossy().to_string(),
            compressed_path: None,
            status: status::PENDING.to_string(),
            original_size,
            compressed_size: None,
            progress: 0,
            error: None,
            quality,
        };

        store.tasks.insert(id.clone(), task.clone());
        enforce_max_tasks(&mut store);

        if let Some(ref app_handle) = store.app_handle {
            if let Err(e) = app_handle.emit("task:created", &task) {
                error!("Failed to emit task:created event: {:?}", e);
            }
        }

        task
    };

    info!("Added task for: {}", filename);

    // Spawn compression task
    let tasks_clone = tasks.clone();
    let app_handle_clone = app_handle.clone();
    tokio::task::spawn_blocking(move || {
        compress_task(path, task.id, tasks_clone, app_handle_clone);
    });
}

/// Compress image task
fn compress_task(path: PathBuf, id: String, tasks: TaskStore, app_handle: AppHandle) {
    info!("Starting compression for: {:?}", path);

    // Get task data and update status
    let (quality, output_path) = {
        let mut store = safe_lock(&tasks);
        let app_handle_opt = store.app_handle.clone();

        let Some(task) = store.tasks.get_mut(&id) else {
            warn!("Task {} disappeared before compression started", id);
            return;
        };

        task.status = status::COMPRESSING.to_string();
        let quality = task.quality;
        let output_path = generate_output_path(&path);

        if let Some(ref app_handle) = app_handle_opt {
            emit_task_event(app_handle, "task:status-changed", task);
        }

        (quality, output_path)
    };

    // Validate input file exists
    if !path.exists() {
        update_task_error(
            &tasks,
            &id,
            "Input file was deleted before compression could start",
        );
        return;
    }

    // Check output collision
    if output_path.exists() {
        update_task_error(
            &tasks,
            &id,
            &format!("Compressed file already exists: {:?}", output_path),
        );
        return;
    }

    // Perform compression with progress
    let tasks_clone = tasks.clone();
    let id_clone = id.clone();

    let compress_result =
        compress_image_with_progress(&app_handle, &path, &output_path, quality, move |progress| {
            let mut store = safe_lock(&tasks_clone);
            let app_handle_opt = store.app_handle.clone();

            if let Some(task) = store.tasks.get_mut(&id_clone) {
                task.progress = progress;
                if let Some(ref app_handle) = app_handle_opt {
                    emit_task_event(app_handle, "task:status-changed", task);
                }
            }
        });

    // Update final status
    let mut store = safe_lock(&tasks);
    let app_handle_opt = store.app_handle.clone();

    let Some(task) = store.tasks.get_mut(&id) else {
        warn!("Task {} disappeared during compression", id);
        return;
    };

    match compress_result {
        Ok(new_size) => {
            task.status = status::COMPLETED.to_string();
            task.compressed_size = Some(new_size);
            task.compressed_path = Some(output_path.to_string_lossy().to_string());
            task.progress = 100;
            info!(
                "Compressed {}: {} -> {}",
                task.filename, task.original_size, new_size
            );
        }
        Err(e) => {
            task.status = status::ERROR.to_string();
            task.error = Some(e.to_string());
            error!("Failed to compress {}: {}", task.filename, e);
        }
    }

    if let Some(ref app_handle) = app_handle_opt {
        emit_task_event(app_handle, "task:status-changed", task);
    }
}

/// Update task with error status
fn update_task_error(tasks: &TaskStore, id: &str, error_msg: &str) {
    let mut store = safe_lock(tasks);
    let app_handle_opt = store.app_handle.clone();

    if let Some(task) = store.tasks.get_mut(id) {
        task.status = status::ERROR.to_string();
        task.error = Some(error_msg.to_string());
        error!("Error for task {}: {}", task.filename, error_msg);

        if let Some(ref app_handle) = app_handle_opt {
            emit_task_event(app_handle, "task:status-changed", task);
        }
    }
}

// ============================================================================
// Cleanup Tasks
// ============================================================================

/// Spawn background cleanup tasks
fn spawn_cleanup_tasks(tasks: TaskStore, processed_files: ProcessedFiles) {
    // Periodic task cleanup
    let tasks_for_cleanup = tasks.clone();
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_secs(CLEANUP_INTERVAL_SECS)).await;
            let mut store = safe_lock(&tasks_for_cleanup);
            let completed_ids: Vec<_> = store
                .tasks
                .iter()
                .filter(|(_, task)| task.status == status::COMPLETED)
                .map(|(id, _)| id.clone())
                .collect();

            for id in completed_ids {
                store.tasks.remove(&id);
                info!("Auto-cleanup: removed completed task {}", id);
            }
        }
    });

    // Processed files cleanup
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_secs(PROCESSED_FILES_CLEANUP_INTERVAL_SECS)).await;
            let mut processed = safe_lock(&processed_files);
            let now = SystemTime::now();
            let stale_files: Vec<_> = processed
                .iter()
                .filter_map(|(path, last_time)| {
                    let age = now.duration_since(*last_time).unwrap_or_default().as_secs();
                    if age > PROCESSED_FILES_MAX_AGE_SECS {
                        Some(path.clone())
                    } else {
                        None
                    }
                })
                .collect();

            for path in stale_files {
                processed.remove(&path);
            }

            if !processed.is_empty() {
                info!("Processed files cache: {} entries", processed.len());
            }
        }
    });
}

// ============================================================================
// Application Entry Point
// ============================================================================

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::Builder::from_default_env()
        .filter_level(log::LevelFilter::Info)
        .init();

    let downloads_dir = get_downloads_dir();
    let settings: SettingsStore = Arc::new(Mutex::new(GlobalSettings {
        quality: DEFAULT_QUALITY,
        watched_folders: vec![downloads_dir.clone()],
    }));
    let settings_clone = settings.clone();

    let (watcher_handle, rx) = create_watcher(&downloads_dir);

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .setup(move |app| {
            let app_handle = app.handle().clone();
            let persisted_tasks = load_tasks_from_disk();

            let tasks: TaskStore = Arc::new(Mutex::new(TaskStoreInner {
                tasks: persisted_tasks,
                app_handle: Some(app_handle.clone()),
            }));

            app.manage(tasks.clone());

            // Spawn periodic save task
            let tasks_for_save = tasks.clone();
            tauri::async_runtime::spawn(async move {
                loop {
                    tokio::time::sleep(Duration::from_secs(TASK_SAVE_INTERVAL_SECS)).await;
                    let store = safe_lock(&tasks_for_save);
                    save_tasks_to_disk(&store.tasks);
                }
            });

            // Spawn watcher loop
            tauri::async_runtime::spawn(run_watcher_loop(
                rx,
                tasks,
                settings_clone,
                app_handle.clone(),
            ));

            // Create system tray
            setup_system_tray(app)?;

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

/// Setup system tray
fn setup_system_tray(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let toggle_item =
        tauri::menu::MenuItem::with_id(app, "toggle", "Show/Hide", true, None::<&str>)?;
    let quit_item = tauri::menu::MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

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
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;

    // Set window icon
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_icon(app.default_window_icon().unwrap().clone());
    }

    Ok(())
}
