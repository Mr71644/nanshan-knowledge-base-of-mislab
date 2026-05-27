# 普通文件（status=4）「详情」预览功能 — 实施方案

## 1. 背景

### 1.1 现状

文件列表（`src/views/FileList/index.jsx`）中，文件通过 `record.status` 区分类型：

| status | 类型 | 三点菜单选项 | 行点击行为 |
|--------|------|-------------|-----------|
| 1 | 富文本 | 详情、置顶、下载、删除 | 跳转到 Content 编辑页 |
| 2 | 文件夹 | 详情、更名、置顶、下载、删除 | 进入子目录 |
| 3 | Excel | 详情、置顶、下载、删除 | 跳转到 Excel 编辑页 |
| **4** | **普通文件** | **下载、置顶、删除（无详情）** | **无响应** |

**问题**：status=4 的普通文件无法预览，只能下载。用户希望能直接在浏览器中预览图片、PDF、视频、音频、文本等常见文件类型。

### 1.2 已有资源

| 资源 | 位置 | 说明 |
|------|------|------|
| Preview 组件 | `src/views/Preview/index.jsx` | 已存在的预览页面，使用 iframe 渲染，但只对 PDF 有效，未被 FileList 关联 |
| Preview 路由 | `src/router/index.jsx` 第 57-59 行 | `path: 'preview'`，已注册，URL 格式 `#/preview?from={fileId}` |
| 预览 API | `src/apis/file.js` → `previewFile(id)` | `GET /minio/preview/:id`，返回预览 URL（MinIO presigned URL） |
| 下载工具 | `src/utils/download.js` → `downloadSingle()` | `GET /document/download/{status}/{id}` |
| react-markdown | `package.json` 已安装 | 可直接用于渲染 `.md` 文件 |

### 1.3 需求

1. 为可预览的 status=4 文件添加「详情」菜单项
2. 不可预览的文件（docx、zip、exe 等）**不显示**「详情」选项
3. 预览在**新标签页**打开（`window.open`），原页面不受影响
4. 不使用浏览器回退，避免状态丢失

---

## 2. 文件类型分类设计

### 2.1 新建工具函数 `src/utils/fileType.js`

```
函数签名：getFileType(fileName: string) → { category: string, extension: string }
```

### 2.2 分类规则

| category | 扩展名 | 预览渲染方式 |
|----------|--------|-------------|
| `image` | jpg, jpeg, png, gif, svg, webp, bmp, ico | `<img>` 标签，居中展示 |
| `pdf` | pdf | `<iframe>` 嵌入（浏览器原生 PDF 渲染） |
| `video` | mp4, webm, ogg, mov | `<video controls>` |
| `audio` | mp3, wav, ogg, aac, flac | `<audio controls>` |
| `text` | txt, json, csv, xml, js, ts, jsx, tsx, css, html, py, java, c, cpp, h, go, rs, sh, yml, yaml, toml, ini, conf, log, sql | fetch 文本内容 → `<pre>` 展示 |
| `markdown` | md, markdown | fetch 文本内容 → `react-markdown` 渲染 |
| `unsupported` | 其他所有扩展名 | **不显示「详情」菜单项** |

### 2.3 函数逻辑

```js
const FILE_CATEGORIES = {
    image: ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp', 'ico'],
    pdf: ['pdf'],
    video: ['mp4', 'webm', 'ogg', 'mov'],
    audio: ['mp3', 'wav', 'aac', 'flac'],
    text: ['txt', 'json', 'csv', 'xml', 'js', 'ts', 'jsx', 'tsx', 'css', 'html',
           'py', 'java', 'c', 'cpp', 'h', 'go', 'rs', 'sh',
           'yml', 'yaml', 'toml', 'ini', 'conf', 'log', 'sql'],
    markdown: ['md', 'markdown'],
}

export function getFileType(fileName) {
    const ext = (fileName.split('.').pop() || '').toLowerCase()
    for (const [category, extensions] of Object.entries(FILE_CATEGORIES)) {
        if (extensions.includes(ext)) return { category, extension: ext }
    }
    return { category: 'unsupported', extension: ext }
}
```

---

## 3. 修改详情

### 3.1 FileList 三点菜单改造

**文件**: `src/views/FileList/index.jsx`

#### 3.1.1 添加 import（文件顶部）

```js
import { getFileType } from '@/utils/fileType';
```

