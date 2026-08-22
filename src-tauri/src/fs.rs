use crate::state::AppInner;
use rayon::prelude::*;
use base64::Engine;
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::MutexGuard;
use std::time::UNIX_EPOCH;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Node {
    pub name: String,
    pub rel_path: String,
    pub is_dir: bool,
    pub size: u64,
    /// markdown 笔记的标题（首个 # 或文件名）
    pub title: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadResult {
    pub content: String,
    pub size: u64,
    pub modified: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub rel_path: String,
    pub line_no: usize,
    pub line_text: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkEntry {
    /// 引用发生的文件（相对路径）
    pub source: String,
    /// 被引用的笔记名（[[}] 内原文）
    pub target: String,
}

/// 需要隐藏的目录（应用私有数据、系统噪音）
const HIDDEN_DIRS: [&str; 4] = [".dsh", ".git", ".obsidian", ".DS_Store"];

/// 把相对路径安全地解析到 vault 内，防止路径穿越
pub fn resolve(state: &MutexGuard<'_, AppInner>, rel: &str) -> Result<PathBuf, String> {
    let vault = state
        .vault
        .as_ref()
        .ok_or_else(|| "未设置知识库目录".to_string())?;
    let rel = rel.trim_start_matches('/');
    let p = vault.join(rel);
    // 规范化后必须仍在 vault 内（用分量比较，避免 canonicalize 要求文件存在）
    let norm = normalize(&p);
    if norm.starts_with(vault) {
        Ok(norm)
    } else {
        Err("非法路径".to_string())
    }
}

fn normalize(p: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for c in p.components() {
        match c {
            std::path::Component::ParentDir => {
                out.pop();
            }
            std::path::Component::CurDir => {}
            other => out.push(other.as_os_str()),
        }
    }
    out
}

fn to_rel(state: &MutexGuard<'_, AppInner>, p: &Path) -> String {
    let vault = state.vault.as_ref().unwrap();
    p.strip_prefix(vault)
        .unwrap_or(p)
        .to_string_lossy()
        .replace('\\', "/")
}

/// 列出某层目录内容（目录优先、字母序）
#[tauri::command]
pub fn list_dir(state: tauri::State<'_, crate::state::AppState>, rel: String) -> Result<Vec<Node>, String> {
    let st = state.lock.lock().unwrap();
    let dir = resolve(&st, &rel)?;
    let mut nodes: Vec<Node> = Vec::new();
    let entries = fs::read_dir(&dir).map_err(|e| e.to_string())?;
    for e in entries.flatten() {
        let name = e.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }
        let md = e.metadata().ok();
        let is_dir = md.as_ref().map(|m| m.is_dir()).unwrap_or(false);
        let size = md.as_ref().map(|m| m.len()).unwrap_or(0);
        let rel_path = if rel.is_empty() {
            name.clone()
        } else {
            format!("{}/{}", rel.trim_end_matches('/'), name)
        };
        let title = if is_dir {
            None
        } else {
            note_title(&e.path())
        };
        nodes.push(Node {
            name,
            rel_path,
            is_dir,
            size,
            title,
        });
    }
    nodes.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });
    Ok(nodes)
}

/// 从 md 文件头部提取标题（首个「# 」或 front-matter title:）
fn note_title(path: &Path) -> Option<String> {
    let Ok(meta) = fs::metadata(path) else {
        return None;
    };
    if meta.len() > 512 * 1024 {
        return None; // 大文件不预读
    }
    let Ok(text) = fs::read_to_string(path) else {
        return None;
    };
    extract_title(&text)
}

pub fn extract_title(text: &str) -> Option<String> {
    let mut in_fm = false;
    let mut fm_start = false;
    for (i, line) in text.lines().enumerate() {
        if i == 0 && line.trim() == "---" {
            in_fm = true;
            fm_start = true;
            continue;
        }
        if fm_start && in_fm {
            if line.trim() == "---" {
                in_fm = false;
                continue;
            }
            let t = line.trim();
            if let Some(v) = t.strip_prefix("title:") {
                return Some(v.trim().trim_matches('"').trim_matches('\'').to_string());
            }
            continue;
        }
        if !in_fm {
            if let Some(h) = line.strip_prefix("# ") {
                let t = h.trim();
                if !t.is_empty() {
                    return Some(t.to_string());
                }
            }
            if !line.trim().is_empty() {
                return None;
            }
        }
    }
    None
}

