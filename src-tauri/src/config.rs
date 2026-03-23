use log::error;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PngConfig {
    pub quality: u8,
    #[serde(default)]
    pub palette: bool,
    #[serde(default)]
    pub convert_to: Option<String>,
    #[serde(default)]
    pub interlace: bool,
    #[serde(default)]
    pub bitdepth: u8,
    #[serde(default)]
    pub filter: Option<String>,
    #[serde(default = "default_png_colors")]
    pub colors: u16,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct JpegConfig {
    pub quality: u8,
    #[serde(default)]
    pub convert_to: Option<String>,
    #[serde(default = "default_true")]
    pub optimize_coding: bool,
    #[serde(default)]
    pub interlace: bool,
    #[serde(default)]
    pub subsample_mode: Option<String>,
    #[serde(default)]
    pub trellis_quant: bool,
    #[serde(default)]
    pub overshoot_deringing: bool,
    #[serde(default)]
    pub quantize: bool,
    #[serde(default = "default_quantize_colors")]
    pub colors: u16,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WebpConfig {
    pub quality: u8,
    #[serde(default)]
    pub convert_to: Option<String>,
    #[serde(default = "default_effort_4")]
    pub effort: u8,
    #[serde(default)]
    pub lossless: bool,
    #[serde(default)]
    pub near_lossless: bool,
    #[serde(default)]
    pub smart_subsample: bool,
    #[serde(default = "default_alpha_q")]
    pub alpha_q: u8,
    #[serde(default)]
    pub quantize: bool,
    #[serde(default = "default_quantize_colors")]
    pub colors: u16,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AvifConfig {
    pub quality: u8,
    #[serde(default)]
    pub convert_to: Option<String>,
    #[serde(default = "default_effort_4")]
    pub effort: u8,
    #[serde(default)]
    pub lossless: bool,
    #[serde(default)]
    pub bitdepth: u8,
    #[serde(default)]
    pub subsample_mode: Option<String>,
    #[serde(default)]
    pub quantize: bool,
    #[serde(default = "default_quantize_colors")]
    pub colors: u16,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HeifConfig {
    pub quality: u8,
    #[serde(default)]
    pub convert_to: Option<String>,
    #[serde(default = "default_effort_4")]
    pub effort: u8,
    #[serde(default)]
    pub lossless: bool,
    #[serde(default)]
    pub bitdepth: u8,
    #[serde(default)]
    pub quantize: bool,
    #[serde(default = "default_quantize_colors")]
    pub colors: u16,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TiffConfig {
    pub quality: u8,
    #[serde(default)]
    pub convert_to: Option<String>,
    #[serde(default)]
    pub compression: Option<String>,
    #[serde(default)]
    pub predictor: Option<String>,
    #[serde(default)]
    pub tile: bool,
    #[serde(default)]
    pub pyramid: bool,
    #[serde(default)]
    pub bitdepth: u8,
    #[serde(default)]
    pub quantize: bool,
    #[serde(default = "default_quantize_colors")]
    pub colors: u16,
}

fn default_png_colors() -> u16 {
    256
}

fn default_quantize_colors() -> u16 {
    256
}

fn default_true() -> bool {
    true
}

fn default_effort_4() -> u8 {
    4
}

fn default_alpha_q() -> u8 {
    100
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FormatOptions {
    pub png: PngConfig,
    pub jpeg: JpegConfig,
    #[serde(default = "default_webp_config")]
    pub webp: WebpConfig,
    #[serde(default = "default_avif_config")]
    pub avif: AvifConfig,
    #[serde(default = "default_heif_config")]
    pub heif: HeifConfig,
    #[serde(default = "default_tiff_config")]
    pub tiff: TiffConfig,
}

fn default_webp_config() -> WebpConfig {
    WebpConfig {
        quality: crate::DEFAULT_QUALITY,
        convert_to: None,
        effort: 4,
        lossless: false,
        near_lossless: false,
        smart_subsample: false,
        alpha_q: 100,
        quantize: false,
        colors: 256,
    }
}

fn default_avif_config() -> AvifConfig {
    AvifConfig {
        quality: crate::DEFAULT_QUALITY,
        convert_to: None,
        effort: 4,
        lossless: false,
        bitdepth: 0,
        subsample_mode: None,
        quantize: false,
        colors: 256,
    }
}

fn default_heif_config() -> HeifConfig {
    HeifConfig {
        quality: crate::DEFAULT_QUALITY,
        convert_to: None,
        effort: 4,
        lossless: false,
        bitdepth: 0,
        quantize: false,
        colors: 256,
    }
}

fn default_tiff_config() -> TiffConfig {
    TiffConfig {
        quality: crate::DEFAULT_QUALITY,
        convert_to: None,
        compression: None,
        predictor: None,
        tile: false,
        pyramid: false,
        bitdepth: 0,
        quantize: false,
        colors: 256,
    }
}

impl Default for FormatOptions {
    fn default() -> Self {
        let q = crate::DEFAULT_QUALITY;
        Self {
            png: PngConfig {
                quality: q,
                palette: false,
                convert_to: None,
                interlace: false,
                bitdepth: 0,
                filter: None,
                colors: 256,
            },
            jpeg: JpegConfig {
                quality: q,
                convert_to: None,
                optimize_coding: true,
                interlace: false,
                subsample_mode: None,
                trellis_quant: false,
                overshoot_deringing: false,
                quantize: false,
                colors: 256,
            },
            webp: default_webp_config(),
            avif: default_avif_config(),
            heif: default_heif_config(),
            tiff: default_tiff_config(),
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppConfig {
    pub watched_folders: Vec<String>,
    pub quality: u8,
    pub show_background_notification: bool,
    pub show_system_notifications: bool,
    #[serde(default)]
    pub format_options: FormatOptions,
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
            format_options: FormatOptions::default(),
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
            .unwrap_or_default();

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

    pub fn set_format_options(&mut self, options: FormatOptions) {
        self.config.format_options = options;
        let _ = self.save();
    }

    pub fn reset(&mut self) -> Result<(), String> {
        self.config = AppConfig::default();
        self.save()
    }
}
