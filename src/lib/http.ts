/**
 * 浏览器 Web 版 HTTP 客户端（统一 POST）。
 *
 * 约定：所有数据接口一律使用 POST，参数放入 JSON body。
 * 唯一例外：静态附件资源由浏览器 `<img>` 原生按 URL 加载（GET），不走本客户端。
 *
 * - Base URL：优先 `import.meta.env.VITE_API_BASE`，否则默认 http://localhost:3000
 * - 鉴权：token 存 localStorage，请求头拼 `Authorization: Bearer <token>`
 * - 统一响应：{ code, message, data }，code !== 0 时抛出异常（message 可直接展示）
 * - 401 / token 失效：触发注册的 onUnauthorized 回调（前端据此弹出登录框）
 */

const TOKEN_KEY = "dsh.web.token";
const BASE_KEY = "dsh.web.baseUrl";

export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

let onUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(h: (() => void) | null) {
  onUnauthorized = h;
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function getBaseUrl(): string {
  const env = (import.meta as any).env?.VITE_API_BASE as string | undefined;
  // 默认空串 → 相对路径 /api/…，经 Vite dev proxy 转发；亦可配 VITE_API_BASE 指向后端
  return (env || localStorage.getItem(BASE_KEY) || "").replace(/\/+$/, "");
}

export function setBaseUrl(url: string) {
  localStorage.setItem(BASE_KEY, url);
}

export function logout() {
  setToken(null);
  onUnauthorized?.();
}

/** 构造完整 URL（base 为空则相对路径 /api/…） */
function toUrl(path: string, query?: Record<string, string | number | null | undefined>): string {
  const base = getBaseUrl();
  let url = base ? `${base}${path}` : path;
  if (query) {
    const usp = new URLSearchParams();
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") usp.set(k, String(v));
    });
    const qs = usp.toString();
    if (qs) url += `${url.includes("?") ? "&" : "?"}${qs}`;
  }
  return url;
}

export interface HttpOptions {
  /** 参数放入 JSON body */
  body?: unknown;
  /** 附加 query 到 URL（仅当后端要求在 URL 时使用） */
  query?: Record<string, string | number | null | undefined>;
  /** 是否携带鉴权头，默认 true */
  auth?: boolean;
}

export class HttpError extends Error {
  code: number;
  constructor(code: number, message: string) {
    super(message);
    this.code = code;
    this.name = "HttpError";
  }
}

/** 统一 POST */
export async function post<T>(path: string, opts: HttpOptions = {}): Promise<T> {
  const { body, query, auth = true } = opts;
  const headers: Record<string, string> = { Accept: "application/json", "Content-Type": "application/json" };
  if (auth) {
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }
  let res: Response;
  try {
    res = await fetch(toUrl(path, query), {
      method: "POST",
      headers,
      body: JSON.stringify(body ?? {}),
    });
  } catch (e) {
    throw new HttpError(-1, `网络错误：无法连接到后端（${getBaseUrl()}）`);
  }

  if (res.status === 401) {
    logout();
    throw new HttpError(401, "未登录或登录已过期");
  }

  let text = "";
  try {
    text = await res.text();
  } catch {
    /* ignore */
  }
  if (!res.ok || !text) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = text ? JSON.parse(text) : null;
      if (j?.message) msg = j.message;
    } catch {
      /* ignore */
    }
    throw new HttpError(res.status, msg);
  }

  const json: ApiResponse<T> = JSON.parse(text);
  if (json.code !== 0) {
    throw new HttpError(json.code, json.message || "请求失败");
  }
  return json.data;
}
