# 修复只读模式下 minio:id 直接设置为 img.src 的问题

## 问题描述

当 Tiptap 编辑器处于只读模式（`editable={false}`）时，图片 src 属性会被直接设置为 `minio:xxx`，导致浏览器尝试加载无效的 URL（如 `minio:108`）。

## 根本原因

在只读模式下，Tiptap 不使用自定义的 `nodeView`，而是使用 `renderHTML` 方法直接生成 HTML。原来的代码会直接输出 `src="minio:xxx"`，浏览器会尝试加载这个 URL。

## 解决方案

使用 `data-minio-src` 属性存储 `minio:` 值（不会触发浏览器加载），然后通过 JavaScript 异步获取真实 URL 并设置到 `img.src`。

---

## 修改步骤

### 步骤 1：修改 MinioImage.js 的 `renderHTML` 方法

**文件**：`src/components/TiptapEditor/extensions/MinioImage.js`

找到 `renderHTML` 方法，将其修改为：

```javascript
renderHTML({ node }) {
    const src = node.attrs.src || ''
    const alt = node.attrs.alt || '图片'
    const width = node.attrs.width
    const height = node.attrs.height

    // 如果是 minio: 前缀，使用 data 属性存储，避免浏览器直接请求
    if (src.startsWith('minio:')) {
        return ['img', {
            'data-minio-src': src,
            alt,
            ...(width ? { width } : {}),
            ...(height ? { height } : {}),
        }]
    }
    return ['img', { src, alt, ...(width ? { width } : {}), ...(height ? { height } : {}) }]
}
```

**关键点**：
- 当 `src` 以 `minio:` 开头时，使用 `data-minio-src` 属性而不是 `src`
- `data-*` 属性不会触发浏览器的网络请求

---

### 步骤 2：在 TiptapEditor 组件中添加处理逻辑

**文件**：`src/components/TiptapEditor/index.jsx`

#### 2.1 导入 previewMarkdownImage API

在文件顶部的 import 语句中添加：

```javascript
import { previewMarkdownImage } from '@/apis/image'
```

#### 2.2 添加 useEffect 处理 data-minio-src

在编辑器初始化之后，添加以下 useEffect（放在其他 useEffect 之后）：

```javascript
// 处理 data-minio-src 属性的图片（用于只读模式）
useEffect(() => {
    if (!editor) return

    const processMinioImages = async () => {
        const dom = editor.view.dom
        const images = dom.querySelectorAll('img[data-minio-src]')

        for (const img of images) {
            const minioSrc = img.getAttribute('data-minio-src')
            if (!minioSrc || !minioSrc.startsWith('minio:')) continue

            const fileId = minioSrc.slice(6)
            img.style.minHeight = '200px'
            img.style.background = '#f5f5f5'

            try {
                const res = await previewMarkdownImage(fileId)
                const url = res?.data || res
                if (url) {
                    img.src = url
                    img.removeAttribute('data-minio-src')
                } else {
                    img.alt = '图片加载失败'
                    img.style.color = 'red'
                }
            } catch {
                img.alt = '图片加载失败'
                img.style.color = 'red'
            } finally {
                img.style.minHeight = ''
                img.style.background = ''
            }
        }
    }

    // 初始处理
    processMinioImages()

    // 监听内容更新
    const handleUpdate = () => {
        processMinioImages()
    }

    editor.on('update', handleUpdate)
    return () => {
        editor.off('update', handleUpdate)
    }
}, [editor])
```

**关键点**：
- 查找所有带有 `data-minio-src` 的 img 元素
- 调用 `previewMarkdownImage(fileId)` 获取真实 URL
- 将真实 URL 设置到 `img.src`
- 监听编辑器更新事件，处理动态添加的图片

---

## 工作原理

### 可编辑模式（editable={true}）
```
用户上传图片 → ImageUpload.js 返回 'minio:108'
    ↓
插入到编辑器 → MinioImage nodeView 被调用
    ↓
applySrc() 函数 → 调用 enqueuePreview(108)
    ↓
获取真实 URL → 设置 img.src = 'http://xxx.com/xxx.jpg'
```

### 只读模式（editable={false}）
```
编辑器渲染 → renderHTML() 被调用
    ↓
生成 <img data-minio-src="minio:108"> （不触发网络请求）
    ↓
useEffect 检测到 data-minio-src
    ↓
调用 previewMarkdownImage(108)
    ↓
获取真实 URL → 设置 img.src = 'http://xxx.com/xxx.jpg'
    ↓
移除 data-minio-src 属性
```

---

## API 依赖

需要确保以下 API 存在：

```javascript
// src/apis/image.js
const previewMarkdownImage = (id) => {
  return request({
    url: `/minio/preview/markdown/${id}`,
    method: 'GET'
  })
}
```

---

## 验证方法

修改后，在浏览器控制台的网络面板中应该看到：

1. ❌ **不应该出现**：对 `minio:108` 的请求
2. ✅ **应该出现**：对 `/minio/preview/markdown/108` 的 API 请求
3. ✅ **应该出现**：对真实图片 URL（如 `http://xxx.com/xxx.jpg`）的请求

---

## 相关文件清单

- `src/components/TiptapEditor/extensions/MinioImage.js` - 图片扩展定义
- `src/components/TiptapEditor/index.jsx` - 编辑器主组件
- `src/apis/image.js` - 图片相关 API
- `src/utils/imageCache.js` - URL 缓存工具
