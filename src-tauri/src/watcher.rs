use crate::compression::{ImageFormat, Vips};
use crate::platform::get_lib_path;
use notify::{Event, EventKind, RecursiveMode, Watcher};
use std::path::Path;
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager};

#[derive(Clone, serde::Serialize)]
struct NewFile {
    path: String,
}

pub struct VipsState(pub Option<Arc<Vips>>);

pub struct WatcherHandle {
    pub watcher: Mutex<notify::RecommendedWatcher>,
}

pub fn init_watcher(app: &tauri::AppHandle) {
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
    let watcher = match notify::recommended_watcher(move |res: Result<Event, _>| {
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
                        let ext_lower = ext.to_lowercase();
                        if ext_lower == "tmp" || ext_lower == "crdownload" || ext_lower == "part"
                        {
                            println!(
                                "[watcher] Skipping temporary file: {}",
                                path.display()
                            );
                            continue;
                        }
                    }

                    // Skip files that are already compressed outputs
                    if let Some(stem) = file_path.file_stem().and_then(|s| s.to_str()) {
                        if stem.ends_with("_compressed") {
                            println!(
                                "[watcher] Skipping compressed file: {}",
                                path.display()
                            );
                            continue;
                        }
                    }

                    let format = ImageFormat::from_path(file_path);
                    println!(
                        "[watcher] File detected ({:?}): {} [format: {:?}]",
                        event.kind,
                        path.display(),
                        format
                    );

                    let payload = NewFile {
                        path: path.display().to_string(),
                    };
                    // We keep "new-download" event name for compatibility with frontend hooks for now,
                    // though it now means "new file in watched folder"
                    match handle.emit("new-download", &payload) {
                        Ok(_) => {
                            println!("[watcher] Emitted event for: {}", path.display())
                        }
                        Err(e) => eprintln!("[watcher] Failed to emit event: {e}"),
                    }

                    // Auto-compress if it's a supported image format
                    if format.is_some() {
                        if let Some(ref vips) = vips {
                            let h = handle.clone();
                            let v = vips.clone();
                            let p = path.to_path_buf();
                            std::thread::spawn(move || {
                                if let Err(e) = crate::processor::process_file(&h, &v, &p) {
                                    eprintln!("[watcher] Error: {e}");
                                }
                            });
                        }
                    }
                }
            }
        }
    }) {
        Ok(w) => w,
        Err(e) => {
            eprintln!("Failed to create file watcher: {e}");
            return;
        }
    };

    let watcher_handle = WatcherHandle {
        watcher: Mutex::new(watcher),
    };

    // Initial folders from config
    let folders = {
        let config_manager = crate::config::CONFIG.get().unwrap().lock().unwrap();
        config_manager.config.watched_folders.clone()
    };

    {
        let mut w = watcher_handle.watcher.lock().unwrap();
        for folder in folders {
            let path = Path::new(&folder);
            if path.exists() {
                if let Err(e) = w.watch(path, RecursiveMode::NonRecursive) {
                    eprintln!("Failed to watch directory {}: {}", folder, e);
                } else {
                    println!("Watching directory: {}", folder);
                }
            }
        }
    }

    app.manage(watcher_handle);
}
