# 笔记 / 目录操作

所有路径均为**相对知识库根目录**的 `relPath`，用 `/` 分隔、不以 `/` 开头；根目录传空字符串。

> **方法约定**：本章所有接口用 `POST`，参数一律走 body（原本用 query 的 `rel`/`q` 都放 body）。附件静态读取除外（见 attachments.md）。
> 后端须做边界校验，阻止 `..` 越权逃逸到知识库外（对齐桌面版 `src-electron/main.ts` 的 `resolve()`）。文件名/目录名需 `sanitize`（`\ / : * ? " < > |` 替换为空）。

---

## 1. 列出目录（对应桌面版 `listDir`）

`POST /api/vaults/:id/list`

### 请求体

```json
{ "rel": "笔记" }
```

- `rel` 为相对目录；根目录传 `""`（body 可为空对象 `{}`）。

### 响应（`data`）

```json
[
  { "name": "Folders", "relPath": "Folders", "isDir": true, "size": 0, "title": null },
  { "name": "welcome.md", "relPath": "welcome.md", "isDir": false, "size": 1024, "title": "欢迎使用 DSH Markdown" }
]
```

```
200 OK
```

目录在前、文件在后，各自按名称（不区分大小写）升序。隐藏文件（`.` 开头）过滤去掉。

---

## 2. 读取文件（`readFile`）

`POST /api/vaults/:id/read`

### 请求体

```json
{ "rel": "notes/demo.md" }
```

### 响应（`data`）

```json
{ "content": "# 标题\n\n正文", "size": 1024, "modified": 1756886400 }
```

```
200 OK
```

### 错误

- `404`：文件不存在

---

## 3. 写入文件（`writeFile`，原子写入）

`POST /api/vaults/:id/write`

### 请求体

```json
{ "rel": "notes/demo.md", "content": "# 新内容\n" }
```

后端建议先写临时文件再 rename，避免半写状态。

### 响应

```json
{ "code": 0, "message": "ok", "data": null }
```

```
200 OK
```

若父目录不存在，须自动 `mkdir -p`。

---

## 4. 新建笔记（`createNote`）

`POST /api/vaults/:id/notes`

在 `dir` 目录下新建 `title.md`，自动处理重名（`title-2.md`、`title-3.md` …）。

### 请求体

```json
{ "dir": "notes", "title": "我的笔记", "content": "# 我的笔记\n\n" }
```

- `dir` 为相对目录（根目录传 `""`）。
- `content` 可选，缺省生成 `# <title>\n\n`。

### 响应（`data`）— 返回实际创建的相对路径

```json
"notes/我的笔记.md"
```

```
201 Created
```

### 错误

- `400`：标题为空或非法字符

---

## 5. 新建目录（`createDir`）

`POST /api/vaults/:id/dirs`

### 请求体

```json
{ "parent": "notes", "name": "archived" }
```

### 响应（`data`）— 返回相对路径

```json
"notes/archived"
```

```
201 Created
```

### 错误

- `409`：同名目录已存在 / 重名冲突

---

## 6. 重命名（`renameEntry`）

`POST /api/vaults/:id/rename`

### 请求体

```json
{ "rel": "notes/old.md", "newName": "new.md" }
```

`newName` 为**新文件名/目录名**（不含路径）。

### 响应（`data`）— 返回新相对路径

```json
"notes/new.md"
```

```
200 OK
```

### 错误

- `409`：目标已存在同名条目

---

## 7. 移动（`moveEntry`）

`POST /api/vaults/:id/move`

将条目移动到目标目录，文件名不变。

### 请求体

```json
{ "rel": "notes/old.md", "dstDir": "archive" }
```

### 响应（`data`）— 返回新相对路径

```json
"archive/old.md"
```

```
200 OK
```

### 错误

- `409`：目标目录存在同名条目

---

## 8. 删除（`deleteEntry`）

`POST /api/vaults/:id/entry`

递归删除文件或目录。

### 请求体

```json
{ "rel": "notes/old.md" }
```

### 响应

```json
{ "code": 0, "message": "ok", "data": null }
```

```
200 OK
```

### 错误

- `404`：条目不存在

---

## 9. 搜索（`searchVault`）

`POST /api/vaults/:id/search`

对全部 `.md/.markdown/.txt` 做大小写不敏感的行内检索。

### 请求体

```json
{ "q": "关键词" }
```

### 响应（`data`）

```json
[
  { "relPath": "notes/a.md", "lineNo": 3, "lineText": "…包含关键词的行…" }
]
```

```
200 OK
```

限制：最多返回 300 条命中；每个文件最多返回 20 条行；单行超过 500 字符跳过；`lineText` 截断至 160 字符。

---

## 10. 全部笔记（`listAllNotes`）

`POST /api/vaults/:id/notes`

返回全部 `.md/.markdown` 文件索引，用于快速打开 / 补全 / 图谱。注意与 §4 新建笔记**同路径、不同语义**（无 body / body 为空时列出；含 `dir/title/content` 时为新建）。

### 请求体

无（body 可为空对象 `{}`）。

### 响应（`data`）

```json
[
  { "relPath": "notes/a.md", "title": "A" },
  { "relPath": "b.md", "title": null }
]
```

```
200 OK
```

`title` 抽取规则：frontmatter `title:` 字段 > 首个 `# ` 标题；二选一皆无则 `null`。仅对 ≤ 512KB 文件解析。

---

## 11. 链接索引（`indexLinks`）

`POST /api/vaults/:id/links`

扫描全部笔记中的 `[[...]]` 双向链接，返回源→目标映射。

### 请求体

无（body 可为空对象 `{}`）。

### 响应（`data`）

```json
[
  { "source": "notes/a.md", "target": "B" },
  { "source": "notes/a.md", "target": "C" }
]
```

```
200 OK
```

正则：`(?<!\!)\[\[([^\[\]]+?)\]\]`，`target` 取 `|` 别名前的部分并 trim。

---

## 12. 变更版本（`fs-change` 轮询用）

`POST /api/vaults/:id/version`

返回一个**自增版本号**，用于前端轮询检测知识库是否发生任何变更（新建/改名/删除/写入等）。返回的 `version` 只要与上次不同，前端即刷新文件树与链接索引。

### 请求体

无（body 可为空对象 `{}`）。

### 响应（`data`）

```json
{ "version": 42 }
```

```
200 OK
```

- 后端内部维护一个单调递增的计数器；任一写操作（write/create/rename/move/delete/attachment）完成后 `version++`。
- 前端每 4 秒轮询一次（`src/lib/browser-api.ts` 的 `pollFsChange`）。

