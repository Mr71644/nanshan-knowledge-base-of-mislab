import { getToken } from './token'

const BASE_URL = import.meta.env.VITE_API_BASE_URL

function extractFilename(headers, fallbackName = 'download') {
    const disposition = headers.get('Content-Disposition')
    if (!disposition) return fallbackName

    const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i)
    if (utf8Match) return decodeURIComponent(utf8Match[1])

    const match = disposition.match(/filename="([^"]+)"/)
    if (match) return match[1]

    return fallbackName
}

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
    const token = getToken()
    const url = `${BASE_URL}/document/download/${status}/${id}`

    const response = await fetch(url, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
    })

    if (!response.ok) {
        if (response.status === 401) {
            window.location.hash = '/login'
        }
        throw new Error(`下载失败: ${response.status}`)
    }

    const filename = extractFilename(response.headers, name || `document_${id}`)
    const blob = await response.blob()
    triggerBrowserDownload(blob, filename)
}

export async function downloadBatch(archiveName, items) {
    const token = getToken()
    const url = `${BASE_URL}/document/download/batch`

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ archiveName, items })
    })

    if (!response.ok) {
        if (response.status === 401) {
            window.location.hash = '/login'
        }
        throw new Error(`批量下载失败: ${response.status}`)
    }

    const filename = extractFilename(response.headers, `${archiveName}.zip`)
    const blob = await response.blob()
    triggerBrowserDownload(blob, filename)
}
