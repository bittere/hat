use libloading::Library;
use log::info;
use serde::Serialize;
use std::ffi::CString;
use std::fs;
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

// ---------------------------------------------------------------------------
// Minimal libvips FFI wrapper
// ---------------------------------------------------------------------------

pub struct Vips {
    _lib: Library,
    fn_new_from_file: VipsNewFromFileFn,
    fn_write_to_file: VipsWriteToFileFn,
    fn_object_unref: GObjectUnrefFn,
    fn_error_buffer: VipsErrorBufferFn,
    fn_error_clear: VipsErrorClearFn,
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

        Ok(Self {
            _lib: lib,
            fn_new_from_file,
            fn_write_to_file,
            fn_object_unref,
            fn_error_buffer,
            fn_error_clear,
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

    fn load_image(&self, path: &Path) -> Result<*mut c_void> {
        let cpath = path_to_cstring(path)?;
        // NULL terminates the variadic arg list
        let img = unsafe { (self.fn_new_from_file)(cpath.as_ptr(), std::ptr::null::<c_char>()) };
        if img.is_null() {
            return Err(CompressionError::Vips(format!(
                "failed to load {}: {}",
                path.display(),
                self.vips_error()
            )));
        }
        Ok(img)
    }

    fn save_image(&self, img: *mut c_void, path_with_opts: &str) -> Result<()> {
        let cpath = CString::new(path_with_opts)
            .map_err(|_| CompressionError::InvalidPath(path_with_opts.to_string()))?;
        // NULL terminates the variadic arg list
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

    fn unref(&self, img: *mut c_void) {
        unsafe { (self.fn_object_unref)(img) };
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

        // The UI sends a "compression level" (1-100) where higher = more compression.
        // libvips Q is the inverse: higher Q = higher quality = less compression.
        let q = (101u8.saturating_sub(quality)).clamp(1, 100);
        info!(
            "[compression] compression_level={} → libvips Q={}",
            quality, q
        );

        let effective_format = target_format.unwrap_or(format);
        match effective_format {
            ImageFormat::Png => self.compress_png(input, output, q, flags),
            ImageFormat::Jpeg => self.compress_jpeg(input, output, q, flags),
            ImageFormat::WebP => self.compress_webp(input, output, q, flags),
            ImageFormat::Avif => self.compress_avif(input, output, q, flags),
            ImageFormat::Heif => self.compress_heif(input, output, q, flags),
            ImageFormat::Tiff => self.compress_tiff(input, output, q, flags),
        }
    }

    // -- format implementations ---------------------------------------------
    // Options are passed via vips filename suffix syntax so we never call
    // variadic C functions through libloading.

    pub fn compress_png(
        &self,
        input: &Path,
        output: &Path,
        quality: u8,
        flags: &CompressionFlags,
    ) -> Result<u64> {
        let q = quality.clamp(1, 100);
        let ui = 101u8.saturating_sub(q);
        let compression = ((ui as f32 / 100.0) * 9.0).round().clamp(0.0, 9.0) as i32;

        let out = output_str(output)?;
        let filter = flags.png_filter.as_deref().unwrap_or("248");
        let bitdepth = if flags.png_bitdepth > 0 {
            flags.png_bitdepth
        } else if flags.png_palette {
            8
        } else {
            16
        };

        let mut parts = if flags.png_palette {
            vec![
                format!("compression={}", compression),
                "palette".to_string(),
                "colours=256".to_string(),
                format!("Q={}", q),
                "dither=0.5".to_string(),
                "effort=10".to_string(),
                format!("filter={}", filter),
                "strip".to_string(),
                format!("bitdepth={}", bitdepth),
            ]
        } else {
            vec![
                format!("compression={}", compression),
                format!("Q={}", q),
                "effort=10".to_string(),
                format!("filter={}", filter),
                "strip".to_string(),
                format!("bitdepth={}", bitdepth),
            ]
        };

        if flags.png_interlace {
            parts.push("interlace=true".to_string());
        }

        let suffix = format!("{}[{}]", out, parts.join(","));

        info!("[compression] PNG save params: {}", suffix);
        let img = self.load_image(input)?;
        let res = self.save_image(img, &suffix);
        self.unref(img);
        res?;

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
        let img = self.load_image(input)?;
        let res = self.save_image(img, &suffix);
        self.unref(img);
        res?;

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
        let img = self.load_image(input)?;
        let res = self.save_image(img, &suffix);
        self.unref(img);
        res?;

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
        let img = self.load_image(input)?;
        let res = self.save_image(img, &suffix);
        self.unref(img);
        res?;

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
        let img = self.load_image(input)?;
        let res = self.save_image(img, &suffix);
        self.unref(img);
        res?;

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
        let img = self.load_image(input)?;
        let res = self.save_image(img, &suffix);
        self.unref(img);
        res?;

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
