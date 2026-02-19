use crate::compression::CompressionRecord;
use std::path::PathBuf;
use std::sync::Mutex;

pub struct CompressionLog {
    pub records: Vec<CompressionRecord>,
    path: PathBuf,
}

impl CompressionLog {
    pub fn load(path: PathBuf) -> Self {
        let records = std::fs::read_to_string(&path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default();
        Self { records, path }
    }

    pub fn append(&mut self, record: CompressionRecord) {
        self.records.push(record);
        self.save();
    }

    pub fn clear(&mut self) {
        self.records.clear();
        self.save();
    }

    pub fn save(&self) {
        if let Some(parent) = self.path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if let Ok(json) = serde_json::to_string_pretty(&self.records) {
            let _ = std::fs::write(&self.path, json);
        }
    }
}

pub static COMPRESSION_LOG: std::sync::OnceLock<Mutex<CompressionLog>> = std::sync::OnceLock::new();

pub fn init_compression_log(app: &tauri::AppHandle) {
    use tauri::Manager;
    let log_path = app
        .path()
        .app_data_dir()
        .expect("failed to resolve app data dir")
        .join("compression_log.json");
    let log = CompressionLog::load(log_path);
    let _ = COMPRESSION_LOG.set(Mutex::new(log));
}
