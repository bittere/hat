use image::ImageReader;
use log::{info, warn};
use oxipng::Options;
use std::fs;
use std::path::Path;
use tauri::AppHandle;

// Constants
const PNG_MIN_COLORS: f32 = 129.0;
const PNG_MAX_COLORS: f32 = 256.0;
const PNG_COLOR_RANGE: f32 = PNG_MAX_COLORS - PNG_MIN_COLORS;
const DEFAULT_PNG_COMPRESSION: u8 = 6;

// Custom error type for better error handling
#[derive(Debug)]
pub enum CompressionError {
    Io(std::io::Error),
    Image(image::ImageError),
    Vips(String),
    InvalidPath(String),
    UnsupportedFormat(String),
}

impl std::fmt::Display for CompressionError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Io(e) => write!(f, "IO error: {}", e),
            Self::Image(e) => write!(f, "Image processing error: {}", e),
            Self::Vips(e) => write!(f, "libvips error: {}", e),
            Self::InvalidPath(p) => write!(f, "Invalid path: {}", p),
            Self::UnsupportedFormat(fmt) => write!(f, "Unsupported format: {}", fmt),
        }
    }
}

impl std::error::Error for CompressionError {}

impl From<std::io::Error> for CompressionError {
    fn from(err: std::io::Error) -> Self {
        Self::Io(err)
    }
}

impl From<image::ImageError> for CompressionError {
    fn from(err: image::ImageError) -> Self {
        Self::Image(err)
    }
}

type Result<T> = std::result::Result<T, CompressionError>;

/// Compress image with progress callback.
/// Returns compressed file size in bytes.
pub fn compress_image_with_progress<F>(
    app_handle: &AppHandle,
    input: &Path,
    output: &Path,
    quality: u8,
    on_progress: F,
) -> Result<u64>
where
    F: Fn(u32) + Send + 'static,
{
    compress_image_with_compression_and_progress(
        app_handle,
        input,
        output,
        quality,
        None,
        on_progress,
    )
}

/// Enhanced compression with libvips optimization.
///
/// # Arguments
/// * `compression` - PNG compression level 0-9 (optional, only affects fallback)
pub fn compress_image_with_compression_and_progress<F>(
    app_handle: &AppHandle,
    input: &Path,
    output: &Path,
    quality: u8,
    compression: Option<u8>,
    on_progress: F,
) -> Result<u64>
where
    F: Fn(u32) + Send + 'static,
{
    on_progress(0);

    // Validate input
    if !input.exists() {
        return Err(CompressionError::InvalidPath(format!(
            "Input file does not exist: {}",
            input.display()
        )));
    }

    // Ensure output directory exists
    if let Some(parent) = output.parent() {
        fs::create_dir_all(parent)?;
    }

    on_progress(5);

    let size = compress_image_internal(
        app_handle,
        input,
        output,
        quality,
        compression,
        Some(&on_progress),
    )?;

    on_progress(100);
    Ok(size)
}

fn compress_image_internal<F>(
    app_handle: &AppHandle,
    input: &Path,
    output: &Path,
    quality: u8,
    compression: Option<u8>,
    on_progress: Option<&F>,
) -> Result<u64>
where
    F: Fn(u32),
{
    let ext = input
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_lowercase())
        .ok_or_else(|| {
            CompressionError::InvalidPath(format!("No file extension: {}", input.display()))
        })?;

    info!("Compressing {}: {:?}", ext, input);

    if let Some(cb) = on_progress {
        cb(10);
    }

    // Try libvips first, fall back to Rust if it fails
    let result = match ext.as_str() {
        "jpg" | "jpeg" | "jfif" => compress_with_fallback(
            || run_optimized_jpegsave(app_handle, input, output, quality),
            || compress_jpeg_fallback(input, output, quality),
            input,
            output,
        ),
        "png" => compress_with_fallback(
            || run_optimized_pngsave(app_handle, input, output, quality),
            || compress_png_fallback(input, output, compression),
            input,
            output,
        ),
        "webp" => compress_with_fallback(
            || run_optimized_webpsave(app_handle, input, output, quality),
            || compress_copy_fallback(input, output),
            input,
            output,
        ),
        "gif" => compress_with_fallback(
            || run_optimized_gifsave(app_handle, input, output),
            || compress_copy_fallback(input, output),
            input,
            output,
        ),
        "tiff" | "tif" => compress_with_fallback(
            || run_optimized_tiffsave(app_handle, input, output),
            || compress_copy_fallback(input, output),
            input,
            output,
        ),
        _ => Err(CompressionError::UnsupportedFormat(ext)),
    };

    if let Some(cb) = on_progress {
        cb(95);
    }

    result
}

