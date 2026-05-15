import { memo, useState, useRef } from 'react'
import { theme, Layout, Form, Input, FloatButton, Spin, Tooltip, Button, Space } from 'antd'
import { RollbackOutlined, CheckOutlined } from '@ant-design/icons'
import { useNavigate, useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import useMarkDownToolbar, { toolbarButtons, insertText } from '@/hooks/useMarkDownTooBar'
import { useMessage } from '@/hooks/useMessage';
import { addContent } from '@/apis/content';
import { uploadMarkdownImage } from '@/apis/image';
import style from './index.module.css'

const { Content } = Layout

const MarkdownToolbar = ({ textareaRef, onChange, onImageUpload }) => {
    const handleClick = (button) => {
        if (button.type === 'divider') return

        if (button.isImage) {
            onImageUpload(button, (url) => {
                console.log('Image upload callback received URL:', url?.substring(0, 100) + '...')
                if (url) {
                    const insertText = `![${button.placeholder}](${url})`
                    console.log('Inserting markdown:', insertText)
                    const textarea = textareaRef.current
                    if (textarea) {
                        const start = textarea.selectionStart
                        const end = textarea.selectionEnd
                        const text = textarea.value
                        const newText = text.substring(0, start) + insertText + text.substring(end)
                        console.log('New text:', newText.substring(0, 200) + '...')
                        onChange(newText)
                        setTimeout(() => {
                            textarea.focus()
                            textarea.setSelectionRange(start + insertText.length, start + insertText.length)
                        }, 0)
                    }
                } else {
                    console.error('No URL received in callback')
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

const AddContent = () => {
    const {
        token: { colorBgContainer, borderRadiusLG },
    } = theme.useToken();
    const navigate = useNavigate()
    const param = useParams()
    const { error, contextHolder } = useMessage()
    const { components } = useMarkDownToolbar()
    const [value, setValue] = useState('')
    const [loading, setLoading] = useState(false)
    const textareaRef = useRef(null)
    const title = useRef('')
    const author = useRef('')

    const processMarkdown = (text) => {
        // 处理无序列表中的有序列表标记，添加反斜杠转义
        // 注意：只在无序列表项中处理，避免影响其他内容
        return text.replace(/^(-\s+)(\d+)\s*\./gm, '$1$2\. ')
    }

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
                    console.log('Using folderId:', folderId)
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
                } else {
                    // 打印 data 的所有属性
                    console.log('All data properties:', Object.keys(uploadRes.data))
                    console.log('Data object:', uploadRes.data)
                }
            } else if (uploadRes.id) {
                fileId = uploadRes.id
            }

            if (fileId) {
                callback('minio:' + fileId)
            } else {
                const blobUrl = URL.createObjectURL(file)
                console.log('Using blob URL as fallback:', blobUrl)
                callback(blobUrl)
            }
        } catch (e) {
            // 服务器上传失败，使用 blob URL 作为备选
            error({
                content: '图片上传到服务器失败，已使用本地预览',
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

    const add = async () => {
        try {
            setLoading(true)
            let folder = ''
            if (param.folder !== 'main') folder = param.folder
            const processedContent = processMarkdown(value)
            await addContent({
                title: title.current,
                author: author.current,
                content: processedContent,
                folderId: folder
            })
            if (param.folder === 'main') navigate('/home')
            else navigate(`/home/list/${param.folder}`)
        } catch (e) {
            error({
                content: '添加论文失败',
                callBack: () => setLoading(false)
            })
        }
    }
    const back = () => {
        if (param.folder === 'main') navigate('/home')
        else navigate(`/home/list/${param.folder}`)
    }
    return (
        <>
            {contextHolder}
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
                        !loading ?
                            <>
                                <Form className={style.editBox} validateTrigger='onChange'>
                                    <Form.Item
                                        name='title'
                                        label='论文名称'
                                        rules={[() => ({
                                            validator(_, value) {
                                                title.current = value
                                                return Promise.resolve()
                                            }
                                        })]}
                                    >
                                        <Input size='large' style={{ width: '100%' }}></Input>
                                    </Form.Item>
                                    <Form.Item
                                        name='author'
                                        label='论文作者'
                                        rules={[() => ({
                                            validator(_, value) {
                                                author.current = value
                                                return Promise.resolve()
                                            }
                                        })]}
                                    >
                                        <Input size='large' style={{ width: '100%' }}></Input>
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
                                            {processMarkdown(value)}
                                        </ReactMarkdown>
                                    </div>
                                </div>
                                <FloatButton.Group
                                    shape="circle"
                                    style={{
                                        insetInlineEnd: 24,
                                        bottom: 24,
                                    }}
                                >
                                    <Tooltip title="保存文档" placement="left">
                                        <FloatButton
                                            type="primary"
                                            icon={<CheckOutlined />}
                                            onClick={add}
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
                            </>
                            : <Spin size='large' className={style.spin} />
                    }
                </Content>
            </Layout>
        </>
    )
}

export const MemoAddContent = memo(AddContent)