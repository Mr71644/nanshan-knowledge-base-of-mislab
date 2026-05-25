import { memo, useState, useRef, useEffect } from 'react'
import { theme, Layout, Form, Input, FloatButton, Spin, Tooltip } from 'antd'
import { RollbackOutlined, CheckOutlined, UpOutlined, DownOutlined } from '@ant-design/icons'
import { useNavigate, useParams } from 'react-router-dom'
import { useMessage } from '@/hooks/useMessage';
import { addContent } from '@/apis/content';
import TiptapEditor from '@/components/TiptapEditor'
import style from './index.module.css'

const { Content } = Layout

const AddContent = () => {
    const {
        token: { colorBgContainer, borderRadiusLG },
    } = theme.useToken();
    const navigate = useNavigate()
    const param = useParams()
    const { error, loading, contextHolder } = useMessage()
    const [value, setValue] = useState('')
    const [pageLoading, setPageLoading] = useState(false)
    const [headerCollapsed, setHeaderCollapsed] = useState(false)
    const title = useRef('')
    const author = useRef('')
    const uploadHideRef = useRef(null)

    useEffect(() => {
        if (param.folder === 'main') {
            navigate('/home', { replace: true })
        }
    }, [param.folder, navigate])

    const handleUploading = (uploading) => {
        if (uploading) {
            uploadHideRef.current = loading('图片上传中...')
        } else {
            uploadHideRef.current?.()
            uploadHideRef.current = null
        }
    }

    const processMarkdown = (text) => {
        return text.replace(/^(-\s+)(\d+)\s*\./gm, '$1$2\. ')
    }

    const add = async () => {
        try {
            setPageLoading(true)
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
                callBack: () => setPageLoading(false)
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
                        !pageLoading ? (
                            <div className={style.editLayout}>
                                <div className={style.editHeader}>
                                    <div
                                        className={style.editHeaderToggle}
                                        onClick={() => setHeaderCollapsed(c => !c)}
                                    >
                                        {headerCollapsed ? <DownOutlined /> : <UpOutlined />}
                                        <span>{headerCollapsed ? '展开信息' : '收起信息'}</span>
                                    </div>
                                    {!headerCollapsed && (
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
                                        </Form>
                                    )}
                                </div>
                                <div className={style.editContent}>
                                    <TiptapEditor
                                        content={value}
                                        editable={true}
                                        onChange={setValue}
                                        folderId={param.folder}
                                        onError={(msg) => error({ content: msg, delayTime: 3000 })}
                                        onUploading={handleUploading}
                                        fullHeight
                                    />
                                </div>
                            </div>
                        ) : <Spin size='large' className={style.spin} />
                    }
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
                </Content>
            </Layout>
        </>
    )
}

export const MemoAddContent = memo(AddContent)