#### 3.1.2 修改 status=4 的 menuItems（第 165-182 行）

**修改前**：固定三项（下载、置顶、删除）

**修改后**：根据文件类型动态决定是否包含「详情」项

```jsx
if (record.status === 4) {
    const { category } = getFileType(record.name)
    const canPreview = category !== 'unsupported'
    menuItems = [
        ...(canPreview ? [{
            key: 'details',
            label: '详情',
            onClick: () => handleMenuClick('details', record),
        }] : []),
        {
            key: 'download',
            label: '下载',
            onClick: () => handleMenuClick('download', record),
        },
        {
            key: isPinned ? 'unpin' : 'pin',
            label: isPinned ? '取消置顶' : '置顶',
            onClick: () => handleMenuClick(isPinned ? 'unpin' : 'pin', record),
        },
        {
            key: 'delete',
            label: '删除',
            danger: true,
            onClick: () => handleMenuClick('delete', record),
        },
    ]
}
```

#### 3.1.3 修改 handleClick 函数（第 366 行之后）

在 `handleClick` 函数中添加 status=4 分支：

```js
if (record.status === 4) {
    const url = `${window.location.origin}${window.location.pathname}#/preview?from=${record.id}&name=${encodeURIComponent(record.name)}`
    window.open(url, '_blank')
}
```

说明：使用 `window.open` 在新标签页打开预览，与侧边栏打开 Content/Excel 的模式一致（参考 `Home/index.jsx` 第 334 行）。原页面状态完全保持。

---

### 3.2 Preview 组件增强

**文件**: `src/views/Preview/index.jsx`

#### 3.2.1 整体改造思路

现有 Preview 组件只使用 iframe 渲染 PDF，需要根据文件类型选择不同的渲染器。改造后的结构：

```
Preview 组件
├── 顶部栏：显示文件名
├── loading 状态：<Spin>
├── 错误状态：<Empty>
├── 预览内容（根据 category 分支渲染）
│   ├── image  → <img src={previewUrl}>
│   ├── pdf    → <iframe src={previewUrl}>
│   ├── video  → <video src={previewUrl} controls>
│   ├── audio  → <audio src={previewUrl} controls>
│   ├── text   → <pre>{textContent}</pre>
│   └── markdown → <ReactMarkdown>{textContent}</ReactMarkdown>
```

#### 3.2.2 新增状态

```js
const [fileCategory, setFileCategory] = useState('pdf')  // 默认 pdf 走 iframe
const [textContent, setTextContent] = useState('')        // text/markdown 文件的文本内容
const [fileName, setFileName] = useState('')              // 文件名，用于顶部栏显示
```

#### 3.2.3 URL 参数

从 `?from={fileId}&name={fileName}` 中读取：
- `from`：文件 ID（已有）
- `name`：文件名（新增），用于判断文件类型

#### 3.2.4 预览逻辑

```js
useEffect(() => {
    // 1. 从 URL 获取文件名，判断类型
    const name = searchParams.get('name') || ''
    const { category } = getFileType(decodeURIComponent(name))
    setFileCategory(category)
    setFileName(decodeURIComponent(name))

    // 2. 获取预览 URL
    const res = await previewFile(fileId)
    const url = res?.data

    // 3. 对 text/markdown 类型，额外 fetch 文本内容
    if (category === 'text' || category === 'markdown') {
        const textRes = await fetch(url)
        const text = await textRes.text()
        setTextContent(text)
    }

    setPreviewUrl(url)
}, [fileId])
```

#### 3.2.5 渲染函数

```jsx
const renderPreview = () => {
    switch (fileCategory) {
        case 'image':
            return <img src={previewUrl} alt={fileName} className={style.previewImage} />
        case 'pdf':
            return <iframe src={previewUrl} className={style.iframe} title="pdf-preview" allow="fullscreen" />
        case 'video':
            return (
                <div className={style.mediaWrapper}>
                    <video src={previewUrl} controls className={style.previewVideo} />
                </div>
            )
        case 'audio':
            return (
                <div className={style.mediaWrapper}>
                    <audio src={previewUrl} controls className={style.previewAudio} />
                </div>
            )
        case 'markdown':
            return (
                <div className={style.textWrapper}>
                    <ReactMarkdown>{textContent}</ReactMarkdown>
                </div>
            )
        case 'text':
            return (
                <pre className={style.textWrapper}>{textContent}</pre>
            )
        default:
            return <iframe src={previewUrl} className={style.iframe} title="file-preview" allow="fullscreen" />
    }
}
```

---

### 3.3 样式更新

**文件**: `src/views/Preview/index.module.css`、`src/views/Preview/index.module.less`

新增样式：

```css
.header {
    height: 48px;
    display: flex;
    align-items: center;
    padding: 0 24px;
    background: #fff;
    border-bottom: 1px solid #f0f0f0;
    font-size: 14px;
    font-weight: 500;
    color: #333;
    flex-shrink: 0;
}

