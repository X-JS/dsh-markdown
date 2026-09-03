import { isElectron, isTauri } from "./runtime";
import { getAttachmentUrl } from "./browser-api";

/**
 * 将 vault 内文件「绝对路径」转换为可在渲染进程使用的 URL。
 * 传入的 absPath 形如 `<vault>/attachments/2026/09/xxx.png`（markdown.ts 拼出）。
 * - Electron：preload 的 window.electronAPI.convertFileSrc → file://
 * - Tauri：转换为 asset 协议可用的路径
 * - 浏览器 Web：走后端附件接口 /api/vaults/:id/attachment?rel=…
 */
export function convertFileSrc(absPath: string): string {
  if (isElectron()) {
    return (window as any).electronAPI.convertFileSrc(absPath);
  }
  if (isTauri()) {
    return absPath.replace(/\\/g, "/");
  }
  return getAttachmentUrl(absPath);
}
