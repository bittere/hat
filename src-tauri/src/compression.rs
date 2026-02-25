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
    Webp,
    Tiff,
    Heif,
    Avif,
    Gif,
    Jxl,
}

impl ImageFormat {
    pub fn from_extension(ext: &str) -> Option<Self> {
        match ext.to_ascii_lowercase().as_str() {
            "png" => Some(Self::Png),
            "jpg" | "jpeg" => Some(Self::Jpeg),
            "webp" => Some(Self::Webp),
            "tif" | "tiff" => Some(Self::Tiff),
            "heif" | "heic" => Some(Self::Heif),
            "avif" => Some(Self::Avif),
            "gif" => Some(Self::Gif),
            "jxl" => Some(Self::Jxl),
            _ => None,
        }
    }

    pub fn from_path(path: &Path) -> Option<Self> {
        path.extension()
            .and_then(|e| e.to_str())
            .and_then(Self::from_extension)
    }
}

impl std::fmt::Display for ImageFormat {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Png => write!(f, "png"),
            Self::Jpeg => write!(f, "jpeg"),
            Self::Webp => write!(f, "webp"),
            Self::Tiff => write!(f, "tiff"),
            Self::Heif => write!(f, "heif"),
            Self::Avif => write!(f, "avif"),
            Self::Gif => write!(f, "gif"),
            Self::Jxl => write!(f, "jxl"),
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

    pub fn compress(&self, input: &Path, output: &Path, quality: u8, png_palette: bool) -> Result<u64> {
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

        match format {
            ImageFormat::Png => self.compress_png(input, output, q, png_palette),
            ImageFormat::Jpeg => self.compress_jpeg(input, output, q),
            ImageFormat::Webp => self.compress_webp(input, output, q),
            ImageFormat::Tiff => self.compress_tiff(input, output, q),
            ImageFormat::Heif | ImageFormat::Avif => self.compress_heif(input, output, q),
            ImageFormat::Gif => self.compress_gif(input, output, q),
            ImageFormat::Jxl => self.compress_jxl(input, output, q),
        }
    }

    // -- format implementations ---------------------------------------------
    // Options are passed via vips filename suffix syntax so we never call
    // variadic C functions through libloading.

    pub fn compress_png(&self, input: &Path, output: &Path, quality: u8, palette: bool) -> Result<u64> {
        let q = quality.clamp(1, 100);
        let ui = 101u8.saturating_sub(q);
        let compression = ((ui as f32 / 100.0) * 9.0).round().clamp(0.0, 9.0) as i32;

        let out = output_str(output)?;
        let suffix = if palette {
            format!(
                "{}[compression={},palette,colours=256,Q={},dither=0.5,effort=10,filter=248,strip,bitdepth=8]",
                out, compression, q,
            )
        } else {
            format!(
                "{}[compression={},Q={},effort=10,filter=248,strip,bitdepth=16]",
                out, compression, q,
            )
        };

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

    pub fn compress_jpeg(&self, input: &Path, output: &Path, quality: u8) -> Result<u64> {
        let q = quality.clamp(1, 100);
        let suffix = format!(
            "{}[Q={},strip=true,optimize-coding=true]",
            output_str(output)?,
            q,
        );

        info!("[compression] JPEG save params: {}", suffix);
        let img = self.load_image(input)?;
        let res = self.save_image(img, &suffix);
        self.unref(img);
        res?;

        let size = fs::metadata(output)?.len();
        println!(
            "[compression] JPEG {} → {} bytes (q={})",
            input.display(),
            size,
            q
        );
        Ok(size)
    }

    pub fn compress_webp(&self, input: &Path, output: &Path, quality: u8) -> Result<u64> {
        let q = quality.clamp(1, 100);
        let suffix = format!("{}[Q={},strip=true]", output_str(output)?, q,);

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

    pub fn compress_tiff(&self, input: &Path, output: &Path, quality: u8) -> Result<u64> {
        let q = quality.clamp(1, 100);
        let suffix = format!(
            "{}[Q={},compression=jpeg,strip=true]",
            output_str(output)?,
            q,
        );

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

    pub fn compress_heif(&self, input: &Path, output: &Path, quality: u8) -> Result<u64> {
        let q = quality.clamp(1, 100);
        let suffix = format!("{}[Q={},strip=true]", output_str(output)?, q,);

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

    pub fn compress_gif(&self, input: &Path, output: &Path, quality: u8) -> Result<u64> {
        let q = quality.clamp(1, 100);
        let ui = 101u8.saturating_sub(q);
        let effort = ((ui as f32 / 100.0) * 10.0).round().clamp(1.0, 10.0) as i32;
        let suffix = format!("{}[effort={},dither=1.0]", output_str(output)?, effort,);

        info!("[compression] GIF save params: {}", suffix);
        let img = self.load_image(input)?;
        let res = self.save_image(img, &suffix);
        self.unref(img);
        res?;

        let size = fs::metadata(output)?.len();
        info!(
            "[compression] GIF {} → {} bytes (effort={})",
            input.display(),
            size,
            effort
        );
        Ok(size)
    }

    pub fn compress_jxl(&self, input: &Path, output: &Path, quality: u8) -> Result<u64> {
        let q = quality.clamp(1, 100);
        let suffix = format!("{}[Q={},effort=7,strip=true]", output_str(output)?, q,);

        info!("[compression] JXL save params: {}", suffix);
        let img = self.load_image(input)?;
        let res = self.save_image(img, &suffix);
        self.unref(img);
        res?;

        let size = fs::metadata(output)?.len();
        info!(
            "[compression] JXL {} → {} bytes (q={})",
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

pub fn compressed_output_path(input: &Path) -> Option<std::path::PathBuf> {
    let stem = input.file_stem()?.to_str()?;
    let ext = input.extension()?.to_str()?;
    let name = format!("{}_compressed.{}", stem, ext);
    Some(input.with_file_name(name))
}
