use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

/// 应用全局配置：存放于 ~/Library/Application Support/dsh-markdown/config.json
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    #[serde(rename = "vaultPath", default)]
    pub vault_path: Option<String>,
    #[serde(rename = "aiBaseUrl", default = "default_ai_base")]
    pub ai_base_url: String,
    #[serde(rename = "aiModel", default = "default_ai_model")]
    pub ai_model: String,
    #[serde(rename = "aiVisionModel", default = "default_ai_vision_model")]
    pub ai_vision_model: String,
    #[serde(rename = "aiApiKey", default)]
    pub ai_api_key: String,
    #[serde(rename = "theme", default = "default_theme")]
    pub theme: String,
}

fn default_ai_base() -> String {
    "https://api.deepseek.com".to_string()
}
fn default_ai_model() -> String {
    "deepseek-v4-flash".to_string()
}
fn default_ai_vision_model() -> String {
    "deepseek-v4-flash-vision-exp".to_string()
}
fn default_theme() -> String {
    "auto".to_string()
}

impl Default for Config {
    fn default() -> Self {
        Config {
            vault_path: None,
            ai_base_url: default_ai_base(),
            ai_model: default_ai_model(),
            ai_vision_model: default_ai_vision_model(),
            ai_api_key: String::new(),
            theme: default_theme(),
        }
    }
}

fn config_file() -> PathBuf {
    let base = dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("com.zhufeng.zf-markdown");
    let _ = fs::create_dir_all(&base);
    base.join("config.json")
}

pub fn load_config() -> Config {
    match fs::read_to_string(config_file()) {
        Ok(s) => serde_json::from_str(&s).unwrap_or_default(),
        Err(_) => Config::default(),
    }
}

pub fn save_config(cfg: &Config) {
    if let Ok(json) = serde_json::to_string_pretty(cfg) {
        let _ = fs::write(config_file(), json);
    }
}
