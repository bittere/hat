use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::Manager;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppConfig {
    pub watched_folders: Vec<String>,
}

impl Default for AppConfig {
    fn default() -> Self {
        let mut watched_folders = Vec::new();
        if let Some(downloads) = dirs::download_dir() {
            watched_folders.push(downloads.display().to_string());
        }
        Self { watched_folders }
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

    pub fn save(&self) {
        if let Some(parent) = self.path.parent() {
            if let Err(e) = std::fs::create_dir_all(parent) { eprintln!("Failed to create config directory: {}", e); }
        }
        if let Ok(json) = serde_json::to_string_pretty(&self.config) {
            if let Err(e) = std::fs::write(&self.path, json) { eprintln!("Failed to save config: {}", e); }
        }
    }

    pub fn add_folder(&mut self, folder: String) {
        if !self.config.watched_folders.contains(&folder) {
            self.config.watched_folders.push(folder);
            self.save();
        }
    }

    pub fn remove_folder(&mut self, folder: &str) {
        self.config.watched_folders.retain(|f| f != folder);
        self.save();
    }
}

pub static CONFIG: std::sync::OnceLock<Mutex<ConfigManager>> = std::sync::OnceLock::new();

pub fn init_config(app: &tauri::AppHandle) {
    let config_path = app
        .path()
        .app_config_dir()
        .expect("failed to resolve app config dir")
        .join("config.json");
    let config_manager = ConfigManager::load(config_path);
    let _ = CONFIG.set(Mutex::new(config_manager));
}
