import { Image } from '@tiptap/extension-image'
import { ResizableNodeView } from '@tiptap/core'
import { urlCache, setCache, enqueuePreview, CACHE_TTL } from '@/utils/imageCache'

const MinioImage = Image.extend({
    addOptions() {
        return {
            ...this.parent?.(),
            resize: {
                enabled: true,
                minWidth: 30,
                alwaysPreserveAspectRatio: true,
            },
        }
    },

    addNodeView() {
        return ({ node, getPos, editor }) => {
            const img = createBaseImg(node.attrs.alt)
            const currentSrc = { value: node.attrs.src }

            applySrc(img, currentSrc, node.attrs.src, node.attrs.alt)

            const nodeView = new ResizableNodeView({
                element: img,
                editor,
                node,
                getPos,
                onResize(width, height) {
                    img.style.width = `${width}px`
                    img.style.height = `${height}px`
                },
                onCommit(width, height) {
                    const pos = getPos()
                    if (pos === undefined) return
                    editor
                        .chain()
                        .setNodeSelection(pos)
                        .updateAttributes('image', { width, height })
                        .run()
                },
                onUpdate(updatedNode) {
                    if (updatedNode.type.name !== 'image') return false
                    if (updatedNode.attrs.src !== currentSrc.value) {
                        currentSrc.value = updatedNode.attrs.src
                        applySrc(img, currentSrc, updatedNode.attrs.src, updatedNode.attrs.alt)
                    }
                    return true
                },
                options: {
                    directions: ['bottom-left', 'bottom-right', 'top-left', 'top-right'],
                    min: { width: 30 },
                    preserveAspectRatio: true,
                },
            })

            return nodeView
        }
    },

    renderHTML({ node }) {
        const src = node.attrs.src || ''
        const alt = node.attrs.alt || '图片'
        const width = node.attrs.width
        const height = node.attrs.height

        if (src.startsWith('minio:')) {
            return ['img', {
                'data-minio-src': src,
                alt,
                ...(width ? { width } : {}),
                ...(height ? { height } : {}),
            }]
        }
        return ['img', { src, alt, ...(width ? { width } : {}), ...(height ? { height } : {}) }]
    },
})

function createBaseImg(alt) {
    const img = document.createElement('img')
    img.alt = alt || '图片'
    img.style.maxWidth = '100%'
    img.style.height = 'auto'
    img.style.display = 'block'
    img.style.border = '1px solid #ddd'
    img.style.borderRadius = '4px'
    img.onerror = () => {
        img.style.display = 'none'
        if (img.parentNode) {
            const span = document.createElement('span')
            span.textContent = '图片加载失败'
            span.style.color = 'red'
            img.parentNode.appendChild(span)
        }
    }
    return img
}

function clearErrorState(img) {
    img.style.display = 'block'
    img.style.color = ''
    const errorSpan = img.parentNode?.querySelector(':scope > span')
    if (errorSpan) errorSpan.remove()
}

function setLoadingState(img) {
    img.style.minHeight = '200px'
    img.style.background = '#f5f5f5'
    img.style.border = '1px solid #ddd'
}

function clearLoadingState(img) {
    img.style.minHeight = ''
    img.style.background = ''
}

function applySrc(img, currentSrc, src, alt) {
    clearErrorState(img)

    if (!src || typeof src !== 'string') {
        img.src = ''
        img.alt = '图片加载失败'
        img.style.color = 'red'
        return
    }

    if (!src.startsWith('minio:')) {
        img.src = src
        img.alt = alt || '图片'
        return
    }

    const fileId = src.slice(6)
    const cached = urlCache.get(fileId)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        img.src = cached.url
        img.alt = alt || '图片'
        return
    }

    setLoadingState(img)
    enqueuePreview(fileId).then((res) => {
        if (src !== currentSrc.value) return
        let url = null
        if (typeof res === 'string') url = res
        else if (res && res.data) url = res.data

        if (url) {
            setCache(fileId, url)
            clearLoadingState(img)
            img.src = url
            img.alt = alt || '图片'
        } else {
            clearLoadingState(img)
            img.src = ''
            img.alt = '图片加载失败'
            img.style.color = 'red'
        }
    }).catch(() => {
        if (src !== currentSrc.value) return
        clearLoadingState(img)
        img.src = ''
        img.alt = '图片加载失败'
        img.style.color = 'red'
    })
}

export default MinioImage
