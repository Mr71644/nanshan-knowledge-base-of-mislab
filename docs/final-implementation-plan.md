# 存储格式迁移 — 最终实施方案

**日期：** 2026-07-10 | **分支：** `test/migration-feasibility` | **状态：** 可行性已验证，待实施

---

## 1. 总览

将富文本文档存储格式从 **Markdown** 迁移到 **ProseMirror JSON**。

### 核心验证结论

| # | 假设 | 验证结果 |
|---|------|----------|
| 1 | Editor.create + 离屏 DOM 输出与 useEditor 一致 | ✅ 11/11 |
| 2 | 真实文档 Markdown→JSON 无损转换 | ✅ 图片(4/4)+代码块(3/3)+表格+纯文本全覆盖 |
| 3 | 字体/颜色/高亮扩展正确序列化/反序列化 | ✅ 18/18 |
| 4 | 批量转换性能可接受 | ✅ 100 文档 1.3s, 12.7ms/doc |
| 5 | 极端边界输入不崩溃 | ✅ 0 崩溃，1 项已知 ProseMirror 约束 |
| 6 | 删除 renderMarkdown 安全 | ✅ JSON 解析不受影响 |

**唯一已知边界：** `[](url)` 无文本链接——ProseMirror 的 link mark 必须附着在 text 节点上，实际文档中极其罕见。不影响迁移。

---

## 2. 格式设计

### 2.1 格式标识

新增 `contentType` 字段：

| 值 | 含义 |
|----|------|
| `"markdown"` | 旧 Markdown 文档（API 缺失此字段时默认值） |
| `"prosemirror"` | 新 JSON 文档 |

### 2.2 JSON 结构

**普通文本：**
```json
{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"正文"}]}]}
```

**带字体+颜色：**
```json
{"type":"text","marks":[
  {"type":"textStyle","attrs":{"fontFamily":"SimSun","color":"#FF0000"}},
  {"type":"highlight","attrs":{"color":"#FFFF00"}}
],"text":"红色宋体高亮"}
```

**图片（minio: 引用原样保留）：**
```json
{"type":"image","attrs":{"src":"minio:abc123","alt":"描述","width":800,"height":null}}
```

**代码块：**
```json
{"type":"codeBlock","attrs":{"language":"javascript"},"content":[{"type":"text","text":"console.log('hello');"}]}
```

**表格：**
```json
{"type":"table","content":[{"type":"tableRow","content":[
  {"type":"tableCell","content":[{"type":"paragraph","content":[{"type":"text","text":"值"}]}]}
]}]}
```

### 2.3 体积膨胀

| 文档类型 | 膨胀率 |
|----------|--------|
| 纯文本 | 1.5 ~ 3x |
| 含表格 | 6 ~ 12x |
| 整体平均 | ~4x |

---

## 3. 转换引擎

### 3.1 核心方案

```js
// src/utils/migrationEngine.js
import { Editor } from '@tiptap/core'
import { StarterKit } from '@tiptap/starter-kit'
// ... 所有与 TiptapEditor 完全相同的扩展

const ALL_EXTENSIONS = [/* 与 TiptapEditor/index.jsx 100% 一致 */]

export function convertMarkdownToJSON(markdownContent) {
    const el = document.createElement('div')       // 离屏 DOM
    const editor = new Editor({
        element: el,
        extensions: ALL_EXTENSIONS,
        content: markdownContent || '',
        contentType: 'markdown',
    })
    const json = editor.getJSON()
    editor.destroy()
    return JSON.stringify(json)
}
```

### 3.2 为什么是这个方案

| 尝试过的方案 | 问题 |
|-------------|------|
| `generateJSON(md, extensions)` | 不解析 Markdown，只接受 HTML（测试1 发现） |
| `Editor.create` + 离屏 DOM | ✅ 已验证，输出确定且与 useEditor 完全一致 |

### 3.3 关键约束

- 必须在**浏览器环境**运行（需要 `document.createElement`）
- 必须在**React 环境**运行（自定义扩展依赖 React hooks：CodeBlockWithToolbar, MinioImage）
- 扩展配置必须与 TiptapEditor **100% 一致**，包括所有自定义扩展
- 不需要 React 组件树，只需要离屏 DOM 元素

---

## 4. 迁移机制：双层保障

### 层 1：静默批量迁移（主路径）

```
用户登录 → Home 页挂载
    ↓
GET /text/migrate-list → 待迁移文档 [{id, content}]
    ↓
requestIdleCallback 分批: 每批 10 个
    ↓
convertMarkdownToJSON()  × 10
    ↓
POST /text/migrate-batch 一次性写回
    ↓
循环直到完成 → sessionStorage 标记 → 静默结束
```

**调度参数：**

| 参数 | 值 | 依据 |
|------|-----|------|
| 批大小 | 10 个 | 测试4 每批转换 ~130ms |
| 写回间隔 | 模拟网络 200-400ms | 以实际 API 为准 |
| 空闲调度 | requestIdleCallback | 不阻塞用户交互 |
| 降级方案 | setTimeout(50ms) | 不支持 requestIdleCallback 的环境 |

