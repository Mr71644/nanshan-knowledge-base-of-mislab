import { memo, useEffect, useState } from 'react'
import { Empty, Spin } from 'antd'
import { useSearchParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import { previewFile } from '@/apis/file'
import { getFileType } from '@/utils/fileType'
import { useMessage } from '@/hooks/useMessage'
import style from './index.module.less'

const Preview = () => {
    const [searchParams] = useSearchParams()
    const { error, contextHolder } = useMessage()
    const [loading, setLoading] = useState(true)
    const [previewUrl, setPreviewUrl] = useState('')
    const [fileCategory, setFileCategory] = useState('pdf')
    const [textContent, setTextContent] = useState('')
    const [fileName, setFileName] = useState('')
    const fileId = (searchParams.get('from') || '').trim()

    useEffect(() => {
        let cancelled = false

        const getPreviewUrl = async () => {
            if (!fileId) {
                setLoading(false)
                return
            }

            const name = decodeURIComponent(searchParams.get('name') || '')
            const { category } = getFileType(name)
            setFileCategory(category)
            setFileName(name)

            try {
                setLoading(true)
                const res = await previewFile(fileId)
                const url = res?.data || ''

                if (!url) {
                    throw new Error('empty preview url')
                }

                if (category === 'text' || category === 'markdown') {
                    const textRes = await fetch(url)
                    const text = await textRes.text()
                    if (!cancelled) setTextContent(text)
                }

                if (!cancelled) {
                    setPreviewUrl(url)
                }
            } catch (e) {
                if (!cancelled) {
                    error({
                        content: '文件预览失败，请检查链接或网络'
                    })
                }
            } finally {
                if (!cancelled) {
                    setLoading(false)
                }
            }
        }

        getPreviewUrl()

        return () => {
            cancelled = true
        }
    }, [fileId])

    const renderPreview = () => {
        if (loading) {
            return (
                <div className={style.center}>
                    <Spin size='large' />
                </div>
            )
        }

        if (!fileId) {
            return (
                <div className={style.center}>
                    <Empty description='缺少链接参数 from，请检查访问地址' />
                </div>
            )
        }

        if (!previewUrl) {
            return (
                <div className={style.center}>
                    <Empty description='未获取到预览地址，请稍后重试' />
                </div>
            )
        }

        switch (fileCategory) {
            case 'image':
                return (
                    <div className={style.imageWrapper}>
                        <img src={previewUrl} alt={fileName} className={style.previewImage} />
                    </div>
                )
            case 'video':
                return (
                    <div className={style.mediaWrapper}>
                        <video src={previewUrl} controls className={style.previewVideo} />
                    </div>
                )
            case 'audio':
                return (
                    <div className={style.mediaWrapper}>
                        <audio src={previewUrl} controls className={style.previewAudio} />
                    </div>
                )
            case 'markdown':
                return (
                    <div className={style.textWrapper}>
                        <ReactMarkdown>{textContent}</ReactMarkdown>
                    </div>
                )
            case 'text':
                return <pre className={style.textWrapper}>{textContent}</pre>
            default:
                return (
                    <div className={style.wrapper}>
                        <iframe
                            className={style.iframe}
                            src={previewUrl}
                            title='file-preview'
                            allow='fullscreen'
                        />
                    </div>
                )
        }
    }

    return (
        <div className={style.page}>
            {contextHolder}
            <div className={style.header}>
                <span>{fileName}</span>
            </div>
            <div className={style.content}>
                {renderPreview()}
            </div>
        </div>
    )
}

export const MemoPreview = memo(Preview)
