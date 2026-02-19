use std::path::PathBuf;

pub fn get_target_double() -> &'static str {
    #[cfg(all(target_os = "windows", target_arch = "x86_64"))]
    { "win32-x64" }
    #[cfg(all(target_os = "windows", target_arch = "aarch64"))]
    { "win32-arm64" }
    #[cfg(all(target_os = "windows", target_arch = "x86"))]
    { "win32-ia32" }
    #[cfg(all(target_os = "macos", target_arch = "x86_64"))]
    { "darwin-x64" }
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    { "darwin-arm64" }
    #[cfg(all(target_os = "linux", target_arch = "x86_64"))]
    { "linux-x64" }
    #[cfg(all(target_os = "linux", target_arch = "aarch64"))]
    { "linux-arm64" }
    #[cfg(all(target_os = "linux", target_arch = "arm"))]
    { "linux-arm" }
}

pub fn get_lib_filename() -> &'static str {
    #[cfg(target_os = "windows")]
    { "libvips-42.dll" }
    #[cfg(target_os = "macos")]
    { "libvips-cpp.8.17.3.dylib" }
    #[cfg(target_os = "linux")]
    { "libvips-cpp.so.8.17.3" }
}

pub fn get_lib_path(app: &tauri::AppHandle) -> PathBuf {
    use tauri::Manager;
    // In production, use the bundled resource
    if let Ok(resource_dir) = app.path().resource_dir() {
        let bundled = resource_dir.join("libvips").join(get_lib_filename());
        if bundled.exists() {
            return bundled;
        }
    }
    // In dev, use the vendor directory relative to src-tauri
    PathBuf::from("../vendor/libvips")
        .join(get_target_double())
        .join("lib")
        .join(get_lib_filename())
}

pub fn load_icon() -> tauri::image::Image<'static> {
    #[cfg(target_os = "windows")]
    {
        tauri::image::Image::from_path("icons/icon.ico")
            .expect("failed to load icon.ico")
    }
    #[cfg(not(target_os = "windows"))]
    {
        tauri::image::Image::from_path("icons/128x128@2x.png")
            .expect("failed to load icon png")
    }
}
