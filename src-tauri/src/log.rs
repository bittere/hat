use crate::compression::CompressionRecord;
use log::error;
use std::path::PathBuf;

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
        let _ = self.save();
    }

    pub fn clear(&mut self) {
        self.records.clear();
        let _ = self.save();
    }

    pub fn save(&self) -> Result<(), String> {
        if let Some(parent) = self.path.parent() {
            if let Err(e) = std::fs::create_dir_all(parent) {
                error!("Failed to create log directory: {}", e);
                return Err(format!("Failed to create log directory: {}", e));
            }
        }
        if let Ok(json) = serde_json::to_string_pretty(&self.records) {
            if let Err(e) = std::fs::write(&self.path, json) {
                error!("Failed to save log: {}", e);
                return Err(format!("Failed to save log: {}", e));
            }
        }
        Ok(())
    }
}
