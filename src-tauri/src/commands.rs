use crate::compression::{compressed_output_path, CompressionRecord, ImageFormat};
use crate::watcher::VipsState;
use log::{error, info};
use notify::Watcher;
use std::path::Path;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{Emitter, Manager};

#[tauri::command]
pub fn set_quality(
    value: u8,
    config: tauri::State<'_, Mutex<crate::config::ConfigManager>>,
) -> Result<u8, String> {
    let clamped = value.clamp(1, 100);
    let mut config_manager = config.lock().map_err(|e| e.to_string())?;

    let previous = config_manager.config.quality;
    config_manager.set_quality(clamped);
    info!("[compression] Quality changed: {previous} → {clamped}");
    Ok(clamped)
}

#[tauri::command]
pub fn get_quality(
    config: tauri::State<'_, Mutex<crate::config::ConfigManager>>,
) -> Result<u8, String> {
    let config_manager = config.lock().map_err(|e| e.to_string())?;
    Ok(config_manager.config.quality)
}

#[tauri::command]
pub fn get_compression_history(
    log: tauri::State<'_, Mutex<crate::log::CompressionLog>>,
) -> Vec<CompressionRecord> {
    log.lock().map(|l| l.records.clone()).unwrap_or_default()
}

#[tauri::command]
pub fn clear_compression_history(log: tauri::State<'_, Mutex<crate::log::CompressionLog>>) {
    if let Ok(mut log) = log.lock() {
        log.clear();
    }
}

#[tauri::command]
pub fn delete_original_images(
    log: tauri::State<'_, Mutex<crate::log::CompressionLog>>,
) -> Result<u32, String> {
    let mut log = log.lock().map_err(|e| e.to_string())?;

    let mut deleted = 0u32;
    for record in log.records.iter_mut() {
        if record.original_deleted {
            continue;
        }
        let path = Path::new(&record.initial_path);
        if path.exists() {
            if let Err(e) = std::fs::remove_file(path) {
                error!("[cleanup] Failed to delete {}: {e}", record.initial_path);
            } else {
                info!("[cleanup] Deleted original: {}", record.initial_path);
                deleted += 1;
            }
        }
        record.original_deleted = true;
    }
    let _ = log.save();
    Ok(deleted)
}

#[tauri::command]
pub fn recompress(
    path: String,
    previous_quality: u8,
    app: tauri::AppHandle,
    vips_state: tauri::State<'_, VipsState>,
) -> Result<(), String> {
    let vips = vips_state
        .inner()
        .vips
        .as_ref()
        .ok_or("libvips not available")?;
    let input = Path::new(&path);

    let format =
        ImageFormat::from_path(input).ok_or_else(|| "Unsupported image format".to_string())?;
    let output = compressed_output_path(input)
        .ok_or_else(|| "Could not determine output path".to_string())?;
    let initial_size = std::fs::metadata(input)
        .map(|m| m.len())
        .map_err(|e| e.to_string())?;

    let quality: u8 = previous_quality.saturating_add(10).min(100);
    let compressed_size = vips
        .compress(input, &output, quality)
        .map_err(|e| e.to_string())?;

    let record = CompressionRecord {
        initial_path: path.clone(),
        final_path: output.display().to_string(),
        initial_size,
        compressed_size,
        initial_format: format.to_string(),
        final_format: format.to_string(),
        quality,
        timestamp: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs(),
        original_deleted: false,
    };

    info!(
        "[compression] Recompressed {} → {} ({} → {} bytes, quality={})",
        record.initial_path,
        record.final_path,
        record.initial_size,
        record.compressed_size,
        quality
    );

    let _ = app.emit("compression-complete", &record);
    let log = app.state::<Mutex<crate::log::CompressionLog>>();
    if let Ok(mut log) = log.lock() {
        log.append(record);
    }

    Ok(())
}

#[tauri::command]
pub async fn compress_files(
    paths: Vec<String>,
    app: tauri::AppHandle,
    vips_state: tauri::State<'_, VipsState>,
) -> Result<(), String> {
    let vips = vips_state
        .inner()
        .vips
        .as_ref()
        .ok_or("libvips not available")?;

    for path_str in paths {
        let path = Path::new(&path_str);
        if let Err(e) = crate::processor::process_file(&app, vips, path) {
            error!(
                "[manual-compression] Failed to compress {}: {}",
                path_str, e
            );
        }
    }

    Ok(())
}

