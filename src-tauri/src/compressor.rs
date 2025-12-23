use image::{GenericImageView, ImageFormat, ImageReader};
use log::{error, info, warn};
use oxipng::{BitDepth, ColorType as OxiColorType, Options, RawImage};
use std::fs;
use std::path::Path;
use tauri::AppHandle;

pub fn compress_image(
    app_handle: &AppHandle,
    input: &Path,
    output: &Path,
    quality: u8,
) -> Result<u64, Box<dyn std::error::Error>> {
    // Sidecar-based JPEG encoding (bundled) with Rust fallback

    let ext = input
        .extension()
        .ok_or("No file extension")?
        .to_string_lossy()
        .to_lowercase();

    info!("Compressing {} file: {:?}", ext, input);

    /*
    // Try sidecar-based JPEG encoding first, then fallback to Rust path
    if ext.as_str() == "jpg" || ext.as_str() == "jpeg" {
        if let Ok(size) = run_imagemagick_encode(input, output, 60) {
            info!("JPEG compressed via sidecar: {} bytes", size);
            return Ok(size);
        }
    }
    */

    // Try libvips sidecar first for JPEG/PNG/WebP, fallback to Rust path
    let result = match ext.as_str() {
        "jpg" | "jpeg" | "jfif" | "png" | "webp" => {
            match run_vips(app_handle, input, output, quality) {
                Ok(size) => Ok(size),
                Err(e) => {
                    warn!(
                        "libvips sidecar failed: {}, falling back to Rust implementation",
                        e
                    );
                    match ext.as_str() {
                        "jpg" | "jpeg" | "jfif" => compress_jpeg(input, output, quality),
                        "png" => compress_png(input, output, quality),
                        "webp" => compress_webp(input, output, quality),
                        _ => Err(e),
                    }
                }
            }
        }
        "bmp" | "tiff" | "tif" => compress_png(input, output, quality),
        _ => Err("Unsupported format".into()),
    };

    match result {
        Ok(size) => Ok(size),
        Err(e) => {
            warn!(
                "All primary compression methods failed: {}, trying basic fallback",
                e
            );
            compress_with_fallback(input, output, &ext, quality)
        }
    }
}

fn run_vips(
    app_handle: &AppHandle,
    input: &Path,
    output: &Path,
    quality: u8,
) -> Result<u64, Box<dyn std::error::Error>> {
    info!("Running libvips sidecar for: {:?}", input);

    use tauri_plugin_shell::ShellExt;
    use std::env;

    let input_str = input.to_str().ok_or("Invalid input path")?;
    let output_str = output.to_str().ok_or("Invalid output path")?;
    let output_with_quality = format!("{}[Q={}]", output_str, quality);

    info!(
        "vips command: copy '{}' '{}'",
        input_str, output_with_quality
    );

    // Use vips copy command with output options for compression
    let output_result = tauri::async_runtime::block_on(async {
        let mut cmd = app_handle
            .shell()
            .sidecar("vips")
            .map_err(|e| {
                error!("Failed to create vips sidecar: {}", e);
                format!("Failed to create sidecar: {}", e)
            })?;

        // Set PATH to include binaries directory for DLL resolution
        // Add both the src-tauri/binaries directory and app bundle binaries directory
        let binaries_paths = vec![
            "src-tauri\\binaries",  // Development mode path
            ".\\binaries",           // Alternative dev path
        ];

        let mut path_var = env::var("PATH").unwrap_or_default();
        for bin_path in binaries_paths {
            if !path_var.contains(bin_path) {
                path_var = format!("{};{}", bin_path, path_var);
            }
        }

        info!("Setting PATH for vips execution: {}", path_var);
        cmd = cmd.env("PATH", path_var);

        cmd.args(["copy", input_str, &output_with_quality])
            .output()
            .await
            .map_err(|e| {
                error!("Failed to execute vips: {}", e);
                format!("Failed to execute vips: {}", e)
            })
    })?;

    let stdout = String::from_utf8_lossy(&output_result.stdout);
    let stderr = String::from_utf8_lossy(&output_result.stderr);

    info!("vips stdout: {}", stdout);
    if !stderr.is_empty() {
        warn!("vips stderr: {}", stderr);
    }

    if !output_result.status.success() {
        let error_msg = format!(
            "vips failed with exit code {:?}: {}",
            output_result.status.code(),
            stderr
        );
        error!("{}", error_msg);
        return Err(error_msg.into());
    }

    // Get the output file size
    let size = fs::metadata(output)?.len();
    info!("libvips compressed successfully, size: {}", size);
    Ok(size)
}

/*
fn compress_gif(
    input: &Path,
    output: &Path,
    _quality: u8,
) -> Result<u64, Box<dyn std::error::Error>> {
    info!("Compressing GIF: {:?}", input);

    // For GIFs, pure Rust compression is limited without color quantization.
    // We'll re-encode it which might apply some basic optimization.
    let img = ImageReader::open(input)?.decode()?;
    img.save_with_format(output, image::ImageFormat::Gif)?;

    let size = fs::metadata(output)?.len();
    info!("GIF processed, size: {}", size);
    Ok(size)
}
*/