#[tauri::command]
pub fn read_file(state: tauri::State<'_, crate::state::AppState>, rel: String) -> Result<ReadResult, String> {
    let st = state.lock.lock().unwrap();
    let path = resolve(&st, &rel)?;
    let meta = fs::metadata(&path).map_err(|e| e.to_string())?;
    let content = fs::read_to_string(&path)
        .map_err(|e| format!("读取失败（二进制文件或编码问题）：{e}"))?;
    let modified = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);
    Ok(ReadResult {
        size: meta.len(),
        content,
        modified,
    })
}

#[tauri::command]
pub fn write_file(state: tauri::State<'_, crate::state::AppState>, rel: String, content: String) -> Result<(), String> {
    let st = state.lock.lock().unwrap();
    let path = resolve(&st, &rel)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    // 先写临时文件再原子重命名，避免崩溃留下半截文件
    let tmp = path.with_extension("md.tmp");
    fs::write(&tmp, &content).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &path).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        e.to_string()
    })?;
    Ok(())
}

/// 新建笔记；返回相对路径。同名冲突时自动加 -2 后缀。
#[tauri::command]
pub fn create_note(
    state: tauri::State<'_, crate::state::AppState>,
    dir: String,
    title: String,
    content: Option<String>,
) -> Result<String, String> {
    let st = state.lock.lock().unwrap();
    let dir = dir.trim_end_matches('/').to_string();
    let safe_title = sanitize_filename(&title);
    if safe_title.is_empty() {
        return Err("标题不能为空".to_string());
    }
    let mut rel = if dir.is_empty() {
        format!("{safe_title}.md")
    } else {
        format!("{dir}/{safe_title}.md")
    };
    let mut n = 2;
    while resolve(&st, &rel).map(|p| p.exists()).unwrap_or(false) {
        rel = if dir.is_empty() {
            format!("{safe_title}-{n}.md")
        } else {
            format!("{dir}/{safe_title}-{n}.md")
        };
        n += 1;
    }
    let body = content.unwrap_or_else(|| format!("# {title}\n\n"));
    write_file_inner(&st, &rel, &body)?;
    Ok(rel)
}

fn write_file_inner(st: &MutexGuard<'_, AppInner>, rel: &str, content: &str) -> Result<(), String> {
    let path = resolve(st, rel)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&path, content).map_err(|e| e.to_string())?;
    Ok(())
}

fn sanitize_filename(name: &str) -> String {
    name.chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => ' ',
            _ => c
        })
        .collect::<String>()
        .trim()
        .to_string()
}

#[tauri::command]
pub fn create_dir(state: tauri::State<'_, crate::state::AppState>, parent: String, name: String) -> Result<String, String> {
    let st = state.lock.lock().unwrap();
    let safe = sanitize_filename(&name);
    if safe.is_empty() {
        return Err("名称不能为空".to_string());
    }
    let rel = if parent.is_empty() {
        safe.clone()
    } else {
        format!("{}/{}", parent.trim_end_matches('/'), safe)
    };
    let path = resolve(&st, &rel)?;
    fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    Ok(rel)
}

#[tauri::command]
pub fn rename_entry(
    state: tauri::State<'_, crate::state::AppState>,
    rel: String,
    new_name: String,
) -> Result<String, String> {
    let st = state.lock.lock().unwrap();
    let path = resolve(&st, &rel)?;
    let parent = path.parent().ok_or("无效路径")?;
    let safe = sanitize_filename(&new_name);
    if safe.is_empty() {
        return Err("名称不能为空".to_string());
    }
    let dst = parent.join(&safe);
    if dst.exists() {
        return Err("同名文件已存在".to_string());
    }
    fs::rename(&path, &dst).map_err(|e| e.to_string())?;
    Ok(to_rel(&st, &dst))
}

