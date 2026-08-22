# DSH Markdown — 智能 Markdown 知识库

macOS（Apple Silicon）本地优先的智能 Markdown 知识库编辑器。Tauri 2 + WKWebView 架构，内存约 100MB，M1 上安静无风扇。集成 DeepSeek AI：文本模型 `deepseek-v4-flash` + 视觉模型 `deepseek-v4-flash-vision-exp`（截图/图片一键转 Markdown 笔记）。

## ✨ 特性

| 功能 | 说明 |
|---|---|
| 📝 编辑器 | CodeMirror 6 视口增量渲染，10MB+ 大文件流畅编辑；>2MB 自动切「仅编辑」模式 |
| 👁 实时预览 | GFM、代码高亮；编辑 / 分栏 / 预览切换 |
| 🗺 思维导图 | 全文大纲转 markmap；` ```markmap ` 代码块内嵌导图 |
| 🔀 流程图 | ` ```mermaid ` 流程图 / 甘特图 / 时序图 |
| 🔗 双向链接 | `[[笔记名]]` 补全、跳转、自动创建；反链面板；局部/全库关系图谱（深度 1–3 层、出/入/双向过滤） |
| 🤖 AI 助手 | 多会话管理（本地持久化）、携带笔记上下文对话、多模态图片问答 |
| 🌐 网页转笔记 | 粘贴链接一键成文；微信公众号配图自动本地化；Obsidian Web Clipper 同款 front-matter，存入 `Clippings/` |
| 📷 截图转笔记 | 应用自动隐藏 → 系统截图 → 自动恢复 → 视觉模型转 Markdown（表格逐行识别）；腾讯文档/飞书等 JS 页面走此路径 |
| 🖼 图片归档 | 粘贴/拖拽图片自动存入 `attachments/年/月/`，永不散乱 |
| 📂 知识库 | 目录树管理、全文搜索、⌘P 快速打开、外部修改检测、原子写入自动保存 |
| 🌓 主题 | 浅色 / 深色 / 跟随系统 |

## 🖥 运行环境要求

| 依赖 | 版本 | 说明 |
|---|---|---|
| macOS | 13+ | Apple Silicon（M1/M2/M3）；Intel 未测试 |
| Node.js | ≥ 20 | 建议 22（含 npm ≥ 10） |
| Rust | ≥ 1.77 | 含 cargo，经 [rustup](https://rustup.rs) 安装 |
| Xcode Command Line Tools | — | `xcode-select --install` |
| DeepSeek API Key | 可选 | 不填可正常用作纯编辑器；AI 功能需要 |

## 🚀 快速开始

```bash
# 1. 克隆
git clone https://github.com/<你的用户名>/dsh-markdown.git
cd dsh-markdown

# 2. 安装依赖（node_modules 体积较大，勿提交 git）
npm install

# 3. 开发模式运行（首次会全量编译 Rust，约 2–3 分钟）
npm run tauri dev
```

## 📦 构建 Release 版

```bash
npm run tauri build
```

产物位置：

- **应用**：`src-tauri/target/release/bundle/macos/DSH Markdown.app`（拖入 /Applications 即可）
- **安装包**：`src-tauri/target/release/bundle/dmg/DSH Markdown_0.1.0_aarch64.dmg`

> 应用为 ad-hoc 签名，首次打开需右键 → 打开；更新重装后 macOS 的「屏幕录制」授权需重新勾选并重启应用。

## 📁 目录结构

```
dsh-markdown/
├── src/                          # 前端（React 19 + TypeScript）
│   ├── components/               #   UI 组件
│   │   ├── Editor.tsx            #     CodeMirror 6 编辑器
│   │   ├── Preview.tsx           #     Markdown 预览（mermaid/markmap 按需加载）
│   │   ├── MindmapView.tsx       #     全文思维导图
│   │   ├── GraphView.tsx         #     局部/全库关系图谱（canvas 力导向）
│   │   ├── AiPanel.tsx           #     AI 助手（会话/网页转笔记/截图转笔记）
│   │   ├── FileTree.tsx          #     知识库目录树
│   │   └── ...                   #     大纲/反链/快速打开/设置等
│   ├── lib/                      #   核心逻辑
│   │   ├── cm.ts                 #     CodeMirror 配置（双链补全/图片粘贴）
│   │   ├── markdown.ts           #     markdown-it 渲染管线
│   │   ├── ai.ts                 #     DeepSeek 流式客户端（多模态）
│   │   ├── store.ts              #     zustand 全局状态
│   │   └── wikilink.ts           #     双链解析/反链/模糊匹配
│   └── styles/global.css         #   主题变量（浅/深）
├── src-tauri/                    # 后端（Rust + Tauri 2）
│   ├── src/
│   │   ├── fs.rs                 #     文件树/读写/搜索/链接索引/附件归档
│   │   ├── ai.rs                 #     OpenAI 兼容 SSE 流式代理（reasoning 双通道）
│   │   ├── chats.rs              #     AI 会话持久化（vault/.dsh/ai/）
│   │   ├── fetch.rs              #     网页抓取/微信图片提取下载/交互截图
│   │   ├── watcher.rs            #     FSEvents 文件监听
│   │   └── config.rs             #     本机配置读写
│   ├── capabilities/default.json #   插件权限声明（ACL）
│   └── tauri.conf.json           #   窗口/打包/asset 协议配置
├── scripts/gen-icon.mjs          # 应用图标生成（纯 Node，无依赖）
├── LICENSE                       # Apache-2.0
└── README.md
```

## ⌨️ 快捷键

| 按键 | 功能 |
|---|---|
| `⌘P` | 快速打开笔记 |
| `⌘S` | 立即保存（平时 800ms 自动保存） |
| `⌘\` | 侧栏开关 |
| `⌘B / ⌘I / ⌘K` | 粗体 / 斜体 / 链接 |
| `⌘↩` | AI 发送 / 转笔记（跟随主按钮） |
| `[[` | 双链补全 |

## 📚 使用指引

- 首次启动选择一个空文件夹作为知识库（自动初始化目录结构）
- AI 功能：右上角 ⚙️ 填入 DeepSeek API Key（模型名已预置）
- 📷 截图转笔记首次使用需授权「屏幕录制」（系统设置 → 隐私与安全性），授权后 **⌘Q 重启应用**生效

## 🔐 隐私说明

- 笔记、附件、AI 会话全部存放在你选择的知识库目录，纯本地
- DeepSeek API Key 仅保存在本机（`~/Library/Application Support/com.zhufeng.zf-markdown/config.json`），不会上传到任何第三方，也不在源码中

## 🧰 技术栈

Tauri 2 · React 19 · TypeScript · Vite 7 · CodeMirror 6 · markdown-it · mermaid · markmap · zustand · Rust（notify / reqwest / rayon / tokio）

## ⚡ 性能设计（M1 不发热）

- Tauri 2 而非 Electron；mermaid / markmap / 代码语法全部按需 `import()`，空闲零占用
- 大文件（>2MB）自动禁用实时预览
- 文件监听走 macOS FSEvents（事件驱动，零轮询）
- 图谱力导向动画收敛后自动降频

## 📄 License

[Apache-2.0](LICENSE) © The DSH Markdown Authors
