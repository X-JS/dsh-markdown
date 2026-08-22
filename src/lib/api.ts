import { invoke } from "@tauri-apps/api/core";
import type { Config } from "./types";

export const api = {
  getConfig: () => invoke<Config>("get_config"),
  setConfig: (patch: {
    vaultPath?: string;
    aiBaseUrl?: string;
    aiModel?: string;
    aiVisionModel?: string;
    aiApiKey?: string;
    theme?: string;
  }) => invoke<Config>("set_config", patch),

  listDir: (rel: string) => invoke<FsNode[]>("list_dir", { rel }),
  readFile: (rel: string) => invoke<ReadResult>("read_file", { rel }),
  writeFile: (rel: string, content: string) => invoke<void>("write_file", { rel, content }),
  createNote: (dir: string, title: string, content?: string) =>
    invoke<string>("create_note", { dir, title, content: content ?? null }),
  createDir: (parent: string, name: string) => invoke<string>("create_dir", { parent, name }),
  renameEntry: (rel: string, newName: string) => invoke<string>("rename_entry", { rel, newName }),
  moveEntry: (rel: string, dstDir: string) => invoke<string>("move_entry", { rel, dstDir }),
  deleteEntry: (rel: string) => invoke<void>("delete_entry", { rel }),
  searchVault: (query: string) => invoke<SearchHit[]>("search_vault", { query }),
  listAllNotes: () => invoke<NoteMetaItem[]>("list_all_notes"),
  indexLinks: () => invoke<LinkEntry[]>("index_links"),
  saveAttachment: (filename: string, base64Data: string) =>
    invoke<string>("save_attachment", { filename, base64Data }),
  ensureVault: (path: string) => invoke<void>("ensure_vault", { path }),
  startWatch: () => invoke<void>("start_watch"),
  fetchPage: (url: string) => invoke<PageContent>("fetch_page", { url }),
  downloadImages: (urls: string[]) => invoke<string[]>("download_images", { urls }),
  interactiveScreenshot: () => invoke<string | null>("interactive_screenshot"),
  aiChatList: () => invoke<ChatSummary[]>("ai_chat_list"),
  aiChatLoad: (id: string) => invoke<ChatDoc>("ai_chat_load", { id }),
  aiChatSave: (doc: ChatDoc) => invoke<void>("ai_chat_save", { doc }),
  aiChatDelete: (id: string) => invoke<void>("ai_chat_delete", { id }),
};

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
