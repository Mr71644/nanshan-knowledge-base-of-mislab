# Step 6: 前端集成实现文档

## 概述

改造 React 前端的 `ChatInput` 组件，接入 RAG 服务的 SSE 流式问答接口，实现打字机效果和来源引用展示。

---

## 一、当前前端代码分析

### 1.1 项目信息

| 项 | 值 |
|---|---|
| 项目位置 | `D:\桌面\nanshan-knowledge-base-workespace\nanshan-knowledge-base-dev\` |
| 框架 | React 18 + Vite 5 + Redux Toolkit |
| UI 库 | Ant Design |
| HTTP 库 | axios（共享实例 `src/utils/request.js`） |
| Token 管理 | `src/utils/token.js`，存储在 `localStorage` 的 `token_key` |

### 1.2 ChatInput 组件现状

**文件**：`src/components/ChatInput/index.jsx`

当前实现的问题：

| 问题 | 现状 | 需要改为 |
|------|------|---------|
| API 地址 | 硬编码 `http://10.92.191.37:8000/api/v1/ask` | 使用环境变量 `VITE_RAG_API_URL + /api/v1/rag/query` |
| HTTP 库 | 直接用 `axios.post`（不支持 SSE 流式） | 用原生 `fetch + ReadableStream` |
| 认证 | Token 被注释掉了，`user_id` 硬编码为 `"1"` | 使用 `getToken()` 放到 `Authorization` header |
| 流式渲染 | 无，等完整响应再显示 | SSE 逐 token 渲染（打字机效果） |
| 来源引用 | 无 | 显示检索到的文档来源列表 |

**关键代码位置**（`index.jsx`）：

```
第 1-10 行:    import 和状态定义
第 40-68 行:   handleSend 函数（需完整替换）
第 92-104 行:  消息列表渲染（需添加来源引用和流式光标）
```

### 1.3 共享请求工具

**文件**：`src/utils/request.js`
- 已有 axios 实例，带 JWT 自动注入和 401 处理
- **ChatInput 不使用这个共享实例**（因为它需要 SSE，axios 不原生支持）
- 但需要复用 `getToken()` 获取 JWT

### 1.4 Vite 代理

**文件**：`vite.config.js`
- 当前代理规则：`/api` → `http://101.43.146.27/new-app/api`
- 需要添加：`/rag-api` → `http://localhost:8001`（开发环境用）

---

## 二、需要修改的文件清单

| 文件 | 修改类型 | 说明 |
|------|---------|------|
| `.env.development` | 追加 | 添加 `VITE_RAG_API_URL` |
| `.env.production` | 追加 | 添加 `VITE_RAG_API_URL` |
| `vite.config.js` | 追加 | 添加 RAG 服务代理规则 |
| `src/components/ChatInput/index.jsx` | **重写** | 替换 API 调用、SSE 流式、来源展示 |
| `src/components/ChatInput/index.module.css` | 追加 | 来源引用样式 + 流式光标动画 |

共 **5 个文件**。

---

## 三、逐文件修改指南

### 3.1 `.env.development`

追加一行：

```bash
VITE_RAG_API_URL=/rag-api
```

> 说明：开发环境通过 Vite 代理转发，所以用 `/rag-api` 相对路径。

### 3.2 `.env.production`

追加一行：

```bash
VITE_RAG_API_URL=http://119.27.181.240:8001
```

> 说明：生产环境直连服务器上的 RAG 服务。

### 3.3 `vite.config.js`

在 `server.proxy` 中添加 RAG 服务的代理规则：

```javascript
proxy: {
    '/api': {
        target: 'http://101.43.146.27/new-app/api',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '')
    },
    // ↓↓↓ 新增 ↓↓↓
    '/rag-api': {
        target: 'http://localhost:8001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/rag-api/, '')
    }
}
```

> 路由映射：`/rag-api/api/v1/rag/query` → `http://localhost:8001/api/v1/rag/query`

### 3.4 `src/components/ChatInput/index.jsx`

#### 需要修改的 import

