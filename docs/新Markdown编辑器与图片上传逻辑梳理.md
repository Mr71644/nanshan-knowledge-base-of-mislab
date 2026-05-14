# Markdown 编辑器与图片上传逻辑梳理

## 一、整体架构

项目有**两套编辑器系统**：

| 系统 | 用途 | 编辑器 | 图片存储 |
|------|------|--------|---------|
| 旧版 | React Quill 富文本 | `react-quill` | `/minio/upload` → `/minio/preview/{id}` |
| 新版 | Markdown | `react-markdown` + textarea | `/minio/upload/markdown` → `/minio/preview/markdown/{id}` |

目前 Content（查看/编辑）和 AddContent（新建）页面都已切换为 Markdown 编辑器，旧版 Quill 的 hook（`useQuillTooBar.jsx`）仍然存在但未被使用。

---

## 二、Markdown 编辑器实现

### 涉及文件

| 文件 | 职责 |
|------|------|
| `src/hooks/useMarkDownTooBar.jsx` | 工具栏按钮定义、文本插入逻辑、ReactMarkdown 自定义渲染组件 |
| `src/views/Content/index.jsx` | 内容查看/编辑页（Markdown） |
| `src/views/AddContent/index.jsx` | 新建内容页（Markdown） |

### 编辑器工作流程

```
用户输入 → textarea（value state）
         ↓
   processMarkdown() 处理特殊转义
         ↓
   保存时 → editContent() API 提交到后端
         ↓
   预览区 → <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
```

### processMarkdown() 的作用

```javascript
const processMarkdown = (text) => {
    return text.replace(/^(-\s+)(\d+)\s*\./gm, '$1$2\. ')
}
```

处理无序列表中的有序列表标记，添加反斜杠转义，避免 Markdown 解析器误识别。

### 工具栏按钮（toolbarButtons）

文件：`src/hooks/useMarkDownTooBar.jsx`

提供以下按钮，每个按钮定义了 `before`、`after`、`placeholder`，点击后通过 `insertText()` 函数操作 textarea 光标位置插入 Markdown 语法：

| 按钮 | before | after | Markdown 输出 |
|------|--------|-------|--------------|
| 粗体 | `**` | `**` | `**粗体文本**` |
| 斜体 | `*` | `*` | `*斜体文本*` |
| 行内代码 | `` ` `` | `` ` `` | `` `代码` `` |
| 链接 | `[` | `](url)` | `[链接文本](url)` |
| 图片 | `![` | `](url)` | `![图片描述](url)` |
| 有序列表 | `1. ` | | `1. 列表项` |
| 无序列表 | `- ` | | `- 列表项` |
| 表格 | `\| 表头1 \| 表头2 \|...` | | 完整表格语法 |
| 引用 | `> ` | | `> 引用文本` |
| 代码块 | ` ```\n` | `\n``` ` | 代码块 |
| H1/H2/H3 | `# ` / `## ` / `### ` | | 各级标题 |

### insertText() 工作原理

```javascript
const insertText = (textareaRef, before, after = '', placeholder = '') => {
    const textarea = textareaRef.current
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const text = textarea.value
    const selectedText = text.substring(start, end) || placeholder

    const newText = text.substring(0, start) + before + selectedText + after + text.substring(end)
    return { newText, cursorStart: start + before.length, cursorEnd: start + before.length + selectedText.length }
}
```

1. 获取 textarea 当前光标的起止位置
2. 如果有选中文本则包裹，否则使用 placeholder
3. 拼接新文本并返回光标应定位的新位置

---

## 三、图片触发方式（三种入口）

三种入口最终都调用同一个 `processImage()` 函数：

### 1. 工具栏按钮点击

```
点击图片按钮 → handleImageUpload()
    → 动态创建 <input type="file" accept="image/*">
    → 用户选择文件
    → processImage(file, callback)
```

callback 会将图片 URL 以 `![图片描述](url)` 的格式插入到 textarea 光标位置。

