import { previewMarkdownImage } from '@/apis/image'

const urlCache = new Map()
const CACHE_TTL = 5 * 60 * 1000

const MAX_CONCURRENT = 3
const pendingQueue = []
let activeCount = 0

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
    return new Promise((resolve, reject) => {
        const task = () => previewMarkdownImage(fileId).then(resolve).catch(reject)
        pendingQueue.push({ task })
        processQueue()
    })
}

export { urlCache, enqueuePreview, CACHE_TTL }
