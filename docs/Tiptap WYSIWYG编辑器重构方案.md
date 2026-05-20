# Tiptap WYSIWYG 编辑器重构方案

> 生成日期：2026-05-19

---

## 一、背景与目标

### 1.1 现状

当前内容编辑器采用分屏模式：
- **左侧**：`<textarea>` 编写 Markdown 语法
- **右侧**：`ReactMarkdown` 实时渲染预览

用户需要同时面对原始 Markdown 文本和渲染结果，编辑体验不够直观。

### 1.2 目标

将编辑器改为 **WYSIWYG（所见即所得）** 形式，像 Notion 一样在同一个编辑区内直接显示格式化内容，无需切换预览。

### 1.3 约束

| 约束项 | 说明 |
|--------|------|
| 存储格式 | 继续使用 Markdown，后端无需改动 |
| 图片逻辑 | 保留现有 MinIO 上传流程和 `minio:fileId` 引用格式 |
| 旧文档兼容 | 保留现有 HTML → Markdown 迁移流程不变 |
| 编辑器选型 | Tiptap（基于 ProseMirror，官方提供 Markdown 扩展） |

---

## 二、技术选型分析

### 2.1 为什么选择 Tiptap

| 维度 | Tiptap | Milkdown | Cherry Markdown | Toast UI Editor |
|------|--------|----------|----------------|-----------------|
| 核心架构 | ProseMirror | ProseMirror | 自研 | 自研 |
| Markdown 支持 | 官方 `@tiptap/markdown` 扩展 | 原生 Markdown | 原生 Markdown | 双模式切换 |
| 社区生态 | 最活跃，npm 周下载 100W+ | 中等 | 中文社区好 | 较成熟但更新慢 |
| 自定义能力 | 极高（扩展机制） | 高（插件化） | 中等 | 中等 |
| 图片自定义 | 完全可控 | 可控 | 有限 | 有限 |
| React 集成 | 官方 `@tiptap/react` | 官方支持 | 原生 JS | 官方 React wrapper |

**选择 Tiptap 的核心原因**：
1. 官方 `@tiptap/markdown` 扩展提供完整的 Markdown 输入输出能力，无需社区包
2. 自定义 NodeView 机制可以精确控制图片渲染（支持 `minio:` URL 异步解析）
3. ProseMirror 插件系统可以拦截粘贴/拖拽事件，实现图片上传
4. 社区最活跃，遇到问题容易找到解决方案

### 2.2 Markdown 输入输出方案

使用 Tiptap 官方的 `@tiptap/markdown` 扩展：

```
加载内容：editor.commands.setContent(markdownString, { contentType: 'markdown' })
输出内容：const md = editor.getMarkdown()
```

工作原理：
1. 加载时，Markdown 扩展将 Markdown 字符串解析为 ProseMirror 文档结构
2. 每个扩展（Image、Heading、Table 等）通过 `parseMarkdown` 配置解析自己的 Markdown token
3. 输出时，Markdown 扩展遍历 ProseMirror 文档树，每个扩展通过 `renderMarkdown` 配置序列化为 Markdown
4. Image 扩展内置支持 `![alt](src "title")` 格式，`minio:fileId` 会原样保留

---

## 三、整体架构

### 3.1 数据流

```
当前架构（分屏）：
用户输入 → textarea (Markdown 文本)
                    ↓ processMarkdown()
              保存 → 后端 (Markdown 字符串)
                    ↓
              ReactMarkdown 渲染 ← previewValue (300ms 防抖)

新架构（WYSIWYG）：
用户操作 → Tiptap 编辑器 (ProseMirror 文档)
                    ↓ editor.getMarkdown()
              onChange(md) → setValue(md)
                    ↓
              保存 → 后端 (Markdown 字符串)
              （无预览区，编辑区内直接渲染格式化内容）
```

### 3.2 新增文件结构

```
src/
├── utils/
│   └── imageCache.js                          ← 从 useMarkDownTooBar.jsx 提取
├── components/
│   └── TiptapEditor/
│       ├── index.jsx                          ← 主编辑器组件
│       ├── index.module.css                   ← 编辑器样式
│       ├── EditorToolbar.jsx                  ← 工具栏组件
│       └── extensions/
│           ├── MinioImage.js                  ← minio: URL 异步图片扩展
│           └── ImageUpload.js                 ← 图片上传扩展（粘贴/拖拽/工具栏）
```