```javascript
// 删除
import axios from 'axios'

// 保留
import { getToken } from '@/utils'
```

#### 修改消息状态结构

每条消息从 `{ type, content }` 扩展为：

```javascript
{
    type: 'Q' | 'A',
    content: string,
    sources: [],          // 来源文档列表
    isStreaming: boolean,  // 是否正在流式输出
    id: number            // 唯一 ID，用于更新特定消息
}
```

初始消息改为：

```javascript
const [messages, setMessages] = useState([
    {
        type: 'A',
        content: '你好！我是知识库智能助手，有什么可以帮你的吗？',
        sources: [],
        isStreaming: false,
        id: 0,
    }
])
```

#### 完整替换 handleSend 函数

替换原来第 40-68 行的 `handleSend` 函数：

```javascript
const handleSend = async () => {
    const question = inputValue.trim()
    if (!question) return

    // 添加用户问题
    setMessages(prev => [...prev, { type: 'Q', content: question }])
    setInputValue('')

    // 添加 AI 回复占位（空内容，标记为流式中）
    const answerId = Date.now()
    setMessages(prev => [...prev, {
        type: 'A',
        content: '',
        sources: [],
        isStreaming: true,
        id: answerId,
    }])

    try {
        const token = getToken()
        const ragUrl = import.meta.env.VITE_RAG_API_URL

        const response = await fetch(`${ragUrl}/api/v1/rag/query`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({
                question,
                stream: true,
                top_k: 5,
            }),
        })

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`)
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() || ''

            for (const line of lines) {
                if (!line.startsWith('data: ')) continue
                try {
                    const data = JSON.parse(line.slice(6))

                    if (data.type === 'source') {
                        setMessages(prev => prev.map(m =>
                            m.id === answerId
                                ? { ...m, sources: data.documents }
                                : m
                        ))
                    } else if (data.type === 'token') {
                        setMessages(prev => prev.map(m =>
                            m.id === answerId
                                ? { ...m, content: m.content + data.content }
                                : m
                        ))
                    } else if (data.type === 'done') {
                        setMessages(prev => prev.map(m =>
                            m.id === answerId
                                ? { ...m, isStreaming: false }
                                : m
                        ))
                    }
                } catch (e) {
                    // 忽略解析错误
                }
            }
        }
    } catch (error) {
        setMessages(prev => prev.map(m =>
            m.id === answerId
                ? { ...m, content: '获取答案失败，请检查网络后重试', isStreaming: false }
                : m
        ))
    }
}
```

#### 修改消息列表渲染

在消息列表的渲染区域（约第 92-104 行），需要：

1. **AI 消息内容后追加来源引用**
2. **流式输出时显示闪烁光标**
3. **保持原有的 Q/A 气泡样式**

```jsx
{messages.map((msg, index) => (
    <div key={index} className={msg.type === 'Q' ? styles.question : styles.answer}>
        <div className={styles.messageContent}>
            {msg.content}
            {msg.type === 'A' && msg.isStreaming && (
                <span className={styles.streamingCursor}>|</span>
            )}
        </div>
        {msg.type === 'A' && msg.sources && msg.sources.length > 0 && !msg.isStreaming && (
            <div className={styles.sourcesContainer}>
                <div className={styles.sourcesTitle}>来源文档：</div>
                {msg.sources.map((src, i) => (
                    <div key={i} className={styles.sourceItem}>
                        <span className={styles.sourceName}>{src.title}</span>
                        <span className={styles.sourceType}>({src.doc_type})</span>
                        <span className={styles.sourceScore}>相关度: {(src.score * 100).toFixed(1)}%</span>
                    </div>
                ))}
            </div>
        )}
    </div>
))}
```

### 3.5 `src/components/ChatInput/index.module.css`

在文件末尾追加以下样式：

```css
/* 来源引用区域 */
.sourcesContainer {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid #e8e8e8;
}

.sourcesTitle {
    font-size: 11px;
    color: #999;
    margin-bottom: 4px;
}

.sourceItem {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: #666;
    padding: 2px 0;
}

