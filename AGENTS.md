# AGENTS.md — DSH Markdown

多运行时本地优先 Markdown 知识库（React 19 + TypeScript + Vite）。同一套 UI 跑在三种后端：**Tauri (Rust)**、**Electron (Node)**、**浏览器 Web (HTTP 后端)**。数据文件存放在知识库中，无数据库。UI / 注释 / 文档使用中文。

## 开发命令

```bash
npm run dev                 # 浏览器 Web 构建 —— vite 跑在 :1430（供 Tauri/Web 开发）
npm run tauri dev           # Tauri 桌面（Rust；首次构建约 2-3 分钟）
npm run electron:dev        # Electron 桌面 —— vite.config.electron.ts + vite-plugin-electron
npm run build               # tsc + vite build（web/tauri 渲染层）
npm run electron:build      # Electron：clean → 双份 typecheck → electron-builder
npm run electron:pack       # Electron：clean → build → electron-builder --dir（不产安装包）
```

端口 **1430 是硬编码**（`strictPort: true`），横跨 `vite.config.ts`、`vite.config.electron.ts`、`tauri.conf.json`。残留的 Vite/node 进程会导致启动报 `Port 1430 is already in use`。`npm run electron:dev` 会先跑 `scripts/kill-port.mjs`；普通 `npm run dev` **不会**。重跑前用 `scripts/kill-port.mjs 1430`（或 taskkill）释放端口。

## 验证（仓库无 lint / formatter）

typecheck 是唯一快速门禁，三者必须全过：

```bash
npx tsc --noEmit -p tsconfig.json        # src（渲染层）
npx tsc --noEmit -p tsconfig.electron.json  # src-electron（主进程+preload）
npx tsc --noEmit -p tsconfig.node.json   # vite.config.ts
```

仓库**没有 ESLint/Prettier** —— 手工对齐现有风格。改动任何 `src/` 前后都要确认渲染层 typecheck 通过。

## 三方后端桥接（关键）

不要直接调用 `window.electronAPI`、`@tauri-apps/*` 或 fetch。一切都要经过 **`src/lib/api.ts`**，它按运行时分发：

- `src/lib/runtime.ts` 决定后端：`isElectron()`（`window.electronAPI`）、`isTauri()`（`window.__TAURI_INTERNALS__`），否则 `isWeb()`。
- `src/lib/api.ts` 把每个方法路由到 Electron preload / Tauri `invoke` / 浏览器 HTTP。**桌面端（Electron+Tauri）行为永远不能变。**
- `src/lib/ai.ts` 对流式 AI 做同样的三方拆分。

### 只改 Web 后端时

绝不要碰这些桌面文件：`src-electron/**`（Electron 主/preload）、`src-tauri/**`（Rust）、`vite.config.electron.ts`。仅 Web 的模块：

- `src/lib/http.ts` —— **仅 POST** 的 fetch 客户端（token 存 localStorage，统一响应 `{code,message,data}`）。**所有请求都用 POST；参数放 body。** 唯一的 GET 是静态附件（浏览器 `<img>` 无法 POST）。
- `src/lib/browser-api.ts` —— Web 后端，实现与 `ElectronAPI` 同签名的接口。
- `src/lib/demo-data.ts` —— `DEMO_MODE=true` 用内存示例数据（登录 `admin`/`666666`），无需后端即可展示。设 `DEMO_MODE=false` 才会连真实后端 `localhost:3000`（Vite 代理 `/api`）。

### 接口文档同步（硬约束）

凡是改动 Web 端接口（`src/lib/browser-api.ts`、`src/lib/http.ts`、或任何调用后端地址/参数/方法的地方），**无论改动大小，都必须同步更新 `docs/api/` 接口文档**：

- 新增/删除/改名端点 → 更新对应章节（`auth.md`/`vaults.md`/`notes.md`/`attachments.md`）。
- 改请求字段、响应结构、HTTP 方法 → 同步文档样例。
- 文档以**代码为准**（`browser-api.ts` 是唯一事实来源）；若文档与代码冲突，改文档，不要改代码来迁就文档。
- 提交前核对：代码用到的全部端点路径 + body 字段名必须在文档中出现。文档方法与代码一致（统一 `POST`，唯一例外是附件静态 `GET`）。

### 桌面端保护（硬约束）

Electron / Tauri 是独立桌面应用，**不需要任何后端支持**。对桌面功能有任何改动，**必须先经用户确认**。改动共享文件（`src/lib/api.ts`、`src/lib/ai.ts`、`src/lib/file-src.ts` 等）时，用 `isElectron()/isTauri()/isWeb()` 分派，确保桌面分支行为不变。回归验证标准：`npx tsc --noEmit -p tsconfig.electron.json` 通过 + `npm run electron:build` 产出 `main.js`/`preload.js` 无错。

### Tauri 专用泄漏（已知，勿“修”）

`App.tsx` 的 `dragWindow` 无条件调用 `import("@tauri-apps/api/window")` → `getCurrentWindow().startDragging()`。在浏览器/Electron 里，**仅标题栏拖拽**时会抛 `Cannot read properties of undefined (reading 'metadata')`（无害，fire-and-forget）。不要通过改动 Tauri 路径来修复。

## 应用资源加载

Markdown 图片由 `src/lib/markdown.ts` → `src/lib/file-src.ts` 的 `convertFileSrc()` 解析，按分支处理：Electron `file://` / Tauri asset 协议 / 浏览器后端附件 URL。**`file-src.ts` 静态引用了 `browser-api.ts`**，所以 Web HTTP 模块会进入所有 bundle（安全，懒副作用）。

## 知识库数据模型

“知识库/vault”即真实文件夹；桌面端 `config.vaultPath` 是文件系统路径。Web 端它是 **后端 vault 的 id/名称**（仍存在同一个 `vaultPath` 字段里）。笔记以相对知识库的 `relPath` 寻址（用 `/` 分隔、无前导 `/`，根目录为 `""`）。文件操作与 `src-electron/main.ts` 一致（sanitize 文件名、阻止 `..` 逃逸）。

## 布局说明

- `docs/api/` —— Web 数据后端 REST 契约（全部 POST，见 §1.2）。后端目前尚未实现；新增真实端点应遵循它。
- `docs/` 被 gitignore，但 `docs/manual/` 与 `docs/api/` 例外（见 `.gitignore`）。
- `src/lib/store.ts`（zustand）是 UI 状态的唯一来源；组件只能通过它读写。
