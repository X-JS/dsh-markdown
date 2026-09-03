# 桌面专属能力（浏览器版降级说明）

浏览器 Web 版不实现以下能力，前端调用返回空值 / no-op / reject。这些接口在后端本阶段也**不提供**，仅为明确浏览器边界。

| 前端 API | 桌面依赖 | 浏览器行为 |
| --- | --- | --- |
| `interactiveScreenshot` | Electron 截图 | reject（浏览器无此能力） |
| `readExternalFile` / `writeExternalFile` | 双击唤起外部绝对路径 | reject（请用知识库内文件） |
| `getPendingOpens` / `onOpenFileRequest` / `openFileReady` | 系统文件关联 / open-file | 返回空 / no-op |
| `startWatch` / `fsChangeSubscribe` | chokidar 实时监听 | 浏览器分支改用轮询或忽略（见下） |
| `fetchPage` | 网页正文提取 | 本阶段后端不实现，前端面板相关功能降级隐藏 |
| `downloadImages` | 主进程抓图 | 见 `attachments.md` §3（后端可实现，可选） |
| AI 会话（`aiChatList/Load/Save/Delete`、`aiChat`） | 主进程 SSE | 本阶段后端**不提供**；前端隐藏 AI 面板 |

## 变更监听（fsChange）

浏览器版没有 chokidar。前端 `subscribeFsChange` 在浏览器分支使用**轮询**：

- 每 4 秒 `POST /api/vaults/:id/version`（见 notes.md §12），返回单调递增的 `version`；与上次不同即触发回调。
- 回调触发后前端 `bumpTree()` + `refreshLinks()`，并重读当前打开文件判断是否有外部修改。

---

## 未来可扩展（本阶段不做）

- AI 流式对话：`POST /api/ai/chat/stream`（SSE）
- 账号管理：`POST /api/auth/password`
- 知识库协作 / 共享
- 网页剪藏（对 `fetchPage` 提供后端实现）
