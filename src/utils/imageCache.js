import { previewMarkdownImage } from '@/apis/image'

const urlCache = new Map()
const CACHE_TTL = 5 * 60 * 1000
const MAX_CACHE_SIZE = 100

const MAX_CONCURRENT = 3
const pendingQueue = []
let activeCount = 0

const evictExpired = () => {
    const now = Date.now()
    for (const [key, entry] of urlCache) {
        if (now - entry.timestamp >= CACHE_TTL) {
            if (entry.url && entry.url.startsWith('blob:')) {
                URL.revokeObjectURL(entry.url)
            }
            urlCache.delete(key)
        }
    }
}

const evictIfOverCapacity = () => {
    if (urlCache.size <= MAX_CACHE_SIZE) return
    const entries = [...urlCache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp)
    const toRemove = entries.slice(0, urlCache.size - MAX_CACHE_SIZE)
    for (const [key, entry] of toRemove) {
        if (entry.url && entry.url.startsWith('blob:')) {
            URL.revokeObjectURL(entry.url)
        }
        urlCache.delete(key)
    }
}

const setCache = (fileId, url) => {
    const old = urlCache.get(fileId)
    if (old && old.url && old.url.startsWith('blob:') && old.url !== url) {
        URL.revokeObjectURL(old.url)
    }
    urlCache.set(fileId, { url, timestamp: Date.now() })
    evictIfOverCapacity()
}

const processQueue = () => {
    while (activeCount < MAX_CONCURRENT && pendingQueue.length > 0) {
        const next = pendingQueue.shift()
        activeCount++
        next.task().finally(() => {
            activeCount--
            processQueue()
        })
    }
}

const enqueuePreview = (fileId) => {
    evictExpired()
    return new Promise((resolve, reject) => {
        const task = () => previewMarkdownImage(fileId).then(resolve).catch(reject)
        pendingQueue.push({ task })
        processQueue()
    })
}

export { urlCache, setCache, enqueuePreview, CACHE_TTL }
