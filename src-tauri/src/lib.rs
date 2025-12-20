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
    pub status: String, // "pending", "compressing", "completed", "error"
    pub original_size: u64,
    pub compressed_size: Option<u64>,
    pub progress: u32,
    pub error: Option<String>,
}

type TaskStore = Arc<Mutex<HashMap<String, CompressionTask>>>;

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
async fn test_compression(tasks: tauri::State<'_, TaskStore>) -> Result<String, String> {
    // Create a test image file in Downloads
    let downloads_dir = get_downloads_dir();
    let test_path = downloads_dir.join("test_image.jpg");
    
    // Create a simple test image (1x1 pixel JPEG)
    let img = image::RgbImage::new(1, 1);
    let mut buffer = Vec::new();
    let mut encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut buffer, 75);
    encoder.encode_image(&img).map_err(|e| e.to_string())?;
    std::fs::write(&test_path, &buffer).map_err(|e| e.to_string())?;
    
    info!("Created test image: {:?}", test_path);
    
    // Trigger compression
    handle_new_image(test_path, tasks.inner().clone()).await;
    
    Ok("Test compression started".to_string())
}

fn get_downloads_dir() -> PathBuf {
    let home = dirs::home_dir().expect("Could not find home directory");
    let downloads_dir = home.join("Downloads");
    info!("Downloads directory resolved to: {:?}", downloads_dir);
    downloads_dir
}

async fn watch_downloads(tasks: TaskStore) {
    let downloads_dir = get_downloads_dir();
    info!("Downloads directory: {:?}", downloads_dir);

    if !downloads_dir.exists() {
        error!("Downloads directory does not exist: {:?}", downloads_dir);
        return;
    }

    let processed_files: ProcessedFiles = Arc::new(Mutex::new(HashMap::new()));
    let (tx, rx) = std::sync::mpsc::channel();
    let mut watcher = notify::recommended_watcher(move |res: Result<Event, _>| {
        let _ = tx.send(res);
    })
    .expect("Failed to create watcher");

    watcher
        .watch(&downloads_dir, RecursiveMode::NonRecursive)
        .expect("Failed to watch downloads directory");

    info!(
        "Started watching Downloads directory: {}",
        downloads_dir.display()
    );

    while let Ok(res) = rx.recv() {
        if let Ok(event) = res {
            info!("File system event: {:?} - {:?}", event.kind, event.paths);
            match event.kind {
                EventKind::Create(_) | EventKind::Modify(_) => {
                    for path in event.paths {
                        info!("Checking file: {:?}", path);
                        if is_image_file(&path) {
                            info!("Image file detected: {:?}", path);
                            // Check if we've already processed this file recently (within 5 seconds)
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
                            }; // Lock is dropped here

                            if should_process {
                                info!("Processing new image: {:?}", path);
                                handle_new_image(path, tasks.clone()).await;
                            } else {
                                info!("Skipping recently processed file: {:?}", path);
                            }
                        } else {
                            info!("Not an image file: {:?}", path);
                        }
                    }
                }
                _ => {
                    info!("Ignoring event kind: {:?}", event.kind);
                }
            }
        }
    }
}

async fn handle_new_image(path: PathBuf, tasks: TaskStore) {
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
    info!("Spawning compression task for: {}", filename);
    tokio::task::spawn_blocking(move || {
        info!("Compression task spawned and executing");
        compress_task(path, id, tasks_clone);
    });
    info!("Spawn call completed");
}

fn compress_task(path: PathBuf, id: String, tasks: TaskStore) {
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

    match compress_image(&path, &output_path) {
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

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(tasks)
        .setup(|app| {
            tauri::async_runtime::spawn(watch_downloads(tasks_clone));

            // Create system tray
            let toggle_item =
                tauri::menu::MenuItem::with_id(app, "toggle", "Show/Hide", true, None::<&str>)?;
            let quit_item =
                tauri::menu::MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

            let tray_menu = tauri::menu::MenuBuilder::new(app)
                .items(&[&toggle_item, &quit_item])
                .build()?;

            let _tray = tauri::tray::TrayIconBuilder::new()
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

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_compression_status,
            clear_completed,
            test_compression
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
