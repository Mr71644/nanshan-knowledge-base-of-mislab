# 图片预览 URL 过期修复方案

## 问题描述

文档中的图片在一段时间后无法正常显示，具体表现为两种场景：

1. **新建文档**：用户上传图片后，图片最初可以正常显示，但经过一段时间后图片失效
2. **迁移旧文档**：老版本富文本编辑器创建的文档（含 base64 图片），完成迁移后图片同样会过期失效

## 根因分析

### 图片 URL 生命周期

当前图片处理流程：

```
上传图片 → 后端返回 fileId → 调用预览接口获取预签名 URL → 将 URL 嵌入 Markdown 内容 → 保存到数据库
```

MinIO 后端返回的预览 URL 是**预签名 URL**（Pre-signed URL），带有 `X-Amz-Expires` 等时效参数，过期后无法访问。而当前代码将这个有时效性的 URL **永久存储**在 Markdown 内容字符串中（如 `![图片](https://minio...?X-Amz-Signature=...)`），保存到数据库后不会更新。URL 一旦过期，`<img>` 标签的 `src` 失效，图片就无法显示。

### 受影响的代码路径

| 场景 | 文件 | 问题代码 |
|---|---|---|
| 新建文档上传图片 | `src/views/AddContent/index.jsx` `processImage` | 上传后调用 `previewMarkdownImage` 获取 URL 并嵌入 |
| 编辑文档上传图片 | `src/views/Content/index.jsx` `processImage` | 同上 |
| 旧文档迁移 | `src/utils/migrateImages.js` `migrateBase64Images` | 迁移 base64 图片时获取 URL 并嵌入 |
| 图片渲染 | `src/hooks/useMarkDownTooBar.jsx` `img` 组件 | 直接使用 `src` 渲染，无刷新机制 |

## 修复方案

### 核心思路

**不再存储预签名 URL，改为存储 `fileId` 引用，在渲染时动态获取新鲜 URL。**

Markdown 中的图片存储格式从：

```markdown
![图片描述](https://minio-server/bucket/path?X-Amz-Algorithm=...&X-Amz-Signature=...)
```

改为：

```markdown
![图片描述](minio:199)
```

其中 `199` 是后端上传接口返回的文件 ID。渲染时由 `AsyncImage` 组件识别 `minio:` 前缀，实时调用 `previewMarkdownImage(fileId)` 获取新鲜的预签名 URL。

### 方案优势

- **彻底解决过期问题**：每次打开文档都会获取新的预签名 URL
- **内容更简洁**：Markdown 中存储的是短引用而非长 URL
- **向后兼容**：普通 http/https URL、base64、blob URL 均不受影响

## 具体改动

### 1. 新增 AsyncImage 组件

**文件**：`src/hooks/useMarkDownTooBar.jsx`

将同步的 `img` 渲染函数替换为有状态的 `AsyncImage` 组件：

- **识别 `minio:` 前缀**：检测到后提取 `fileId`，调用 API 获取新鲜 URL
- **URL 缓存**：模块级 `Map` 缓存，TTL 为 5 分钟，避免编辑时每次按键都请求 API
- **加载状态**：请求中显示"图片加载中..."占位符
- **错误处理**：失败时显示"图片加载失败"
- **兼容处理**：非 `minio:` 前缀的 URL（http、https、data、blob）直接渲染

### 2. 修改上传流程

**文件**：`src/views/AddContent/index.jsx`、`src/views/Content/index.jsx`

`processImage` 函数改动：

- 上传成功获取 `fileId` 后，直接 `callback('minio:' + fileId)`
- 不再调用 `previewMarkdownImage` 获取预签名 URL
- 移除 `previewMarkdownImage` 的导入（上传时不再需要）

### 3. 修改迁移流程

**文件**：`src/utils/migrateImages.js`

`migrateBase64Images` 函数改动：

- base64 图片上传成功后，将 HTML 中的 `data:image/...;base64,...` 替换为 `minio:{fileId}`
- 不再调用 `previewMarkdownImage` 获取预签名 URL
- 下游的 `htmlToMarkdown.js` 无需修改，turndown 会将 `src="minio:42"` 原样转为 `![alt](minio:42)`

### 4. 修复 ReactMarkdown URL 过滤

**文件**：`src/views/AddContent/index.jsx`、`src/views/Content/index.jsx`

ReactMarkdown v10 默认只允许 `http`/`https`/`mailto`/`tel` 协议的 URL，`minio:` 前缀会被过滤为空字符串。需要在所有 `<ReactMarkdown>` 实例上添加：

```jsx
<ReactMarkdown
    remarkPlugins={[remarkGfm]}
    components={components}
    urlTransform={(url) => url}   // 允许所有 URL 协议通过
>
```

## 修改文件清单

| 文件 | 改动内容 |
|---|---|
| `src/hooks/useMarkDownTooBar.jsx` | 新增 `AsyncImage` 组件 + URL 缓存，替换原有同步 `img` 渲染 |
| `src/views/AddContent/index.jsx` | `processImage` 存 `minio:fileId`；移除 `previewMarkdownImage` 导入；加 `urlTransform` |
| `src/views/Content/index.jsx` | 同上 |
| `src/utils/migrateImages.js` | 迁移时存 `minio:fileId`；移除 `previewMarkdownImage` 导入 |

## 已有内容兼容性

| 内容类型 | 处理方式 |
|---|---|
| `minio:fileId`（新格式） | AsyncImage 动态获取新鲜 URL |
| 过期的预签名 URL（旧格式） | 作为普通 URL 渲染，触发 onError 显示"图片加载失败" |
| 外部 URL（https://...） | 直接渲染，不受影响 |
| base64 data URI | 直接渲染，不受影响 |
| blob: URL（上传失败兜底） | 会话级预览，不受影响 |

> **注意**：数据库中已存储的过期预签名 URL，前端无法从中反推 fileId。受影响的文档需要用户重新编辑并上传图片。

## 测试验证

| 测试项 | 结果 |
|---|---|
| 新建文档 — 工具栏按钮上传图片 | 通过 |
| 新建文档 — 粘贴图片 | 通过 |
| 新建文档 — 拖拽图片 | 通过 |
| 查看已有 Markdown 文档 | 通过 |
| 旧版 HTML 文档迁移 | 通过 |
| 刷新页面 — 加载状态显示 | 通过 |
