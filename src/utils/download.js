import { request } from '@/utils'

function triggerBrowserDownload(blob, filename) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function downloadSingle(status, id, name) {
    const blob = await request({
        url: `/document/download/${status}/${id}`,
        method: 'GET',
        responseType: 'blob',
    })
    triggerBrowserDownload(blob, name || `document_${id}`)
}

export async function downloadBatch(archiveName, items) {
    const blob = await request({
        url: '/document/download/batch',
        method: 'POST',
        responseType: 'blob',
        data: { archiveName, items }
    })
    triggerBrowserDownload(blob, `${archiveName}.zip`)
}
