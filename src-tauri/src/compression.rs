use libloading::Library;
use log::{info, warn};
use serde::Serialize;
use std::ffi::CString;
use std::fs;
use std::io::BufWriter;
use std::os::raw::{c_char, c_int, c_void};
use std::path::Path;

// ---------------------------------------------------------------------------
// Supported format enum
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ImageFormat {
    Png,
    Jpeg,
    WebP,
    Avif,
    Heif,
    Tiff,
}

impl ImageFormat {
    pub fn from_extension(ext: &str) -> Option<Self> {
        match ext.to_ascii_lowercase().as_str() {
            "png" => Some(Self::Png),
            "jpg" | "jpeg" => Some(Self::Jpeg),
            "webp" => Some(Self::WebP),
            "avif" => Some(Self::Avif),
            "heif" | "heic" => Some(Self::Heif),
            "tif" | "tiff" => Some(Self::Tiff),
            _ => None,
        }
    }

    pub fn from_path(path: &Path) -> Option<Self> {
        path.extension()
            .and_then(|e| e.to_str())
            .and_then(Self::from_extension)
    }

    pub fn extension(&self) -> &'static str {
        match self {
            Self::Png => "png",
            Self::Jpeg => "jpg",
            Self::WebP => "webp",
            Self::Avif => "avif",
            Self::Heif => "heic",
            Self::Tiff => "tiff",
        }
    }
}

impl std::fmt::Display for ImageFormat {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Png => write!(f, "png"),
            Self::Jpeg => write!(f, "jpeg"),
            Self::WebP => write!(f, "webp"),
            Self::Avif => write!(f, "avif"),
            Self::Heif => write!(f, "heif"),
            Self::Tiff => write!(f, "tiff"),
        }
    }
}

// ---------------------------------------------------------------------------
// CompressionRecord
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, serde::Deserialize)]
pub struct CompressionRecord {
    pub initial_path: String,
    pub final_path: String,
    pub initial_size: u64,
    pub compressed_size: u64,
    pub initial_format: String,
    pub final_format: String,
    pub quality: u8,
    pub timestamp: u64,
    #[serde(default)]
    pub original_deleted: bool,
}

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

#[derive(Debug, thiserror::Error)]
pub enum CompressionError {
    #[error("invalid path: {0}")]
    InvalidPath(String),
    #[error("unsupported format: {0}")]
    UnsupportedFormat(String),
    #[error("libvips error: {0}")]
    Vips(String),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("libloading error: {0}")]
    LibLoading(#[from] libloading::Error),
}

pub type Result<T> = std::result::Result<T, CompressionError>;

// ---------------------------------------------------------------------------
// Non-variadic FFI function pointer types
//
// libvips' convenience functions (vips_pngsave, etc.) are variadic, which
// causes STATUS_ACCESS_VIOLATION on Windows x64 when called through
// `libloading` function pointers.
//
// Instead we use only two functions and pass save options through vips'
// filename suffix syntax:  output.png[compression=9,palette,Q=80]
// ---------------------------------------------------------------------------

type VipsInitFn = unsafe extern "C" fn(*const c_char) -> c_int;
// These are variadic C functions – the `...` is critical on Windows x64
// where variadic/non-variadic calling conventions differ. We always pass
// a single NULL terminator as the only variadic arg.
type VipsNewFromFileFn = unsafe extern "C" fn(*const c_char, ...) -> *mut c_void;
type VipsWriteToFileFn = unsafe extern "C" fn(*mut c_void, *const c_char, ...) -> c_int;
type GObjectUnrefFn = unsafe extern "C" fn(*mut c_void);
type VipsErrorBufferFn = unsafe extern "C" fn() -> *const c_char;
type VipsErrorClearFn = unsafe extern "C" fn();
// Non-variadic functions for extracting pixel data from VipsImage
type VipsWriteToMemoryFn = unsafe extern "C" fn(*mut c_void, *mut usize) -> *mut c_void;
type VipsGetWidthFn = unsafe extern "C" fn(*mut c_void) -> c_int;
type VipsGetHeightFn = unsafe extern "C" fn(*mut c_void) -> c_int;
type VipsGetBandsFn = unsafe extern "C" fn(*mut c_void) -> c_int;
type GFreeFn = unsafe extern "C" fn(*mut c_void);
// VipsBandFormat enum value for VIPS_FORMAT_UCHAR
const VIPS_FORMAT_UCHAR: c_int = 0;
// Non-variadic: creates a VipsImage from a copy of a memory buffer
type VipsNewFromMemoryCopyFn =
    unsafe extern "C" fn(*const c_void, usize, c_int, c_int, c_int, c_int) -> *mut c_void;