.previewImage {
    max-width: 100%;
    max-height: calc(100vh - 48px);
    object-fit: contain;
    display: block;
    margin: 0 auto;
}

.mediaWrapper {
    display: flex;
    justify-content: center;
    align-items: center;
    flex: 1;
    padding: 24px;
}

.previewVideo {
    max-width: 100%;
    max-height: calc(100vh - 96px);
}

.previewAudio {
    width: 80%;
    max-width: 600px;
}

.textWrapper {
    flex: 1;
    overflow: auto;
    padding: 24px;
    background: #fff;
    font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
    font-size: 13px;
    line-height: 1.6;
    white-space: pre-wrap;
    word-wrap: break-word;
    margin: 0;
}
```

---

## 4. 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/utils/fileType.js` | **新建** | 文件类型判断工具函数 |
| `src/views/FileList/index.jsx` | **修改** | 添加 import、条件性详情菜单项、handleClick status=4 分支 |
| `src/views/Preview/index.jsx` | **修改** | 多类型预览渲染器、URL 参数扩展 |
| `src/views/Preview/index.module.css` | **修改** | 新增 header、image、video、audio、text 样式 |
| `src/views/Preview/index.module.less` | **修改** | 同步更新 LESS 源文件 |

**不需要修改的文件**：
- `src/router/index.jsx` — Preview 路由已注册，无需改动
- `src/apis/file.js` — `previewFile()` API 已存在，直接复用
- `package.json` — 无需安装新依赖，`react-markdown` 已安装

---

## 5. 复用的已有代码

| 已有资源 | 位置 | 用途 |
|---------|------|------|
| `previewFile(id)` | `src/apis/file.js:72` | 获取 MinIO presigned 预览 URL |
| `downloadSingle(status, id, name)` | `src/utils/download.js:3` | 文件下载 |
| `react-markdown` | `package.json` 已安装 | Markdown 文件渲染 |
| `window.open(url, '_blank')` | `Home/index.jsx:334` 模式 | 新标签页打开预览 |
| `useSearchParams()` | `Preview/index.jsx:9` 已使用 | 读取 URL 查询参数 |

---

## 6. 验证方案

### 6.1 启动

```bash
pnpm dev
```

### 6.2 功能验证

| 测试场景 | 操作 | 预期结果 |
|---------|------|---------|
| 图片文件（.png/.jpg） | 上传图片 → 点击三点菜单 | 显示「详情」项，点击后新标签页展示图片 |
| PDF 文件 | 上传 PDF → 点击详情 | 新标签页用 iframe 渲染 PDF |
| 视频文件（.mp4） | 上传视频 → 点击详情 | 新标签页显示视频播放器 |
| 音频文件（.mp3） | 上传音频 → 点击详情 | 新标签页显示音频播放器 |
| 文本文件（.txt/.json） | 上传文本 → 点击详情 | 新标签页显示文本内容 |
| Markdown 文件（.md） | 上传 md → 点击详情 | 新标签页渲染 Markdown |
| 不可预览文件（.docx/.zip） | 上传 docx → 点击三点菜单 | **不显示**「详情」项 |
| 原页面状态 | 预览后切回原标签 | 文件列表状态保持不变，无回退问题 |

---

## 7. Git 操作步骤

开始开发前，请手动执行以下命令：

```bash
# 1. 切换到 develop 并拉取最新代码
git checkout develop
git pull

# 2. 创建功能分支
git checkout -b feature/file-preview
```

开发完成后：

```bash
# 3. 提交更改
git add src/utils/fileType.js src/views/FileList/index.jsx src/views/Preview/
git commit -m "feat: 为普通文件添加预览功能，支持图片/PDF/视频/音频/文本/Markdown"

# 4. 推送并创建 PR
git push -u origin feature/file-preview
# 然后在 GitHub 创建 PR 到 develop
```