.sourceName {
    color: #1677ff;
    max-width: 160px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.sourceType {
    color: #999;
}

.sourceScore {
    color: #bbb;
    font-size: 10px;
}

/* 流式输出闪烁光标 */
.streamingCursor {
    display: inline-block;
    animation: blink 0.8s infinite;
    color: #1677ff;
    font-weight: bold;
    margin-left: 2px;
}

@keyframes blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0; }
}

/* 消息内容（用于 inline 光标定位） */
.messageContent {
    display: inline;
}
```

---

## 四、SSE 事件协议

RAG 服务返回的 SSE 事件格式：

```
data: {"type": "source", "documents": [...]}        ← 第一个事件：来源文档列表
data: {"type": "token", "content": "南"}              ← 后续事件：逐字输出
data: {"type": "token", "content": "山"}
data: {"type": "token", "content": "知识库"}
...
data: {"type": "done", "usage": {...}}                ← 最后事件：结束+用量统计
```

前端处理流程：

```
source 事件 → 更新消息的 sources 字段（显示来源列表）
token  事件 → 追加 content（打字机效果）
done   事件 → 设置 isStreaming = false（显示来源引用）
```

---

## 五、非流式模式（备用）

如果某些场景不需要流式（如网络不稳定），可以发送 `stream: false`：

```javascript
const response = await fetch(`${ragUrl}/api/v1/rag/query`, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ question, stream: false, top_k: 5 }),
})

const data = await response.json()
// data = { answer: "...", sources: [...], usage: {...} }
```

---

## 六、生产环境 Nginx 配置

部署到服务器后，nginx 需要添加 RAG 服务的反向代理（SSE 需要特殊配置）：

```nginx
location /api/v1/rag/ {
    proxy_pass http://127.0.0.1:8001/api/v1/rag/;
    proxy_http_version 1.1;
    proxy_set_header Connection '';
    proxy_buffering off;           # 必须关闭，否则 SSE 会被缓存
    proxy_cache off;               # 关闭缓存
    proxy_read_timeout 300s;       # SSE 长连接超时
}
```

---

## 七、验证清单

| 序号 | 测试项 | 操作 | 期望结果 |
|------|--------|------|---------|
| 1 | 环境变量 | 启动开发服务器 | 控制台无 `VITE_RAG_API_URL` 相关报错 |
| 2 | 代理连通 | 打开聊天，输入问题 | 网络请求到达 `localhost:8001` |
| 3 | SSE 流式 | 提问"知识库有哪些功能" | 答案逐字显示（打字机效果） |
| 4 | 来源展示 | 答案完成后 | 显示来源文档列表（标题、类型、相关度） |
| 5 | 闪烁光标 | 答案流式输出中 | 文本末尾有闪烁的 `|` 光标 |
| 6 | 光标消失 | 答案完成后 | 光标消失 |
| 7 | 错误处理 | 关闭 RAG 服务后提问 | 显示"获取答案失败"提示 |
| 8 | 无关问题 | 问"今天天气怎么样" | 回答"知识库中未找到相关信息" |
| 9 | 空输入 | 点击发送按钮（输入框为空） | 不发送请求 |
| 10 | 多轮对话 | 连续提问多个问题 | 每个问题都有独立的答案和来源 |

---

## 八、注意事项

1. **不要使用 axios 发 SSE 请求**：axios 不原生支持 SSE 流式读取，必须用 `fetch + ReadableStream`

2. **消息更新使用 id 匹配**：由于 React 状态更新是异步的，必须用 `answerId` 精确匹配要更新的消息，避免更新到错误的消息

3. **buffer 处理**：SSE 数据可能跨多个 chunk 到达，需要用 buffer 拼接后按 `\n` 分割处理

4. **JWT Token 必须发送**：虽然当前 RAG 服务的索引用管理员 Token，但查询接口会转发用户 Token 给 Java 后端做权限校验（未来实现权限隔离时需要）

5. **CORS 已配置**：RAG 服务的 FastAPI 已配置 `allow_origins=["*"]`，开发环境不会有跨域问题。生产环境通过 nginx 同源代理解决