/// 移动文件/目录到另一目录（拖拽归档用）
#[tauri::command]
pub fn move_entry(
    state: tauri::State<'_, crate::state::AppState>,
    rel: String,
    dst_dir: String,
) -> Result<String, String> {
    let st = state.lock.lock().unwrap();
    let src = resolve(&st, &rel)?;
    let name = src.file_name().ok_or("无效路径")?.to_string_lossy().to_string();
    let dst = resolve(&st, &format!("{}/{}", dst_dir.trim_end_matches('/'), name))?;
    if dst.exists() {
        return Err("目标已存在同名文件".to_string());
    }
    fs::rename(&src, &dst).map_err(|e| e.to_string())?;
    Ok(to_rel(&st, &dst))
}

/// 删除到系统废纸篓（可恢复）
#[tauri::command]
pub fn delete_entry(state: tauri::State<'_, crate::state::AppState>, rel: String) -> Result<(), String> {
    let st = state.lock.lock().unwrap();
    let path = resolve(&st, &rel)?;
    trash::delete(&path).map_err(|e| e.to_string())
}

/// 全文搜索：rayon 并行扫描 vault 内 md/txt，返回命中行
#[tauri::command]
pub fn search_vault(
    state: tauri::State<'_, crate::state::AppState>,
    query: String,
) -> Result<Vec<SearchHit>, String> {
    let st = state.lock.lock().unwrap();
    let vault = st.vault.clone().ok_or("未设置知识库目录")?;
    let q = query.to_lowercase();
    if q.is_empty() {
        return Ok(vec![]);
    }
    let files = collect_text_files(&vault, &vault);
    let hits: Vec<SearchHit> = files
        .par_iter()
        .filter_map(|abs| {
            let Ok(text) = fs::read_to_string(abs) else {
                return None;
            };
            let rel = abs.strip_prefix(&vault).unwrap().to_string_lossy().replace('\\', "/");
            let mut out = Vec::new();
            for (i, line) in text.lines().enumerate() {
                if line.len() > 500 {
                    continue; // 超长行（如 base64）跳过
                }
                if line.to_lowercase().contains(&q) {
                    out.push(SearchHit {
                        rel_path: rel.clone(),
                        line_no: i + 1,
                        line_text: line.trim().chars().take(160).collect(),
                    });
                    if out.len() >= 20 {
                        break; // 单文件最多 20 条命中
                    }
                }
            }
            Some(out)
        })
        .flatten()
        .take_any(300)
        .collect();
    Ok(hits)
}

fn collect_text_files(root: &Path, base: &Path) -> Vec<PathBuf> {
    let mut out = Vec::new();
    let Ok(entries) = fs::read_dir(root) else {
        return out;
    };
    for e in entries.flatten() {
        let name = e.file_name().to_string_lossy().to_string();
        if name.starts_with('.') || HIDDEN_DIRS.contains(&name.as_str()) {
            continue;
        }
        let p = e.path();
        if p.is_dir() {
            if p.strip_prefix(base).unwrap().components().count() < 12 {
                out.extend(collect_text_files(&p, base));
            }
        } else {
            let ext = p.extension().and_then(|s| s.to_str()).unwrap_or("");
            if matches!(ext, "md" | "markdown" | "txt") {
                out.push(p);
            }
        }
    }
    out
}

/// 扫描全库双链：[[目标]]，用于反链与图谱
#[tauri::command]
pub fn index_links(state: tauri::State<'_, crate::state::AppState>) -> Result<Vec<LinkEntry>, String> {
    let st = state.lock.lock().unwrap();
    let vault = st.vault.clone().ok_or("未设置知识库目录")?;
    let files = collect_text_files(&vault, &vault);
    let links: Vec<LinkEntry> = files
        .par_iter()
        .filter_map(|abs| {
            let Ok(text) = fs::read_to_string(abs) else {
                return None;
            };
            let rel = abs.strip_prefix(&vault).unwrap().to_string_lossy().replace('\\', "/");
            let mut out = Vec::new();
            let bytes = text.as_bytes();
            let mut i = 0;
            while i + 1 < bytes.len() {
                if bytes[i] == b'[' && bytes[i + 1] == b'[' {
                    if let Some(close) = text[i + 2..].find("]]") {
                        let target = &text[i + 2..i + 2 + close];
                        // 去掉别名部分 [[name|alias]]
                        let target = target.split('|').next().unwrap_or(target).trim();
                        // 排除嵌入图片语法 ![[...]] 已由前置 ! 判断
                        let is_embed = i > 0 && bytes[i - 1] == b'!';
                        if !target.is_empty() && !is_embed {
                            out.push(LinkEntry {
                                source: rel.clone(),
                                target: target.to_string(),
                            });
                        }
                        i += close + 4;
                        continue;
                    }
                }
                i += 1;
            }
            Some(out)
        })
        .flatten()
        .collect();
    Ok(links)
}

