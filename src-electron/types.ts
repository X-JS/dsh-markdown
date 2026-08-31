export interface ElectronAPI {
  /** 运行平台（preload 注入 process.platform，如 darwin / win32 / linux） */
  platform: string;
  getAppVersion: () => Promise<string>;
  getConfig: () => Promise<any>;
  setConfig: (patch: any) => Promise<any>;
  ensureVault: (path: string) => Promise<void>;
  startWatch: (vaultPath?: string) => Promise<void>;
  listDir: (rel: string) => Promise<any[]>;
  readFile: (rel: string) => Promise<any>;
  writeFile: (rel: string, content: string) => Promise<void>;
  createNote: (dir: string, title: string, content?: string | null) => Promise<string>;
  createDir: (parent: string, name: string) => Promise<string>;
  renameEntry: (rel: string, newName: string) => Promise<string>;
  moveEntry: (rel: string, dstDir: string) => Promise<string>;
  deleteEntry: (rel: string) => Promise<void>;
  searchVault: (query: string) => Promise<any[]>;
  listAllNotes: () => Promise<any[]>;
  indexLinks: () => Promise<any[]>;
  saveAttachment: (filename: string, base64Data: string) => Promise<string>;
  fetchPage: (url: string) => Promise<any>;
  downloadImages: (urls: string[], vaultPath?: string) => Promise<any[]>;
  interactiveScreenshot: () => Promise<string | null>;
  aiChatList: () => Promise<any[]>;
  aiChatLoad: (id: string) => Promise<any>;
  aiChatSave: (doc: any) => Promise<void>;
  aiChatDelete: (id: string) => Promise<void>;
  aiChat: (params: any) => Promise<void>;
  /** 打开系统文件选择框，返回选中图片的 data URL（最多 4 张） */
  pickImages: () => Promise<string[]>;
  /** 打开系统目录选择框，返回选中目录路径或 null */
  pickDirectory: () => Promise<string | null>;
  /** 将绝对路径转换为 file:// URL（图片渲染用） */
  convertFileSrc: (absPath: string) => string;
  fsChangeSubscribe: (callback: () => void) => () => void;
  aiChunkSubscribe: (requestId: string, callback: (chunk: any) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