/// Helper to try libvips first, then fall back to Rust implementation
fn compress_with_fallback<V, R>(
    vips_fn: V,
    fallback_fn: R,
    input: &Path,
    output: &Path,
) -> Result<u64>
where
    V: FnOnce() -> Result<u64>,
    R: FnOnce() -> Result<u64>,
{
    match vips_fn() {
        Ok(size) => use_smaller_file(input, output, size),
        Err(e) => {
            warn!("libvips failed: {}, using Rust fallback", e);
            let size = fallback_fn()?;
            use_smaller_file(input, output, size)
        }
    }
}

/// Ensures the output file is not larger than the input
fn use_smaller_file(input: &Path, output: &Path, compressed_size: u64) -> Result<u64> {
    let original_size = fs::metadata(input)?.len();

    if compressed_size > original_size {
        info!(
            "Compressed size ({}) > original size ({}), using original",
            compressed_size, original_size
        );
        fs::copy(input, output)?;
        Ok(original_size)
    } else {
        Ok(compressed_size)
    }
}

// ============================================================================
// libvips Operations
// ============================================================================

fn run_optimized_pngsave(
    app_handle: &AppHandle,
    input: &Path,
    output: &Path,
    quality: u8,
) -> Result<u64> {
    let q_value = quality.clamp(1, 100);
    let colors = (PNG_MIN_COLORS + (q_value as f32 / 100.0) * PNG_COLOR_RANGE) as u8;

    let q_arg = format!("--Q={}", q_value);
    let colors_arg = format!("--colours={}", colors);

    let args = vec![
        "pngsave",
        input
            .to_str()
            .ok_or_else(|| CompressionError::InvalidPath(input.display().to_string()))?,
        output
            .to_str()
            .ok_or_else(|| CompressionError::InvalidPath(output.display().to_string()))?,
        "--compression=9",
        "--effort=10",
        "--palette",
        &q_arg,
        &colors_arg,
        "--dither=1",
    ];

    info!("vips pngsave: {}", args.join(" "));
    execute_vips(app_handle, &args, output)
}

fn run_optimized_jpegsave(
    app_handle: &AppHandle,
    input: &Path,
    output: &Path,
    quality: u8,
) -> Result<u64> {
    let q_value = quality.clamp(1, 100);
    let q_arg = format!("--Q={}", q_value);

    let args = vec![
        "jpegsave",
        input
            .to_str()
            .ok_or_else(|| CompressionError::InvalidPath(input.display().to_string()))?,
        output
            .to_str()
            .ok_or_else(|| CompressionError::InvalidPath(output.display().to_string()))?,
        &q_arg,
        "--strip=true",
        "--optimize-coding=true",
        "--interlace=true",
    ];

    info!("vips jpegsave (Q={}): {}", quality, args.join(" "));
    execute_vips(app_handle, &args, output)
}

fn run_optimized_webpsave(
    app_handle: &AppHandle,
    input: &Path,
    output: &Path,
    quality: u8,
) -> Result<u64> {
    let q_value = quality.clamp(1, 100);
    let q_arg = format!("--Q={}", q_value);

    let args = vec![
        "webpsave",
        input
            .to_str()
            .ok_or_else(|| CompressionError::InvalidPath(input.display().to_string()))?,
        output
            .to_str()
            .ok_or_else(|| CompressionError::InvalidPath(output.display().to_string()))?,
        &q_arg,
        "--strip=true",
        "--mixed=true",
    ];

    info!("vips webpsave (Q={}): {}", quality, args.join(" "));
    execute_vips(app_handle, &args, output)
}