### 2. 粘贴图片

```
在 textarea 中 Ctrl+V → handlePaste(e, textareaRef, onChange)
    → 检查 clipboardData.items 中是否有 image 类型
    → 阻止默认行为 e.preventDefault()
    → 获取文件 items[i].getAsFile()
    → processImage(file, callback)
    → insertImageMarkdown() 插入 Markdown
```

### 3. 拖拽图片

```
拖拽文件到 textarea → handleDrop(e, textareaRef, onChange)
    → 阻止默认行为 e.preventDefault()
    → 遍历 e.dataTransfer.files，筛选图片类型
    → processImage(file, callback)
    → insertImageMarkdown() 插入 Markdown
```

### insertImageMarkdown() 插入逻辑

```javascript
const insertImageMarkdown = (textareaRef, onChange, url) => {
    const textarea = textareaRef.current
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const text = textarea.value
    const insertText = `![图片描述](${url})`
    const newText = text.substring(0, start) + insertText + text.substring(end)
    onChange(newText)
    // 光标移动到插入文本末尾
    setTimeout(() => {
        textarea.focus()
        textarea.setSelectionRange(start + insertText.length, start + insertText.length)
    }, 0)
}
```

---

## 四、图片上传流程（新版 Markdown）

### processImage() 核心流程

文件：`src/views/AddContent/index.jsx` 和 `src/views/Content/index.jsx`（两处逻辑相同）

```
1. 获取文件 file
       ↓
2. 构造上传参数 uploadParams = { file }
   - 如果 param.folder 有效，追加 id（整数）和 folderId（整数）
       ↓
3. 调用 uploadMarkdownImage(uploadParams)
   → POST /minio/upload/markdown
   → FormData: file + id(可选) + folderId(可选)
   → 后端自动设置 isMarkdownImage，无需前端传递
       ↓
4. 从响应中提取 fileId（按优先级尝试）
   ┌─ typeof uploadRes === 'string'  → fileId = uploadRes
   ├─ uploadRes.data.id              → fileId = uploadRes.data.id
   ├─ uploadRes.data.fileId          → fileId = uploadRes.data.fileId
   ├─ uploadRes.data.file_id         → fileId = uploadRes.data.file_id
   └─ uploadRes.id                   → fileId = uploadRes.id
       ↓
5. 调用 previewMarkdownImage(fileId)
   → GET /minio/preview/markdown/{fileId}
       ↓
6. 从响应中提取预览 URL
   ┌─ typeof previewRes === 'string' → url = previewRes
   └─ previewRes.data                → url = previewRes.data
       ↓
7a. 成功 → callback(url) → 插入 ![描述](url) 到 Markdown
7b. fileId 为空 → callback(blobUrl) → 使用本地 blob URL 兜底
7c. 上传异常 → error 提示 + callback(blobUrl) → 使用本地 blob URL 兜底
```

### API 接口详情（src/apis/image.js）

| 函数名 | 方法 | URL | 参数 | 说明 |
|--------|------|-----|------|------|
| `uploadImage` | POST | `/minio/upload` | file, id, isEmbedded=true, embedded=true | 通用图片上传（旧版） |
| `uploadMarkdownImage` | POST | `/minio/upload/markdown` | file, id(整数), folderId(整数) | Markdown 专用图片上传 |
| `previewImage` | GET | `/minio/preview/{id}` | id | 通用图片预览（旧版） |
| `previewMarkdownImage` | GET | `/minio/preview/markdown/{id}` | id | Markdown 图片预览 |
| `getImageList` | GET | `/minio/imageList` | | 通用图片列表 |
| `getMarkdownImageList` | GET | `/minio/markdownImageList` | | Markdown 图片列表 |

### 通用文件上传接口（src/apis/file.js）