// ---------------------------------------------------------------------------
// Format-specific compression flags
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Default)]
pub struct CompressionFlags {
    // PNG
    pub png_palette: bool,
    pub png_interlace: bool,
    pub png_bitdepth: u8,
    pub png_filter: Option<String>,
    pub png_colors: u16,
    // Quantization (non-PNG formats)
    pub jpeg_quantize: bool,
    pub jpeg_colors: u16,
    pub webp_quantize: bool,
    pub webp_colors: u16,
    pub avif_quantize: bool,
    pub avif_colors: u16,
    pub heif_quantize: bool,
    pub heif_colors: u16,
    pub tiff_quantize: bool,
    pub tiff_colors: u16,
    // JPEG
    pub jpeg_optimize_coding: bool,
    pub jpeg_interlace: bool,
    pub jpeg_subsample_mode: Option<String>,
    pub jpeg_trellis_quant: bool,
    pub jpeg_overshoot_deringing: bool,
    // WebP
    pub webp_effort: u8,
    pub webp_lossless: bool,
    pub webp_near_lossless: bool,
    pub webp_smart_subsample: bool,
    pub webp_alpha_q: u8,
    // AVIF
    pub avif_effort: u8,
    pub avif_lossless: bool,
    pub avif_bitdepth: u8,
    pub avif_subsample_mode: Option<String>,
    // HEIF
    pub heif_effort: u8,
    pub heif_lossless: bool,
    pub heif_bitdepth: u8,
    // TIFF
    pub tiff_compression: Option<String>,
    pub tiff_predictor: Option<String>,
    pub tiff_tile: bool,
    pub tiff_pyramid: bool,
    pub tiff_bitdepth: u8,
}

impl CompressionFlags {
    /// Build CompressionFlags from FormatOptions for a given image format.
    pub fn from_format_options(opts: &crate::config::FormatOptions, format: ImageFormat) -> Self {
        match format {
            ImageFormat::Png => CompressionFlags {
                png_palette: opts.png.palette,
                png_interlace: opts.png.interlace,
                png_bitdepth: opts.png.bitdepth,
                png_filter: opts.png.filter.clone(),
                png_colors: opts.png.colors,
                ..Default::default()
            },
            ImageFormat::Jpeg => CompressionFlags {
                jpeg_optimize_coding: opts.jpeg.optimize_coding,
                jpeg_interlace: opts.jpeg.interlace,
                jpeg_subsample_mode: opts.jpeg.subsample_mode.clone(),
                jpeg_trellis_quant: opts.jpeg.trellis_quant,
                jpeg_overshoot_deringing: opts.jpeg.overshoot_deringing,
                jpeg_quantize: opts.jpeg.quantize,
                jpeg_colors: opts.jpeg.colors,
                ..Default::default()
            },
            ImageFormat::WebP => CompressionFlags {
                webp_effort: opts.webp.effort,
                webp_lossless: opts.webp.lossless,
                webp_near_lossless: opts.webp.near_lossless,
                webp_smart_subsample: opts.webp.smart_subsample,
                webp_alpha_q: opts.webp.alpha_q,
                webp_quantize: opts.webp.quantize,
                webp_colors: opts.webp.colors,
                ..Default::default()
            },
            ImageFormat::Avif => CompressionFlags {
                avif_effort: opts.avif.effort,
                avif_lossless: opts.avif.lossless,
                avif_bitdepth: opts.avif.bitdepth,
                avif_subsample_mode: opts.avif.subsample_mode.clone(),
                avif_quantize: opts.avif.quantize,
                avif_colors: opts.avif.colors,
                ..Default::default()
            },
            ImageFormat::Heif => CompressionFlags {
                heif_effort: opts.heif.effort,
                heif_lossless: opts.heif.lossless,
                heif_bitdepth: opts.heif.bitdepth,
                heif_quantize: opts.heif.quantize,
                heif_colors: opts.heif.colors,
                ..Default::default()
            },
            ImageFormat::Tiff => CompressionFlags {
                tiff_compression: opts.tiff.compression.clone(),
                tiff_predictor: opts.tiff.predictor.clone(),
                tiff_tile: opts.tiff.tile,
                tiff_pyramid: opts.tiff.pyramid,
                tiff_bitdepth: opts.tiff.bitdepth,
                tiff_quantize: opts.tiff.quantize,
                tiff_colors: opts.tiff.colors,
                ..Default::default()
            },
        }
    }
}

// ---------------------------------------------------------------------------
// Minimal libvips FFI wrapper
// ---------------------------------------------------------------------------

/// RAII guard for a raw VipsImage pointer.  Calls `g_object_unref` on drop.
pub struct VipsImage<'a> {
    ptr: *mut c_void,
    vips: &'a Vips,
}

impl<'a> VipsImage<'a> {
    fn new(ptr: *mut c_void, vips: &'a Vips) -> Self {
        Self { ptr, vips }
    }

    pub fn as_ptr(&self) -> *mut c_void {
        self.ptr
    }
}

