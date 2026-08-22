use crate::state::AppState;
use notify::{RecursiveMode, Watcher};
use std::path::PathBuf;
use std::sync::mpsc;
use std::time::{Duration, Instant};
use tauri::Emitter;

/// 监听 vault 文件变化，变化时向前端发送 "fs-change" 事件（400ms 去抖）。
/// macOS 底层为 FSEvents，事件驱动，空闲时零 CPU 占用。
#[tauri::command]
pub fn start_watch(state: tauri::State<'_, AppState>, app: tauri::AppHandle) -> Result<(), String> {
    let vault: PathBuf = {
        let mut st = state.lock.lock().unwrap();
        st.watcher = None; // drop 旧 watcher 即停止监听
        st.vault
            .clone()
            .ok_or_else(|| "未设置知识库目录".to_string())?
    };

    let (tx, rx) = mpsc::channel();
    let mut watcher =
        notify::recommended_watcher(move |res: Result<notify::Event, notify::Error>| {
            if res.is_ok() {
                let _ = tx.send(());
            }
        })
        .map_err(|e| e.to_string())?;

    watcher
        .watch(&vault, RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;

    std::thread::spawn(move || {
        let mut last = Instant::now() - Duration::from_secs(60);
        while rx.recv().is_ok() {
            while rx.try_recv().is_ok() {}
            if last.elapsed() < Duration::from_millis(400) {
                continue;
            }
            last = Instant::now();
            let _ = app.emit("fs-change", ());
        }
    });

    state.lock.lock().unwrap().watcher = Some(watcher);
    Ok(())
}
