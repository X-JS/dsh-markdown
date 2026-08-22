use notify::RecommendedWatcher;
use std::path::PathBuf;
use std::sync::Mutex;

/// 可变共享状态：vault 根目录 + 活跃的文件监听器
pub struct AppInner {
    pub vault: Option<PathBuf>,
    pub watcher: Option<RecommendedWatcher>,
}

pub struct AppState {
    pub lock: Mutex<AppInner>,
}

impl Default for AppState {
    fn default() -> Self {
        AppState {
            lock: Mutex::new(AppInner {
                vault: None,
                watcher: None,
            }),
        }
    }
}