impl Drop for VipsImage<'_> {
    fn drop(&mut self) {
        if !self.ptr.is_null() {
            unsafe { (self.vips.fn_object_unref)(self.ptr) };
        }
    }
}

pub struct Vips {
    _lib: Library,
    fn_new_from_file: VipsNewFromFileFn,
    fn_write_to_file: VipsWriteToFileFn,
    fn_object_unref: GObjectUnrefFn,
    fn_error_buffer: VipsErrorBufferFn,
    fn_error_clear: VipsErrorClearFn,
    fn_write_to_memory: VipsWriteToMemoryFn,
    fn_get_width: VipsGetWidthFn,
    fn_get_height: VipsGetHeightFn,
    fn_get_bands: VipsGetBandsFn,
    fn_g_free: GFreeFn,
    fn_new_from_memory_copy: VipsNewFromMemoryCopyFn,
}

impl Vips {
    /// Creates a new Vips instance by loading the shared library from the given path.
    ///
    /// # Safety
    ///
    /// This function is unsafe because it loads a dynamic library and interacts with C FFI.
    /// It assumes the provided `lib_path` points to a valid libvips installation.
    pub unsafe fn new(lib_path: &Path) -> Result<Self> {
        let lib = Library::new(lib_path)?;

        let init = *lib.get::<VipsInitFn>(b"vips_init\0")?;
        let app_name = CString::new("hat").unwrap();
        if init(app_name.as_ptr()) != 0 {
            return Err(CompressionError::Vips("vips_init failed".into()));
        }

        let fn_new_from_file = *lib.get::<VipsNewFromFileFn>(b"vips_image_new_from_file\0")?;
        let fn_write_to_file = *lib.get::<VipsWriteToFileFn>(b"vips_image_write_to_file\0")?;
        let fn_object_unref = *lib.get::<GObjectUnrefFn>(b"g_object_unref\0")?;
        let fn_error_buffer = *lib.get::<VipsErrorBufferFn>(b"vips_error_buffer\0")?;
        let fn_error_clear = *lib.get::<VipsErrorClearFn>(b"vips_error_clear\0")?;
        let fn_write_to_memory =
            *lib.get::<VipsWriteToMemoryFn>(b"vips_image_write_to_memory\0")?;
        let fn_get_width = *lib.get::<VipsGetWidthFn>(b"vips_image_get_width\0")?;
        let fn_get_height = *lib.get::<VipsGetHeightFn>(b"vips_image_get_height\0")?;
        let fn_get_bands = *lib.get::<VipsGetBandsFn>(b"vips_image_get_bands\0")?;
        let fn_g_free = *lib.get::<GFreeFn>(b"g_free\0")?;
        let fn_new_from_memory_copy =
            *lib.get::<VipsNewFromMemoryCopyFn>(b"vips_image_new_from_memory_copy\0")?;

        Ok(Self {
            _lib: lib,
            fn_new_from_file,
            fn_write_to_file,
            fn_object_unref,
            fn_error_buffer,
            fn_error_clear,
            fn_write_to_memory,
            fn_get_width,
            fn_get_height,
            fn_get_bands,
            fn_g_free,
            fn_new_from_memory_copy,
        })
    }

    // -- helpers ------------------------------------------------------------

    fn vips_error(&self) -> String {
        unsafe {
            let ptr = (self.fn_error_buffer)();
            if ptr.is_null() {
                return String::new();
            }
            let msg = std::ffi::CStr::from_ptr(ptr).to_string_lossy().into_owned();
            (self.fn_error_clear)();
            msg
        }
    }

