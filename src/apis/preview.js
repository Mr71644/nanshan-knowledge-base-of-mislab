import { getToken } from '@/utils/token'
import { showMessage } from '@/store/modules/message'
import { clearUserInfo } from '@/store/modules/user'
import store from '@/store'

const API_BASE = import.meta.env.VITE_API_BASE_URL

/**
 * 预览 API 错误类
 */
class PreviewApiError extends Error {
    constructor(message, httpStatus, code) {
        super(message)
        this.name = 'PreviewApiError'
        this.httpStatus = httpStatus
        this.code = code
    }
}

/**
 * 统一处理 fetch 响应的鉴权失败（401）
 */
function handleAuthFailure() {
    store.dispatch(clearUserInfo())
    store.dispatch(showMessage({ message: '未登录或登录已过期，请重新登录', type: 'warn' }))
    window.location.hash = '/login'
}

/**
 * 发送带 JWT 鉴权的 fetch 请求，返回 JSON 数据
 * 同时检查 HTTP 状态和响应体中的 code 字段
 */
async function fetchJson(path, init = {}) {
    const token = getToken()
    const headers = {
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
    }
    if (token) {
        headers.Authorization = `Bearer ${token}`
    }

    const response = await fetch(`${API_BASE}${path}`, {
        ...init,
        headers,
    })

    if (response.status === 401) {
        handleAuthFailure()
        throw new PreviewApiError('登录已过期', 401, 401)
    }

    let result
    try {
        result = await response.json()
    } catch {
        throw new PreviewApiError(
            `请求失败：HTTP ${response.status}`,
            response.status
        )
    }

    if (!response.ok || (result.code && result.code !== 200)) {
        if (result.code === 401) {
            handleAuthFailure()
        }
        throw new PreviewApiError(
            result.message || `请求失败：HTTP ${response.status}`,
            response.status,
            result.code
        )
    }

    return result.data
}

/**
 * 获取预览元信息
 * GET /document/preview/4/{fileId}/info
 */
export function getPreviewInfo(fileId) {
    return fetchJson(`/document/preview/4/${fileId}/info`)
}

/**
 * 提交 Office 转 PDF 任务（幂等）
 * POST /document/preview/4/{fileId}/prepare
 */
export function prepareOfficePreview(fileId) {
    return fetchJson(`/document/preview/4/${fileId}/prepare`, { method: 'POST' })
}

/**
 * 获取普通文件流（Blob）
 * GET /document/preview/4/{fileId}
 * 支持可选的 Range 请求头
 */
export async function fetchPreviewBlob(fileId, range) {
    const token = getToken()
    const headers = {}
    if (token) {
        headers.Authorization = `Bearer ${token}`
    }
    if (range) {
        headers.Range = range
    }

    const response = await fetch(`${API_BASE}/document/preview/4/${fileId}`, { headers })

    if (response.status === 401) {
        handleAuthFailure()
        throw new PreviewApiError('登录已过期', 401, 401)
    }

    if (!response.ok) {
        let message = `文件流获取失败：HTTP ${response.status}`
        try {
            const errorBody = await response.json()
            if (errorBody.message) {
                message = errorBody.message
            }
            if (errorBody.code === 401) {
                handleAuthFailure()
            }
        } catch { /* 非 JSON 响应体，使用默认消息 */ }
        throw new PreviewApiError(message, response.status)
    }

    return response.blob()
}

/**
 * 获取转换后的 PDF 文件流（Blob）
 * GET /document/preview/4/{fileId}/pdf
 * 支持可选的 Range 请求头
 */
export async function fetchPreviewPdf(fileId, range) {
    const token = getToken()
    const headers = {}
    if (token) {
        headers.Authorization = `Bearer ${token}`
    }
    if (range) {
        headers.Range = range
    }

    const response = await fetch(`${API_BASE}/document/preview/4/${fileId}/pdf`, { headers })

    if (response.status === 401) {
        handleAuthFailure()
        throw new PreviewApiError('登录已过期', 401, 401)
    }

    if (!response.ok) {
        let message = `PDF 流获取失败：HTTP ${response.status}`
        let code
        try {
            const errorBody = await response.json()
            if (errorBody.message) {
                message = errorBody.message
            }
            code = errorBody.code
            if (code === 401) {
                handleAuthFailure()
            }
        } catch { /* 非 JSON 响应体 */ }
        throw new PreviewApiError(message, response.status, code)
    }

    return response.blob()
}

export { PreviewApiError }
