# 知识库（Vault）

知识库是后端存储空间的一个逻辑单元，以 `id` 唯一标识。前端「选择知识库」即：列出已有库 → 选中或新建。

> **方法约定**：本章所有接口用 `POST`。id 用 URL 路径段 `/api/vaults/:id`，其余参数走 body。

---

## 1. 列表

`POST /api/vaults`

列出当前用户全部知识库。

### 请求体

无（body 可为空对象 `{}`）。

### 响应（`data`）

```json
[
  { "id": "v_1", "name": "我的笔记", "createdAt": "2026-09-03T09:00:00Z", "updatedAt": "2026-09-03T09:00:00Z", "noteCount": 12 }
]
```

```
200 OK
```

排序：按 `updatedAt` 降序（最近使用的项目在前）。

---

## 2. 创建

`POST /api/vaults`

新建一个知识库。后端自动生成 `id`，并可在内部创建空的目录骨架（如 `attachments/`、`templates/`，非强制）。

### 请求体

```json
{ "name": "我的笔记" }
```

### 响应（`data`）

```json
{ "id": "v_1", "name": "我的笔记", "createdAt": "...", "updatedAt": "...", "noteCount": 0 }
```

```
201 Created
```

### 错误

- `409`：同名知识库已存在

---

## 3. 详情（前端暂未调用，预留）

`POST /api/vaults/:id`

### 请求体

无（body 可为空对象 `{}`）。

### 响应（`data`）

```json
{ "id": "v_1", "name": "我的笔记", "createdAt": "...", "updatedAt": "...", "noteCount": 12 }
```

```
200 OK
```

### 错误

- `404`：知识库不存在或无权访问

---

## 4. 删除（前端暂未调用，预留）

`POST /api/vaults/:id/delete`

删除整个知识库（及其内全部笔记与附件）。**不可恢复**，前端需二次确认。

### 请求体

无（body 可为空对象 `{}`）。

### 响应

```json
{ "code": 0, "message": "ok", "data": null }
```

```
200 OK
```

### 错误

- `404`：知识库不存在