    pub fn load_image(&self, path: &Path) -> Result<VipsImage<'_>> {
        let cpath = path_to_cstring(path)?;
        let img = unsafe { (self.fn_new_from_file)(cpath.as_ptr(), std::ptr::null::<c_char>()) };
        if img.is_null() {
            return Err(CompressionError::Vips(format!(
                "failed to load {}: {}",
                path.display(),
                self.vips_error()
            )));
        }
        Ok(VipsImage::new(img, self))
    }

    fn save_image(&self, img: *mut c_void, path_with_opts: &str) -> Result<()> {
        let cpath = CString::new(path_with_opts)
            .map_err(|_| CompressionError::InvalidPath(path_with_opts.to_string()))?;
        let ret =
            unsafe { (self.fn_write_to_file)(img, cpath.as_ptr(), std::ptr::null::<c_char>()) };
        if ret != 0 {
            return Err(CompressionError::Vips(format!(
                "write_to_file failed: {}",
                self.vips_error()
            )));
        }
        Ok(())
    }

    /// Extract raw pixel data from a VipsImage as RGBA u8 bytes.
    /// Returns (width, height, rgba_bytes).
    pub fn extract_rgba(&self, img: &VipsImage<'_>) -> Result<(u32, u32, Vec<u8>)> {
        let width = unsafe { (self.fn_get_width)(img.as_ptr()) } as u32;
        let height = unsafe { (self.fn_get_height)(img.as_ptr()) } as u32;
        let bands = unsafe { (self.fn_get_bands)(img.as_ptr()) } as u32;

        let mut size: usize = 0;
        let buf = unsafe { (self.fn_write_to_memory)(img.as_ptr(), &mut size) };
        if buf.is_null() {
            return Err(CompressionError::Vips(format!(
                "vips_image_write_to_memory failed: {}",
                self.vips_error()
            )));
        }

        let raw = unsafe { std::slice::from_raw_parts(buf as *const u8, size) };

        let expected = (width as usize) * (height as usize) * (bands as usize);
        if size != expected {
            unsafe { (self.fn_g_free)(buf) };
            return Err(CompressionError::Vips(format!(
                "pixel buffer size mismatch: got {} expected {} ({}x{}x{})",
                size, expected, width, height, bands
            )));
        }

        let pixel_count = (width as usize) * (height as usize);
        let rgba = match bands {
            4 => raw.to_vec(),
            3 => {
                let mut out = vec![0u8; pixel_count * 4];
                for (src, dst) in raw.chunks_exact(3).zip(out.chunks_exact_mut(4)) {
                    dst[0] = src[0];
                    dst[1] = src[1];
                    dst[2] = src[2];
                    dst[3] = 255;
                }
                out
            }
            2 => {
                let mut out = vec![0u8; pixel_count * 4];
                for (src, dst) in raw.chunks_exact(2).zip(out.chunks_exact_mut(4)) {
                    dst[0] = src[0];
                    dst[1] = src[0];
                    dst[2] = src[0];
                    dst[3] = src[1];
                }
                out
            }
            1 => {
                let mut out = vec![0u8; pixel_count * 4];
                for (i, &g) in raw.iter().enumerate() {
                    let o = i * 4;
                    out[o] = g;
                    out[o + 1] = g;
                    out[o + 2] = g;
                    out[o + 3] = 255;
                }
                out
            }
            _ => {
                unsafe { (self.fn_g_free)(buf) };
                return Err(CompressionError::Vips(format!(
                    "unsupported band count for palette quantization: {}",
                    bands
                )));
            }
        };

        unsafe { (self.fn_g_free)(buf) };
        Ok((width, height, rgba))
    }

    /// Quantize RGBA pixel data using libimagequant and reconstruct an RGB buffer.
    fn quantize_rgba_to_rgb(
        &self,
        rgba: &[u8],
        width: u32,
        height: u32,
        quality: u8,
        max_colors: u16,
        dithering: f32,
    ) -> Result<Vec<u8>> {
        info!(
            "[compression] quantize_rgba_to_rgb: {}x{} image, {} bytes RGBA, dither={}",
            width,
            height,
            rgba.len(),
            dithering
        );

        let mut liq = imagequant::new();
        let speed = if dithering < 0.01 { 10 } else { 4 };
        liq.set_speed(speed)
            .map_err(|e| CompressionError::Vips(format!("imagequant: {}", e)))?;
        liq.set_quality(0, quality)
            .map_err(|e| CompressionError::Vips(format!("imagequant set_quality: {}", e)))?;
        let colors = if max_colors >= 2 {
            max_colors.min(256) as u32
        } else {
            256
        };
        liq.set_max_colors(colors)
            .map_err(|e| CompressionError::Vips(format!("imagequant set_max_colors: {}", e)))?;

        let pixel_count = (width as usize) * (height as usize);
        let pixels: &[imagequant::RGBA] = unsafe {
            std::slice::from_raw_parts(rgba.as_ptr() as *const imagequant::RGBA, pixel_count)
        };

        let mut liq_img = liq
            .new_image_borrowed(pixels, width as usize, height as usize, 0.0)
            .map_err(|e| CompressionError::Vips(format!("imagequant new_image: {}", e)))?;

        let mut quantized = liq
            .quantize(&mut liq_img)
            .map_err(|e| CompressionError::Vips(format!("imagequant quantize: {}", e)))?;

        quantized
            .set_dithering_level(dithering)
            .map_err(|e| CompressionError::Vips(format!("imagequant dithering: {}", e)))?;

        let (palette, indexed_pixels) = quantized
            .remapped(&mut liq_img)
            .map_err(|e| CompressionError::Vips(format!("imagequant remap: {}", e)))?;

        let remap_quality = quantized.quantization_quality().unwrap_or(0);
        info!(
            "[compression] quantize_rgba_to_rgb: {} palette colors, quality={}",
            palette.len(),
            remap_quality
        );

        let mut rgb = vec![0u8; pixel_count * 3];
        for (&idx, dst) in indexed_pixels.iter().zip(rgb.chunks_exact_mut(3)) {
            let c = &palette[idx as usize];
            dst[0] = c.r;
            dst[1] = c.g;
            dst[2] = c.b;
        }

        Ok(rgb)
    }

    /// Quantize from pre-extracted RGBA, returning (width, height, rgb).
    #[allow(dead_code)]
    pub fn quantize_cached_rgba_to_rgb(
        &self,
        rgba: &[u8],
        width: u32,
        height: u32,
        quality: u8,
        max_colors: u16,
        dithering: f32,
    ) -> Result<(u32, u32, Vec<u8>)> {
        let rgb = self.quantize_rgba_to_rgb(rgba, width, height, quality, max_colors, dithering)?;
        Ok((width, height, rgb))
    }

    /// Create a VipsImage from raw RGB data in memory.
    fn load_image_from_rgb(&self, rgb: &[u8], width: u32, height: u32) -> Result<VipsImage<'_>> {
        let img = unsafe {
            (self.fn_new_from_memory_copy)(
                rgb.as_ptr() as *const c_void,
                rgb.len(),
                width as c_int,
                height as c_int,
                3, // RGB bands
                VIPS_FORMAT_UCHAR,
            )
        };
        if img.is_null() {
            return Err(CompressionError::Vips(format!(
                "vips_image_new_from_memory_copy failed: {}",
                self.vips_error()
            )));
        }
        Ok(VipsImage::new(img, self))
    }

    /// Quantize an image with libimagequant and encode as indexed PNG.
    fn compress_png_imagequant(
        &self,
        img: &VipsImage<'_>,
        input: &Path,
        output: &Path,
        quality: u8,
        flags: &CompressionFlags,
    ) -> Result<u64> {
        let q = quality.clamp(1, 100);

        let (width, height, rgba) = self.extract_rgba(img)?;

        info!(
            "[compression] imagequant: {}x{} image loaded, {} bytes RGBA",
            width,
            height,
            rgba.len()
        );

        let mut liq = imagequant::new();
        liq.set_speed(4)
            .map_err(|e| CompressionError::Vips(format!("imagequant: {}", e)))?;
        liq.set_quality(0, q)
            .map_err(|e| CompressionError::Vips(format!("imagequant set_quality: {}", e)))?;
        let max_colors = if flags.png_colors >= 2 {
            flags.png_colors.min(256) as u32
        } else {
            256
        };
        liq.set_max_colors(max_colors)
            .map_err(|e| CompressionError::Vips(format!("imagequant set_max_colors: {}", e)))?;

        let pixels: &[imagequant::RGBA] = unsafe {
            std::slice::from_raw_parts(
                rgba.as_ptr() as *const imagequant::RGBA,
                (width as usize) * (height as usize),
            )
        };

        let mut liq_img = liq
            .new_image_borrowed(pixels, width as usize, height as usize, 0.0)
            .map_err(|e| CompressionError::Vips(format!("imagequant new_image: {}", e)))?;

        let mut quantized = liq
            .quantize(&mut liq_img)
            .map_err(|e| CompressionError::Vips(format!("imagequant quantize: {}", e)))?;

        quantized
            .set_dithering_level(1.0)
            .map_err(|e| CompressionError::Vips(format!("imagequant dithering: {}", e)))?;

        let (palette, indexed_pixels) = quantized
            .remapped(&mut liq_img)
            .map_err(|e| CompressionError::Vips(format!("imagequant remap: {}", e)))?;

        let remap_quality = quantized.quantization_quality().unwrap_or(0);
        info!(
            "[compression] imagequant: {} palette colors, quality={}",
            palette.len(),
            remap_quality
        );

        // Encode indexed PNG
        let file = fs::File::create(output)?;
        let w = BufWriter::new(file);
        let mut encoder = png::Encoder::new(w, width, height);
        encoder.set_color(png::ColorType::Indexed);
        encoder.set_depth(png::BitDepth::Eight);

        // Build PLTE and tRNS chunks
        let mut plte = Vec::with_capacity(palette.len() * 3);
        let mut trns = Vec::with_capacity(palette.len());
        let mut has_alpha = false;
        for c in &palette {
            plte.extend_from_slice(&[c.r, c.g, c.b]);
            trns.push(c.a);
            if c.a < 255 {
                has_alpha = true;
            }
        }
        encoder.set_palette(plte);
        if has_alpha {
            encoder.set_trns(trns);
        }

        if flags.png_interlace {
            encoder.set_animated(1, 0).ok();
        }

        let compression = (((100u8.saturating_sub(q)) as f32 / 100.0) * 9.0)
            .round()
            .clamp(0.0, 9.0) as u8;
        let png_compression = match compression {
            0..=1 => png::Compression::Fast,
            2..=5 => png::Compression::Default,
            _ => png::Compression::Best,
        };
        encoder.set_compression(png_compression);

        let mut writer = encoder
            .write_header()
            .map_err(|e| CompressionError::Vips(format!("PNG write_header: {}", e)))?;
        writer
            .write_image_data(&indexed_pixels)
            .map_err(|e| CompressionError::Vips(format!("PNG write_image_data: {}", e)))?;
        writer
            .finish()
            .map_err(|e| CompressionError::Vips(format!("PNG finish: {}", e)))?;

        let size = fs::metadata(output)?.len();
        info!(
            "[compression] PNG (imagequant) {} → {} bytes (q={})",
            input.display(),
            size,
            q
        );
        Ok(size)
    }

    // -- public API ---------------------------------------------------------

    pub fn compress(
        &self,
        input: &Path,
        output: &Path,
        quality: u8,
        flags: &CompressionFlags,
        target_format: Option<ImageFormat>,
    ) -> Result<u64> {
        let format = ImageFormat::from_path(input).ok_or_else(|| {
            CompressionError::UnsupportedFormat(
                input
                    .extension()
                    .map(|e| e.to_string_lossy().into_owned())
                    .unwrap_or_default(),
            )
        })?;

        let q = quality.clamp(1, 100);
        info!("[compression] quality={} → libvips Q={}", quality, q);

        let effective_format = target_format.unwrap_or(format);
        let img = self.load_image(input)?;
        self.compress_loaded(&img, input, output, q, flags, effective_format)
    }

    /// Compress using a pre-loaded VipsImage (avoids repeated disk reads on retries).
    pub fn compress_loaded(
        &self,
        img: &VipsImage<'_>,
        input: &Path,
        output: &Path,
        quality: u8,
        flags: &CompressionFlags,
        effective_format: ImageFormat,
    ) -> Result<u64> {
        match effective_format {
            ImageFormat::Png => self.compress_png(img, input, output, quality, flags),
            ImageFormat::Jpeg => self.compress_jpeg(img, input, output, quality, flags),
            ImageFormat::WebP => self.compress_webp(img, input, output, quality, flags),
            ImageFormat::Avif => self.compress_avif(img, input, output, quality, flags),
            ImageFormat::Heif => self.compress_heif(img, input, output, quality, flags),
            ImageFormat::Tiff => self.compress_tiff(img, input, output, quality, flags),
        }
    }

    // -- format implementations ---------------------------------------------
    // Options are passed via vips filename suffix syntax so we never call
    // variadic C functions through libloading.

    pub fn compress_png(
        &self,
        img: &VipsImage<'_>,
        input: &Path,
        output: &Path,
        quality: u8,
        flags: &CompressionFlags,
    ) -> Result<u64> {
        // Use imagequant for palette mode — much better quantization quality
        if flags.png_palette {
            match self.compress_png_imagequant(img, input, output, quality, flags) {
                Ok(size) => return Ok(size),
                Err(e) => {
                    warn!(
                        "[compression] imagequant failed, falling back to libvips palette: {}",
                        e
                    );
                }
            }
        }

        let q = quality.clamp(1, 100);
        // Higher quality → less compression effort (lower number)
        let compression = (((100u8.saturating_sub(q)) as f32 / 100.0) * 9.0)
            .round()
            .clamp(0.0, 9.0) as i32;

        let out = output_str(output)?;
        let filter = flags.png_filter.as_deref().unwrap_or("248");
        let bitdepth = if flags.png_bitdepth > 0 {
            flags.png_bitdepth
        } else {
            16
        };

        let mut parts = vec![
            format!("compression={}", compression),
            format!("Q={}", q),
            "effort=10".to_string(),
            format!("filter={}", filter),
            "strip".to_string(),
            format!("bitdepth={}", bitdepth),
        ];

        if flags.png_interlace {
            parts.push("interlace=true".to_string());
        }

        let suffix = format!("{}[{}]", out, parts.join(","));

        info!("[compression] PNG save params: {}", suffix);
        self.save_image(img.as_ptr(), &suffix)?;

        let size = fs::metadata(output)?.len();
        info!(
            "[compression] PNG {} → {} bytes (q={})",
            input.display(),
            size,
            q
        );
        Ok(size)
    }

    pub fn compress_jpeg(
        &self,
        img: &VipsImage<'_>,
        input: &Path,
        output: &Path,
        quality: u8,
        flags: &CompressionFlags,
    ) -> Result<u64> {
        let q = quality.clamp(1, 100);
        let mut parts = vec![
            format!("Q={}", q),
            "strip=true".to_string(),
            format!("optimize-coding={}", flags.jpeg_optimize_coding),
        ];
        if flags.jpeg_interlace {
            parts.push("interlace=true".to_string());
        }
        if let Some(ref mode) = flags.jpeg_subsample_mode {
            parts.push(format!("subsample-mode={}", mode));
        }
        if flags.jpeg_trellis_quant {
            parts.push("trellis-quant=true".to_string());
        }
        if flags.jpeg_overshoot_deringing {
            parts.push("overshoot-deringing=true".to_string());
        }

        let suffix = format!("{}[{}]", output_str(output)?, parts.join(","));

        info!("[compression] JPEG save params: {}", suffix);

        let _quantized;
        let save_ptr = if flags.jpeg_quantize {
            match self.extract_rgba(img).and_then(|(w, h, rgba)| {
                let rgb =
                    self.quantize_rgba_to_rgb(&rgba, w, h, quality, flags.jpeg_colors, 0.0)?;
                self.load_image_from_rgb(&rgb, w, h)
            }) {
                Ok(qi) => {
                    _quantized = qi;
                    _quantized.as_ptr()
                }
                Err(e) => {
                    warn!("[compression] JPEG quantize failed, falling back: {}", e);
                    img.as_ptr()
                }
            }
        } else {
            img.as_ptr()
        };

        self.save_image(save_ptr, &suffix)?;

        let size = fs::metadata(output)?.len();
        info!(
            "[compression] JPEG {} → {} bytes (q={})",
            input.display(),
            size,
            q
        );
        Ok(size)
    }

    pub fn compress_webp(
        &self,
        img: &VipsImage<'_>,
        input: &Path,
        output: &Path,
        quality: u8,
        flags: &CompressionFlags,
    ) -> Result<u64> {
        let q = quality.clamp(1, 100);
        let effort = if flags.webp_effort > 0 {
            flags.webp_effort
        } else {
            4
        };
        let mut parts = vec![
            format!("Q={}", q),
            format!("effort={}", effort),
            "strip=true".to_string(),
        ];
        if flags.webp_lossless {
            parts.push("lossless=true".to_string());
        }
        if flags.webp_near_lossless {
            parts.push("near-lossless=true".to_string());
        }
        if flags.webp_smart_subsample {
            parts.push("smart-subsample=true".to_string());
        }
        if flags.webp_alpha_q > 0 && flags.webp_alpha_q < 100 {
            parts.push(format!("alpha-q={}", flags.webp_alpha_q));
        }

        let suffix = format!("{}[{}]", output_str(output)?, parts.join(","));

        info!("[compression] WebP save params: {}", suffix);

        let _quantized;
        let save_ptr = if flags.webp_quantize {
            match self.extract_rgba(img).and_then(|(w, h, rgba)| {
                let rgb =
                    self.quantize_rgba_to_rgb(&rgba, w, h, quality, flags.webp_colors, 0.0)?;
                self.load_image_from_rgb(&rgb, w, h)
            }) {
                Ok(qi) => {
                    _quantized = qi;
                    _quantized.as_ptr()
                }
                Err(e) => {
                    warn!("[compression] WebP quantize failed, falling back: {}", e);
                    img.as_ptr()
                }
            }
        } else {
            img.as_ptr()
        };

        self.save_image(save_ptr, &suffix)?;

        let size = fs::metadata(output)?.len();
        info!(
            "[compression] WebP {} → {} bytes (q={})",
            input.display(),
            size,
            q
        );
        Ok(size)
    }

    pub fn compress_avif(
        &self,
        img: &VipsImage<'_>,
        input: &Path,
        output: &Path,
        quality: u8,
        flags: &CompressionFlags,
    ) -> Result<u64> {
        let q = quality.clamp(1, 100);
        let effort = if flags.avif_effort > 0 {
            flags.avif_effort
        } else {
            4
        };
        let mut parts = vec![
            format!("Q={}", q),
            format!("effort={}", effort),
            "strip=true".to_string(),
        ];
        if flags.avif_lossless {
            parts.push("lossless=true".to_string());
        }
        if flags.avif_bitdepth > 0 {
            parts.push(format!("bitdepth={}", flags.avif_bitdepth));
        }
        if let Some(ref mode) = flags.avif_subsample_mode {
            parts.push(format!("subsample-mode={}", mode));
        }

        let suffix = format!("{}[{}]", output_str(output)?, parts.join(","));

        info!("[compression] AVIF save params: {}", suffix);

        let _quantized;
        let save_ptr = if flags.avif_quantize {
            match self.extract_rgba(img).and_then(|(w, h, rgba)| {
                let rgb =
                    self.quantize_rgba_to_rgb(&rgba, w, h, quality, flags.avif_colors, 0.0)?;
                self.load_image_from_rgb(&rgb, w, h)
            }) {
                Ok(qi) => {
                    _quantized = qi;
                    _quantized.as_ptr()
                }
                Err(e) => {
                    warn!("[compression] AVIF quantize failed, falling back: {}", e);
                    img.as_ptr()
                }
            }
        } else {
            img.as_ptr()
        };

        self.save_image(save_ptr, &suffix)?;

        let size = fs::metadata(output)?.len();
        info!(
            "[compression] AVIF {} → {} bytes (q={})",
            input.display(),
            size,
            q
        );
        Ok(size)
    }

    pub fn compress_heif(
        &self,
        img: &VipsImage<'_>,
        input: &Path,
        output: &Path,
        quality: u8,
        flags: &CompressionFlags,
    ) -> Result<u64> {
        let q = quality.clamp(1, 100);
        let effort = if flags.heif_effort > 0 {
            flags.heif_effort
        } else {
            4
        };
        let mut parts = vec![
            format!("Q={}", q),
            format!("effort={}", effort),
            "strip=true".to_string(),
        ];
        if flags.heif_lossless {
            parts.push("lossless=true".to_string());
        }
        if flags.heif_bitdepth > 0 {
            parts.push(format!("bitdepth={}", flags.heif_bitdepth));
        }

        let suffix = format!("{}[{}]", output_str(output)?, parts.join(","));

        info!("[compression] HEIF save params: {}", suffix);

        let _quantized;
        let save_ptr = if flags.heif_quantize {
            match self.extract_rgba(img).and_then(|(w, h, rgba)| {
                let rgb =
                    self.quantize_rgba_to_rgb(&rgba, w, h, quality, flags.heif_colors, 0.0)?;
                self.load_image_from_rgb(&rgb, w, h)
            }) {
                Ok(qi) => {
                    _quantized = qi;
                    _quantized.as_ptr()
                }
                Err(e) => {
                    warn!("[compression] HEIF quantize failed, falling back: {}", e);
                    img.as_ptr()
                }
            }
        } else {
            img.as_ptr()
        };

        self.save_image(save_ptr, &suffix)?;

        let size = fs::metadata(output)?.len();
        info!(
            "[compression] HEIF {} → {} bytes (q={})",
            input.display(),
            size,
            q
        );
        Ok(size)
    }

    pub fn compress_tiff(
        &self,
        img: &VipsImage<'_>,
        input: &Path,
        output: &Path,
        quality: u8,
        flags: &CompressionFlags,
    ) -> Result<u64> {
        let q = quality.clamp(1, 100);
        let compression = flags.tiff_compression.as_deref().unwrap_or("deflate");
        let predictor = flags.tiff_predictor.as_deref().unwrap_or("horizontal");
        let mut parts = vec![
            format!("compression={}", compression),
            format!("Q={}", q),
            format!("predictor={}", predictor),
            "strip=true".to_string(),
        ];
        if flags.tiff_tile {
            parts.push("tile=true".to_string());
        }
        if flags.tiff_pyramid {
            parts.push("pyramid=true".to_string());
        }
        if flags.tiff_bitdepth > 0 {
            parts.push(format!("bitdepth={}", flags.tiff_bitdepth));
        }

        let suffix = format!("{}[{}]", output_str(output)?, parts.join(","));

        info!("[compression] TIFF save params: {}", suffix);

        let _quantized;
        let save_ptr = if flags.tiff_quantize {
            match self.extract_rgba(img).and_then(|(w, h, rgba)| {
                let rgb =
                    self.quantize_rgba_to_rgb(&rgba, w, h, quality, flags.tiff_colors, 0.0)?;
                self.load_image_from_rgb(&rgb, w, h)
            }) {
                Ok(qi) => {
                    _quantized = qi;
                    _quantized.as_ptr()
                }
                Err(e) => {
                    warn!("[compression] TIFF quantize failed, falling back: {}", e);
                    img.as_ptr()
                }
            }
        } else {
            img.as_ptr()
        };

        self.save_image(save_ptr, &suffix)?;

        let size = fs::metadata(output)?.len();
        info!(
            "[compression] TIFF {} → {} bytes (q={})",
            input.display(),
            size,
            q
        );
        Ok(size)
    }
}

// Safety: Vips holds a loaded library + cached function pointers.
// libvips is documented as thread-safe once initialised.
unsafe impl Send for Vips {}
unsafe impl Sync for Vips {}

impl Drop for Vips {
    fn drop(&mut self) {
        unsafe {
            if let Ok(shutdown) = self._lib.get::<unsafe extern "C" fn()>(b"vips_shutdown\0") {
                shutdown();
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn path_to_cstring(path: &Path) -> Result<CString> {
    CString::new(
        path.to_str()
            .ok_or_else(|| CompressionError::InvalidPath(path.display().to_string()))?,
    )
    .map_err(|_| CompressionError::InvalidPath(path.display().to_string()))
}

fn output_str(path: &Path) -> Result<String> {
    path.to_str()
        .map(|s| s.to_string())
        .ok_or_else(|| CompressionError::InvalidPath(path.display().to_string()))
}

pub fn compressed_output_path(
    input: &Path,
    target_ext: Option<&str>,
) -> Option<std::path::PathBuf> {
    let stem = input.file_stem()?.to_str()?;
    let ext = match target_ext {
        Some(e) => e,
        None => input.extension()?.to_str()?,
    };
    let name = format!("{}_compressed.{}", stem, ext);
    Some(input.with_file_name(name))
}
