/**
 * 浏览器 Web 版后端：以纯 POST HTTP 调用独立数据服务，方法与 ElectronAPI 同签名。
 *
 * 约定：
 * - 所有接口 POST，参数 JSON body。
 * - 配置存 localStorage；vaultPath 字段即「知识库 id / 名称」。
 * - 图片等静态附件由 browser <img> 原生加载 GET URL（唯一例外），见 getAttachmentUrl。
 * - AI / 截图 / 外部文件等桌面专属能力：返回空值或 reject。
 */
import { post, getToken, setToken, getBaseUrl } from "./http";
import type { Config } from "./types";
import type {
  FsNode, ReadResult, SearchHit, LinkEntry, NoteMetaItem, PageContent, ChatSummary, ChatDoc,
} from "./api";
import {
  DEMO_MODE, DEMO_USER, DEMO_VAULT_ID, DEMO_NOTES,
  demoListDir, demoReadFile, demoAllNotes, demoIndexLinks,
} from "./demo-data";

const CONFIG_KEY = "dsh.web.config";
const CURRENT_VAULT_KEY = "dsh.web.currentVault";

/** 演示模式下自动选中的知识库（不弹选库页） */
export const DEMO_AUTO_VAULT = DEMO_MODE ? DEMO_VAULT_ID : null;
/** 演示模式下已登录（skips 登录页）。false → 先展示登录页（预填 admin/666666） */
export const DEMO_AUTHENTICATED = false;

/** 当前知识库 id（浏览器版 vaultPath 即存此值） */
let currentVaultId: string = (() => {
  const saved = localStorage.getItem(CURRENT_VAULT_KEY);
  if (saved) return saved;
  return DEMO_MODE ? DEMO_VAULT_ID : "" as string;
})();

function setCurrentVault(id: string) {
  currentVaultId = id;
  localStorage.setItem(CURRENT_VAULT_KEY, id);
}

/** 读取浏览器版配置（vaultPath 存知识库 id/名称） */
export function getLocalConfig(): Config {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // 演示模式：未显式选库时强制指向演示库
      const cfg = { ...defaultConfig(), ...parsed };
      if (DEMO_MODE && !cfg.vaultPath && currentVaultId) cfg.vaultPath = currentVaultId;
      return cfg;
    }
  } catch {
    /* ignore */
  }
  return defaultConfig();
}

function defaultConfig(): Config {
  return {
    vaultPath: currentVaultId || null,
    aiBaseUrl: "https://api.deepseek.com",
    aiModel: "deepseek-v4-flash",
    aiVisionModel: "deepseek-v4-flash-vision-exp",
    aiApiKey: "",
    theme: "auto",
  };
}

function saveLocalConfig(patch: Partial<Config>): Config {
  const cfg = { ...getLocalConfig(), ...patch };
  if (patch.vaultPath !== undefined) {
    setCurrentVault(cfg.vaultPath || "");
  }
  localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
  return cfg;
}

/** 当前知识库 id；未设置则抛错 */
function vaultId(): string {
  if (!currentVaultId) throw new Error("未选择知识库");
  return currentVaultId;
}

