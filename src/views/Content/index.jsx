import { memo, useState, useRef, useEffect } from 'react'
import { theme, Layout, Form, Input, Spin, FloatButton, Tooltip, Modal } from 'antd'
import { HighlightOutlined, RollbackOutlined, SaveOutlined, WarningOutlined, LoadingOutlined, UpOutlined, DownOutlined } from '@ant-design/icons'
import { useNavigate, useParams } from 'react-router-dom'
import { formatDate } from '@/utils';
import { useMessage } from '@/hooks/useMessage';
import { getContentDetail, editContent } from '@/apis/content';
import HtmlContent from '@/components/HtmlContent'
import { isHtmlContent } from '@/utils/contentType'
import { convertHtmlToMarkdown } from '@/utils/htmlToMarkdown'
import { migrateBase64Images } from '@/utils/migrateImages'
import TiptapEditor from '@/components/TiptapEditor'
import style from './index.module.css'

const { Content } = Layout

const Area = () => {
    const {
        token: { colorBgContainer, borderRadiusLG },
    } = theme.useToken();
    const param = useParams()
    const { success, error, contextHolder } = useMessage()
    const [value, setValue] = useState('')
    const [isEdit, setIsEdit] = useState(false)
    const [isLoading, setIsLoading] = useState(true)
    const [isLegacyHtml, setIsLegacyHtml] = useState(false)
    const [isMigrating, setIsMigrating] = useState(false)
    const [showMigrateModal, setShowMigrateModal] = useState(false)
    const [headerCollapsed, setHeaderCollapsed] = useState(false)
    const title = useRef('')
    const author = useRef('')
    const time = useRef({})
    const navigate = useNavigate()

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
                                                content={value}
                                                editable={true}
                                                onChange={setValue}
                                                folderId={param.folder}
                                                onError={(msg) => error({ content: msg, delayTime: 3000 })}
                                                fullHeight
                                            />
                                        </div>
                                    </div>
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
                                                <TiptapEditor content={value} editable={false} />
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
