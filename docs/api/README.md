# DSH Markdown 后端 API 契约

本项目支持多运行时（Electron / Tauri / **浏览器 Web**）。浏览器 Web 版不再直接访问本地文件系统，而是通过本契约对接一个独立的数据后端服务（HTTP + JSON）。

本目录定义该后端的 REST 接口约定，供后端实现与前端 Web 版联调共同遵循。

---

## 1. 总体约定

| 项 | 约定 |
| --- | --- |
| Base URL | `http://localhost:3000`（后端自行决定端口，前端可用 `VITE_API_BASE` 覆盖；dev 也可经 Vite proxy 转发 `/api`） |
| 协议 | HTTPS 生产环境 / HTTP 本地开发 |
| 数据格式 | 请求与响应均为 `application/json; charset=utf-8` |
| 路径前缀 | 所有接口以 `/api` 开头 |
| **请求方法** | **统一 `POST`**（参数放 JSON body）。如需 GET/PUT/DELETE 请先与前端确认 |
| 鉴权方式 | HTTP Bearer Token（除登录/注册外均需要） |
| 字符编码 | UTF-8 |

> **请求方法约定**：除静态附件读取（浏览器 `<img>` 原生按 URL 加载，见 §1.4）外，**所有数据接口一律使用 `POST`**，参数放入 JSON body。即使语义为「查询/读取」也统一 POST，便于后端统一处理与安全审计；如需改用其它动词，须先经前端同意。

### 1.1 统一响应包裹

所有成功与失败响应都包裹为：

```json
{
  "code": 0,
  "message": "ok",
  "data": { }
}
```

- `code`: `0` 表示成功；非 0 为业务错误码（见 §3）。
- `message`: 人类可读描述，前端可直接展示（如错误提示）。
- `data`: 具体负荷；无返回值时为 `null`。

> 例外：**文件下载 / 静态附件访问** 接口直接返回二进制流（`Content-Type` 为对应 MIME），不包裹 JSON。

### 1.2 请求方法

所有数据接口统一使用 `POST`，参数放入 JSON body（查询类如 list/read/search/index 也一律 POST）。

- 路径参数（如 `/api/vaults/:id`）用 **URL 路径段** 传；其余参数走 body。
- 例外：静态附件由浏览器 `<img>` 原生加载，只能 GET（`attachments.md` §2）。这是允许的唯一非 POST 接口。
- 若需 GET/PUT/DELETE，须先与前端确认。

### 1.3 鉴权

除 `POST /api/auth/login` 与 `POST /api/auth/register` 外，所有请求头需携带：

```
Authorization: Bearer <token>
```

未携带或 token 失效 → `401`，`code = 401`。

### 1.4 认证方式

账号 + 密码。密码仅用于登录换取 token，后端须以安全方式存储（如加盐哈希，勿明文日志）。

---

## 2. 数据模型

### 2.1 核心概念：知识库（Vault）

知识库是**后端存储空间的一个逻辑单元**，以 `id` 唯一标识。前端不再有「本地目录」概念；一个用户可拥有多个知识库。

所有笔记、附件都归属某个知识库，并通过**相对路径字符串**寻址（与桌面版保持一致，最小化前端改动）。

```ts
interface Vault {
  id: string;          // 知识库唯一 id
  name: string;        // 显示名称，用户可改写
  createdAt: string;   // ISO 8601
  updatedAt: string;   // ISO 8601
  noteCount: number;   // 笔记数量（md 文件数）
}
```

### 2.2 文件 / 目录节点（对应桌面版 FsNode）

```ts
interface FsNode {
  name: string;     // 当前条目名（不含路径）
  relPath: string;  // 相对知识库根目录的路径，用 "/" 分隔，根目录条目不含前导 /
  isDir: boolean;
  size: number;     // 目录恒为 0
  title: string | null; // 笔记标题（md 首行 # 或 frontmatter title），非 md 为 null
}
```

### 2.3 读文件结果（对应桌面版 ReadResult）

```ts
interface ReadResult {
  content: string;
  size: number;      // 字节
  modified: number;  // Unix 秒
}
```

### 2.4 搜索命中（对应桌面版 SearchHit）

```ts
interface SearchHit {
  relPath: string;
  lineNo: number;   // 1 起始
  lineText: string; // 该行文本（前端会截断，后端可省略）
}
```

### 2.5 笔记目录项（listAllNotes / 链接索引）

```ts
interface NoteMetaItem {
  relPath: string;
  title: string | null;
}

interface LinkEntry {
  source: string; // 含 [[..]] 的笔记 relPath
  target: string; // [[target]] 里的目标名
}
```

### 2.6 Path 约定

- `relPath` 一律以 `/` 分隔，且**不**以 `/` 开头。
- 根目录传空字符串 `""`。
- 后端须做边界校验，阻止 `..` 越权逃逸到知识库外（对齐桌面版 `main.ts` 的 `resolve()`）。

---

## 3. 错误码

统一响应中 `code` 为 0 表示成功；否则：

| code | HTTP | 含义 | 前端行为 |
| --- | --- | --- | --- |
| 0 | 200 | 成功 | — |
| 400 | 400 | 参数错误 / 非法路径 | 弹 message |
| 401 | 401 | 未登录 / token 失效 | 弹出登录框 |
| 403 | 403 | 无权访问该资源 | 弹 message |
| 404 | 404 | 资源不存在 | 弹 message |
| 409 | 409 | 资源冲突（如重名） | 弹 message |
| 500 | 500 | 服务端内部错误 | 弹 message |

---

## 4. 文档目录

- [auth.md](./auth.md) — 登录 / 注册 / 当前用户
- [vaults.md](./vaults.md) — 知识库列表 / 创建 / 详情(预留) / 删除(预留)
- [notes.md](./notes.md) — 笔记读写、目录树、重命名、移动、删除、搜索、链接索引、变更版本
- [attachments.md](./attachments.md) — 附件归档 / 静态读取 / 批量抓图
- [desktop-only.md](./desktop-only.md) — 桌面专属能力（浏览器版降级说明）

## 5. 前端适配说明

前端只改了 `src/lib/api.ts` 的分支选择（新增 `isTauri()` + `http` 分支），以及图片展示与登录/知识库选择 UI。Electron / Tauri 分支**完全不变**。

- 浏览器版后端：`src/lib/browser-api.ts`
- HTTP 封装：`src/lib/http.ts`（token 存 localStorage，Base URL 取 `VITE_API_BASE`）
- 浏览器版配置：存 localStorage，`vaultPath` 字段存「知识库 id 或名称」字符串
