use log::error;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppConfig {
    pub watched_folders: Vec<String>,
    pub quality: u8,
    pub show_background_notification: bool,
    pub show_system_notifications: bool,
}

impl Default for AppConfig {
    fn default() -> Self {
        let mut watched_folders = Vec::new();
        if let Some(downloads) = dirs::download_dir() {
            watched_folders.push(downloads.display().to_string());
        }
        Self {
            watched_folders,
            quality: crate::DEFAULT_QUALITY,
            show_background_notification: true,
            show_system_notifications: true,
        }
    }
}

pub struct ConfigManager {
    pub config: AppConfig,
    path: PathBuf,
}

impl ConfigManager {
    pub fn load(path: PathBuf) -> Self {
        let config = std::fs::read_to_string(&path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_else(AppConfig::default);

        Self { config, path }
    }

    pub fn save(&self) -> Result<(), String> {
        if let Some(parent) = self.path.parent() {
            if let Err(e) = std::fs::create_dir_all(parent) {
                error!("Failed to create config directory: {}", e);
                return Err(format!("Failed to create config directory: {}", e));
            }
        }
        if let Ok(json) = serde_json::to_string_pretty(&self.config) {
            if let Err(e) = std::fs::write(&self.path, json) {
                error!("Failed to save config: {}", e);
                return Err(format!("Failed to save config: {}", e));
            }
        }
        Ok(())
    }

    pub fn add_folder(&mut self, folder: String) {
        if !self.config.watched_folders.contains(&folder) {
            self.config.watched_folders.push(folder);
            let _ = self.save();
        }
    }

    pub fn remove_folder(&mut self, folder: &str) {
        self.config.watched_folders.retain(|f| f != folder);
        let _ = self.save();
    }

    pub fn set_quality(&mut self, quality: u8) {
        self.config.quality = quality;
        let _ = self.save();
    }

    pub fn set_show_background_notification(&mut self, show: bool) {
        self.config.show_background_notification = show;
        let _ = self.save();
    }

    pub fn set_show_system_notifications(&mut self, show: bool) {
        self.config.show_system_notifications = show;
        let _ = self.save();
    }
}
