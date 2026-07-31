import { getPreviewInfo } from '@/apis/preview'

/**
 * Office 转换状态枚举
 */
export const OFFICE_STATUS = {
    NOT_CREATED: 'NOT_CREATED',
    QUEUED: 'QUEUED',
    CONVERTING: 'CONVERTING',
    READY: 'READY',
    FAILED: 'FAILED',
    UNSUPPORTED: 'UNSUPPORTED',
}

/**
 * 各状态的显示标签
 */
export const OFFICE_STATUS_LABELS = {
    [OFFICE_STATUS.NOT_CREATED]: '准备转换',
    [OFFICE_STATUS.QUEUED]: '排队中...',
    [OFFICE_STATUS.CONVERTING]: '正在转换...',
    [OFFICE_STATUS.READY]: '转换完成',
    [OFFICE_STATUS.FAILED]: '转换失败',
    [OFFICE_STATUS.UNSUPPORTED]: '不支持预览此文件格式',
}

/**
 * 需要轮询的状态
 */
const POLLING_STATUSES = [OFFICE_STATUS.QUEUED, OFFICE_STATUS.CONVERTING]

/**
 * 封装 Object URL 创建
 */
export function createBlobUrl(blob) {
    return URL.createObjectURL(blob)
}

/**
 * 封装 Object URL 释放
 */
export function revokeBlobUrl(url) {
    if (url && url.startsWith('blob:')) {
        URL.revokeObjectURL(url)
    }
}

/**
 * 轮询预览状态，直到转换完成或超时
 *
 * @param {number} fileId - 文件 ID
 * @param {function} onStatusChange - 状态变化回调 (previewInfo) => void
 * @param {object} options
 * @param {number} options.interval - 轮询间隔（毫秒），默认 2000
 * @param {number} options.timeout - 总超时（毫秒），默认 120000
 * @returns {function} cleanup - 停止轮询的函数
 */
export function pollPreviewStatus(fileId, onStatusChange, options = {}) {
    const { interval = 2000, timeout = 120000 } = options

    let timerId = null
    let stopped = false
    const startTime = Date.now()

    async function poll() {
        if (stopped) return

        // 超时检查
        if (Date.now() - startTime >= timeout) {
            if (!stopped && onStatusChange) {
                onStatusChange({
                    previewStatus: OFFICE_STATUS.FAILED,
                    previewError: '转换超时，请稍后重试',
                })
            }
            return
        }

        try {
            const info = await getPreviewInfo(fileId)

            if (stopped) return

            if (onStatusChange) {
                onStatusChange(info)
            }

            // 判断是否需要继续轮询
            if (POLLING_STATUSES.includes(info.previewStatus)) {
                timerId = setTimeout(poll, interval)
            }
            // READY / FAILED / UNSUPPORTED / NOT_CREATED → 停止轮询，由调用方处理
        } catch {
            if (!stopped && onStatusChange) {
                onStatusChange({
                    previewStatus: OFFICE_STATUS.FAILED,
                    previewError: '获取预览状态失败',
                })
            }
        }
    }

    // 立即发起第一次轮询
    timerId = setTimeout(poll, interval)

    // 返回 cleanup 函数
    return () => {
        stopped = true
        if (timerId !== null) {
            clearTimeout(timerId)
            timerId = null
        }
    }
}
