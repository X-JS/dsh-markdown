# 附件（图片等）

附件作为普通文件存入知识库，寻址键为相对路径（对齐桌面版 `attachments/年/月/…`）。

> **方法约定**：§1（归档）与 §3（批量抓图）用 `POST`；§2（读取附件）是唯一 `GET` 例外——浏览器 `<img>` 原生按 URL 加载，无法改为 POST。

---

## 1. 归档附件（`saveAttachment`）

`POST /api/vaults/:id/attachments`

前端把文件转成 base64 上传，后端按「年/月」归档并生成唯一文件名。

### 请求体

```json
{ "filename": "clipboard-2026.png", "base64": "iVBORw0KGgoAAAANS…" }
```

后端归档规则（对齐桌面版 `main.ts`）：

```
attachments/<YYYY>/<MM>/<yyyy-MM-dd-HH-mm-ss>-<stem>.<ext>
```

- 文件名经 sanitize（去掉非法字符）。
- 若文件名含扩展名，保留；否则默认 `.bin`。
- 已存在则追加时间戳避免覆盖。

### 响应（`data`）— 返回相对路径

```json
"attachments/2026/09/2026-09-03-10-30-15-clipboard-2026.png"
```

```
201 Created
```

### 错误

- `400`：base64 非法

---

## 2. 读取附件 / 图片（静态访问）

`GET /api/vaults/:id/attachment?rel=<rel>`

返回二进制流，供 `<img>` / `<video>` / `<audio>` 直接使用。**不包裹 JSON。**

### 响应

- `200 OK`，`Content-Type` 按扩展名推断（`png`→`image/png`、`jpg/jpeg`→`image/jpeg`、`gif`→`image/gif`、`webp`→`image/webp`、`svg`→`image/svg+xml`…）
- `Cache-Control: public, max-age=31536000, immutable`（基于唯一时间戳文件名，可长缓存）

### 错误

- `404`：文件不存在

> 前端通过 `src/lib/file-src.ts` 的 `convertFileSrc`（浏览器分支）拼出此 URL；`src/lib/markdown.ts` 里 `![](rel)` 即可直接显示。

---

## 3. 批量抓图（`downloadImages`）

`POST /api/vaults/:id/download-images`

抓取网页中的远程图片并入库，返回各自相对路径。供「网页剪藏」使用。

### 请求体

```json
{ "urls": ["https://example.com/a.png", "https://example.com/b.jpg"] }
```

### 响应（`data`）

```json
[ "attachments/2026/09/a.png", "attachments/2026/09/b.jpg" ]
```

```
200 OK
```

每张图片独立尝试；失败的 URL 在结果数组中省略（或返回 `null`），不影响其余图片。抓取失败不视为整请求失败。

---

## 说明：图片显示链路

浏览器 Web 版中，笔记里的 `![](attachments/xxx.png)` 会：

1. `markdown.ts` 的 image rule 把它识别为相对路径（非 http/data）；
2. `convertFileSrc`（浏览器分支）拼接为 `GET /api/vaults/:id/attachment?rel=…`；
3. `<img>` 直接使用该 URL，由后端返回二进制流。
