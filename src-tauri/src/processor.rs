use crate::compression::{compressed_output_path, CompressionRecord, ImageFormat, Vips};
use crate::log::COMPRESSION_LOG;
use crate::QUALITY;
use std::path::Path;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Emitter;

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
    std::thread::sleep(std::time::Duration::from_millis(500));

    let initial_size = std::fs::metadata(path).map(|m| m.len()).unwrap_or(0);
    let original_quality = QUALITY.load(Ordering::Relaxed);
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
                println!(
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
        if let Some(log) = COMPRESSION_LOG.get() {
            if let Ok(mut log) = log.lock() {
                log.append(record.clone());
            }
        }

        // Notify frontend
        let _ = app.emit("compression-complete", &record);

        Ok(record)
    } else {
        Err("Failed to compress file after retries".to_string())
    }
}
