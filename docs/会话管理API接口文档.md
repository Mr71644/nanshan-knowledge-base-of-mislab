# 会话管理 API 接口文档

Base URL: `{VITE_RAG_API_URL}/api/v1/rag`

所有接口需要在 Header 中携带 `Authorization: Bearer {token}`（复用现有 ragFetch 封装即可）。

---

## 一、会话管理

### 1. 创建会话

`POST /conversations`

**Request Body:**

```json
{
  "title": "新对话"  // 可选，默认 "新对话"
}
```

**Response:**

```json
{
  "id": "a1b2c3d4-...",
  "title": "新对话",
  "created_at": "2026-05-30T10:00:00+00:00",
  "updated_at": "2026-05-30T10:00:00+00:00",
  "message_count": 0
}
```

---

### 2. 获取会话列表

`GET /conversations`

按 `updated_at` 倒序返回，最近活跃的会话在最前面。

**Response:**

```json
{
  "conversations": [
    {
      "id": "a1b2c3d4-...",
      "title": "关于RAG的讨论",
      "created_at": "2026-05-30T10:00:00+00:00",
      "updated_at": "2026-05-30T11:30:00+00:00",
      "message_count": 6
    },
    {
      "id": "e5f6g7h8-...",
      "title": "新对话",
      "created_at": "2026-05-29T09:00:00+00:00",
      "updated_at": "2026-05-29T09:05:00+00:00",
      "message_count": 2
    }
  ]
}
```

---

### 3. 获取会话消息

`GET /conversations/{conversation_id}/messages`

按消息 ID 升序返回（时间顺序）。

**Response:**

```json
{
  "messages": [
    {
      "id": 1,
      "role": "user",
      "content": "什么是RAG？",
      "sources": [],
      "created_at": "2026-05-30T10:00:00+00:00"
    },
    {
      "id": 2,
      "role": "assistant",
      "content": "RAG（检索增强生成）是一种结合检索和生成的技术...",
      "sources": [
        {
          "doc_id": "markdown-42",
          "title": "RAG技术介绍",
          "doc_type": "markdown",
          "score": 0.8721
        }
      ],
      "created_at": "2026-05-30T10:00:05+00:00"
    }
  ]
}
```

**错误：** 会话不存在返回 `404 {"detail": "Conversation not found"}`

---

### 4. 修改会话标题

`PATCH /conversations/{conversation_id}`

**Request Body:**

```json
{
  "title": "新的标题"
}
```

**Response:**

```json
{
  "updated": true
}
```

**错误：** 会话不存在返回 `404`

---

### 5. 删除会话

`DELETE /conversations/{conversation_id}`

删除会话及其所有消息（CASCADE）。

**Response:**

```json
{
  "deleted": true
}
```

**错误：** 会话不存在返回 `404`

---

## 二、Query 接口改造

### `POST /query`

**Request Body 新增字段：**

```json
{
  "question": "什么是RAG？",
  "stream": true,
  "top_k": 5,
  "conversation_id": "a1b2c3d4-..."   // 新增，可选
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `question` | string | 是 | 用户问题 |
| `stream` | bool | 否 | 默认 true，SSE 流式 |
| `top_k` | int | 否 | 默认 5 |
| `conversation_id` | string | 否 | 会话 ID，为空则自动创建新会话 |

### SSE 事件流变化

原事件顺序：`source` → `token`(多次) → `done`

**新增 `conversation` 事件**（仅当 `conversation_id` 为空自动创建新会话时发送）：

```
事件顺序：conversation → source → token(多次) → done
```

#### conversation 事件

```json
data: {"type": "conversation", "conversation_id": "a1b2c3d4-...", "title": "新对话"}
```

前端收到后需保存 `conversation_id`，后续该会话内的请求都带上此 ID。

#### source 事件（不变）

```json
data: {"type": "source", "documents": [...]}
```

#### token 事件（不变）

```json
data: {"type": "token", "content": "RAG是..."}
```

#### done 事件（不变）

```json
data: {"type": "done"}
```

---

## 三、前端对接建议

### 新增 API 函数（`src/apis/rag.js`）

```js
// 创建新会话
export const createConversation = (title = '新对话') =>
  ragFetch('/api/v1/rag/conversations', {
    method: 'POST',
    body: JSON.stringify({ title }),
  });

// 获取会话列表
export const getConversations = () =>
  ragFetch('/api/v1/rag/conversations');

// 获取会话消息
export const getConversationMessages = (convId) =>
  ragFetch(`/api/v1/rag/conversations/${convId}/messages`);

// 修改会话标题
export const updateConversation = (convId, title) =>
  ragFetch(`/api/v1/rag/conversations/${convId}`, {
    method: 'PATCH',
    body: JSON.stringify({ title }),
  });

// 删除会话
export const deleteConversation = (convId) =>
  ragFetch(`/api/v1/rag/conversations/${convId}`, {
    method: 'DELETE',
  });
```

### 前端交互流程

1. **进入页面**：调用 `getConversations()` 加载会话列表显示在侧边栏
2. **新建对话**：调用 `createConversation()`，清空聊天区域，存储返回的 `id`
3. **发送消息**：
   - 请求体带 `conversation_id`
   - 监听 SSE 的 `conversation` 事件，若收到则更新当前会话 ID
4. **切换会话**：调用 `getConversationMessages(convId)` 加载历史消息
5. **删除会话**：调用 `deleteConversation(convId)`，从列表移除
6. **重命名会话**：调用 `updateConversation(convId, newTitle)`，可用第一条消息自动生成标题