### 3.3 改动文件

| 文件 | 改动类型 | 说明 |
|------|----------|------|
| `src/views/Content/index.jsx` | 大改 | 删除分屏编辑器，替换为 TiptapEditor |
| `src/views/AddContent/index.jsx` | 大改 | 删除分屏编辑器，替换为 TiptapEditor |
| `src/views/Content/index.module.css` | 中改 | 删除分屏/工具栏样式 |
| `src/views/AddContent/index.module.css` | 中改 | 删除分屏/工具栏样式 |
| `package.json` | 小改 | 添加 @tiptap/* 依赖 |

### 3.4 不修改的文件

| 文件 | 原因 |
|------|------|
| `src/apis/image.js` | API 层无需改动 |
| `src/apis/content.js` | API 层无需改动 |
| `src/utils/request.js` | 请求配置无需改动 |
| `src/utils/contentType.js` | HTML 检测逻辑不变 |
| `src/utils/htmlToMarkdown.js` | 旧 HTML 迁移仍需使用 |
| `src/utils/migrateImages.js` | 旧图片迁移仍需使用 |
| `src/components/HtmlContent/index.jsx` | 旧 HTML 只读渲染仍需使用 |
| `src/router/index.jsx` | 路由不变 |

---

## 四、各模块详细设计

### 4.1 图片 URL 缓存工具 (`src/utils/imageCache.js`)

**来源**：从 `src/hooks/useMarkDownTooBar.jsx` 第 1-29 行提取，无 React 依赖。

**导出内容**：

```javascript
// URL 缓存 Map，key 为 fileId，value 为 { url, timestamp }
urlCache: Map

// 缓存过期时间（5 分钟）
CACHE_TTL: number

// 将 fileId 加入队列异步获取预览 URL，返回 Promise<string>
enqueuePreview(fileId: string): Promise
```

**内部实现**：
- 并发限制器：最多 3 个同时请求（`MAX_CONCURRENT = 3`）
- 请求队列：`pendingQueue` + `activeCount` + `processQueue()`
- 调用 `previewMarkdownImage(fileId)` 获取实际 URL

### 4.2 MinioImage 扩展 (`src/components/TiptapEditor/extensions/MinioImage.js`)

**目标**：让 Tiptap 支持 `minio:fileId` 格式的图片引用，在编辑和只读模式下都能正确渲染。

**扩展方式**：继承 `@tiptap/extension-image`，添加自定义 NodeView。

**为什么需要 NodeView**：Tiptap 的 `renderHTML` 是同步的，无法进行异步 URL 解析。NodeView 提供完整的 DOM 控制权，支持异步生命周期。

**核心逻辑**：

```
图片节点 src 属性
    ↓
检测是否以 "minio:" 开头
    ├── 是 → 提取 fileId
    │        ↓
    │    查 urlCache 缓存
    │        ├── 命中且未过期 → 直接渲染 <img src="缓存的URL">
    │        └── 未命中 → 显示加载占位符
    │                     ↓
    │                  enqueuePreview(fileId)
    │                     ↓
    │                  渲染 <img src="解析后的URL"> 或显示 "图片加载失败"
    │
    └── 否 → 直接渲染 <img src="原始URL">（http/https/data/blob 等格式）
```

**Markdown 往返**：
- Image 扩展内置的 `parseMarkdown` 会将 `![alt](minio:123)` 解析为 `{ src: 'minio:123', alt: 'alt' }` 的图片节点
- 内置的 `renderMarkdown` 会将图片节点序列化为 `![alt](minio:123)`
- `minio:` 前缀在整个过程中原样保留，无需特殊处理

**内存安全**：
- `destroy()` 方法中设置 `destroyed` 标记
- 异步回调执行前检查标记，已销毁则跳过 DOM 操作

### 4.3 ImageUpload 扩展 (`src/components/TiptapEditor/extensions/ImageUpload.js`)

**目标**：统一处理三种图片上传入口（工具栏按钮、粘贴、拖拽），上传到 MinIO 后插入 `minio:fileId` 图片节点。

**扩展配置**：
```javascript
ImageUpload.configure({
    folderId: string|number,  // 文件夹 ID，用于上传参数
    onError: (message) => void  // 错误回调
})
```

**三种入口统一流程**：

```
获取 File 对象
    ↓
构造 uploadParams = { file }
（如果 folderId 有效，追加 id 和 folderId 为整数）
    ↓
调用 uploadMarkdownImage(uploadParams)  ← 复用现有 API (src/apis/image.js)
    ↓
从响应中提取 fileId（兼容多种响应格式）
    ↓
成功 → editor.chain().focus().setImage({ src: 'minio:' + fileId, alt: '图片描述' }).run()
失败 → 错误提示 + blob URL 兜底
```

**ProseMirror 插件拦截**：

| 事件 | 处理方式 |
|------|----------|
| `handlePaste` | 检查 `clipboardData.items` 是否有 image 类型，有则拦截默认行为并上传 |
| `handleDrop` | 检查 `dataTransfer.files` 是否为图片类型，有则拦截默认行为并上传 |

**工具栏命令**：
```javascript
editor.commands.uploadImage()
// → 动态创建 <input type="file" accept="image/*">
// → 用户选文件后走统一上传流程
```

### 4.4 工具栏组件 (`src/components/TiptapEditor/EditorToolbar.jsx`)

**目标**：替换当前在 Content 和 AddContent 页面中重复定义的 `MarkdownToolbar` 组件。

**映射关系**（当前 15 个按钮 → Tiptap 命令）：

| 按钮 | 图标 | Tiptap 命令 |
|------|------|-------------|
| 粗体 | `BoldOutlined` | `editor.chain().focus().toggleBold().run()` |
| 斜体 | `ItalicOutlined` | `editor.chain().focus().toggleItalic().run()` |
| 行内代码 | `CodeOutlined` | `editor.chain().focus().toggleCode().run()` |
| 链接 | `LinkOutlined` | `prompt()` 获取 URL → `setLink({href})` |
| 图片 | `PictureOutlined` | `editor.commands.uploadImage()` |
| 有序列表 | `OrderedListOutlined` | `toggleOrderedList()` |
| 无序列表 | `UnorderedListOutlined` | `toggleBulletList()` |
| 表格 | `TableOutlined` | `insertTable({rows:3, cols:3, withHeaderRow:true})` |
| 引用 | `AlignLeftOutlined` | `toggleBlockquote()` |
| 代码块 | `AlignCenterOutlined` | `toggleCodeBlock()` |
| H1 / H2 / H3 | 文字 "H1" / "H2" / "H3" | `toggleHeading({level: N})` |

**按钮高亮**：使用 `editor.isActive('bold')` 等检测当前光标位置的格式状态，激活状态按钮添加高亮样式。

**Props**：`editor: Editor`（Tiptap 编辑器实例）

**仅在 `editable=true` 时渲染**。

### 4.5 TiptapEditor 主组件 (`src/components/TiptapEditor/index.jsx`)

**目标**：封装可复用的 WYSIWYG 编辑器组件，替代分屏编辑器。

**Props 接口**：

| Prop | 类型 | 说明 |
|------|------|------|
| `content` | `string` | Markdown 字符串（初始内容） |
| `editable` | `boolean` | `false` 为只读模式 |
| `onChange` | `(md: string) => void` | 内容变化时回调 Markdown 字符串 |
| `folderId` | `string \| number` | 图片上传的文件夹 ID |

**编辑器配置**：

```javascript
const editor = useEditor({
    extensions: [
        StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
        MinioImage,
        Link.configure({ openOnClick: false }),
        Table.configure({ resizable: true }),
        TableRow,
        TableCell,
        TableHeader,
        Placeholder.configure({ placeholder: '在这里输入内容...' }),
        Markdown,
        ImageUpload.configure({ folderId }),
    ],
    content: initialMarkdown,
    contentType: 'markdown',
    editable: editable,
    onUpdate: ({ editor }) => {
        const md = editor.getMarkdown()
        onChange?.(md)
    },
})
```

**外部内容更新处理**：

问题：`getDetail()` 刷新数据时调用 `setValue`，触发 TiptapEditor 的 content prop 变化，可能覆盖用户正在编辑的内容。

解决方案：
- 用 `useRef` 跟踪最后一次由编辑器内部产生的 Markdown 内容
- 仅当外部传入的 `content` 与 ref 中的值不同时，才调用 `editor.commands.setContent()`

```javascript
const lastEditorMd = useRef(content)

useEffect(() => {
    if (editor && content !== lastEditorMd.current) {
        editor.commands.setContent(content, { contentType: 'markdown' })
        lastEditorMd.current = content
    }
}, [content, editor])
```

**editable 状态切换**：

```javascript
useEffect(() => {
    if (editor) {
        editor.setEditable(editable)
    }
}, [editable, editor])
```

**渲染结构**：

```jsx
<div className={styles.tiptapEditor}>
    {editable && <EditorToolbar editor={editor} />}
    <EditorContent editor={editor} className={styles.tiptapContent} />
</div>
```

### 4.6 编辑器样式 (`src/components/TiptapEditor/index.module.css`)

从现有 `src/views/Content/index.module.css` 中的 `.markdownPreview` 和 `.contentPreview` 样式迁移到 `.tiptapContent :global(.tiptap-prosemirror)` 下。

需要覆盖的样式：

| 选择器 | 说明 |
|--------|------|
| `.tiptapEditor` | 外层容器 |
| `.tiptapContent` | 编辑区容器，设置边框和高度 |
| `.tiptapContent :global(.ProseMirror)` | ProseMirror 编辑区样式 |
| `.ProseMirror h1/h2/h3` | 标题大小（与现有一致） |
| `.ProseMirror p` | 段落间距和行高 |
| `.ProseMirror pre` | 代码块背景和圆角 |
| `.ProseMirror code` | 行内代码背景和圆角 |
| `.ProseMirror blockquote` | 引用左边框 |
| `.ProseMirror ul/ol` | 列表缩进 |
| `.ProseMirror table/th/td` | 表格边框 |
| `.ProseMirror img` | 图片自适应（max-width: 100%） |
| `.ProseMirror a` | 链接颜色 |
| `.toolbarButton` | 工具栏按钮 |
| `.toolbarButton.active` | 激活状态按钮 |
| `.toolbarDivider` | 工具栏分隔线 |

---

## 五、页面重构

### 5.1 Content 页面 (`src/views/Content/index.jsx`)

**当前**：540 行 → **重构后**：约 300 行

#### 删除的代码

| 代码段 | 行号 | 说明 |
|--------|------|------|
| MarkdownToolbar 组件 | 20-107 | 内联定义，被 EditorToolbar 替代 |
| previewValue 状态 + 防抖 effect | 117, 133-136 | 不再需要预览防抖 |
| textareaRef | 123 | 不再使用 textarea |
| handleImageUpload | 138-149 | 移入 ImageUpload 扩展 |
| processImage | 151-195 | 移入 ImageUpload 扩展 |
| handlePaste | 197-216 | 移入 ImageUpload 扩展 |
| handleDrop | 218-232 | 移入 ImageUpload 扩展 |
| insertImageMarkdown | 234-248 | 移入 ImageUpload 扩展 |
| 分屏编辑器 JSX | 452-475 | 被 TiptapEditor 替代 |
| ReactMarkdown 只读渲染 JSX | 493-503 | 被 TiptapEditor 替代 |

#### 替换后的代码

**导入变化**：
```diff
- import ReactMarkdown from 'react-markdown'
- import remarkGfm from 'remark-gfm'
- import useMarkDownToolbar, { toolbarButtons, insertText } from '@/hooks/useMarkDownTooBar'
- import { uploadMarkdownImage } from '@/apis/image';
+ import TiptapEditor from '@/components/TiptapEditor'
```

**编辑模式**：
```jsx
<Form className={style.editBox} ...>
    <Form.Item name='title' ...><Input /></Form.Item>
    <Form.Item name='author' ...><Input /></Form.Item>
</Form>
<TiptapEditor content={value} editable={true} onChange={setValue} folderId={param.folder} />
```

**只读模式**（非旧版 HTML）：
```jsx
<div className={style.contentPreview}>
    <TiptapEditor content={value} editable={false} />
</div>
```

**只读模式**（旧版 HTML）— 不变：
```jsx
<div className={style.legacyBanner}>
    <WarningOutlined />
    此文档为旧版格式，点击编辑按钮可迁移为 Markdown 格式
</div>
<HtmlContent content={value} className={style.contentPreview} />
```

#### 保留不变的代码

| 代码段 | 说明 |
|--------|------|
| `getDetail()` | 数据加载逻辑不变 |
| `edit()` | 保存逻辑不变（`value` 仍是 Markdown 字符串） |
| `ChangeIsEdit()` | 编辑/保存切换逻辑不变 |
| `handleMigrate()` | 旧 HTML 迁移流程不变 |
| `processMarkdown()` | 保留用于保存路径 |
| 自动保存 useEffect | `value` 变化仍触发 2 秒防抖保存 |
| Modal / 迁移遮罩 | 旧文档迁移 UI 不变 |
| FloatButton | 浮动按钮组不变 |
| Layout / Form | 页面布局不变 |

### 5.2 AddContent 页面 (`src/views/AddContent/index.jsx`)

**当前**：377 行 → **重构后**：约 150 行

与 Content 页面相同的删减和替换逻辑。

**编辑区替换**：
```jsx
<Form className={style.editBox} ...>
    <Form.Item name='title' ...><Input /></Form.Item>
    <Form.Item name='author' ...><Input /></Form.Item>
</Form>
<TiptapEditor content={value} editable={true} onChange={setValue} folderId={param.folder} />
<FloatButton.Group ...>...</FloatButton.Group>
```

`add()` 函数无需改动 — `value` 已经是 Markdown 字符串。

---

## 六、样式清理

### 6.1 Content 页面样式 (`src/views/Content/index.module.css`)

#### 删除

| 选择器 | 原因 |
|--------|------|
| `.markdownToolbar` | 工具栏样式移至 TiptapEditor |
| `.toolbarButton` | 同上 |
| `.toolbarDivider` | 同上 |
| `.markdownContainer` | 不再使用分屏布局 |
| `.markdownEdit` | 同上 |
| `.markdownTextarea` | 不再使用 textarea |
| `.markdownPreview` | 不再使用 ReactMarkdown 预览 |
| `.markdownPreview h1/h2/h3/p/pre/code/blockquote/ul/ol/li/table/th/td/img/a` | 排版样式移至 TiptapEditor |

#### 保留

| 选择器 | 原因 |
|--------|------|
| `.contentPreview` | 只读模式下仍使用（包裹 TiptapEditor） |
| `.contentPreview h1/h2/h3/p/...` | 只读模式排版样式保留（双保险） |
| `.articleHeader` | 文章标题区不变 |
| `.legacyBanner` | 旧版提示横幅不变 |
| `.migratingOverlay` | 迁移遮罩不变 |
| `.editBox` | 表单样式不变 |
| `.spin` | Loading 样式不变 |

### 6.2 AddContent 页面样式 (`src/views/AddContent/index.module.css`)

删除所有 `.markdown*` 和 `.toolbar*` 相关样式，保留 `.editBox` 和 `.spin`。

---

## 七、依赖变更

### 7.1 新增依赖

```bash
pnpm add @tiptap/core @tiptap/react @tiptap/pm @tiptap/starter-kit @tiptap/extension-image @tiptap/extension-link @tiptap/extension-table @tiptap/extension-table-cell @tiptap/extension-table-header @tiptap/extension-table-row @tiptap/extension-placeholder @tiptap/extension-underline @tiptap/markdown
```

| 包名 | 用途 |
|------|------|
| `@tiptap/core` | 编辑器核心 |
| `@tiptap/react` | React 集成（`useEditor`、`EditorContent`） |
| `@tiptap/pm` | ProseMirror 类型定义 |
| `@tiptap/starter-kit` | 预配置的扩展集合（bold、italic、heading、lists 等） |
| `@tiptap/extension-image` | 图片扩展（内置 Markdown 解析/序列化） |
| `@tiptap/extension-link` | 链接扩展 |
| `@tiptap/extension-table` | 表格扩展 |
| `@tiptap/extension-table-cell` | 表格单元格 |
| `@tiptap/extension-table-header` | 表格头 |
| `@tiptap/extension-table-row` | 表格行 |
| `@tiptap/extension-placeholder` | 占位文本扩展 |
| `@tiptap/extension-underline` | 下划线扩展 |
| `@tiptap/markdown` | Markdown 解析/序列化扩展 |

### 7.2 可移除依赖（稳定后执行）

| 包名 | 原因 |
|------|------|
| `react-markdown` | 被 Tiptap + @tiptap/markdown 替代 |
| `remark-gfm` | 同上 |
| `react-quill` | 旧版编辑器，已不使用 |
| `quill-image-resize-module-react` | 旧版图片缩放插件，已不使用 |

### 7.3 保留依赖

| 包名 | 原因 |
|------|------|
| `turndown` | 旧 HTML → Markdown 迁移仍需使用（`htmlToMarkdown.js`） |
| `react-html-parser` | 旧 HTML 只读渲染仍需使用（`HtmlContent` 组件） |

---

## 八、风险分析与缓解

| 风险 | 严重程度 | 缓解措施 |
|------|----------|----------|
| Markdown 往返转换保真度 — Tiptap 解析与 react-markdown 可能存在差异 | 高 | 用现有文档样本做 round-trip 测试：`setContent(md)` → `getMarkdown()` → 对比差异 |
| `@tiptap/markdown` 对 GFM 表格支持可能不完整 | 高 | 检查 Table 扩展是否有内置 `parseMarkdown`/`renderMarkdown`，若无则需添加自定义规则 |
| `onUpdate` 每次按键都调用 `getMarkdown()` 可能有性能问题 | 中 | 大文档测试性能，必要时在 TiptapEditor 内部对 `onChange` 做防抖 |
| 外部 `content` 更新（getDetail 刷新）覆盖用户正在编辑的内容 | 中 | 用 ref 跟踪内容来源，仅外部变化时才 `setContent` |
| NodeView 异步图片解析可能内存泄漏 | 低 | `destroy()` 方法设置销毁标记，异步回调检查标记 |
| CSS 冲突 — ProseMirror 样式与现有样式冲突 | 低 | 使用 CSS Modules 作用域和 `:global()` 精确控制 |

---

## 九、实施顺序

```
Phase 1: 基础设施（不涉及页面改动）
  第 1 步: 安装 Tiptap 依赖
  第 2 步: 创建 src/utils/imageCache.js（从现有代码提取）
  第 3 步: 创建 MinioImage 扩展
  第 4 步: 创建 ImageUpload 扩展
  第 5 步: 创建 EditorToolbar 组件
  第 6 步: 创建 TiptapEditor 主组件
  第 7 步: 创建编辑器样式

Phase 2: 页面集成
  第 8 步: 重构 Content 页面
  第 9 步: 重构 AddContent 页面

Phase 3: 清理
  第 10 步: 清理页面样式
  第 11 步: 清理依赖（稳定后）
  第 12 步: 废弃 useMarkDownTooBar.jsx（稳定后）
```

---

## 十、验证测试

### 10.1 功能测试

| 测试场景 | 预期结果 |
|----------|----------|
| 新建文档 — 输入各种格式文本 | 标题、粗体、斜体、代码、引用等格式正常渲染 |
| 新建文档 — 工具栏按钮上传图片 | 图片上传成功，编辑区内显示图片 |
| 新建文档 — 粘贴图片 | Ctrl+V 粘贴图片正常上传并显示 |
| 新建文档 — 拖拽图片 | 拖拽图片文件到编辑区正常上传并显示 |
| 新建文档 — 保存 | 数据库中 content 为合法 Markdown，图片为 `![alt](minio:fileId)` 格式 |
| 编辑文档 — 自动保存 | 编辑后 2 秒自动保存，刷新页面内容不丢失 |
| 编辑文档 — 手动保存 | 点击保存按钮后内容正确保存 |
| 查看文档 — 只读模式 | 格式化内容正确渲染，不可编辑 |
| 查看文档 — 图片显示 | `minio:fileId` 图片正确解析并显示 |
| 旧文档 — 只读预览 | HTML 内容正确渲染，base64 图片正常显示，显示提示横幅 |
| 旧文档 — 迁移 | 弹出确认框 → 迁移成功 → 进入 WYSIWYG 编辑模式 |
| 迁移后重新打开 | 走正常 Markdown 流程，图片使用 MinIO URL |
| 插入表格 | 表格正确创建，可编辑内容 |
| 空内容 | 编辑器正常显示，不报错 |

### 10.2 兼容性测试

| 场景 | 说明 |
|------|------|
| 已有 Markdown 文档 | 通过 Tiptap 打开后渲染效果与当前 ReactMarkdown 预览一致 |
| 已有图片引用 `minio:fileId` | 图片正常解析和显示 |
| 包含 GFM 表格的文档 | 表格正确解析和显示 |
| 包含代码块的文档 | 代码块正确高亮和显示 |
