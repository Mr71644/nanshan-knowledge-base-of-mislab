import { memo, useState, useRef, useEffect } from 'react'
import { theme, Layout, Form, Input, Spin, FloatButton, Tooltip, Button, Space, Modal } from 'antd'
import { HighlightOutlined, RollbackOutlined, SaveOutlined, WarningOutlined, LoadingOutlined } from '@ant-design/icons'
import { useNavigate, useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import useMarkDownToolbar, { toolbarButtons, insertText } from '@/hooks/useMarkDownTooBar'
import { formatDate } from '@/utils';
import { useMessage } from '@/hooks/useMessage';
import { getContentDetail, editContent } from '@/apis/content';
import { uploadMarkdownImage } from '@/apis/image';
import HtmlContent from '@/components/HtmlContent'
import { isHtmlContent } from '@/utils/contentType'
import { convertHtmlToMarkdown } from '@/utils/htmlToMarkdown'
import { migrateBase64Images } from '@/utils/migrateImages'
import style from './index.module.css'

const { Content } = Layout

const MarkdownToolbar = ({ textareaRef, onChange, onImageUpload }) => {
    const handleClick = (button) => {
        if (button.type === 'divider') return

        if (button.isImage) {
            onImageUpload(button, (url) => {
                if (url) {
                    const insertText = `![${button.placeholder}](${url})`
                    const textarea = textareaRef.current
                    if (textarea) {
                        const start = textarea.selectionStart
                        const end = textarea.selectionEnd
                        const text = textarea.value
                        const newText = text.substring(0, start) + insertText + text.substring(end)
                        onChange(newText)
                        setTimeout(() => {
                            textarea.focus()
                            textarea.setSelectionRange(start + insertText.length, start + insertText.length)
                        }, 0)
                    }
                } else {
                }
            })
            return
        }

        // 处理链接按钮点击
        if (button.title === '链接') {
            const textarea = textareaRef.current
            if (textarea) {
                const selectedText = textarea.value.substring(textarea.selectionStart, textarea.selectionEnd)
                const linkText = selectedText || '链接文本'

                // 弹出输入框获取链接 URL
                const url = prompt('请输入链接 URL:', 'http://')
                if (url) {
                    const insertText = `[${linkText}](${url})`
                    const start = textarea.selectionStart
                    const end = textarea.selectionEnd
                    const text = textarea.value
                    const newText = text.substring(0, start) + insertText + text.substring(end)
                    onChange(newText)
                    setTimeout(() => {
                        textarea.focus()
                        textarea.setSelectionRange(start + insertText.length, start + insertText.length)
                    }, 0)
                }
            }
            return
        }

        const result = insertText(textareaRef, button.before, button.after, button.placeholder)
        if (result) {
            onChange(result.newText)
            setTimeout(() => {
                const textarea = textareaRef.current
                if (textarea) {
                    textarea.focus()
                    textarea.setSelectionRange(result.cursorStart, result.cursorEnd)
                }
            }, 0)
        }
    }

    return (
        <div className={style.markdownToolbar}>
            <Space wrap>
                {toolbarButtons.map((button, index) => {
                    if (button.type === 'divider') {
                        return <div key={index} className={style.toolbarDivider} />
                    }
                    return (
                        <Tooltip key={index} title={button.title}>
                            <Button
                                type="text"
                                size="small"
                                onClick={() => handleClick(button)}
                                className={style.toolbarButton}
                            >
                                {button.icon}
                            </Button>
                        </Tooltip>
                    )
                })}
            </Space>
        </div>
    )
}

const Area = () => {
    const {
        token: { colorBgContainer, borderRadiusLG },
    } = theme.useToken();
    const param = useParams()
    const { success, error, contextHolder } = useMessage()
    const { components } = useMarkDownToolbar()
    const [value, setValue] = useState('')
    const [previewValue, setPreviewValue] = useState('')
    const [isEdit, setIsEdit] = useState(false)
    const [isLoading, setIsLoading] = useState(true)
    const [isLegacyHtml, setIsLegacyHtml] = useState(false)
    const [isMigrating, setIsMigrating] = useState(false)
    const [showMigrateModal, setShowMigrateModal] = useState(false)
    const textareaRef = useRef(null)
    const title = useRef('')
    const author = useRef('')
    const time = useRef({})
    const navigate = useNavigate()

    const processMarkdown = (text) => {
        return text.replace(/^(-\s+)(\d+)\s*\./gm, '$1$2\. ')
    }

    useEffect(() => {
        const timer = setTimeout(() => setPreviewValue(value), 300)
        return () => clearTimeout(timer)
    }, [value])

    const handleImageUpload = async (button, callback) => {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = 'image/*'
        input.onchange = async (e) => {
            const file = e.target.files[0]
            if (file) {
                await processImage(file, callback)
            }
        }
        input.click()
    }

    const processImage = async (file, callback) => {
        try {
            // 只传递有效的文件夹 ID，不使用默认值 0
            const uploadParams = { file }
            if (param.folder) {
                // 确保 id 是整数类型
                const folderId = parseInt(param.folder, 10)
                if (!isNaN(folderId) && folderId > 0) {
                    uploadParams.id = folderId
                    uploadParams.folderId = folderId
                }
            }
            const uploadRes = await uploadMarkdownImage(uploadParams)
            // 尝试从响应中提取文件 ID
            let fileId = null
            if (typeof uploadRes === 'string') {
                fileId = uploadRes
            } else if (uploadRes.data) {
                if (uploadRes.data.id) {
                    fileId = uploadRes.data.id
                } else if (uploadRes.data.fileId) {
                    fileId = uploadRes.data.fileId
                } else if (uploadRes.data.file_id) {
                    fileId = uploadRes.data.file_id
                }
            } else if (uploadRes.id) {
                fileId = uploadRes.id
            }

            if (fileId) {
                callback('minio:' + fileId)
            } else {
                const blobUrl = URL.createObjectURL(file)
                callback(blobUrl)
            }
        } catch (e) {
            // 服务器上传失败，使用 blob URL 作为备选
            error({
                content: '图片上传到服务器失败',
                delayTime: 3000
            })
            const blobUrl = URL.createObjectURL(file)
            callback(blobUrl)
        }
    }

    const handlePaste = async (e, textareaRef, onChange) => {
        const clipboardData = e.clipboardData
        const items = clipboardData?.items
        if (items) {
            for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf('image') !== -1) {
                    e.preventDefault()
                    const file = items[i].getAsFile()
                    if (file) {
                        await processImage(file, (url) => {
                            if (url) {
                                insertImageMarkdown(textareaRef, onChange, url)
                            }
                        })
                    }
                    break
                }
            }
        }
    }

    const handleDrop = async (e, textareaRef, onChange) => {
        e.preventDefault()
        const files = e.dataTransfer.files
        if (files.length > 0) {
            for (let i = 0; i < files.length; i++) {
                if (files[i].type.indexOf('image') !== -1) {
                    await processImage(files[i], (url) => {
                        if (url) {
                            insertImageMarkdown(textareaRef, onChange, url)
                        }
                    })
                }
            }
        }
    }

    const insertImageMarkdown = (textareaRef, onChange, url) => {
        const textarea = textareaRef.current
        if (textarea) {
            const start = textarea.selectionStart
            const end = textarea.selectionEnd
            const text = textarea.value
            const insertText = `![图片描述](${url})`
            const newText = text.substring(0, start) + insertText + text.substring(end)
            onChange(newText)
            setTimeout(() => {
                textarea.focus()
                textarea.setSelectionRange(start + insertText.length, start + insertText.length)
            }, 0)
        }
    }

    const getDetail = async (id) => {
        const currentId = id || param.id
        const res = await getContentDetail(currentId)
        const detail = res.data
        title.current = detail.title
        author.current = detail.author
        time.current = {
            createTime: formatDate(detail.createTime),
            updateTime: formatDate(detail.updateTime)
        }
        setValue(detail.content)
        setPreviewValue(detail.content)
        setIsLegacyHtml(isHtmlContent(detail.content))
    }
    const back = () => {
        if (param.folder === 'main') navigate('/home')
        else navigate(`/home/list/${param.folder}`)
    }
    const edit = async ({ title, author, content, id }) => {
        const currentId = id || param.id
        const processedContent = processMarkdown(content)
        await editContent({ title, author, content: processedContent, id: currentId })
        getDetail(currentId)
    }
    const ChangeIsEdit = async () => {
        if (isEdit) {
            try {
                await edit({
                    title: title.current,
                    author: author.current,
                    content: value,
                })
                success({
                    content: '文档更新成功！',
                    delayTime: 0
                })
            } catch (e) {
                error({
                    content: '文档更新失败'
                })
            }
            setIsEdit(false)
        } else {
            if (isLegacyHtml) {
                setShowMigrateModal(true)
            } else {
                setIsEdit(true)
            }
        }
    }

    const handleMigrate = async () => {
        setShowMigrateModal(false)
        setIsMigrating(true)

        try {
            const migratedHtml = await migrateBase64Images(
                value,
                param.folder,
                (current, total) => {
                }
            )

            const markdown = convertHtmlToMarkdown(migratedHtml)
            setValue(markdown)
            setIsLegacyHtml(false)

            await editContent({
                title: title.current,
                author: author.current,
                content: processMarkdown(markdown),
                id: param.id
            })

            success({ content: '文档迁移成功！' })
            setIsEdit(true)
        } catch (e) {
            error({ content: '文档迁移失败，请稍后重试' })
        } finally {
            setIsMigrating(false)
        }
    }
    useEffect(() => {
        const fetchData = async () => {
            try {
                await getDetail();
                setIsLoading(false)
            } catch (e) {
                error({
                    content: '文档获取失败',
                    callBack: () => setIsLoading(false)
                });
            }
        };
        fetchData();
    }, [param.id])

    useEffect(() => {
        if (!isEdit) return;

        const timer = setTimeout(async () => {
            try {
                const processedContent = processMarkdown(value)
                await editContent({
                    title: title.current,
                    author: author.current,
                    content: processedContent,
                    id: param.id
                });
            } catch (e) {
                error({
                    content: '自动保存失败，请手动保存',
                    delayTime: 2000
                });
            }
        }, 2000);

        return () => clearTimeout(timer);
    }, [value, isEdit]);

    return (
        <>
            {contextHolder}
            <Modal
                title="文档格式迁移"
                open={showMigrateModal}
                onOk={handleMigrate}
                onCancel={() => setShowMigrateModal(false)}
                okText="确认迁移"
                cancelText="取消"
            >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <WarningOutlined style={{ color: '#faad14', fontSize: 22, marginTop: 2 }} />
                    <div>
                        <p style={{ margin: 0 }}>
                            此文档使用旧版富文本编辑器创建，迁移后将转换为 Markdown 格式。
                        </p>
                        <p style={{ margin: '8px 0 0' }}>
                            文档中的图片将上传至服务器存储，文档格式转换后<strong>不可恢复</strong>。
                        </p>
                    </div>
                </div>
            </Modal>
            {isMigrating && (
                <div className={style.migratingOverlay}>
                    <Spin indicator={<LoadingOutlined style={{ fontSize: 36 }} />} />
                    <p style={{ marginTop: 16 }}>正在迁移文档格式，请稍候...</p>
                </div>
            )}
            <Layout
                style={{
                    padding: '24px',
                    height: '100vh'
                }}
            >
                <Content
                    style={{
                        paddingLeft: 24,
                        paddingRight: 24,
                        paddingBottom: 24,
                        paddingTop: 6,
                        margin: 0,
                        minHeight: 280,
                        background: colorBgContainer,
                        borderRadius: borderRadiusLG,
                    }}
                >
                    {
                        isLoading ? <Spin size='large' className={style.spin} /> :
                            (
                                isEdit ?
                                    <>
                                        <Form
                                            className={style.editBox}
                                            initialValues={{ title: title.current, author: author.current }}
                                            validateTrigger='onChange'
                                        >
                                            <Form.Item
                                                name='title'
                                                label='文章名称'
                                                rules={[() => ({
                                                    validator(_, value) {
                                                        title.current = value
                                                        return Promise.resolve()
                                                    }
                                                })]}
                                            >
                                                <Input size='large' style={{ width: '90%' }}></Input>
                                            </Form.Item>
                                            <Form.Item
                                                name='author'
                                                label='文章作者'
                                                rules={[() => ({
                                                    validator(_, value) {
                                                        author.current = value
                                                        return Promise.resolve()
                                                    }
                                                })]}
                                            >
                                                <Input size='large' style={{ width: '90%' }}></Input>
                                            </Form.Item>
                                        </Form >
                                        <MarkdownToolbar textareaRef={textareaRef} onChange={setValue} onImageUpload={handleImageUpload} />
                                        <div className={style.markdownContainer}>
                                            <div className={style.markdownEdit}>
                                                <textarea
                                                    ref={textareaRef}
                                                    value={value}
                                                    onChange={(e) => setValue(e.target.value)}
                                                    placeholder="在这里输入 Markdown 内容..."
                                                    className={style.markdownTextarea}
                                                    onPaste={(e) => handlePaste(e, textareaRef, setValue)}
                                                    onDrop={(e) => handleDrop(e, textareaRef, setValue)}
                                                    onDragOver={(e) => e.preventDefault()}
                                                />
                                            </div>
                                            <div className={style.markdownPreview}>
                                                <ReactMarkdown
                                                    remarkPlugins={[remarkGfm]}
                                                    components={components}
                                                    urlTransform={(url) => url}
                                                >
                                                    {processMarkdown(previewValue)}
                                                </ReactMarkdown>
                                            </div>
                                        </div>
                                    </>
                                    :
                                    <>
                                        <div className={style.articleHeader}>
                                            <h1>{title.current}</h1>
                                            <h2>作者：{author.current}</h2>
                                            <h3>创建时间：{time.current.createTime}&nbsp;&nbsp;&nbsp;&nbsp;更新时间：{time.current.updateTime}</h3>
                                        </div>
                                        {isLegacyHtml ? (
                                            <>
                                                <div className={style.legacyBanner}>
                                                    <WarningOutlined />
                                                    此文档为旧版格式，点击编辑按钮可迁移为 Markdown 格式
                                                </div>
                                                <HtmlContent content={value} className={style.contentPreview} />
                                            </>
                                        ) : (
                                            <div className={style.contentPreview}>
                                                <ReactMarkdown
                                                    remarkPlugins={[remarkGfm]}
                                                    components={components}
                                                    urlTransform={(url) => url}
                                                >
                                                    {processMarkdown(value)}
                                                </ReactMarkdown>
                                            </div>
                                        )}
                                    </>

                            )
                    }
                </Content>
                <FloatButton.Group
                    shape="circle"
                    style={{
                        insetInlineEnd: 24,
                        bottom: 24,
                    }}
                >
                    <Tooltip title={isEdit ? "保存并退出编辑" : "进入编辑模式"} placement="left">
                        <FloatButton
                            type="primary"
                            icon={isEdit ? <SaveOutlined /> : <HighlightOutlined />}
                            onClick={ChangeIsEdit}
                            style={{
                                boxShadow: '0 4px 12px rgba(24, 144, 255, 0.3)',
                            }}
                        />
                    </Tooltip>
                    <Tooltip title="返回" placement="left">
                        <FloatButton
                            icon={<RollbackOutlined />}
                            onClick={back}
                            style={{
                                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                            }}
                        />
                    </Tooltip>
                </FloatButton.Group>
            </Layout >
        </>
    )
}

export const MemoContent = memo(Area)