import { memo, useState, useRef, useEffect } from 'react'
import { theme, Layout, Form, Input, Spin } from 'antd'
import { SaveOutlined, UpOutlined, DownOutlined } from '@ant-design/icons'
import { useNavigate, useParams } from 'react-router-dom'
import { useMessage } from '@/hooks/useMessage';
import { addContent } from '@/apis/content';
import TiptapEditor from '@/components/TiptapEditor'
import style from './index.module.less'

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

    const add = async () => {
        try {
            setPageLoading(true)
            let folder = ''
            if (param.folder !== 'main') folder = param.folder
            await addContent({
                title: title.current,
                author: author.current,
                content: value,
                folderId: folder,
                contentType: 'prosemirror'
            })
            if (param.folder === 'main') navigate('/home')
            else navigate(`/home/list/${param.folder}`)
        } catch {
            error({
                content: '添加论文失败',
                callBack: () => setPageLoading(false)
            })
        }
    }
    return (
        <>
            {contextHolder}
            <Layout
                className={style.pageLayout}
                style={{
                    padding: 'var(--layout-padding)',
                }}
            >
                <Content
                    style={{
                        paddingLeft: 'var(--layout-padding)',
                        paddingRight: 'var(--layout-padding)',
                        paddingBottom: 'var(--layout-padding)',
                        paddingTop: 6,
                        margin: 0,
                        minHeight: 280,
                        background: colorBgContainer,
                        borderRadius: borderRadiusLG,
                        height: '100%',
                        display: 'flex',
                        flexDirection: 'column',
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
                                        contentType="prosemirror"
                                        editable={true}
                                        onChange={(v) => setValue(v)}
                                        folderId={param.folder}
                                        isNewDoc
                                        onError={(msg) => error({ content: msg, delayTime: 3000 })}
                                        onUploading={handleUploading}
                                        fullHeight
                                    />
                                </div>
                            </div>
                        ) : <Spin size='large' className={style.spin} />
                    }
                    <div className={style.floatBtns}>
                        <div className={style.editFloatBtn} onClick={add}>
                            <span className={style.editFloatBtnIcon}>
                                <SaveOutlined />
                            </span>
                            <span className={style.editFloatBtnText}>保存并退出</span>
                        </div>
                    </div>
                </Content>
            </Layout>
        </>
    )
}

export const MemoAddContent = memo(AddContent)
