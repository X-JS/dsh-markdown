use crate::state::AppState;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::PathBuf;

/// AI 会话持久化：vault/.dsh/ai/chats/{id}.json
/// messages 为 OpenAI 格式的自由 JSON（含多模态内容数组），前端负责结构与渲染。

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatSummary {
    pub id: String,
    pub title: String,
    pub modified: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatDoc {
    pub id: String,
    pub title: String,
    pub modified: u64,
    pub messages: Value,
}

fn chats_dir(state: &tauri::State<'_, AppState>) -> Result<PathBuf, String> {
    let st = state.lock.lock().unwrap();
    let vault = st.vault.clone().ok_or("未设置知识库目录")?;
    let dir = vault.join(".dsh/ai/chats");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// 列出全部会话（按修改时间倒序）
#[tauri::command]
pub fn ai_chat_list(state: tauri::State<'_, AppState>) -> Result<Vec<ChatSummary>, String> {
    let dir = chats_dir(&state)?;
    let mut out = Vec::new();
    for e in fs::read_dir(&dir).map_err(|e| e.to_string())?.flatten() {
        let p = e.path();
        if p.extension().and_then(|s| s.to_str()) != Some("json") {
            continue;
        }
        let Ok(text) = fs::read_to_string(&p) else { continue };
        let Ok(doc) = serde_json::from_str::<ChatDoc>(&text) else { continue };
        out.push(ChatSummary {
            id: doc.id,
            title: doc.title,
            modified: doc.modified,
        });
    }
    out.sort_by(|a, b| b.modified.cmp(&a.modified));
    out.truncate(100); // 最多保留 100 条索引
    Ok(out)
}

#[tauri::command]
pub fn ai_chat_load(state: tauri::State<'_, AppState>, id: String) -> Result<ChatDoc, String> {
    let safe_id = id.replace(['/', '\\', '.'], "");
    let path = chats_dir(&state)?.join(format!("{safe_id}.json"));
    let text = fs::read_to_string(&path).map_err(|_| "会话不存在".to_string())?;
    serde_json::from_str(&text).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn ai_chat_save(state: tauri::State<'_, AppState>, doc: ChatDoc) -> Result<(), String> {
    let safe_id = doc.id.replace(['/', '\\', '.'], "");
    let path = chats_dir(&state)?.join(format!("{safe_id}.json"));
    let json = serde_json::to_string(&doc).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn ai_chat_delete(state: tauri::State<'_, AppState>, id: String) -> Result<(), String> {
    let safe_id = id.replace(['/', '\\', '.'], "");
    let path = chats_dir(&state)?.join(format!("{safe_id}.json"));
    let _ = fs::remove_file(&path);
    Ok(())
}
