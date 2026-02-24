use crate::compression::{compressed_output_path, CompressionRecord, ImageFormat, Vips};
use log::{error, info};
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{Emitter, Manager};

#[derive(Clone, serde::Serialize)]
struct CompressionRetry {
    path: String,
    attempt: u8,
    original_quality: u8,
    retry_quality: u8,
    initial_size: u64,
    compressed_size: u64,
}

pub fn process_file(
    app: &tauri::AppHandle,
    vips: &Arc<Vips>,
    path: &Path,
) -> Result<CompressionRecord, String> {
    let format = ImageFormat::from_path(path).ok_or_else(|| "Unsupported format".to_string())?;
    let output = compressed_output_path(path).ok_or_else(|| "Invalid output path".to_string())?;

    // Wait for the file to be fully written (useful for downloads)
    if let Err(e) = wait_for_file_stability(path) {
        error!(
            "[processor] File stability check failed for {}: {}",
            path.display(),
            e
        );
    }

    let initial_size = std::fs::metadata(path).map(|m| m.len()).unwrap_or(0);
    let original_quality = app
        .state::<Mutex<crate::config::ConfigManager>>()
        .lock()
        .map(|c| c.config.quality)
        .unwrap_or(crate::DEFAULT_QUALITY);

    let mut current_quality = original_quality;
    let mut compressed_size = 0u64;
    let mut success = false;
    const MAX_RETRIES: u8 = 5;
    const QUALITY_STEP: u8 = 10;

    for attempt in 0..=MAX_RETRIES {
        match vips.compress(path, &output, current_quality) {
            Ok(size) => {
                compressed_size = size;
                if size <= initial_size || current_quality >= 100 {
                    success = true;
                    break;
                }

                // Compressed file is larger — notify and retry
                let retry_quality = (current_quality + QUALITY_STEP).min(100);
                info!(
                    "[compression] Compressed size ({size}) > original ({initial_size}), retrying with quality {retry_quality} (attempt {})",
                    attempt + 1
                );

                let _ = app.emit(
                    "compression-retry",
                    &CompressionRetry {
                        path: path.display().to_string(),
                        attempt: attempt + 1,
                        original_quality,
                        retry_quality,
                        initial_size,
                        compressed_size: size,
                    },
                );

                current_quality = retry_quality;
                if current_quality >= 100 {
                    continue;
                }
            }
            Err(e) => {
                return Err(format!("Failed to compress {}: {e}", path.display()));
            }
        }
    }

    if success {
        let record = CompressionRecord {
            initial_path: path.display().to_string(),
            final_path: output.display().to_string(),
            initial_size,
            compressed_size,
            initial_format: format.to_string(),
            final_format: format.to_string(),
            quality: current_quality,
            timestamp: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs(),
            original_deleted: false,
        };

        // Log it
        let log = app.state::<Mutex<crate::log::CompressionLog>>();
        if let Ok(mut log) = log.lock() {
            log.append(record.clone());
        }

        // Notify frontend
        let _ = app.emit("compression-complete", &record);

        // System Notification
        let config = app.state::<Mutex<crate::config::ConfigManager>>();
        let show_system_notif = if let Ok(c) = config.lock() {
            c.config.show_system_notifications
        } else {
            true
        };

        if show_system_notif {
            use tauri_plugin_notification::NotificationExt;
            let file_name = path.file_name().and_then(|s| s.to_str()).unwrap_or("image");

            let _ = app
                .notification()
                .builder()
                .title("Image Compressed")
                .body(format!(
                    "{} compressed to {} (saved {}%)",
                    file_name,
                    format_bytes(record.compressed_size),
                    ((record.initial_size - record.compressed_size) as f64
                        / record.initial_size as f64
                        * 100.0)
                        .round()
                ))
                .show();
        }

        Ok(record)
    } else {
        Err("Failed to compress file after retries".to_string())
    }
}

fn format_bytes(bytes: u64) -> String {
    let kb = bytes as f64 / 1024.0;
    if kb < 1024.0 {
        return format!("{:.1} KB", kb);
    }
    let mb = kb / 1024.0;
    format!("{:.1} MB", mb)
}

fn wait_for_file_stability(path: &Path) -> Result<(), String> {
    let mut last_size = 0;
    let mut stable_count = 0;
    const POLLING_INTERVAL: std::time::Duration = std::time::Duration::from_millis(100);
    const STABLE_THRESHOLD: u32 = 3; // Must be stable for 300ms
    const MAX_WAIT: std::time::Duration = std::time::Duration::from_secs(5);

    let start = std::time::Instant::now();

    while start.elapsed() < MAX_WAIT {
        let current_size = std::fs::metadata(path).map(|m| m.len()).unwrap_or(0);
        if current_size > 0 && current_size == last_size {
            stable_count += 1;
            if stable_count >= STABLE_THRESHOLD {
                return Ok(());
            }
        } else {
            last_size = current_size;
            stable_count = 0;
        }
        std::thread::sleep(POLLING_INTERVAL);
    }

    if last_size > 0 {
        Ok(()) // We waited long enough, try anyway
    } else {
        Err("File never appeared or remained empty".to_string())
    }
}
