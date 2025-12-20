use image::{GenericImageView, ImageFormat, ImageReader, imageops::FilterType};
use log::{info, warn, error};
use std::fs;
use std::path::{Path, PathBuf};



pub fn compress_image(
    input: &Path,
    output: &Path,
) -> Result<u64, Box<dyn std::error::Error>> {
    // Sidecar-based JPEG encoding (bundled) with Rust fallback

    let ext = input
        .extension()
        .ok_or("No file extension")?
        .to_string_lossy()
        .to_lowercase();

    info!("Compressing {} file: {:?}", ext, input);
 
    // Try sidecar-based JPEG encoding first, then fallback to Rust path
    if ext.as_str() == "jpg" || ext.as_str() == "jpeg" {
        if let Ok(size) = run_imagemagick_encode(input, output, 60) {
            info!("JPEG compressed via sidecar: {} bytes", size);
            return Ok(size);
        }
    }

    // Try image crate first, fallback to Rust path
    let result = match ext.as_str() {
        "jpg" | "jpeg" => compress_jpeg(input, output),
        "png" => compress_png(input, output),
        "webp" => compress_as_png(input),
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

    info!("Opening and decoding image...");
    let img = ImageReader::open(input)?.decode()?;
    info!("Image decoded successfully");

    // Keep PNG path unchanged for now (no changes here in Plan B)

    // Resize to max 4K
    let (max_width, max_height) = (3840, 2160);
    let (w, h) = img.dimensions();
    info!("Original dimensions: {}x{}", w, h);

    let (new_w, new_h) = if w > max_width || h > max_height {
        let aspect = w as f32 / h as f32;
        let (nw, nh) = if w > h {
            (max_width, (max_width as f32 / aspect) as u32)
        } else {
            ((max_height as f32 * aspect) as u32, max_height)
        };
        info!("Resizing to: {}x{}", nw, nh);
        (nw, nh)
    } else {
        info!("No resizing needed");
        (w, h)
    };

    info!("Performing resize operation...");
    let resized = img.resize(new_w, new_h, FilterType::Lanczos3);
    info!("Resize complete");

    // Save to temp file first
    let temp_path = output.with_extension("tmp.png");
    info!("Saving to temp file: {:?}", temp_path);
    resized.save_with_format(&temp_path, ImageFormat::Png)?;
    info!("Temp file saved");

    // Read and optimize with oxipng
    info!("Reading temp file for optimization...");
    let data = fs::read(&temp_path)?;
    info!(
        "Optimizing with oxipng (size before: {} bytes)...",
        data.len()
    );

    let options = oxipng::Options::default();
    let optimized = oxipng::optimize_from_memory(&data, &options)?;
    info!(
        "Optimization complete (size after: {} bytes)",
        optimized.len()
    );

    info!("Writing final output: {:?}", output);
    fs::write(output, &optimized)?;
    info!("Output written");

    // Clean up temp file
    let _ = fs::remove_file(&temp_path);
    info!("Temp file cleaned up");

    let size = fs::metadata(output)?.len();
    info!("PNG compression complete, final size: {} bytes", size);
    Ok(size)
 }

fn compress_as_png(input: &Path, output: &Path) -> Result<u64, Box<dyn std::error::Error>> {
    // Convert any format to optimized PNG
    compress_png(input, output)
}

fn compress_with_fallback(input: &Path, output: &Path, ext: &str) -> Result<u64, Box<dyn std::error::Error>> {
    info!("Using fallback compression for: {:?}", input);
    
    // Simple copy with basic size reduction as fallback
    let metadata = fs::metadata(input)?;
    let original_size = metadata.len();
    
    // For very small files, just copy them
    if original_size < 1024 * 100 { // 100KB
        fs::copy(input, output)?;
        return Ok(original_size);
    }
    
    // Try to read and write a smaller version
    match ext {
        "jpg" | "jpeg" => {
            // Try simple image crate operations
            if let Ok(img) = ImageReader::open(input).and_then(|r| r.decode().map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))) {
                let (w, h) = img.dimensions();
                // Scale down to 50% if large
                let (new_w, new_h) = if w > 1024 || h > 1024 {
                    (w / 2, h / 2)
                } else {
                    (w, h)
                };
                let resized = img.resize(new_w, new_h, FilterType::Nearest);
                let mut buffer = Vec::new();
                let mut encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut buffer, 60);
                if encoder.encode_image(&resized).is_ok() {
                    fs::write(output, &buffer)?;
                    return Ok(buffer.len() as u64);
                }
            }
        }
        "png" => {
            if let Ok(img) = ImageReader::open(input).and_then(|r| r.decode().map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))) {
                let (w, h) = img.dimensions();
                let (new_w, new_h) = if w > 1024 || h > 1024 {
                    (w / 2, h / 2)
                } else {
                    (w, h)
                };
                let resized = img.resize(new_w, new_h, FilterType::Nearest);
                if resized.save_with_format(output, ImageFormat::Png).is_ok() {
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