| 函数名 | 方法 | URL | 说明 |
|--------|------|-----|------|
| `uploadFile` | POST | `/minio/upload` | 单文件上传 |
| `uploadFilesBatch` | POST | `/minio/upload/batch` | 批量文件上传 |
| `downloadFile` | GET | `/minio/download/{id}` | 文件下载（返回 blob） |
| `previewFile` | GET | `/minio/preview/{id}` | 文件预览 |

---

## 五、图片渲染逻辑

文件：`src/hooks/useMarkDownTooBar.jsx` 中的 `components.img`

ReactMarkdown 通过自定义 `components` 对象渲染各类 HTML 元素。图片渲染逻辑如下：

```javascript
img: ({ node, src, alt, title, ...props }) => {
    // src 不存在或非字符串 → 显示红色 "图片加载失败"
    // 正常情况 → 渲染 <img>，设置 maxWidth: 100% 自适应宽度
    // onError → 隐藏图片，在旁边插入红色 "图片加载失败" 文字
}
```

**关键点**：图片渲染完全依赖 Markdown 中存储的 `src` URL，不做任何 URL 转换或拼接。如果 Markdown 文本中存储的图片 URL 已经失效或格式不匹配，图片将无法加载。

---

## 六、自动保存机制（仅 Content 编辑页）

文件：`src/views/Content/index.jsx`

```javascript
useEffect(() => {
    if (!isEdit) return;

    const timer = setTimeout(async () => {
        try {
            const processedContent = processMarkdown(value)
            await editContent({
                title: title.current,
                author: author.current,
                content: processedContent,
                id: param.id
            });
        } catch (e) {
            error({ content: '自动保存失败，请手动保存', delayTime: 2000 });
        }
    }, 2000); // 编辑后 2 秒自动保存

    return () => clearTimeout(timer);
}, [value, isEdit]);
```

- 仅在编辑模式（`isEdit === true`）下触发
- `value` 变化后延迟 2 秒提交
- 每次新的变化会清除上一次的定时器，避免频繁请求

---

## 七、请求基础配置

文件：`src/utils/request.js`

```javascript
const request = axios.create({
    baseURL: 'http://101.43.146.27/new-app/api',
})
```

- 所有 API 请求会自动拼接此 baseURL
- 请求拦截器自动添加 `Authorization: Bearer ${token}`
- 401 响应自动清除 token 并跳转登录页
- 响应拦截器统一返回 `response.data`

---

## 八、潜在的老版本兼容问题分析

### 问题根源

| 维度 | 旧版 | 新版 |
|------|------|------|
| 上传接口 | `POST /minio/upload` | `POST /minio/upload/markdown` |
| 预览接口 | `GET /minio/preview/{id}` | `GET /minio/preview/markdown/{id}` |
| 图片存储方式 | Quill 编辑器内嵌 base64 或 URL | Markdown `![desc](url)` 语法 |
| baseURL | 可能是老地址 `http://119.27.181.240:4529` | 当前 `http://101.43.146.27/new-app/api` |

### 可能出现的兼容场景

1. **旧数据中图片 URL 包含老 baseURL**：如果旧内容中图片 URL 硬编码了 `http://119.27.181.240:4529/minio/preview/{id}`，新环境中该地址可能已不可访问
2. **旧数据中图片以 id 形式存储**：如果旧版存储的是纯 id 或相对路径（如 `/minio/preview/123`），新版渲染时直接作为 img src 使用，缺少完整的 baseURL 拼接
3. **旧数据中图片为 base64**：Quill 编辑器可能将图片以 base64 DataURL 形式存储在内容中，切换到 Markdown 后这些 base64 数据可能未被正确处理
4. **预览接口路径不同**：旧版用 `/minio/preview/{id}`，新版用 `/minio/preview/markdown/{id}`，老数据中的图片 id 如果用新接口预览可能无法匹配

### 兼容方案方向

- 在图片渲染组件（`components.img`）中，对旧格式的图片 URL 进行识别和转换
- 判断 src 是否为纯 id、旧 baseURL 路径、或相对路径，自动拼接为新版可用的完整预览 URL
- 同时保持新版上传流程不变
