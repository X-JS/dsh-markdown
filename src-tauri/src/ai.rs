use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tauri::Emitter;

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ChatMsg {
    pub role: String,
    /// 纯文本 string 或 OpenAI 多模态数组 [{type:"text"},{type:"image_url",...}]
    pub content: serde_json::Value,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AiChunk {
    delta: String,
    /// 推理模型的思维链增量（deepseek-v4-flash-vision-exp 等）
    reasoning: bool,
    done: bool,
    error: Option<String>,
}

/// AI 对话（OpenAI 兼容 /chat/completions，SSE 流式）。
/// 通过事件 `ai-chunk-{requestId}` 推送增量；前端拼接渲染。
/// 流式请求在 tokio 任务中执行，command 立即返回，UI 不阻塞。
#[tauri::command]
pub async fn ai_chat(
    app: tauri::AppHandle,
    request_id: String,
    base_url: String,
    api_key: String,
    model: String,
    messages: Vec<ChatMsg>,
    max_tokens: Option<u32>,
) -> Result<(), String> {
    if api_key.is_empty() {
        return Err("未配置 API Key，请先在设置中填写".to_string());
    }
    let url = format!("{}/chat/completions", base_url.trim_end_matches('/'));

    tokio::spawn(async move {
        let event = format!("ai-chunk-{request_id}");
        let emit = |delta: String, reasoning: bool, done: bool, error: Option<String>| {
            let _ = app.emit(&event, AiChunk { delta, reasoning, done, error });
        };

        let client = match reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(300))
            .build()
        {
            Ok(c) => c,
            Err(e) => {
                emit(String::new(), false, true, Some(e.to_string()));
                return;
            }
        };

        let mut body = serde_json::json!({ "model": model, "messages": messages, "stream": true });
        if let Some(mt) = max_tokens {
            body["max_tokens"] = serde_json::json!(mt);
        }

        let resp = match client
            .post(&url)
            .header("Authorization", format!("Bearer {api_key}"))
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
        {
            Ok(r) => r,
            Err(e) => {
                emit(String::new(), false, true, Some(format!("网络错误：{e}")));
                return;
            }
        };

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            emit(String::new(), false, true, Some(format!("HTTP {status}：{}", truncate(&text, 500))));
            return;
        }

        let mut stream = resp.bytes_stream();
        let mut buf = String::new();
        loop {
            match stream.next().await {
                Some(Ok(chunk)) => {
                    buf.push_str(&String::from_utf8_lossy(&chunk));
                    // SSE：按行解析 data:
                    while let Some(pos) = buf.find('\n') {
                        let line: String = buf.drain(..=pos).collect();
                        let line = line.trim();
                        if !line.starts_with("data:") {
                            continue;
                        }
                        let data = line[5..].trim();
                        if data == "[DONE]" {
                            emit(String::new(), false, true, None);
                            return;
                        }
                        if let Ok(v) = serde_json::from_str::<serde_json::Value>(data) {
                            // 推理模型：思维链在 reasoning_content，正文在 content，都要透传
                            let reasoning = v
                                .pointer("/choices/0/delta/reasoning_content")
                                .and_then(|c| c.as_str())
                                .unwrap_or("");
                            if !reasoning.is_empty() {
                                emit(reasoning.to_string(), true, false, None);
                            }
                            let delta = v
                                .pointer("/choices/0/delta/content")
                                .and_then(|c| c.as_str())
                                .unwrap_or("");
                            if !delta.is_empty() {
                                emit(delta.to_string(), false, false, None);
                            }
                        }
                    }
                }
                Some(Err(e)) => {
                    emit(String::new(), false, true, Some(format!("流中断：{e}")));
                    return;
                }
                None => {
                    emit(String::new(), false, true, None);
                    return;
                }
            }
        }
    });

    Ok(())
}

fn truncate(s: &str, n: usize) -> String {
    s.chars().take(n).collect()
}
