import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { Config } from "./types";

/** OpenAI 多模态 content part */
export interface ImagePart {
  type: "image_url";
  image_url: { url: string }; // data: URL
}
export interface TextPart {
  type: "text";
  text: string;
}

export interface AiMessage {
  role: "system" | "user" | "assistant";
  content: string | (TextPart | ImagePart)[];
}

/**
 * 流式对话：invoke 立即返回，增量经 `ai-chunk-{id}` 事件到达。
 * onDelta 携带每个增量片段；返回完整文本。
 */
export async function aiChat(
  cfg: Config,
  messages: AiMessage[],
  onDelta: (delta: string, full: string) => void,
  maxTokens?: number,
  onReasoningDelta?: (reasoningFull: string) => void
): Promise<string> {
  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return new Promise((resolve, reject) => {
    let full = "";
    let reasoningFull = "";
    let un: UnlistenFn | null = null;
    let settled = false;
    const finish = (ok: boolean, err?: string) => {
      if (settled) return;
      settled = true;
      un?.();
      if (ok) resolve(full);
      else reject(new Error(err || "AI 请求失败"));
    };
    listen<{ delta: string; reasoning: boolean; done: boolean; error?: string }>(
      `ai-chunk-${requestId}`,
      (e) => {
        const { delta, reasoning, done, error } = e.payload;
        if (error) return finish(false, error);
        if (delta && !reasoning) {
          // 推理模型的思维链（reasoning）不进正文
          full += delta;
          onDelta(delta, full);
        }
        if (delta && reasoning) {
          reasoningFull += delta;
          onReasoningDelta?.(reasoningFull);
        }
        if (done) finish(true);
      }
    ).then((u) => {
      un = u;
      invoke("ai_chat", {
        requestId,
        baseUrl: cfg.aiBaseUrl,
        apiKey: cfg.aiApiKey,
        model: cfg.aiModel,
        messages,
        maxTokens: maxTokens ?? null,
      }).catch((err) => finish(false, String(err)));
    });
  });
}