/** 相对路径 → 附件静态 GET URL（markdown 图片渲染用，浏览器 <img> 原生加载） */
export function getAttachmentUrl(absPath: string): string {
  // 演示模式：绝对/网络图片直接返回，无需后端；相对 attachments 路径无实际文件，返回空占位
  if (DEMO_MODE) {
    if (/^(https?:|data:|#|blob:)/.test(absPath)) return absPath;
    // 返回 1x1 透明占位（避免破图）
    return "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
  }
  const id = currentVaultId;
  const rel = absPath.startsWith(id + "/") ? absPath.slice(id.length + 1) : absPath;
  const base = getBaseUrl();
  return `${base}/api/vaults/${encodeURIComponent(id)}/attachment?rel=${encodeURIComponent(rel)}`;
}

/** 后端静态附件地址（供前端主动取图片时用） */
export function attachmentBase(id: string): string {
  return `${getBaseUrl()}/api/vaults/${encodeURIComponent(id)}/attachment?rel=`;
}

// ─── 认证 ────────────────────────────────────────────────────────────────
export async function login(username: string, password: string): Promise<void> {
  if (DEMO_MODE) {
    if (username !== DEMO_USER.username || password !== DEMO_USER.password) {
      throw new Error("账号或密码错误（演示账号 admin / 666666）");
    }
    setToken("demo-token");
    return;
  }
  const d = await post<{ token: string }>("/api/auth/login", { body: { username, password } });
  setToken(d.token);
}

export async function register(username: string, password: string): Promise<void> {
  if (DEMO_MODE) {
    setToken("demo-token");
    return;
  }
  const d = await post<{ token: string }>("/api/auth/register", { body: { username, password } });
  setToken(d.token);
}

export async function fetchMe(): Promise<{ id: string; username: string } | null> {
  if (DEMO_MODE) return { id: "u_demo", username: DEMO_USER.username };
  try {
    return await post<{ id: string; username: string }>("/api/auth/me");
  } catch (e: any) {
    if (e?.code === 401 || e?.code === 404) return null;
    throw e;
  }
}

/** 列出后端知识库（用于「选择知识库」） */
export async function listVaults(): Promise<any[]> {
  if (DEMO_MODE) {
    return [{ id: DEMO_VAULT_ID, name: "演示知识库", noteCount: DEMO_NOTES.length, updatedAt: new Date().toISOString() }];
  }
  return post<any[]>("/api/vaults");
}

export async function createVault(name: string): Promise<any> {
  if (DEMO_MODE) {
    return { id: DEMO_VAULT_ID, name, noteCount: 0, updatedAt: new Date().toISOString() };
  }
  return post<any>("/api/vaults", { body: { name } });
}

// ─── 文件系统（全 POST） ──────────────────────────────────────────────────
const fs = (vaultIdNow: string) => ({
  listDir: (rel: string) => post<FsNode[]>(`/api/vaults/${vaultIdNow}/list`, { body: { rel } }),
  readFile: (rel: string) => post<ReadResult>(`/api/vaults/${vaultIdNow}/read`, { body: { rel } }),
  writeFile: (rel: string, content: string) =>
    post<void>(`/api/vaults/${vaultIdNow}/write`, { body: { rel, content } }),
  createNote: (dir: string, title: string, content?: string | null) =>
    post<string>(`/api/vaults/${vaultIdNow}/notes`, { body: { dir, title, content: content ?? undefined } }),
  createDir: (parent: string, name: string) =>
    post<string>(`/api/vaults/${vaultIdNow}/dirs`, { body: { parent, name } }),
  renameEntry: (rel: string, newName: string) =>
    post<string>(`/api/vaults/${vaultIdNow}/rename`, { body: { rel, newName } }),
  moveEntry: (rel: string, dstDir: string) =>
    post<string>(`/api/vaults/${vaultIdNow}/move`, { body: { rel, dstDir } }),
  deleteEntry: (rel: string) =>
    post<void>(`/api/vaults/${vaultIdNow}/entry`, { body: { rel } }),
  searchVault: (query: string) =>
    post<SearchHit[]>(`/api/vaults/${vaultIdNow}/search`, { body: { q: query } }),
  listAllNotes: () => post<NoteMetaItem[]>(`/api/vaults/${vaultIdNow}/notes`),
  indexLinks: () => post<LinkEntry[]>(`/api/vaults/${vaultIdNow}/links`),
  saveAttachment: (filename: string, base64Data: string) =>
    post<string>(`/api/vaults/${vaultIdNow}/attachments`, { body: { filename, base64: base64Data } }),
});

/** 演示模式下用内存数据替代后端（读操作）；写操作走内存占位，保证不崩溃 */
const demoFs = {
  listDir: (rel: string) => Promise.resolve(demoListDir(rel) as unknown as FsNode[]),
  readFile: (rel: string) => Promise.resolve(demoReadFile(rel) as unknown as ReadResult),
  writeFile: (_rel: string, _content: string) => Promise.resolve(undefined as void),
  createNote: (dir: string, title: string, _content?: string | null) =>
    Promise.resolve(dir ? `${dir}/${title}.md` : `${title}.md`),
  createDir: (parent: string, name: string) => Promise.resolve(parent ? `${parent}/${name}` : name),
  renameEntry: (rel: string, newName: string) => {
    const dir = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/") + 1) : "";
    return Promise.resolve(`${dir}${newName}`);
  },
  moveEntry: (rel: string, dstDir: string) => {
    const name = rel.includes("/") ? rel.slice(rel.lastIndexOf("/") + 1) : rel;
    return Promise.resolve(dstDir ? `${dstDir}/${name}` : name);
  },
  deleteEntry: (_rel: string) => Promise.resolve(undefined as void),
  searchVault: (query: string) => Promise.resolve([] as SearchHit[]),
  listAllNotes: () => Promise.resolve(demoAllNotes() as unknown as NoteMetaItem[]),
  indexLinks: () => Promise.resolve(demoIndexLinks() as unknown as LinkEntry[]),
  saveAttachment: (filename: string, _base64: string) => {
    const now = new Date();
    const ym = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}`;
    const stamp = now.toISOString().replace(/[:T]/g, "-").slice(0, 19).replace(".", "-");
    return Promise.resolve(`attachments/${ym}/${stamp}-${filename}`);
  },
};

// ─── 变更监听：轮询版本号（桌面为 chokidar） ─────────────────────────────
function pollFsChange(callback: () => void): (() => void) {
  if (DEMO_MODE) return () => {};
  let lastVersion = -1;
  let killed = false;
  const tick = async () => {
    if (killed) return;
    try {
      const v = await post<{ version: number }>(`/api/vaults/${vaultId()}/version`, { body: {} });
      if (lastVersion >= 0 && v.version !== lastVersion) callback();
      lastVersion = v.version;
    } catch {
      /* ignore */
    } finally {
      if (!killed) setTimeout(tick, 4000);
    }
  };
  tick();
  return () => {
    killed = true;
  };
}

export const browserApi = {
  getPlatform: () => "web",
  getAppVersion: () => Promise.resolve("0.1.0"),
  getConfig: () => Promise.resolve(getLocalConfig()),
  setTheme: (_theme: string) => {},
  setConfig: (patch: any) => Promise.resolve(saveLocalConfig(patch)),
  ensureVault: async (vaultIdOrName: string) => {
    setCurrentVault(vaultIdOrName);
  },
  startWatch: () => Promise.resolve(),
  listDir: (rel: string) => (DEMO_MODE ? demoFs.listDir(rel) : fs(vaultId()).listDir(rel)),
  readFile: (rel: string) => (DEMO_MODE ? demoFs.readFile(rel) : fs(vaultId()).readFile(rel)),
  writeFile: (rel: string, content: string) => (DEMO_MODE ? demoFs.writeFile(rel, content) : fs(vaultId()).writeFile(rel, content)),
  createNote: (dir: string, title: string, content?: string | null) =>
    DEMO_MODE ? demoFs.createNote(dir, title, content) : fs(vaultId()).createNote(dir, title, content),
  createDir: (parent: string, name: string) =>
    DEMO_MODE ? demoFs.createDir(parent, name) : fs(vaultId()).createDir(parent, name),
  renameEntry: (rel: string, newName: string) =>
    DEMO_MODE ? demoFs.renameEntry(rel, newName) : fs(vaultId()).renameEntry(rel, newName),
  moveEntry: (rel: string, dstDir: string) =>
    DEMO_MODE ? demoFs.moveEntry(rel, dstDir) : fs(vaultId()).moveEntry(rel, dstDir),
  deleteEntry: (rel: string) => (DEMO_MODE ? demoFs.deleteEntry(rel) : fs(vaultId()).deleteEntry(rel)),
  searchVault: (query: string) => (DEMO_MODE ? demoFs.searchVault(query) : fs(vaultId()).searchVault(query)),
  listAllNotes: () => (DEMO_MODE ? demoFs.listAllNotes() : fs(vaultId()).listAllNotes()),
  indexLinks: () => (DEMO_MODE ? demoFs.indexLinks() : fs(vaultId()).indexLinks()),
  saveAttachment: (filename: string, base64Data: string) =>
    DEMO_MODE ? demoFs.saveAttachment(filename, base64Data) : fs(vaultId()).saveAttachment(filename, base64Data),
  fetchPage: (_url: string) => Promise.reject<PageContent>(new Error("浏览器版暂不支持网页抓取")),
  downloadImages: (_urls: string[]) => Promise.resolve<string[]>([]),
  interactiveScreenshot: () => Promise.resolve<string | null>(null),
  aiChatList: () => Promise.resolve<ChatSummary[]>([]),
  aiChatLoad: (_id: string) => Promise.reject<ChatDoc>(new Error("浏览器版暂不支持 AI")),
  aiChatSave: (_doc: any) => Promise.reject(new Error("浏览器版暂不支持 AI")),
  aiChatDelete: (_id: string) => Promise.reject(new Error("浏览器版暂不支持 AI")),
  aiChat: (_params: any) => Promise.reject(new Error("浏览器版暂不支持 AI")),
  pickImages: () => Promise.resolve<string[]>([]),
  pickDirectory: () => Promise.resolve<string | null>(null),
  convertFileSrc: (absPath: string) => getAttachmentUrl(absPath),
  fsChangeSubscribe: (cb: () => void) => pollFsChange(cb),
  aiChunkSubscribe: (_requestId: string, _cb: (chunk: any) => void) => () => {},
  readExternalFile: (_absPath: string) =>
    Promise.reject<ReadResult>(new Error("浏览器版不支持外部文件")),
  writeExternalFile: (_absPath: string, _content: string) =>
    Promise.reject(new Error("浏览器版不支持外部文件")),
  getPendingOpens: () => Promise.resolve<string[]>([]),
  openFileReady: () => {},
  onOpenFileRequest: (_cb: (absPath: string) => void) => () => {},
};
