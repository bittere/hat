use libloading::{Library, Symbol};
use notify::{Event, EventKind, RecursiveMode, Watcher};
use serde::Serialize;
use std::ffi::{CStr, CString};
use std::os::raw::{c_char, c_int};
use std::path::PathBuf;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};

fn get_target_double() -> &'static str {
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

fn get_lib_filename() -> &'static str {
    #[cfg(target_os = "windows")]
    { "libvips-42.dll" }
    #[cfg(target_os = "macos")]
    { "libvips-cpp.8.17.3.dylib" }
    #[cfg(target_os = "linux")]
    { "libvips-cpp.so.8.17.3" }
}

fn get_lib_path(app: &tauri::AppHandle) -> PathBuf {
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

#[derive(Serialize)]
struct VipsStatus {
    loaded: bool,
    target: String,
    lib_path: String,
    version: Option<String>,
    initialized: bool,
    error: Option<String>,
}

#[tauri::command]
fn get_vips_status(app: tauri::AppHandle) -> VipsStatus {
    let target = get_target_double().to_string();
    let lib_path = get_lib_path(&app);
    let lib_path_str = lib_path.display().to_string();

    let lib = match unsafe { Library::new(&lib_path) } {
        Ok(lib) => lib,
        Err(e) => {
            return VipsStatus {
                loaded: false,
                target,
                lib_path: lib_path_str,
                version: None,
                initialized: false,
                error: Some(format!("Failed to load library: {}", e)),
            };
        }
    };

    let version = unsafe {
        lib.get::<Symbol<unsafe extern "C" fn() -> *const c_char>>(b"vips_version_string\0")
            .ok()
            .and_then(|f| {
                let ptr = f();
                if ptr.is_null() {
                    None
                } else {
                    Some(CStr::from_ptr(ptr).to_string_lossy().into_owned())
                }
            })
    };

    let initialized = unsafe {
        lib.get::<Symbol<unsafe extern "C" fn(*const c_char) -> c_int>>(b"vips_init\0")
            .ok()
            .map(|f| {
                let name = CString::new("hat").unwrap();
                f(name.as_ptr()) == 0
            })
            .unwrap_or(false)
    };

    if initialized {
        unsafe {
            if let Ok(f) = lib.get::<Symbol<unsafe extern "C" fn()>>(b"vips_shutdown\0") {
                f();
            }
        }
    }

    VipsStatus {
        loaded: true,
        target,
        lib_path: lib_path_str,
        version,
        initialized,
        error: None,
    }
}

#[derive(Clone, Serialize)]
struct NewFile {
    path: String,
}

fn start_downloads_watcher(app: &tauri::AppHandle) {
    let Some(downloads_dir) = dirs::download_dir() else {
        eprintln!("Could not determine downloads directory");
        return;
    };

    let handle = app.clone();
    let mut watcher = match notify::recommended_watcher(move |res: Result<Event, _>| {
        if let Ok(event) = res {
            let dominated = matches!(
                event.kind,
                EventKind::Create(_)
                    | EventKind::Modify(notify::event::ModifyKind::Name(notify::event::RenameMode::To))
            );
            if dominated {
                for path in &event.paths {
                    println!("[downloads-watcher] File detected ({:?}): {}", event.kind, path.display());
                    let payload = NewFile {
                        path: path.display().to_string(),
                    };
                    match handle.emit("new-download", &payload) {
                        Ok(_) => println!("[downloads-watcher] Emitted event for: {}", path.display()),
                        Err(e) => eprintln!("[downloads-watcher] Failed to emit event: {e}"),
                    }
                }
            } else {
                println!("[downloads-watcher] Event (ignored): {:?}", event.kind);
            }
        }
    }) {
        Ok(w) => w,
        Err(e) => {
            eprintln!("Failed to create file watcher: {e}");
            return;
        }
    };

    if let Err(e) = watcher.watch(&downloads_dir, RecursiveMode::NonRecursive) {
        eprintln!("Failed to watch downloads directory: {e}");
        return;
    }

    // Leak the watcher so it lives for the entire app lifetime
    std::mem::forget(watcher);
    println!("Watching downloads directory: {}", downloads_dir.display());
}

fn load_icon() -> tauri::image::Image<'static> {
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![get_vips_status])
        .setup(|app| {
            let window = app.get_webview_window("main").unwrap();
            let icon = load_icon();
            window.set_icon(icon.clone())?;

            let show_i = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &quit_i])?;

            start_downloads_watcher(app.handle());

            TrayIconBuilder::new()
                .icon(icon)
                .tooltip("Hat")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.unminimize();
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.unminimize();
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