fn run_optimized_gifsave(app_handle: &AppHandle, input: &Path, output: &Path) -> Result<u64> {
    let input_str = input
        .to_str()
        .ok_or_else(|| CompressionError::InvalidPath(input.display().to_string()))?;
    let input_frames = format!("{}[n=-1]", input_str);

    let args = vec![
        "gifsave",
        &input_frames,
        output
            .to_str()
            .ok_or_else(|| CompressionError::InvalidPath(output.display().to_string()))?,
        "--bitdepth=7",
        "--dither=0",
    ];

    info!("vips gifsave: {}", args.join(" "));
    execute_vips(app_handle, &args, output)
}

fn run_optimized_tiffsave(app_handle: &AppHandle, input: &Path, output: &Path) -> Result<u64> {
    let args = vec![
        "tiffsave",
        input
            .to_str()
            .ok_or_else(|| CompressionError::InvalidPath(input.display().to_string()))?,
        output
            .to_str()
            .ok_or_else(|| CompressionError::InvalidPath(output.display().to_string()))?,
        "--compression=jpeg",
        "--strip",
    ];

    info!("vips tiffsave: {}", args.join(" "));
    execute_vips(app_handle, &args, output)
}

/// Execute vips command with proper PATH setup and error handling
fn execute_vips(app_handle: &AppHandle, args: &[&str], output: &Path) -> Result<u64> {
    use std::env;
    use tauri_plugin_shell::ShellExt;

    // Setup PATH for binaries (cross-platform)
    let path_separator = if cfg!(windows) { ";" } else { ":" };
    let binary_paths = if cfg!(windows) {
        vec!["src-tauri\\binaries", ".\\binaries"]
    } else {
        vec!["src-tauri/binaries", "./binaries"]
    };

    let mut path_var = env::var("PATH").unwrap_or_default();
    for bin_path in binary_paths {
        if !path_var.contains(bin_path) {
            path_var = format!("{}{}{}", bin_path, path_separator, path_var);
        }
    }

    let output_result = tauri::async_runtime::block_on(async {
        let mut cmd = app_handle
            .shell()
            .sidecar("vips")
            .map_err(|e| CompressionError::Vips(e.to_string()))?;
        cmd = cmd.env("PATH", path_var);
        cmd.args(args)
            .output()
            .await
            .map_err(|e| CompressionError::Vips(e.to_string()))
    })?;

    let stdout = String::from_utf8_lossy(&output_result.stdout);
    let stderr = String::from_utf8_lossy(&output_result.stderr);

    if !stdout.is_empty() {
        info!("vips stdout: {}", stdout);
    }
    if !stderr.is_empty() {
        warn!("vips stderr: {}", stderr);
    }

    if !output_result.status.success() {
        return Err(CompressionError::Vips(format!(
            "vips failed (code {:?}): {}",
            output_result.status.code(),
            stderr
        )));
    }

    let size = fs::metadata(output)?.len();
    info!("libvips success: {} bytes", size);
    Ok(size)
}

// ============================================================================
// Rust Fallback Implementations
// ============================================================================

fn compress_jpeg_fallback(input: &Path, output: &Path, quality: u8) -> Result<u64> {
    let img = ImageReader::open(input)?.decode()?;
    let mut buffer = Vec::new();
    let mut encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut buffer, quality);
    encoder.encode_image(&img)?;
    fs::write(output, &buffer)?;
    Ok(buffer.len() as u64)
}

fn compress_png_fallback(input: &Path, output: &Path, compression: Option<u8>) -> Result<u64> {
    let data = fs::read(input)?;
    let comp_level = compression.unwrap_or(DEFAULT_PNG_COMPRESSION).min(6);
    let options = Options::from_preset(comp_level);
    let optimized = oxipng::optimize_from_memory(&data, &options).map_err(|e| {
        CompressionError::Image(image::ImageError::IoError(std::io::Error::new(
            std::io::ErrorKind::Other,
            e.to_string(),
        )))
    })?;
    fs::write(output, &optimized)?;
    Ok(optimized.len() as u64)
}

fn compress_copy_fallback(input: &Path, output: &Path) -> Result<u64> {
    fs::copy(input, output)?;
    Ok(fs::metadata(output)?.len())
}
