use crate::compression::{ImageFormat, Vips};
use crate::platform::get_lib_path;
use notify::{Event, EventKind, RecursiveMode, Watcher};
use std::path::Path;
use std::sync::Arc;
use tauri::{Emitter, Manager};

#[derive(Clone, serde::Serialize)]
struct NewFile {
    path: String,
}

pub struct VipsState(pub Option<Arc<Vips>>);

pub fn start_downloads_watcher(app: &tauri::AppHandle) {
    let Some(downloads_dir) = dirs::download_dir() else {
        eprintln!("Could not determine downloads directory");
        return;
    };

    let lib_path = get_lib_path(app);
    let vips = match unsafe { Vips::new(&lib_path) } {
        Ok(v) => {
            println!("[compression] libvips loaded from {}", lib_path.display());
            Some(Arc::new(v))
        }
        Err(e) => {
            eprintln!("[compression] Failed to load libvips, auto-compression disabled: {e}");
            None
        }
    };

    app.manage(VipsState(vips.clone()));

    let handle = app.clone();
    let mut watcher = match notify::recommended_watcher(move |res: Result<Event, _>| {
        if let Ok(event) = res {
            let dominated = matches!(
                event.kind,
                EventKind::Create(_)
                    | EventKind::Modify(notify::event::ModifyKind::Name(
                        notify::event::RenameMode::To
                    ))
            );
            if dominated {
                for path in &event.paths {
                    let file_path = Path::new(path);

                    // Skip temporary/incomplete download files
                    if let Some(ext) = file_path.extension().and_then(|e| e.to_str()) {
                        if ext.eq_ignore_ascii_case("tmp") || ext.eq_ignore_ascii_case("crdownload")
                        {
                            println!(
                                "[downloads-watcher] Skipping temporary file: {}",
                                path.display()
                            );
                            continue;
                        }
                    }

                    // Skip files that are already compressed outputs
                    if let Some(stem) = file_path.file_stem().and_then(|s| s.to_str()) {
                        if stem.ends_with("_compressed") {
                            println!(
                                "[downloads-watcher] Skipping compressed file: {}",
                                path.display()
                            );
                            continue;
                        }
                    }

                    let format = ImageFormat::from_path(file_path);
                    println!(
                        "[downloads-watcher] File detected ({:?}): {} [format: {:?}]",
                        event.kind,
                        path.display(),
                        format
                    );

                    let payload = NewFile {
                        path: path.display().to_string(),
                    };
                    match handle.emit("new-download", &payload) {
                        Ok(_) => {
                            println!("[downloads-watcher] Emitted event for: {}", path.display())
                        }
                        Err(e) => eprintln!("[downloads-watcher] Failed to emit event: {e}"),
                    }

                    // Auto-compress if it's a supported image format
                    if format.is_some() {
                        if let Some(ref vips) = vips {
                            let h = handle.clone();
                            let v = vips.clone();
                            let p = path.to_path_buf();
                            std::thread::spawn(move || {
                                if let Err(e) = crate::processor::process_file(&h, &v, &p) {
                                    eprintln!("[downloads-watcher] Error: {e}");
                                }
                            });
                        }
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
