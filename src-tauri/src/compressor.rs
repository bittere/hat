use image::{GenericImageView, ImageFormat, ImageReader};
use log::{error, info, warn};
use oxipng::{BitDepth, ColorType as OxiColorType, Options, RawImage};
use std::fs;
use std::path::Path;

pub fn compress_image(input: &Path, output: &Path) -> Result<u64, Box<dyn std::error::Error>> {
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

    // Try image crate first, fallback to Rust path
    let result = match ext.as_str() {
        "jpg" | "jpeg" => compress_jpeg(input, output),
        "png" => compress_png(input, output),
        "webp" => compress_as_png(input, output),
        _ => Err("Unsupported format".into()),
    };

    match result {
        Ok(size) => Ok(size),
        Err(e) => {
            warn!("Image crate compression failed: {}, trying fallback", e);
            compress_with_fallback(input, output, &ext)
        }
    }
}

fn compress_jpeg(input: &Path, output: &Path) -> Result<u64, Box<dyn std::error::Error>> {
    info!("Compressing JPEG: {:?}", input);

    // Attempt sidecar path first outside of in-code: handled in parent function
    // Fallback to Rust-based encode (no resize)
    let img = ImageReader::open(input)?.decode()?;
    info!("Image decoded successfully");

    // Fallback: encode without resizing
    let mut buffer = Vec::new();
    let mut encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut buffer, 60);
    encoder.encode_image(&img)?;
    fs::write(output, &buffer)?;
    let size = buffer.len() as u64;
    info!("JPEG compressed (Rust fallback), size: {}", size);
    Ok(size)
}

fn compress_png(input: &Path, output: &Path) -> Result<u64, Box<dyn std::error::Error>> {
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
        let optimized = oxipng::optimize_from_memory(&original_data, &Options::default())?;
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
    let optimized = raw.create_optimized_png(&Options::default())?;

    info!("Writing final output: {:?}", output);
    fs::write(output, &optimized)?;

    let size = optimized.len() as u64;
    info!("PNG compression complete, final size: {} bytes", size);
    Ok(size)
}

fn compress_as_png(input: &Path, output: &Path) -> Result<u64, Box<dyn std::error::Error>> {
    // Convert any format to optimized PNG
    compress_png(input, output)
}

fn compress_with_fallback(
    input: &Path,
    output: &Path,
    ext: &str,
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
                    image::codecs::jpeg::JpegEncoder::new_with_quality(&mut buffer, 60);
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
