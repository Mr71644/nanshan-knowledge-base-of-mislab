import { memo, useState, useRef, useEffect } from 'react'
import { theme, Layout, Form, Input, Spin, ConfigProvider } from 'antd'
import { HighlightOutlined, SaveOutlined, UpOutlined, DownOutlined, VerticalAlignTopOutlined } from '@ant-design/icons'
import { useParams } from 'react-router-dom'
import { formatDate } from '@/utils';
import { useMessage } from '@/hooks/useMessage';
import { getContentDetail, editContent } from '@/apis/content';
import TiptapEditor from '@/components/TiptapEditor'
import themeConfig from '#theme'
import style from './index.module.less'

const { Content } = Layout

const Area = () => {
    const {
        token: { colorBgContainer, borderRadiusLG },
    } = theme.useToken();
    const param = useParams()
    const { success, error, loading, contextHolder } = useMessage()
    const [value, setValue] = useState('')
    const [isEdit, setIsEdit] = useState(false)
    const [isLoading, setIsLoading] = useState(true)
    const [headerCollapsed, setHeaderCollapsed] = useState(false)
    const [showBackTop, setShowBackTop] = useState(false)
    const title = useRef('')
    const author = useRef('')
    const time = useRef({})
    const uploadHideRef = useRef(null)
    const scrollRef = useRef(null)

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
            setIsEdit(true)
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

    // 监听文档区域滚动，控制回到顶部按钮显示
    useEffect(() => {
        if (isLoading) return
        const el = scrollRef.current
        if (!el) return

        const findScrollContainer = () => {
            const all = el.querySelectorAll('*')
            for (const node of all) {
                const style = window.getComputedStyle(node)
                if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && node.scrollHeight > node.clientHeight) {
                    return node
                }
            }
            return null
        }

        const tid = setTimeout(() => {
            const container = findScrollContainer()
            if (!container) return
            const handler = () => setShowBackTop(container.scrollTop > 300)
            container.addEventListener('scroll', handler, { passive: true })
            handler()
            // store for cleanup
            container._scrollHandler = handler
        }, 300)

        return () => {
            clearTimeout(tid)
            const container = findScrollContainer()
            if (container && container._scrollHandler) {
                container.removeEventListener('scroll', container._scrollHandler)
            }
        }
    }, [isLoading, isEdit])

    const scrollToTop = () => {
        const el = scrollRef.current
        if (!el) return
        const all = el.querySelectorAll('*')
        for (const node of all) {
            const style = window.getComputedStyle(node)
            if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && node.scrollHeight > node.clientHeight) {
                node.scrollTo({ top: 0, behavior: 'smooth' })
                return
            }
        }
    }

    return (
        <ConfigProvider theme={themeConfig.antdTheme}>
            {contextHolder}
            <Layout
                className={style.pageLayout}
                style={{
                    padding: 'var(--layout-padding)',
                }}
            >
                <div ref={scrollRef} style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
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
                        isLoading ? <Spin size='large' className={style.spin} /> :
                            (
                                isEdit ?
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
                                                </Form>
                                            )}
                                        </div>
                                        <div className={style.editContent}>
                                            <TiptapEditor
                                                key="edit"
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
                                    :
                                    <div className={style.previewLayout}>
                                        <div className={style.articleHeader}>
                                            <h1>{title.current}</h1>
                                            <h2>作者：{author.current}</h2>
                                            <h3>创建时间：{time.current.createTime}&nbsp;&nbsp;&nbsp;&nbsp;更新时间：{time.current.updateTime}</h3>
                                        </div>
                                        <div className={style.contentPreview}>
                                            <TiptapEditor key="preview" content={value} editable={false} folderId={param.folder} fullHeight />
                                        </div>
                                    </div>

                            )
                    }
                </Content>
                </div>
                <div className={style.floatBtns}>
                    <div
                        className={style.editFloatBtn}
                        onClick={ChangeIsEdit}
                    >
                        <span className={style.editFloatBtnIcon}>
                            {isEdit ? <SaveOutlined /> : <HighlightOutlined />}
                        </span>
                        <span className={style.editFloatBtnText}>
                            {isEdit ? '保存并退出' : '编辑文档'}
                        </span>
                    </div>
                    {showBackTop && (
                        <div
                            className={style.backTopBtn}
                            onClick={scrollToTop}
                            title="回到顶部"
                        >
                            <VerticalAlignTopOutlined />
                        </div>
                    )}
                </div>
            </Layout >
        </ConfigProvider>
    )
}

export const MemoContent = memo(Area)