**触发时机：** `src/views/Home/index.jsx` 的 `useEffect` 中，与 `getTree()` + `getUserInfomation()` 并行（不 await）。

**防重复：** `sessionStorage` 标记 `migration_completed`。每次新标签页打开都重新检查，但同一标签页不会重复。

### 层 2：懒迁移（兜底）

| 场景 | 行为 |
|------|------|
| 静默迁移遗漏的文档被编辑 | `@tiptap/markdown` 加载 → 保存时 `getJSON()` → contentType: "prosemirror" |
| 新建文档 | 直接 contentType: "prosemirror" |

### 容错

| 异常 | 处理 |
|------|------|
| 单个文档转换失败 | 跳过，console.error，懒迁移兜底 |
| 批量写回报错 | 重试 1 次，仍失败则跳过该批次 |
| 用户关闭标签页 | batch 粒度保证已完成的已写入 |
| 迁移中用户编辑同一文档 | 后端乐观锁 WHERE contentType IS NULL |
| 整个流程异常 | sessionStorage 不标记，下次重试 |

---

## 5. 后端 API

### 5.1 必须变更

**数据库：**
```sql
ALTER TABLE text_table ADD COLUMN content_type VARCHAR(20) DEFAULT NULL;
-- NULL = markdown（兼容旧数据）
```

**`GET /text/get/{id}` 响应加字段：**
```json
{
  "data": {
    "contentType": "markdown",   // 新增，缺失时前端默认 "markdown"
    ...
  }
}
```

**`PUT /text/update` 请求加字段：**
```json
{ "contentType": "prosemirror", ... }
```

**`POST /text/add` 请求加字段：**
```json
{ "contentType": "prosemirror", ... }
```

### 5.2 建议新增（加速迁移）

**`GET /text/migrate-list`**

```sql
SELECT id, content FROM text_table
WHERE status = 1 AND content_type IS NULL
```
仅返回 `id` + `content`，不返回 title/author 等无关字段。

**`POST /text/migrate-batch`**

```json
// 请求
{ "documents": [{ "id": 1, "content": "{...json...}", "contentType": "prosemirror" }] }

// 响应
{ "data": { "success": 10, "failed": 0 } }
```

后端用乐观锁防并发：
```sql
UPDATE text_table SET content = ?, content_type = 'prosemirror'
WHERE id = ? AND content_type IS NULL
```

### 5.3 不需变更

- 图片 API：`/minio/upload/markdown`、`/minio/preview/markdown/{id}` — minio: 引用在 JSON 中原样保留
- 删除 API：`DELETE /text/delete/{id}` — 格式无关
- 文件列表 API：`POST /home/get` — 不返回 content 字段

### 5.4 降级方案（无新接口时）

用现有 API 逐文档处理：
1. `POST /home/get` 递归爬取所有 status=1 的文档 ID
2. `GET /text/get/{id}` 获取 markdown
3. 前端转换
4. `PUT /text/update` 写回（带 contentType）

约 N×2 次 HTTP 请求，需并发控制（同时 3 个）。

---

## 6. 编辑器变更

### 6.1 TiptapEditor (`src/components/TiptapEditor/index.jsx`)

**Props：** 新增 `contentType`（可选，默认 `"markdown"`）

**Extensions：** 新增 FontFamily、TextStyle、Color、Highlight；保留 Markdown（仅用于加载旧文档）

**初始化：**
```jsx
const editor = useEditor({
    extensions: [...ALL_EXTENSIONS],
    content: contentType === 'prosemirror'
        ? JSON.parse(content || '{}')
        : (content || ''),
    contentType: contentType === 'prosemirror' ? 'json' : 'markdown',
})
```

**onUpdate（关键变更）：**
```jsx
onUpdate: ({ editor }) => {
    const json = editor.getJSON()
    const jsonStr = JSON.stringify(json)
    onChangeRef.current?.(jsonStr, 'prosemirror')
}
```

**外部内容同步：**
```jsx
useEffect(() => {
    if (editor && content !== lastSerialized.current) {
        if (contentType === 'prosemirror') {
            editor.commands.setContent(JSON.parse(content || '{}'))
        } else {
            editor.commands.setContent(content || '', { contentType: 'markdown' })
        }
    }
}, [content, contentType, editor])
```

### 6.2 EditorToolbar

在现有工具栏中添加 3 个控件：

1. **字体选择器** — Ant Design `<Select>`，字体列表：默认/宋体/黑体/楷体/微软雅黑/Arial/Times New Roman/Courier New
2. **文字颜色** — Ant Design `<ColorPicker>`，通过 `setColor()` 设置
3. **高亮颜色** — Ant Design `<ColorPicker>`，通过 `toggleHighlight()` 设置

### 6.3 Content/AddContent 视图

**Content：**
- 新增 `contentType` 状态
- `onChange` 签名：`(content, contentType) => { ... }`
- `processMarkdown()` 仅在 `contentType === 'markdown'` 时调用
- `edit()` / auto-save 发送 `contentType`

