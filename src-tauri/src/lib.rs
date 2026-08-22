mod ai;
mod chats;
mod config;
mod fetch;
mod fs;
mod state;
mod watcher;

use state::AppState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // 启动时把持久化的 vault 路径恢复进运行时状态，并确保目录结构齐全
            let cfg = config::load_config();
            if let Some(vp) = &cfg.vault_path {
                let p = std::path::PathBuf::from(vp);
                if p.is_dir() {
                    for d in ["attachments", "templates", ".dsh"] {
                        let _ = std::fs::create_dir_all(p.join(d));
                    }
                    app.state::<AppState>().lock.lock().unwrap().vault = Some(p);
                }
            }
            Ok(())
        })
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            // 配置
            get_config,
            set_config,
            // 知识库文件
            fs::list_dir,
            fs::read_file,
            fs::write_file,
            fs::create_note,
            fs::create_dir,
            fs::rename_entry,
            fs::move_entry,
            fs::delete_entry,
            fs::search_vault,
            fs::list_all_notes,
            fs::index_links,
            fs::save_attachment,
            fs::ensure_vault,
            // 监听
            watcher::start_watch,
            // 网页抓取
            fetch::fetch_page,
            // AI
            ai::ai_chat,
            chats::ai_chat_list,
            chats::ai_chat_load,
            chats::ai_chat_save,
            chats::ai_chat_delete,
            fetch::download_images,
            fetch::interactive_screenshot,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
fn get_config() -> config::Config {
    config::load_config()
}

#[tauri::command]
fn set_config(
    state: tauri::State<'_, AppState>,
    vault_path: Option<String>,
    ai_base_url: Option<String>,
    ai_model: Option<String>,
    ai_vision_model: Option<String>,
    ai_api_key: Option<String>,
    theme: Option<String>,
) -> Result<config::Config, String> {
    let mut cfg = config::load_config();
    if let Some(v) = vault_path {
        // vault 变更时同步运行时状态并重启监听
        let mut st = state.lock.lock().unwrap();
        if st.vault.as_deref() != Some(std::path::Path::new(&v)) {
            st.vault = Some(std::path::PathBuf::from(&v));
            cfg.vault_path = Some(v);
        }
    }
    if let Some(v) = ai_base_url {
        cfg.ai_base_url = v;
    }
    if let Some(v) = ai_model {
        cfg.ai_model = v;
    }
    if let Some(v) = ai_vision_model {
        cfg.ai_vision_model = v;
    }
    if let Some(v) = ai_api_key {
        cfg.ai_api_key = v;
    }
    if let Some(v) = theme {
        cfg.theme = v;
    }
    config::save_config(&cfg);
    Ok(cfg)
}
