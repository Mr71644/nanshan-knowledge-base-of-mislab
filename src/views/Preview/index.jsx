import { memo, useEffect, useState } from 'react'
import { Button, Empty, Spin } from 'antd'
import { useSearchParams } from 'react-router-dom'
import { previewFile } from '@/apis/file'
import { useMessage } from '@/hooks/useMessage'
import style from './index.module.css'

const Preview = () => {
    const [searchParams] = useSearchParams()
    const { error, contextHolder } = useMessage()
    const [loading, setLoading] = useState(true)
    const [previewUrl, setPreviewUrl] = useState('')
    const fileId = (searchParams.get('from') || '').trim()

    useEffect(() => {
        let cancelled = false

        const getPreviewUrl = async () => {
            if (!fileId) {
                setLoading(false)
                return
            }

            try {
                setLoading(true)
                const res = await previewFile(fileId)
                const url = res?.data || ''

                if (!url) {
                    throw new Error('empty preview url')
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

    const renderContent = () => {
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

    return (
        <div className={style.page}>
            {contextHolder}
            {renderContent()}
        </div>
    )
}

export const MemoPreview = memo(Preview)
