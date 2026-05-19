import { Image } from '@tiptap/extension-image'
import { urlCache, enqueuePreview, CACHE_TTL } from '@/utils/imageCache'

const MinioImage = Image.extend({
    addNodeView() {
        return ({ node }) => {
            const wrapper = document.createElement('span')
            wrapper.style.display = 'block'
            wrapper.style.maxWidth = '100%'
            wrapper.style.margin = '10px 0'

            renderSrc(wrapper, node.attrs.src, node.attrs.alt)

            return {
                dom: wrapper,
                update(updatedNode) {
                    if (updatedNode.type.name !== 'image') return false
                    wrapper.innerHTML = ''
                    renderSrc(wrapper, updatedNode.attrs.src, updatedNode.attrs.alt)
                    return true
                },
                destroy() {
                    wrapper.innerHTML = ''
                },
            }
        }
    },
})

function renderSrc(container, src, alt) {
    if (!src || typeof src !== 'string') {
        appendError(container)
        return
    }

    if (!src.startsWith('minio:')) {
        container.appendChild(createImg(src, alt))
        return
    }

    const fileId = src.slice(6)
    const cached = urlCache.get(fileId)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        container.appendChild(createImg(cached.url, alt))
        return
    }

    const placeholder = document.createElement('div')
    placeholder.className = 'minio-image-loading'
    placeholder.style.cssText = 'max-width:100%;height:200px;display:flex;align-items:center;justify-content:center;background:#f5f5f5;border:1px solid #ddd;border-radius:4px;color:#999;'
    placeholder.textContent = '图片加载中...'
    container.appendChild(placeholder)

    enqueuePreview(fileId).then((res) => {
        let url = null
        if (typeof res === 'string') url = res
        else if (res && res.data) url = res.data

        if (url) {
            urlCache.set(fileId, { url, timestamp: Date.now() })
            container.removeChild(placeholder)
            container.appendChild(createImg(url, alt))
        } else {
            container.removeChild(placeholder)
            appendError(container)
        }
    }).catch(() => {
        if (container.contains(placeholder)) {
            container.removeChild(placeholder)
        }
        appendError(container)
    })
}

function createImg(src, alt) {
    const img = document.createElement('img')
    img.src = src
    img.alt = alt || '图片'
    img.style.maxWidth = '100%'
    img.style.height = 'auto'
    img.style.display = 'block'
    img.style.border = '1px solid #ddd'
    img.style.padding = '4px'
    img.style.borderRadius = '4px'
    img.onerror = () => {
        if (img.parentNode) {
            img.style.display = 'none'
            appendError(img.parentNode)
        }
    }
    return img
}

function appendError(container) {
    const errorSpan = document.createElement('span')
    errorSpan.textContent = '图片加载失败'
    errorSpan.style.color = 'red'
    container.appendChild(errorSpan)
}

export default MinioImage
