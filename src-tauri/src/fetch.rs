use base64::Engine;
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PageContent {
    pub url: String,
    pub title: String,
    pub text: String,
    /// 正文图片 URL（微信公众号等：data-src 优先，已过滤内联/图标）
    pub images: Vec<String>,
}

/// 抓取网页并提取正文文本（供 AI 生成 markdown 笔记）。
/// 轻量实现：请求 HTML → 去掉 script/style/nav 等标签 → 保留标题与可见文本。
/// 上限 60KB 文本，避免超大页面拖垮 AI 上下文。
#[tauri::command]
pub async fn fetch_page(url: String) -> Result<PageContent, String> {
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15")
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client
        .get(&url)
        .header("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8")
        .send()
        .await
        .map_err(|e| format!("请求失败：{e}"))?;
    let status = resp.status();
    if !status.is_success() {
        return Err(format!("HTTP {status}"));
    }
    let ct = resp
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();
    if !ct.contains("html") && !ct.contains("text") {
        return Err(format!("不支持的内容类型：{ct}"));
    }
    let body = resp.text().await.map_err(|e| e.to_string())?;
    let (title, text) = extract_text(&body);
    let text = if text.len() > 60 * 1024 {
        text[..60 * 1024].to_string()
    } else {
        text
    };
    let images = extract_images(&body);
    Ok(PageContent {
        url,
        title,
        text,
        images,
    })
}

/// HTML → 纯文本：移除 script/style/header/footer/nav，<h1-6>/<p>/<li>/<br> 转行
fn extract_text(html: &str) -> (String, String) {
    let title = extract_tag(html, "title")
        .or_else(|| extract_meta(html, "og:title"))
        .unwrap_or_default();

    // 截掉 head
    let body_start = html.find("<body").map(|i| html[i..].find('>').map(|j| i + j + 1)).flatten();
    let mut s: String = match body_start {
        Some(i) => html[i..].to_string(),
        None => html.to_string(),
    };
    if let Some(i) = s.find("</body>") {
        s.truncate(i);
    }

    // 移除噪音块
    for tag in ["script", "style", "noscript", "svg", "iframe", "header", "footer", "nav", "form"] {
        s = strip_block(&s, tag);
    }

    // 块级标签转换行；实体原样保留，最后统一解码
    let mut out = String::with_capacity(s.len() / 2);
    let mut in_tag = false;
    let mut tag_buf = String::new();
    for c in s.chars() {
        if c == '<' {
            in_tag = true;
            tag_buf.clear();
            continue;
        }
        if c == '>' && in_tag {
            in_tag = false;
            let t = tag_buf.trim().to_lowercase();
            if t.starts_with("h1") || t.starts_with("h2") || t.starts_with("h3")
                || t.starts_with("h4") || t.starts_with("h5") || t.starts_with("h6")
                || t.starts_with("p") || t.starts_with("li") || t.starts_with("tr")
                || t.starts_with("br") || t.starts_with("/p") || t.starts_with("/li")
                || t.starts_with("/h1") || t.starts_with("/h2") || t.starts_with("/h3")
                || t.starts_with("/h4") || t.starts_with("/h5") || t.starts_with("/h6")
                || t.starts_with("/tr") || t.starts_with("/div") || t.starts_with("div")
            {
                out.push('\n');
            } else if t.starts_with("td") || t.starts_with("th") {
                out.push_str(" | ");
            }
            continue;
        }
        if in_tag {
            tag_buf.push(c);
            continue;
        }
        out.push(c);
    }

    let text = decode_entities(
        &out
            .lines()
            .map(|l| l.trim())
            .filter(|l| !l.is_empty())
            .collect::<Vec<_>>()
            .join("\n"),
    );
    let title = if title.is_empty() {
        text.lines().next().unwrap_or("").chars().take(80).collect()
    } else {
        title
    };
    (decode_entities(&title), text)
}

fn extract_tag(html: &str, tag: &str) -> Option<String> {
    let open = format!("<{tag}");
    let start = html.find(&open)?;
    let content_start = html[start..].find('>')? + start + 1;
    let close = format!("</{tag}>");
    let end = html[content_start..].find(&close)? + content_start;
    Some(decode_entities(html[content_start..end].trim()))
}

fn extract_meta(html: &str, prop: &str) -> Option<String> {
    let needle = format!("property=\"{prop}\"");
    let i = html.find(&needle).or_else(|| {
        let n2 = format!("property='{prop}'");
        html.find(&n2)
    })?;
    let seg = &html[i..(i + 300).min(html.len())];
    let c = seg.find("content=")?;
    let rest = &seg[c + 8..];
    let quote = rest.chars().next()?;
    if quote == '"' || quote == '\'' {
        let end = rest[1..].find(quote)? + 1;
        Some(decode_entities(&rest[1..end]))
    } else {
        let end = rest.find([' ', '>']).unwrap_or(rest.len());
        Some(decode_entities(&rest[..end]))
    }
}

fn strip_block(s: &str, tag: &str) -> String {
    let mut out = s.to_string();
    // 反复剥离同名块（无嵌套假设，最多 20 轮）
    for _ in 0..20 {
        let open = format!("<{tag}");
        let Some(i) = out.find(&open) else { break };
        let Some(after) = out[i..].find('>').map(|j| i + j + 1) else { break };
        let close = format!("</{tag}>");
        let Some(j) = out[after..].find(&close).map(|j| after + j) else {
            // 未闭合：截掉到结尾
            out.truncate(i);
            break;
        };
        out = format!("{}{}", &out[..i], &out[j + close.len()..]);
    }
    out
}