/// 保存粘贴的图片/附件：归档到 attachments/年/月/，返回相对路径
#[tauri::command]
pub fn save_attachment(
    state: tauri::State<'_, crate::state::AppState>,
    filename: String,
    base64_data: String,
) -> Result<String, String> {
    let st = state.lock.lock().unwrap();
    let vault = st.vault.clone().ok_or("未设置知识库目录")?;
    let now = chrono::Local::now();
    let dir = format!("attachments/{}/{}", now.format("%Y"), now.format("%m"));
    let stamp = now.format("%Y%m%d-%H%M%S");
    let safe = sanitize_filename(&filename);
    let (stem, ext) = split_ext(&safe);
    let name = format!("{stamp}-{stem}.{ext}");
    let rel = format!("{dir}/{name}");
    let path = vault.join(&rel);
    fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(base64_data)
        .map_err(|e| e.to_string())?;
    fs::write(&path, bytes).map_err(|e| e.to_string())?;
    Ok(rel)
}

fn split_ext(name: &str) -> (String, String) {
    match name.rfind('.') {
        Some(i) if i > 0 => (name[..i].to_string(), name[i + 1..].to_string()),
        _ => (name.to_string(), "bin".to_string()),
    }
}

/// 初始化知识库目录结构（首次选择 vault 时调用）
#[tauri::command]
pub fn ensure_vault(state: tauri::State<'_, crate::state::AppState>, path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if !p.is_dir() {
        return Err("目录不存在".to_string());
    }
    for d in ["attachments", "templates", ".dsh"] {
        let _ = fs::create_dir_all(p.join(d));
    }
    // 示例欢迎笔记（仅 vault 为空时）
    let welcome = p.join("欢迎使用.md");
    if !welcome.exists() && fs::read_dir(&p).map(|mut it| it.next().is_none()).unwrap_or(false) {
        let _ = fs::write(
            &welcome,
            "# 欢迎使用 DSH Markdown\n\n开始你的知识库之旅：\n\n- 双向链接：输入 `[[` 引用另一篇笔记\n- 思维导图：工具栏切换「导图」视图\n- 流程图：\n\n```mermaid\nflowchart LR\n  A[想法] --> B[记录] --> C[知识库]\n```\n\n- 粘贴图片会自动归档到 attachments/年/月\n",
        );
    }
    let mut st = state.lock.lock().unwrap();
    st.vault = Some(p);
    Ok(())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteMeta {
    pub rel_path: String,
    pub title: Option<String>,
}

/// 列出全库 md 笔记（供 [[补全、快速打开、图谱用）
#[tauri::command]
pub fn list_all_notes(state: tauri::State<'_, crate::state::AppState>) -> Result<Vec<NoteMeta>, String> {
    let st = state.lock.lock().unwrap();
    let vault = st.vault.clone().ok_or("未设置知识库目录")?;
    let files = collect_text_files(&vault, &vault);
    Ok(files
        .into_iter()
        .filter_map(|abs| {
            let ext = abs.extension().and_then(|s| s.to_str()).unwrap_or("");
            if ext != "md" && ext != "markdown" {
                return None;
            }
            let rel = abs.strip_prefix(&vault).unwrap().to_string_lossy().replace('\\', "/");
            let title = note_title(&abs);
            Some(NoteMeta { rel_path: rel, title })
        })
        .collect())
}
