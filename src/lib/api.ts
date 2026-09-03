/**
 * Electron API 桥接层
 *
 * 当运行在 Electron 环境时，window.electronAPI 由 preload 脚本注入。
 * 当运行在 Tauri 环境时，isElectron() 返回 false，api 回退到 Tauri invoke。
 *
 * 前端组件统一通过此模块调用，无需感知底层平台。
 */
import type { Config } from "./types";
import { isElectron, isTauri, isWeb } from "./runtime";

export interface ChatSummary {
  id: string;
  title: string;
  modified: number;
}

export interface ChatDoc {
  id: string;
  title: string;
  modified: number;
  messages: unknown;
}

export interface FsNode {
  name: string;
  relPath: string;
  isDir: boolean;
  size: number;
  title: string | null;
}

export interface ReadResult {
  content: string;
  size: number;
  modified: number;
}

export interface SearchHit {
  relPath: string;
  lineNo: number;
  lineText: string;
}

export interface LinkEntry {
  source: string;
  target: string;
}

export interface NoteMetaItem {
  relPath: string;
  title: string | null;
}

export interface PageContent {
  url: string;
  title: string;
  text: string;
  images: string[];
}

function ensureApi() {
  if (!isElectron()) throw new Error("当前非 Electron 环境");
  return (window as any).electronAPI;
}

function tauriInvoke<T>(cmd: string, args?: any): Promise<T> {
  return import("@tauri-apps/api/core").then((m) => m.invoke<T>(cmd, args));
}

/** 浏览器 Web 版后端（惰性 import 以避开 Electron/Tauri 打包路径） */
function webApi(): any {
  return import("./browser-api").then((m) => m.browserApi);
}

/** 统一分发：Electron / Tauri / Web */
async function call<T>(opts: {
  el: string; // ElectronAPI 方法名
  tauri: { cmd: string; args?: any };
  web: string; // browser-api 方法名
  args?: any[];
  fallback?: () => Promise<T> | T;
}): Promise<T> {
  if (isElectron()) {
    const fn = (window as any).electronAPI?.[opts.el];
    if (typeof fn === "function") return fn(...(opts.args ?? []));
    return opts.fallback ? await opts.fallback() : Promise.reject(new Error(`Electron 不支持 ${opts.el}`));
  }
  if (isTauri()) return tauriInvoke<T>(opts.tauri.cmd, opts.tauri.args);
  if (isWeb()) {
    const m = await webApi();
    const fn = m?.[opts.web];
    if (typeof fn === "function") return fn(...(opts.args ?? []));
    return opts.fallback ? await opts.fallback() : Promise.reject(new Error(`Web 不支持 ${opts.web}`));
  }
  return opts.fallback ? await opts.fallback() : Promise.reject(new Error("未知运行环境"));
}

