/** 运行环境探测（浏览器 / Electron / Tauri），供 api 层分支选择 */

/** Electron 环境：由 preload 通过 contextBridge 注入 window.electronAPI */
export function isElectron(): boolean {
  return typeof window !== "undefined" && !!(window as any).electronAPI;
}

/** Tauri 环境：V2 注入 window.__TAURI_INTERNALS__ */
export function isTauri(): boolean {
  return typeof window !== "undefined" && !!(window as any).__TAURI_INTERNALS__;
}

/** 浏览器 Web 环境（对接独立数据后端） */
export function isWeb(): boolean {
  return !isElectron() && !isTauri();
}

/** 平台字符串：Electron 由 preload 注入；浏览器用 navigator；Tauri 无 */
export function getPlatform(): string {
  if (isElectron()) return (window as any).electronAPI.platform;
  if (typeof navigator !== "undefined") return String(navigator.platform || "");
  return "";
}
