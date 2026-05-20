# 图片调整大小功能 - 实现方案

## 背景

当前 Tiptap 编辑器支持插入图片（工具栏按钮、粘贴、拖拽），但图片插入后无法调整大小。需要添加拖拽缩放功能。

`@tiptap/extension-image` v3.23 已内置 resize 支持，通过 `@tiptap/core` 提供的 `ResizableNodeView` 类实现。当前 `MinioImage` 扩展覆盖了 `addNodeView()` 用于 MinIO 异步 URL 加载，但未启用 resize 能力。

## 方案

将 MinIO 异步加载逻辑与 `ResizableNodeView` 合并，实现图片可拖拽缩放。通过覆盖 `renderMarkdown` 将宽度信息持久化到 Markdown 中。

## 修改文件

### 1. `src/components/TiptapEditor/extensions/MinioImage.js`

- 配置 `resize: { enabled: true, minWidth: 30, alwaysPreserveAspectRatio: true }`
- 导入 `ResizableNodeView` from `@tiptap/core`
- 重写 `addNodeView()`：创建 `<img>` → MinIO 异步加载 → 包装 `ResizableNodeView`
- 覆盖 `renderMarkdown`：有 width 时输出 `<img>` HTML 标签持久化尺寸

### 2. `src/components/TiptapEditor/index.module.css`

- 添加 resize 手柄样式（`[data-resize-handle]`，悬停显示）
- 添加 resize 容器样式（`[data-resize-container]`，居中显示）
- 选中图片高亮边框

### 3. `src/utils/contentType.js`

**问题**：缩放图片保存后，`renderMarkdown` 输出 `<img width="300">` HTML 标签。`isHtmlContent` 的正则匹配到 `<img` 后误判为旧版 Quill HTML，导致内容被 `HtmlContent` 组件渲染而非 Tiptap 编辑器。

**修复**：调整检测优先级，增加 Markdown 特征判断：

1. `data:image/...;base64,` → 直接判定为旧版 HTML
2. 包含 Markdown 特征语法（`![...]()`、`#` 标题、`- ` 列表、`>` 引用、` ``` ` 代码块等）→ 即使有 `<img>` 标签也判定为 Markdown
3. 无 Markdown 特征 + 有 HTML 块级标签 → 判定为旧版 HTML

## 技术细节

### ResizableNodeView 工作原理

```
ResizableNodeView DOM 结构：
div[data-resize-container]        ← 容器（flex 布局）
  └── div[data-resize-wrapper]    ← 包装器（relative 定位）
        ├── <img>                 ← 图片内容
        ├── div[data-resize-handle="top-left"]    ← 左上手柄
        ├── div[data-resize-handle="top-right"]   ← 右上手柄
        ├── div[data-resize-handle="bottom-left"]  ← 左下手柄
        └── div[data-resize-handle="bottom-right"] ← 右下手柄
```

- 构造参数：`element`, `editor`, `node`, `getPos`, `onResize`, `onCommit`
- 宽高以像素值存储在节点属性中
- Markdown 序列化使用 HTML `<img>` 标签持久化尺寸
- 默认保持宽高比（`alwaysPreserveAspectRatio: true`）

### Markdown 持久化

标准 Markdown 不支持图片尺寸。方案：

- 无宽度 → `![alt](minio:xxx)` （保持原样）
- 有宽度 → `<img src="minio:xxx" width="300" alt="图片">` （HTML 标签）

`@tiptap/markdown` 的 markdown-it 解析器可以处理内联 HTML，`parseHTML` 规则 `img[src]` 能自动读取 width 属性。

## 兼容性与 URL 过期恢复

### 旧图片兼容（无 width 属性）

- `width` 属性默认为 `null`
- `ResizableNodeView.applyInitialSize()` 检测到 `width === null` 时使用图片原始自然尺寸
- 旧数据（标准 `![alt](minio:xxx)` 格式）无需任何迁移，完全向后兼容

### URL 过期恢复逻辑

现有逻辑：缓存 TTL 5 分钟 → 过期后重新调用 `enqueuePreview()` 获取新 URL。

**核心改动：从"替换 DOM"改为"复用 img 元素切换状态"**

现有 `renderSrc` 通过 `innerHTML = ''` 清空容器并重建 DOM（先放 loading div，再替换为 img）。但 `ResizableNodeView` 管理外层包装结构（container > wrapper > img + handles），清空内层会破坏 resize 结构。

新策略：始终复用同一个 `<img>` 元素，通过切换样式表现不同状态：

```
创建 img → 设为加载态（灰色背景、固定高度 200px、显示"图片加载中..."文字）
         → 异步获取 URL 成功 → 更新 img.src、恢复正常样式
         → 获取失败 → 切换为错误态（红色文字"图片加载失败"）
```

具体实现：
1. 初始渲染时，对 minio URL 先设置加载态样式
2. `enqueuePreview(fileId)` 成功后更新 `img.src`，移除加载样式
3. 失败时切换为错误态样式
4. `update()` 回调中仅在 `src` 属性变化时重新走加载流程，否则保持不变

这样 URL 过期恢复逻辑完整保留：
- 首次加载或缓存过期 → 触发 `enqueuePreview` → 显示加载态 → 获取新 URL
- 非编辑模式下浏览内容时同样生效

## 验证步骤

1. `pnpm dev` 启动开发服务器
2. 插入图片 → 应看到角落有缩放手柄
3. 拖拽角落手柄 → 图片等比缩放
4. 保存 → 重新加载 → 图片显示为保存的宽度
5. 切换为只读模式 → 缩放手柄消失
6. 粘贴/拖入新图片 → 正常工作且可缩放
7. 打开包含旧图片（无 width）的文档 → 正常显示，无变形
8. 等待缓存过期（5分钟）后刷新 → 图片重新加载，显示加载中 → 恢复正常