export const api = {
  getConfig: (): Promise<Config> =>
    call<Config>({ el: "getConfig", tauri: { cmd: "get_config" }, web: "getConfig", fallback: () => Promise.reject(new Error("无法读取配置")) }),

  setConfig: (patch: Partial<Config>): Promise<Config> =>
    call<Config>({ el: "setConfig", tauri: { cmd: "set_config", args: patch }, web: "setConfig", args: [patch] }),

  ensureVault: (path: string): Promise<void> =>
    call<void>({ el: "ensureVault", tauri: { cmd: "ensure_vault", args: { path } }, web: "ensureVault", args: [path] }),

  startWatch: (vaultPath?: string): Promise<void> =>
    call<void>({ el: "startWatch", tauri: { cmd: "start_watch", args: { vaultPath } }, web: "startWatch", args: [vaultPath], fallback: () => Promise.resolve() }),

  listDir: (rel: string): Promise<FsNode[]> =>
    call<FsNode[]>({ el: "listDir", tauri: { cmd: "list_dir", args: { rel } }, web: "listDir", args: [rel] }),

  readFile: (rel: string): Promise<ReadResult> =>
    call<ReadResult>({ el: "readFile", tauri: { cmd: "read_file", args: { rel } }, web: "readFile", args: [rel] }),

  writeFile: (rel: string, content: string): Promise<void> =>
    call<void>({ el: "writeFile", tauri: { cmd: "write_file", args: { rel, content } }, web: "writeFile", args: [rel, content] }),

  createNote: (dir: string, title: string, content?: string): Promise<string> =>
    call<string>({ el: "createNote", tauri: { cmd: "create_note", args: { dir, title, content: content ?? null } }, web: "createNote", args: [dir, title, content ?? null] }),

  createDir: (parent: string, name: string): Promise<string> =>
    call<string>({ el: "createDir", tauri: { cmd: "create_dir", args: { parent, name } }, web: "createDir", args: [parent, name] }),

  renameEntry: (rel: string, newName: string): Promise<string> =>
    call<string>({ el: "renameEntry", tauri: { cmd: "rename_entry", args: { rel, newName } }, web: "renameEntry", args: [rel, newName] }),

  moveEntry: (rel: string, dstDir: string): Promise<string> =>
    call<string>({ el: "moveEntry", tauri: { cmd: "move_entry", args: { rel, dstDir } }, web: "moveEntry", args: [rel, dstDir] }),

  deleteEntry: (rel: string): Promise<void> =>
    call<void>({ el: "deleteEntry", tauri: { cmd: "delete_entry", args: { rel } }, web: "deleteEntry", args: [rel] }),

  searchVault: (query: string): Promise<SearchHit[]> =>
    call<SearchHit[]>({ el: "searchVault", tauri: { cmd: "search_vault", args: { query } }, web: "searchVault", args: [query] }),

  listAllNotes: (): Promise<NoteMetaItem[]> =>
    call<NoteMetaItem[]>({ el: "listAllNotes", tauri: { cmd: "list_all_notes" }, web: "listAllNotes", fallback: () => Promise.resolve([]) }),

  indexLinks: (): Promise<LinkEntry[]> =>
    call<LinkEntry[]>({ el: "indexLinks", tauri: { cmd: "index_links" }, web: "indexLinks", fallback: () => Promise.resolve([]) }),

  saveAttachment: (filename: string, base64Data: string): Promise<string> =>
    call<string>({ el: "saveAttachment", tauri: { cmd: "save_attachment", args: { filename, base64Data } }, web: "saveAttachment", args: [filename, base64Data] }),

  fetchPage: (url: string): Promise<PageContent> =>
    call<PageContent>({ el: "fetchPage", tauri: { cmd: "fetch_page", args: { url } }, web: "fetchPage", args: [url], fallback: () => Promise.reject(new Error("浏览器版暂不支持网页抓取")) }),

  downloadImages: (urls: string[]): Promise<string[]> =>
    call<string[]>({ el: "downloadImages", tauri: { cmd: "download_images", args: { urls } }, web: "downloadImages", args: [urls], fallback: () => Promise.resolve([]) }),

  interactiveScreenshot: (): Promise<string | null> =>
    call<string | null>({ el: "interactiveScreenshot", tauri: { cmd: "interactive_screenshot" }, web: "interactiveScreenshot", fallback: () => Promise.resolve(null) }),

  aiChatList: (): Promise<ChatSummary[]> =>
    call<ChatSummary[]>({ el: "aiChatList", tauri: { cmd: "ai_chat_list" }, web: "aiChatList", fallback: () => Promise.resolve([]) }),

  aiChatLoad: (id: string): Promise<ChatDoc> =>
    call<ChatDoc>({ el: "aiChatLoad", tauri: { cmd: "ai_chat_load", args: { id } }, web: "aiChatLoad", args: [id], fallback: () => Promise.reject(new Error("浏览器版暂不支持 AI")) }),

  aiChatSave: (doc: ChatDoc): Promise<void> =>
    call<void>({ el: "aiChatSave", tauri: { cmd: "ai_chat_save", args: { doc } }, web: "aiChatSave", args: [doc], fallback: () => Promise.reject(new Error("浏览器版暂不支持 AI")) }),

  aiChatDelete: (id: string): Promise<void> =>
    call<void>({ el: "aiChatDelete", tauri: { cmd: "ai_chat_delete", args: { id } }, web: "aiChatDelete", args: [id], fallback: () => Promise.reject(new Error("浏览器版暂不支持 AI")) }),

  readExternalFile: (absPath: string): Promise<ReadResult> =>
    call<ReadResult>({ el: "readExternalFile", tauri: { cmd: "read_external", args: { absPath } }, web: "readExternalFile", args: [absPath], fallback: () => Promise.reject(new Error("仅桌面版支持外部文件")) }),

  writeExternalFile: (absPath: string, content: string): Promise<void> =>
    call<void>({ el: "writeExternalFile", tauri: { cmd: "write_external", args: { absPath, content } }, web: "writeExternalFile", args: [absPath, content], fallback: () => Promise.reject(new Error("仅桌面版支持外部文件")) }),

  getPendingOpens: (): Promise<string[]> =>
    call<string[]>({ el: "getPendingOpens", tauri: { cmd: "get_pending_opens" }, web: "getPendingOpens", fallback: () => Promise.resolve([]) }),

  openFileReady: (): void => {
    if (isElectron()) ensureApi().openFileReady();
  },

  onOpenFileRequest: (callback: (absPath: string) => void): (() => void) =>
    isElectron() ? ensureApi().onOpenFileRequest(callback) : () => {},
};

/**
 * 订阅 fs-change 事件（跨平台通用）
 */
export function subscribeFsChange(callback: () => void): () => void {
  if (isElectron()) return ensureApi().fsChangeSubscribe(callback);
  if (isWeb()) {
    void import("./browser-api").then((m) => {
      m.browserApi.fsChangeSubscribe(callback);
    });
    return () => {};
  }
  let un: (() => void) | null = null;
  void import("@tauri-apps/api/event")
    .then((m) => m.listen("fs-change", callback))
    .then((u) => {
      un = u;
    });
  return () => {
    un?.();
  };
}