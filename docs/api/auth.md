# 认证

基于账号 + 密码。注册与登录直接返回 token；除这两个接口外，其余接口都需要带 `Authorization: Bearer <token>`。

> **方法约定**：本章全部接口用 `POST`（参数放 body）。

> 说明：本阶段后端暂无「修改密码 / 注销账号」需求，如后续需要可扩展 `POST /api/auth/password`。

---

## 1. 注册

`POST /api/auth/register`

### 请求体

```json
{
  "username": "alice",
  "password": "secret123"
}
```

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `username` | string | 是 | 1–64 字符，建议避免空格 |
| `password` | string | 是 | 最小长度 6 |

### 响应（`data`）

```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "u_1",
    "username": "alice"
  }
}
```

```
201 Created
```

### 错误

- `409`：用户名已存在

---

## 2. 登录

`POST /api/auth/login`

### 请求体

```json
{ "username": "alice", "password": "secret123" }
```

### 响应（`data`）

```json
{ "token": "...", "user": { "id": "u_1", "username": "alice" } }
```

```
200 OK
```

### 错误

- `401`：用户不存在或密码错误

---

## 3. 当前用户

`POST /api/auth/me`

获取当前登录用户信息，同时用于前端校验 token 是否有效。

### 请求体

无（body 可为空对象 `{}`）。

### 响应（`data`）

```json
{ "id": "u_1", "username": "alice" }
```

```
200 OK
```

### 错误

- `401`：token 失效 / 未登录

---

## 4. 登出（可选，令牌失效）

`POST /api/auth/logout`

使当前 token 失效。前端同时清除本地存储的 token。

### 响应

```json
{ "code": 0, "message": "ok", "data": null }
```

```
200 OK
```
