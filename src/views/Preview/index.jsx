import { memo, useEffect, useRef, useState, useCallback } from 'react'
import { Empty, Spin, Button, Result } from 'antd'
import { DownloadOutlined, ReloadOutlined } from '@ant-design/icons'
import { useSearchParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import {
    getPreviewInfo,
    prepareOfficePreview,
    fetchPreviewBlob,
    fetchPreviewPdf,
    PreviewApiError,
} from '@/apis/preview'
import { getFileType } from '@/utils/fileType'
import {
    OFFICE_STATUS,
    OFFICE_STATUS_LABELS,
    createBlobUrl,
    revokeBlobUrl,
    pollPreviewStatus,
} from '@/utils/preview'
import { getToken } from '@/utils/token'
import style from './index.module.less'

/**
 * 安全限制：这些扩展名的文件不渲染内容，只提供下载
 * 规范要求不应放入同源 iframe 或使用 innerHTML 渲染
 */
const UNSAFE_EXTENSIONS = new Set(['html', 'htm', 'xml', 'js'])

/**
 * 可直接在浏览器中渲染为文本的文件扩展名
 */
const TEXT_RENDER_EXTENSIONS = new Set([
    'txt', 'csv', 'json', 'log',
    'js', 'ts', 'jsx', 'tsx', 'css',
    'py', 'java', 'c', 'cpp', 'h', 'go', 'rs', 'sh',
    'yml', 'yaml', 'toml', 'ini', 'conf', 'sql',
    'md', 'markdown',
])

/** 下载按钮使用的 API base */
const API_BASE = import.meta.env.VITE_API_BASE_URL

const Preview = () => {
    const [searchParams] = useSearchParams()
    const fileId = (searchParams.get('from') || '').trim()
    const initialName = decodeURIComponent(searchParams.get('name') || '')

    // ---- state ----
    const [loading, setLoading] = useState(true)
    const [blobUrl, setBlobUrl] = useState('')
    const [textContent, setTextContent] = useState('')
    const [fileName, setFileName] = useState(initialName)
    const [fileCategory, setFileCategory] = useState('unsupported')
    const [fileExtension, setFileExtension] = useState('')
    const [previewType, setPreviewType] = useState(null)       // 'file' | 'office_pdf'
    const [officeStatus, setOfficeStatus] = useState(null)
    const [officeError, setOfficeError] = useState(null)
    const [errorMessage, setErrorMessage] = useState('')
    const [showError, setShowError] = useState(false)

    // 用于 cleanup 的 refs
    const blobUrlRef = useRef('')
    const pollCleanupRef = useRef(null)
    const cancelledRef = useRef(false)

    /** 安全释放上一个 blob URL */
    const clearBlobUrl = useCallback(() => {
        if (blobUrlRef.current) {
            revokeBlobUrl(blobUrlRef.current)
            blobUrlRef.current = ''
        }
    }, [])

    /** 停止 Office 状态轮询 */
    const stopPolling = useCallback(() => {
        if (pollCleanupRef.current) {
            pollCleanupRef.current()
            pollCleanupRef.current = null
        }
    }, [])

    // ---- 文本渲染 ----
    const loadAndRenderText = useCallback(async (blob, category) => {
        try {
            const text = await blob.text()
            if (!cancelledRef.current) {
                setTextContent(text)
                setFileCategory(category)
            }
        } catch {
            if (!cancelledRef.current) {
                setErrorMessage('文本内容读取失败')
                setShowError(true)
            }
        }
    }, [])

    // ---- 普通文件流预览 ----
    const loadFilePreview = useCallback(async (info) => {
        try {
            const blob = await fetchPreviewBlob(fileId)
            if (cancelledRef.current) return

            const url = createBlobUrl(blob)
            blobUrlRef.current = url
            setBlobUrl(url)

            // 文本类型需要读取内容
            const { category, extension } = getFileType(info.fileName || fileName)
            setFileExtension(extension)

            if (TEXT_RENDER_EXTENSIONS.has(extension)) {
                await loadAndRenderText(blob, category)
            } else {
                setFileCategory(category)
            }
        } catch (e) {
            if (cancelledRef.current) return
            const msg = e instanceof PreviewApiError
                ? e.message
                : '文件加载失败，请稍后重试'
            setErrorMessage(msg)
            setShowError(true)
        } finally {
            if (!cancelledRef.current) {
                setLoading(false)
            }
        }
    }, [fileId, fileName, loadAndRenderText])

    // 用于跨 useCallback 的循环引用（loadPdfPreview ↔ startOfficePolling）
    const loadPdfPreviewRef = useRef(null)
    const startOfficePollingRef = useRef(null)

    // ---- Office PDF 预览 ----
    const loadPdfPreview = useCallback(async () => {
        try {
            setOfficeStatus(OFFICE_STATUS.QUEUED)
            const blob = await fetchPreviewPdf(fileId)
            if (cancelledRef.current) return

            clearBlobUrl()
            const url = createBlobUrl(blob)
            blobUrlRef.current = url
            setBlobUrl(url)
            setFileCategory('pdf')
            setOfficeStatus(OFFICE_STATUS.READY)
            setLoading(false)
        } catch (e) {
            if (cancelledRef.current) return
            if (e instanceof PreviewApiError && e.httpStatus === 409) {
                // PDF 尚未就绪，进入轮询
                setOfficeStatus(OFFICE_STATUS.CONVERTING)
                startOfficePollingRef.current?.()
            } else {
                const msg = e instanceof PreviewApiError ? e.message : 'PDF 加载失败'
                setOfficeError(msg)
                setOfficeStatus(OFFICE_STATUS.FAILED)
                setLoading(false)
            }
        }
    }, [fileId, clearBlobUrl])

    // 保持 ref 同步
    loadPdfPreviewRef.current = loadPdfPreview

    // ---- Office 轮询 ----
    const startOfficePolling = useCallback(() => {
        stopPolling()
        pollCleanupRef.current = pollPreviewStatus(
            Number(fileId),
            (info) => {
                if (cancelledRef.current) return
                setOfficeStatus(info.previewStatus)

                if (info.previewStatus === OFFICE_STATUS.READY) {
                    // 转换完成，加载 PDF
                    loadPdfPreviewRef.current?.()
                } else if (
                    info.previewStatus === OFFICE_STATUS.FAILED ||
                    info.previewStatus === OFFICE_STATUS.UNSUPPORTED
                ) {
                    setOfficeError(info.previewError || '文件预览失败')
                    setLoading(false)
                }
                // QUEUED / CONVERTING → 继续轮询（pollPreviewStatus 内部处理）
            },
            { interval: 2000, timeout: 120000 }
        )
    }, [fileId, stopPolling])

    startOfficePollingRef.current = startOfficePolling

    // ---- 处理 Office 文件 ----
    const handleOfficePreview = useCallback(async (info) => {
        const status = info.previewStatus

        if (status === OFFICE_STATUS.READY) {
            await loadPdfPreviewRef.current?.()
        } else if (status === OFFICE_STATUS.NOT_CREATED) {
            // 提交转换任务
            try {
                setOfficeStatus(OFFICE_STATUS.QUEUED)
                const updated = await prepareOfficePreview(fileId)
                if (cancelledRef.current) return
                // prepare 返回最新状态，可能已直接 READY
                if (updated.previewStatus === OFFICE_STATUS.READY) {
                    await loadPdfPreviewRef.current?.()
                } else if (updated.previewStatus === OFFICE_STATUS.FAILED) {
                    setOfficeError(updated.previewError || '不支持此文件格式')
                    setOfficeStatus(OFFICE_STATUS.FAILED)
                    setLoading(false)
                } else if (updated.previewStatus === OFFICE_STATUS.UNSUPPORTED) {
                    setOfficeError(updated.previewError || '不支持预览此文件格式')
                    setOfficeStatus(OFFICE_STATUS.UNSUPPORTED)
                    setLoading(false)
                } else {
                    setOfficeStatus(updated.previewStatus)
                    startOfficePollingRef.current?.()
                    // 轮询过程中 loading 由 startOfficePolling → loadPdfPreview 关闭
                }
            } catch (e) {
                if (cancelledRef.current) return
                const msg = e instanceof PreviewApiError ? e.message : '提交转换任务失败'
                setOfficeError(msg)
                setOfficeStatus(OFFICE_STATUS.FAILED)
                setLoading(false)
            }
        } else if (status === OFFICE_STATUS.FAILED || status === OFFICE_STATUS.UNSUPPORTED) {
            setOfficeError(info.previewError || '不支持预览此文件格式')
            setOfficeStatus(status)
            setLoading(false)
        } else {
            // QUEUED / CONVERTING
            setOfficeStatus(status)
            setLoading(false)
            startOfficePollingRef.current?.()
        }
    }, [fileId])

    // ---- 主流程 ----
    useEffect(() => {
        cancelledRef.current = false

        const init = async () => {
            if (!fileId) {
                setLoading(false)
                setShowError(true)
                setErrorMessage('缺少链接参数 from，请检查访问地址')
                return
            }

            try {
                setLoading(true)
                setShowError(false)
                setErrorMessage('')
                setOfficeStatus(null)
                setOfficeError(null)

                const info = await getPreviewInfo(fileId)
                if (cancelledRef.current) return

                // 更新文件名（以后端返回为准）
                if (info.fileName) {
                    setFileName(info.fileName)
                }

                setPreviewType(info.previewType)

                if (info.previewType === 'file') {
                    await loadFilePreview(info)
                } else if (info.previewType === 'office_pdf') {
                    setFileCategory('office')
                    await handleOfficePreview(info)
                }
            } catch (e) {
                if (cancelledRef.current) return
                const msg = e instanceof PreviewApiError
                    ? e.message
                    : '获取预览信息失败，请稍后重试'
                setErrorMessage(msg)
                setShowError(true)
                setLoading(false)
            }
        }

        init()

        return () => {
            cancelledRef.current = true
            stopPolling()
            clearBlobUrl()
        }
    }, [fileId]) // eslint-disable-line react-hooks/exhaustive-deps

    // ---- 渲染辅助 ----
    const isTextCategory = fileCategory === 'text' || fileCategory === 'markdown'

    /** 是否只能下载不能预览 */
    const isDownloadOnly = () => {
        if (fileCategory === 'archive') return true
        if (fileCategory === 'unsupported') return true
        // 安全限制扩展名
        if (UNSAFE_EXTENSIONS.has(fileExtension) && !isTextCategory) return true
        return false
    }

    /** 渲染下载按钮（用于不支持预览的文件类型） */
    const renderDownload = (reason) => (
        <div className={style.statusContainer}>
            <Result
                status='info'
                title='不支持在线预览'
                subTitle={reason || '此文件类型暂不支持在线预览，请下载后查看'}
                extra={
                    <Button
                        type='primary'
                        icon={<DownloadOutlined />}
                        onClick={() => {
                            const token = getToken()
                            const downloadUrl = `${API_BASE}/document/download/4/${fileId}`
                            // 通过 fetch 下载以携带 JWT 鉴权
                            if (token) {
                                fetch(downloadUrl, {
                                    headers: { Authorization: `Bearer ${token}` }
                                }).then(res => res.blob()).then(blob => {
                                    const url = URL.createObjectURL(blob)
                                    const a = document.createElement('a')
                                    a.href = url
                                    a.download = fileName || `file_${fileId}`
                                    a.click()
                                    URL.revokeObjectURL(url)
                                }).catch(() => {
                                    // fallback：直接打开下载链接
                                    window.open(downloadUrl, '_blank')
                                })
                            } else {
                                window.open(downloadUrl, '_blank')
                            }
                        }}
                    >
                        下载文件
                    </Button>
                }
            />
        </div>
    )

    /** 渲染 Office 转换状态 */
    const renderOfficeStatus = () => {
        const isProcessing = officeStatus === OFFICE_STATUS.QUEUED ||
            officeStatus === OFFICE_STATUS.CONVERTING

        return (
            <div className={style.statusContainer}>
                {isProcessing ? (
                    <div className={style.officeProcessing}>
                        <Spin size='large' />
                        <p className={style.statusText}>
                            {OFFICE_STATUS_LABELS[officeStatus] || '处理中...'}
                        </p>
                        <p className={style.statusHint}>
                            正在将 Office 文件转换为 PDF，请耐心等待（最长 2 分钟）
                        </p>
                    </div>
                ) : (
                    <Result
                        status='error'
                        title='文件预览失败'
                        subTitle={officeError || '文件转换失败，请稍后重试'}
                        extra={
                            <div className={style.actionButtons}>
                                <Button
                                    type='primary'
                                    icon={<ReloadOutlined />}
                                    onClick={() => {
                                        setLoading(true)
                                        setShowError(false)
                                        setErrorMessage('')
                                        setOfficeStatus(null)
                                        setOfficeError(null)
                                        handleOfficePreview({ previewStatus: OFFICE_STATUS.NOT_CREATED })
                                    }}
                                >
                                    重试
                                </Button>
                                <Button
                                    icon={<DownloadOutlined />}
                                    onClick={() => {
                                        const downloadUrl = `${API_BASE}/document/download/4/${fileId}`
                                        window.open(downloadUrl, '_blank')
                                    }}
                                >
                                    下载源文件
                                </Button>
                            </div>
                        }
                    />
                )}
            </div>
        )
    }

    /** 渲染主预览内容 */
    const renderPreview = () => {
        // 加载中
        if (loading) {
            return (
                <div className={style.center}>
                    <Spin size='large' />
                </div>
            )
        }

        // 错误状态
        if (showError) {
            return (
                <div className={style.statusContainer}>
                    <Result
                        status='error'
                        title='预览失败'
                        subTitle={errorMessage}
                        extra={
                            <Button
                                icon={<ReloadOutlined />}
                                onClick={() => {
                                    setShowError(false)
                                    setErrorMessage('')
                                    setLoading(true)
                                    // 重新触发 useEffect
                                    window.location.reload()
                                }}
                            >
                                刷新重试
                            </Button>
                        }
                    />
                </div>
            )
        }

        // Office 处理中
        if (previewType === 'office_pdf' && officeStatus) {
            if (officeStatus === OFFICE_STATUS.READY && blobUrl) {
                // 转换完成，当作 PDF 渲染
            } else {
                return renderOfficeStatus()
            }
        }

        // 无文件 ID
        if (!fileId) {
            return (
                <div className={style.center}>
                    <Empty description='缺少链接参数 from，请检查访问地址' />
                </div>
            )
        }

        // 下载类文件
        if (isDownloadOnly()) {
            const reasons = {
                archive: '压缩包文件不支持在线预览',
                unsupported: '此文件类型暂不支持在线预览',
            }
            const reason = UNSAFE_EXTENSIONS.has(fileExtension)
                ? '出于安全考虑，此类型文件不提供在线预览'
                : (reasons[fileCategory] || '不支持在线预览')
            return renderDownload(reason)
        }

        // 无预览内容
        if (!blobUrl && !textContent) {
            return (
                <div className={style.center}>
                    <Empty description='未获取到预览内容，请稍后重试' />
                </div>
            )
        }

        // 按文件分类渲染
        if (isTextCategory) {
            if (fileCategory === 'markdown') {
                return (
                    <div className={style.textWrapper}>
                        <ReactMarkdown>{textContent}</ReactMarkdown>
                    </div>
                )
            }
            return <pre className={style.textWrapper}>{textContent}</pre>
        }

        switch (fileCategory) {
            case 'image':
                return (
                    <div className={style.imageWrapper}>
                        <img
                            src={blobUrl}
                            alt={fileName}
                            className={style.previewImage}
                        />
                    </div>
                )
            case 'video':
                return (
                    <div className={style.mediaWrapper}>
                        <video
                            src={blobUrl}
                            controls
                            className={style.previewVideo}
                        />
                    </div>
                )
            case 'audio':
                return (
                    <div className={style.mediaWrapper}>
                        <audio
                            src={blobUrl}
                            controls
                            className={style.previewAudio}
                        />
                    </div>
                )
            case 'pdf':
            default:
                return (
                    <div className={style.wrapper}>
                        <iframe
                            className={style.iframe}
                            src={blobUrl}
                            title={fileName || '文件预览'}
                            allow='fullscreen'
                        />
                    </div>
                )
        }
    }

    return (
        <div className={style.page}>
            <div className={style.header}>
                <span>{fileName || '文件预览'}</span>
            </div>
            <div className={style.content}>
                {renderPreview()}
            </div>
        </div>
    )
}

export const MemoPreview = memo(Preview)