#[tauri::command]
pub fn get_watched_folders(
    config: tauri::State<'_, Mutex<crate::config::ConfigManager>>,
) -> Result<Vec<String>, String> {
    let config_manager = config.lock().map_err(|e| e.to_string())?;
    Ok(config_manager.config.watched_folders.clone())
}

#[tauri::command]
pub fn add_watched_folder(
    path: String,
    config: tauri::State<'_, Mutex<crate::config::ConfigManager>>,
    watcher_state: tauri::State<'_, crate::watcher::WatcherHandle>,
) -> Result<Vec<String>, String> {
    let mut config_manager = config.lock().map_err(|e| e.to_string())?;

    let p = Path::new(&path);
    if !p.exists() || !p.is_dir() {
        return Err("Path does not exist or is not a directory".to_string());
    }

    let mut watcher = watcher_state.watcher.lock().map_err(|e| e.to_string())?;

    if let Some(ref mut w) = *watcher {
        w.watch(p, notify::RecursiveMode::NonRecursive)
            .map_err(|e| format!("Failed to watch directory: {}", e))?;
    } else {
        return Err("File watcher is not initialized".to_string());
    }

    config_manager.add_folder(path.clone());

    Ok(config_manager.config.watched_folders.clone())
}

#[tauri::command]
pub fn remove_watched_folder(
    path: String,
    config: tauri::State<'_, Mutex<crate::config::ConfigManager>>,
    watcher_state: tauri::State<'_, crate::watcher::WatcherHandle>,
) -> Result<Vec<String>, String> {
    let mut config_manager = config.lock().map_err(|e| e.to_string())?;

    let mut watcher = watcher_state.watcher.lock().map_err(|e| e.to_string())?;

    if let Some(ref mut w) = *watcher {
        let _ = w.unwatch(Path::new(&path));
    }

    config_manager.remove_folder(&path);

    Ok(config_manager.config.watched_folders.clone())
}

#[tauri::command]
pub async fn search_directories(query: String) -> Vec<String> {
    if query.is_empty() {
        let mut common = Vec::new();
        if let Some(h) = dirs::home_dir() {
            common.push(h.display().to_string());
        }
        if let Some(d) = dirs::download_dir() {
            common.push(d.display().to_string());
        }
        if let Some(d) = dirs::document_dir() {
            common.push(d.display().to_string());
        }
        if let Some(p) = dirs::picture_dir() {
            common.push(p.display().to_string());
        }
        if let Some(d) = dirs::desktop_dir() {
            common.push(d.display().to_string());
        }
        return common;
    }

    let path = Path::new(&query);

    // Determine the directory to search in and the prefix to match
    let (search_dir, prefix) = if query.ends_with('/') || query.ends_with('\\') {
        (path, "")
    } else if let Some(parent) = path.parent() {
        let p_str = parent.as_os_str().to_string_lossy();
        if p_str.is_empty() {
            // If no parent, we might be looking at a relative path in current dir
            // or just starting a path. On Unix, empty parent usually means relative.
            if query.starts_with('/') {
                (Path::new("/"), &query[1..])
            } else {
                (Path::new("."), query.as_str())
            }
        } else {
            (
                parent,
                path.file_name().and_then(|s| s.to_str()).unwrap_or(""),
            )
        }
    } else {
        (Path::new("/"), query.as_str())
    };

    let mut results = Vec::new();

    // If the path itself is a directory, include it as the first result
    if path.is_dir() && !results.contains(&path.display().to_string()) {
        results.push(path.display().to_string());
    }

    if let Ok(entries) = std::fs::read_dir(search_dir) {
        for entry in entries.flatten() {
            if let Ok(file_type) = entry.file_type() {
                if file_type.is_dir() {
                    let name = entry.file_name().to_string_lossy().to_string();
                    if name.to_lowercase().starts_with(&prefix.to_lowercase()) {
                        let full_path = entry.path().display().to_string();
                        if !results.contains(&full_path) {
                            results.push(full_path);
                        }
                    }
                }
            }
            if results.len() >= 5 {
                break;
            }
        }
    }
    results
}