fn compress_webp(
    input: &Path,
    output: &Path,
    quality: u8,
) -> Result<u64, Box<dyn std::error::Error>> {
    info!("Compressing WebP natively via webp crate: {:?}", input);

    let img = ImageReader::open(input)?.decode()?;
    let (width, height) = img.dimensions();

    let webp_data = if img.color().has_alpha() {
        let rgba = img.to_rgba8();
        let encoder = webp::Encoder::from_rgba(&rgba, width, height);
        encoder.encode(quality as f32)
    } else {
        let rgb = img.to_rgb8();
        let encoder = webp::Encoder::from_rgb(&rgb, width, height);
        encoder.encode(quality as f32)
    };

    fs::write(output, &*webp_data)?;
    let size = webp_data.len() as u64;
    info!("WebP compressed natively via webp crate, size: {}", size);
    Ok(size)
}

fn compress_jpeg(
    input: &Path,
    output: &Path,
    quality: u8,
) -> Result<u64, Box<dyn std::error::Error>> {
    info!("Compressing JPEG: {:?}", input);

    // Attempt sidecar path first outside of in-code: handled in parent function
    // Fallback to Rust-based encode (no resize)
    let img = ImageReader::open(input)?.decode()?;
    info!("Image decoded successfully");

    // Fallback: encode without resizing
    let mut buffer = Vec::new();
    let mut encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut buffer, quality);
    encoder.encode_image(&img)?;
    fs::write(output, &buffer)?;
    let size = buffer.len() as u64;
    info!("JPEG compressed (Rust fallback), size: {}", size);
    Ok(size)
}

fn compress_png(
    input: &Path,
    output: &Path,
    quality: u8,
) -> Result<u64, Box<dyn std::error::Error>> {
    info!("Compressing PNG: {:?}", input);

    // Get input extension and size metadata
    let ext = input
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    let original_data = fs::read(input)?;

    // Optimization: If already a PNG, optimize the data directly (keeps original dimensions)
    if ext == "png" {
        info!("PNG detected, optimizing directly...");
        // Map 0-100 quality to oxipng optimization level (0-6)
        let level = (6 - (quality as f32 / 100.0 * 6.0) as u8).min(6);
        let options = Options::from_preset(level);
        let optimized = oxipng::optimize_from_memory(&original_data, &options)?;
        fs::write(output, &optimized)?;
        return Ok(optimized.len() as u64);
    }

    // For other formats (e.g. converting WebP to PNG), decode and optimize from raw pixels
    let img = ImageReader::new(std::io::Cursor::new(&original_data))
        .with_guessed_format()?
        .decode()?;
    let (w, h) = img.dimensions();

    // Convert to RGBA8 for oxipng
    let rgba = img.to_rgba8();
    let raw = RawImage::new(w, h, OxiColorType::RGBA, BitDepth::Eight, rgba.into_raw())?;

    info!(
        "Generating optimized PNG from raw pixels (original dimensions: {}x{})...",
        w, h
    );
    let level = (6 - (quality as f32 / 100.0 * 6.0) as u8).min(6);
    let options = Options::from_preset(level);
    let optimized = raw.create_optimized_png(&options)?;

    info!("Writing final output: {:?}", output);
    fs::write(output, &optimized)?;

    let size = optimized.len() as u64;
    info!("PNG compression complete, final size: {} bytes", size);
    Ok(size)
}

fn compress_with_fallback(
    input: &Path,
    output: &Path,
    ext: &str,
    quality: u8,
) -> Result<u64, Box<dyn std::error::Error>> {
    info!("Using fallback compression for: {:?}", input);

    // Simple copy with basic size reduction as fallback
    let metadata = fs::metadata(input)?;
    let original_size = metadata.len();

    // For very small files, just copy them
    if original_size < 1024 * 100 {
        // 100KB
        fs::copy(input, output)?;
        return Ok(original_size);
    }

    // Try to read and write a smaller version
    match ext {
        "jpg" | "jpeg" => {
            // Try simple image crate operations
            if let Ok(img) = ImageReader::open(input).and_then(|r| {
                r.decode()
                    .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))
            }) {
                let mut buffer = Vec::new();
                let mut encoder =
                    image::codecs::jpeg::JpegEncoder::new_with_quality(&mut buffer, quality);
                if encoder.encode_image(&img).is_ok() {
                    fs::write(output, &buffer)?;
                    return Ok(buffer.len() as u64);
                }
            }
        }
        "png" => {
            if let Ok(img) = ImageReader::open(input).and_then(|r| {
                r.decode()
                    .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))
            }) {
                if img.save_with_format(output, ImageFormat::Png).is_ok() {
                    return Ok(fs::metadata(output)?.len());
                }
            }
        }
        _ => {}
    }

    // Last resort: just copy the file
    error!("All compression methods failed, copying file");
    fs::copy(input, output)?;
    Ok(fs::metadata(output)?.len())
}
