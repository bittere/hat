use crate::compression::{compressed_output_path, CompressionRecord, ImageFormat};
use crate::log::COMPRESSION_LOG;
use crate::watcher::VipsState;
use crate::QUALITY;
use std::path::Path;
use std::sync::atomic::Ordering;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Emitter;

#[tauri::command]
pub fn set_quality(value: u8) -> u8 {
    let clamped = value.clamp(1, 100);
    let previous = QUALITY.swap(clamped, Ordering::Relaxed);
    println!("[compression] Quality changed: {previous} → {clamped}");
    clamped
}

#[tauri::command]
pub fn get_quality() -> u8 {
    QUALITY.load(Ordering::Relaxed)
}

#[tauri::command]
pub fn get_compression_history() -> Vec<CompressionRecord> {
    COMPRESSION_LOG
        .get()
        .and_then(|m| m.lock().ok())
        .map(|log| log.records.clone())
        .unwrap_or_default()
}

#[tauri::command]
pub fn clear_compression_history() {
    if let Some(log) = COMPRESSION_LOG.get() {
        if let Ok(mut log) = log.lock() {
            log.clear();
        }
    }
}

#[tauri::command]
pub fn delete_original_images() -> Result<u32, String> {
    let log_mutex = COMPRESSION_LOG
        .get()
        .ok_or("compression log not initialized")?;
    let mut log = log_mutex.lock().map_err(|e| e.to_string())?;

    let mut deleted = 0u32;
    for record in log.records.iter_mut() {
        if record.original_deleted {
            continue;
        }
        let path = Path::new(&record.initial_path);
        if path.exists() {
            if let Err(e) = std::fs::remove_file(path) {
                eprintln!("[cleanup] Failed to delete {}: {e}", record.initial_path);
            } else {
                println!("[cleanup] Deleted original: {}", record.initial_path);
                deleted += 1;
            }
        }
        record.original_deleted = true;
    }
    log.save();
    Ok(deleted)
}

#[tauri::command]
pub fn recompress(
    path: String,
    previous_quality: u8,
    app: tauri::AppHandle,
    vips_state: tauri::State<'_, VipsState>,
) -> Result<(), String> {
    let vips = vips_state.0.as_ref().ok_or("libvips not available")?;
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

    println!(
        "[compression] Recompressed {} → {} ({} → {} bytes, quality={})",
        record.initial_path,
        record.final_path,
        record.initial_size,
        record.compressed_size,
        quality
    );

    let _ = app.emit("compression-complete", &record);
    if let Some(log) = COMPRESSION_LOG.get() {
        if let Ok(mut log) = log.lock() {
            log.append(record);
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn compress_files(
    paths: Vec<String>,
    app: tauri::AppHandle,
    vips_state: tauri::State<'_, VipsState>,
) -> Result<(), String> {
    let vips = vips_state.0.as_ref().ok_or("libvips not available")?;

    for path_str in paths {
        let path = Path::new(&path_str);
        if let Err(e) = crate::processor::process_file(&app, vips, path) {
            eprintln!(
                "[manual-compression] Failed to compress {}: {}",
                path_str, e
            );
        }
    }

    Ok(())
}