**AddContent：**
- 新建文档固定 `contentType: "prosemirror"`
- 移除 `processMarkdown()`

### 6.4 MinioImage

删除 `renderMarkdown()` 方法（第 82-91 行）。全局搜索已确认仅此一处使用，JSON 路径不依赖此方法。父类 Image 的默认 `renderMarkdown()` 提供 `![alt](src)` 格式作为 Markdown 输出的兜底。

---

## 7. API 层

```js
// src/apis/content.js
const editContent = ({ title, author, content, id, contentType = 'prosemirror' } = {}) => {
    return request({
        url: 'text/update', method: 'PUT',
        data: { title, author, content, id, contentType },
    })
}

const addContent = ({ title, author, content, folderId, contentType = 'prosemirror' } = {}) => {
    return request({
        url: '/text/add', method: 'POST',
        data: { title, author, content, folderId, contentType },
    })
}
```

---

## 8. 文件变更清单

### 新增（5 个）

| 文件 | 用途 |
|------|------|
| `src/utils/migrationEngine.js` | `convertMarkdownToJSON()` — Editor.create + 离屏 DOM |
| `src/utils/migrationScheduler.js` | requestIdleCallback 分批调度 + 容错 |
| `src/apis/migration.js` | `fetchMigrateList()` + `migrateBatch()` |
| `src/utils/proseMirrorUtils.js` | `extractPlainText()` (RAG) + `jsonToMarkdown()` (回滚) |

### 修改（9 个）

| 文件 | 变更 |
|------|------|
| `package.json` | 新增 4 个 @tiptap 扩展依赖 |
| `src/components/TiptapEditor/index.jsx` | 扩展注册 + contentType prop + getJSON |
| `src/components/TiptapEditor/EditorToolbar.jsx` | 字体/颜色/高亮控件 |
| `src/components/TiptapEditor/extensions/MinioImage.js` | 删除 `renderMarkdown()` |
| `src/components/TiptapEditor/index.module.css` | 新控件样式 |
| `src/views/Content/index.jsx` | contentType 状态 + 条件 processMarkdown |
| `src/views/AddContent/index.jsx` | contentType 发送 + 移除 processMarkdown |
| `src/views/Home/index.jsx` | 静默迁移触发 |
| `src/apis/content.js` | contentType 参数 |

### 不改（已验证安全）

`ImageUpload.js`、`CodeBlockWithToolbar.js`、`Preview/index.jsx`、`Excel/`、`AddExcel/`、`UniverSheet/`、`FileList/`、`imageCache.js`、`image.js`、`request.js`、`store/` — 均不受影响。

---

## 9. 执行顺序

```
Phase 1: 依赖安装
  1. pnpm add 4 个 @tiptap 扩展

Phase 2: 核心变更（可并行）
  2. MinioImage: 删除 renderMarkdown()
  3. TiptapEditor: 扩展 + contentType + getJSON + 双格式加载
  4. apis/content.js: contentType 参数

Phase 3: UI 变更
  5. EditorToolbar: 字体/颜色/高亮控件
  6. CSS: 新控件样式

Phase 4: 视图适配
  7. Content/index.jsx: contentType 流
  8. AddContent/index.jsx: contentType 流

Phase 5: 迁移引擎
  9. migrationEngine.js + migrationScheduler.js + migration.js
  10. Home/index.jsx: 静默迁移触发
  11. proseMirrorUtils.js

Phase 6: 验证
  12. pnpm dev → 手动测试矩阵
  13. pnpm build → 生产构建
```

**后端前置条件：** Phase 1 之前需要后端至少完成数据库加列 + `GET /text/get/{id}` 返回 contentType 字段（缺失时前端默认 markdown，不阻塞）。

---

## 10. 回滚策略

| 场景 | 处理 |
|------|------|
| 前端回滚 | contentType marker 的文档在旧前端中加载失败（JSON 字符串不能被 Markdown 解析器解析） |
| 后端回滚 | 检测到缺失 contentType → 默认 markdown → JSON 文档加载失败 |
| 紧急数据回滚 | `proseMirrorUtils.jsonToMarkdown()` 批量转换回 Markdown |

**安全措施：** 后端 `content_type` 列默认 NULL（不自动设置 'markdown'），仅当 PUT 请求显式传入 contentType 时才更新。这意味着旧文档不被编辑就不会改变格式。

---

## 11. 验证矩阵

| 场景 | 验证要点 |
|------|----------|
| 新建文档 → 字体/颜色/高亮 → 保存 → 刷新 | 样式保留 |
| 新建文档 → 表格/图片/代码块 → 保存 → 刷新 | 所有元素正常 |
| 旧 Markdown 文档 → 仅预览 | 正常显示，不转换 |
| 旧 Markdown 文档 → 编辑 → 保存 | 自动转为 JSON，内容无丢失 |
| 图片：MD 语法 + HTML 标签 | minio: 引用 + width 保留 |
| 静默迁移 → 登录后 | 无感知完成 |
| 静默迁移 → 中断恢复 | 已完成的保留，未完成的重试 |
| 并发编辑冲突 | 迁移跳过，懒迁移兜底 |