fn decode_entities(s: &str) -> String {
    s.replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
}


/// 提取正文图片 URL：img 标签的 data-src（微信懒加载）/ data-original / src，
/// 过滤 data: 内联、太短的图标 URL、表情图，最多 20 张
fn extract_images(html: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for seg in html.split("<img").skip(1) {
        let tag = &seg[..seg.find('>').unwrap_or(seg.len().min(500))];
        let url = ["data-src", "data-original", "src"]
            .iter()
            .find_map(|k| {
                let pats = [format!("{k}=\""), format!("{k}='")];
                for pat in pats {
                    if let Some(i) = tag.find(&pat) {
                        let rest = &tag[i + pat.len()..];
                        let quote = &pat[pat.len() - 1..];
                        if let Some(j) = rest.find(quote) {
                            return Some(rest[..j].to_string());
                        }
                    }
                }
                None
            });
        let Some(u) = url else { continue };
        // 关键：HTML 属性中的 URL 是实体编码（&amp;），必须解码后才是可用链接
        let u = decode_entities(&u);
        if u.starts_with("data:") || u.len() < 20 || !u.starts_with("http") {
            continue;
        }
        // 图标/表情过滤：按 wx_fmt（微信）与路径特征
        let fmt = u
            .split("wx_fmt=")
            .nth(1)
            .map(|f| f.split('&').next().unwrap_or(f).to_lowercase())
            .unwrap_or_default();
        if fmt == "svg" || fmt == "other" || u.contains("emoji") || u.contains("icon") {
            continue;
        }
        // /0? 结尾路径多为缩略图，跳过（大图通常为 /640? 等）
        if u.contains("/0?") {
            continue;
        }
        if !out.contains(&u) {
            out.push(u);
        }
        if out.len() >= 20 {
            break;
        }
    }
    out
}

/// 批量下载图片到 attachments/年/月/（网页剪藏配图本地化，规避外链防盗链）
#[tauri::command]
pub async fn download_images(
    state: tauri::State<'_, crate::state::AppState>,
    urls: Vec<String>,
) -> Result<Vec<String>, String> {
    let vault = {
        let st = state.lock.lock().unwrap();
        st.vault.clone().ok_or("未设置知识库目录")?
    };
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15")
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())?;

    let now = chrono::Local::now();
    let dir = format!("attachments/{}/{}", now.format("%Y"), now.format("%m"));
    let stamp = now.format("%Y%m%d-%H%M%S");

    let mut rels = Vec::new();
    for (i, u) in urls.iter().take(20).enumerate() {
        let Ok(resp) = client.get(u).send().await else {
            continue;
        };
        if !resp.status().is_success() {
            continue;
        }
        let ct = resp
            .headers()
            .get("content-type")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("")
            .to_string();
        let ext = if ct.contains("png") {
            "png"
        } else if ct.contains("webp") {
            "webp"
        } else if ct.contains("gif") {
            "gif"
        } else if ct.contains("svg") {
            "svg"
        } else {
            "jpg"
        };
        let Ok(bytes) = resp.bytes().await else { continue };
        if bytes.len() < 5 * 1024 {
            continue; // 过小视为图标
        }
        let rel = format!("{dir}/clip-{stamp}-{i}.{ext}");
        let path = vault.join(&rel);
        if std::fs::write(&path, &bytes).is_ok() {
            rels.push(rel);
        }
    }
    Ok(rels)
}

// macOS 屏幕录制权限预检/请求（CoreGraphics 直接暴露的 C 函数）
#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    fn CGPreflightScreenCaptureAccess() -> bool;
    fn CGRequestScreenCaptureAccess() -> bool;
}

/// macOS 交互式截图（screencapture -i：拖拽选区/空格选窗口/Esc 取消）
/// 返回 PNG base64；用户取消返回 None。
/// 无「屏幕录制」权限时系统只会返回桌面壁纸（剔除所有窗口），必须预检并引导授权。
#[tauri::command]
pub async fn interactive_screenshot(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri::Manager;

    // 权限预检：未授权则触发系统弹窗并明确指引（授权后需重启应用生效）
    unsafe {
        if !CGPreflightScreenCaptureAccess() {
            let _ = CGRequestScreenCaptureAccess(); // 触发系统授权弹窗（异步）
            return Err(
                "需要「屏幕录制」权限：请在 系统设置 → 隐私与安全性 → 屏幕录制 中允许 DSH Markdown，\n\
                 然后完全退出本应用（⌘Q）并重新打开。\n\n                 临时替代：用系统截图 ⇧⌘⌃4（进剪贴板），再回到输入框 ⌘V 粘贴，同样自动转笔记。"
                    .to_string(),
            );
        }
    }

    let win = app.get_webview_window("main").ok_or("未找到主窗口")?;
    // 先隐藏本窗口，避免遮挡要截取的内容；截图完成后恢复并聚焦
    let _ = win.hide();
    tokio::time::sleep(std::time::Duration::from_millis(180)).await;
    let path = std::env::temp_dir().join(format!(
        "dsh-shot-{}.png",
        chrono::Local::now().format("%Y%m%d%H%M%S")
    ));
    let p = path.to_string_lossy().to_string();
    let result = tokio::process::Command::new("screencapture")
        .args(["-i", "-x", &p])
        .output()
        .await;
    let _ = win.show();
    let _ = win.set_focus();
    result.map_err(|e| format!("调用截图失败：{e}"))?;
    if !path.exists() {
        return Ok(None); // 用户按 Esc 取消
    }
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    let _ = std::fs::remove_file(&path);
    Ok(Some(base64::engine::general_purpose::STANDARD.encode(bytes)))
}
