import { memo, useState, useRef, useEffect } from 'react'
import { theme, Layout, Form, Input, Spin, ConfigProvider, Modal, Button } from 'antd'
import { HighlightOutlined, SaveOutlined, UpOutlined, DownOutlined, VerticalAlignTopOutlined, LogoutOutlined } from '@ant-design/icons'
import { useParams } from 'react-router-dom'
import { formatDate } from '@/utils';
import { useMessage } from '@/hooks/useMessage';
import { getContentDetail, editContent } from '@/apis/content';
import { useEditorLock } from '@/hooks/useEditorLock';
import EditorExitGuard from '@/components/EditorExitGuard';
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
    const lock = useEditorLock({ resourceType: 'TEXT', resourceId: param.id })
    const [value, setValue] = useState('')
    const [isDirty, setIsDirty] = useState(false)
    const [isLoading, setIsLoading] = useState(true)
    const [headerCollapsed, setHeaderCollapsed] = useState(false)
    const [showBackTop, setShowBackTop] = useState(false)
    const [docContentType, setDocContentType] = useState('prosemirror')
    const [saveState, setSaveState] = useState('saved') // saved | dirty | saving | failed
    const [exitPromptOpen, setExitPromptOpen] = useState(false)
    const [exitSaving, setExitSaving] = useState(false)
    const title = useRef('')
    const author = useRef('')
    const time = useRef({})
    const uploadHideRef = useRef(null)
    const scrollRef = useRef(null)
    const isInitializingRef = useRef(true)

    // 编辑态：只有 acquire 成功（status === 'editing'）才算真正进入编辑
    const isEdit = lock.status === 'editing'
    // 渲染编辑布局（含只读的锁失效/重连态）
    const inEditUi = lock.status === 'editing' || lock.status === 'reconnecting' || lock.status === 'lockLost'
    const editorEditable = lock.status === 'editing' && saveState !== 'saving'

    const saveStatusText = saveState === 'saving'
        ? '保存中...'
        : saveState === 'failed'
            ? '保存失败'
            : isDirty
                ? '有未保存修改'
                : '已保存'

    const handleUploading = (uploading) => {
        if (uploading) {
            uploadHideRef.current = loading('图片上传中...')
        } else {
            uploadHideRef.current?.()
            uploadHideRef.current = null
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
        const ct = detail.contentType || 'prosemirror'
        setDocContentType(ct)
        setValue(detail.content)
    }

    // 显式保存：携带锁凭证，只有用户点击「保存 / 保存并退出」才发起，不做任何自动保存
    const handleSave = async () => {
        if (lock.status !== 'editing' || !lock.lockToken) {
            return { ok: false, reason: 'no-lock' }
        }
        setSaveState('saving')
        try {
            await editContent({
                title: title.current,
                author: author.current,
                content: value,
                id: param.id,
                contentType: 'prosemirror',
                lockToken: lock.lockToken
            })
            setIsDirty(false)
            setSaveState('saved')
            success({ content: '保存成功', delayTime: 1000 })
            return { ok: true }
        } catch (e) {
            if (e.httpStatus === 423) {
                // 保存返回 423：锁已失效，不得自动重试覆盖，保留当前未保存内容
                lock.markLockLost()
                setSaveState('failed')
                error({ content: '编辑锁已失效，请先复制或导出未保存内容再退出', delayTime: 3000 })
                return { ok: false, reason: 'lock-lost' }
            }
            if (e.httpStatus === 403) {
                error({ content: '编辑权限已失效', delayTime: 2000 })
            } else {
                error({ content: '保存失败', delayTime: 2000 })
            }
            setSaveState('failed')
            return { ok: false }
        }
    }

    // 进入编辑：先 acquire，成功后才启用编辑器
    const handleEnterEdit = async () => {
        const res = await lock.acquire()
        if (res.ok) {
            isInitializingRef.current = true
            setTimeout(() => { isInitializingRef.current = false }, 0)
            setIsDirty(false)
            setSaveState('saved')
        } else if (res.reason === 'occupied') {
            error({
                content: res.ownedByCurrentUser
                    ? '你已在其他标签页编辑该资源'
                    : `该资源正在由 ${res.owner} 编辑，请稍后重试`,
                delayTime: 3000
            })
        } else if (res.reason === 'forbidden') {
            error({ content: '没有编辑该资源的权限' })
        } else if (res.reason !== 'unauthorized') {
            // 401 已由 request.js 统一处理（清理登录态并跳转登录页）
            error({ content: '无法获取编辑权限，请稍后重试' })
        }
    }

    // 退出编辑回预览：必须释放锁并删除 sessionStorage token
    const exitToPreview = async () => {
        setIsDirty(false)
        setSaveState('saved')
        await lock.release()
    }

    const handleSaveAndExit = async () => {
        const res = await handleSave()
        if (res.ok) {
            await exitToPreview()
        }
    }

    // 退出编辑按钮：可保存（editing）且有未保存修改时弹三选项确认；锁失效/重连等不可保存状态直接退出
    const handleRequestExit = () => {
        if (isDirty && lock.status === 'editing') {
            setExitPromptOpen(true)
        } else {
            exitToPreview()
        }
    }

    const handleExitSave = async () => {
        setExitSaving(true)
        const res = await handleSave()
        setExitSaving(false)
        if (res.ok) {
            setExitPromptOpen(false)
            exitToPreview()
        }
        // 失败（如锁失效）→ 留在编辑页抢救内容
    }

    const handleExitDiscard = async () => {
        setExitPromptOpen(false)
        await exitToPreview()
    }

    const handleExitCancel = () => {
        setExitPromptOpen(false)
    }

    const handleEditorChange = (v) => {
        setValue(v)
        if (!isInitializingRef.current) {
            setIsDirty(true)
            setSaveState('dirty')
        }
    }

    useEffect(() => {
        const fetchData = async () => {
            try {
                await getDetail();
                setIsLoading(false)
            } catch {
                error({
                    content: '文档获取失败',
                    callBack: () => setIsLoading(false)
                });
            }
        };
        fetchData();
    }, [param.id])

    // 刷新/重进路由恢复编辑会话：先 heartbeat，成功后自动恢复编辑态（不能先 acquire 制造自我锁死）
    useEffect(() => {
        const lockStorageKey = `editor-lock:TEXT:${param.id}`
        const token = sessionStorage.getItem(lockStorageKey)
        if (!token) return
        lock.restore(token).then((res) => {
            if (res.ok) {
                isInitializingRef.current = true
                setTimeout(() => { isInitializingRef.current = false }, 0)
                setIsDirty(false)
                setSaveState('saved')
            }
            // 失败：restore 内部已清除残留 token 并保持预览态，用户可正常点击编辑重新 acquire
        })
        // eslint-disable-next-line react-hooks/exhaustive-deps -- lock 对象每次渲染重建，加入依赖会导致恢复流程在每次渲染重复执行
    }, [param.id])

    // 刷新/关闭标签页守卫：有未保存内容时提示（release 依赖服务端租约超时兜底）
    useEffect(() => {
        if (!isDirty) return
        const handler = (event) => {
            event.preventDefault()
            event.returnValue = ''
        }
        window.addEventListener('beforeunload', handler)
        return () => window.removeEventListener('beforeunload', handler)
    }, [isDirty])

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
    }, [isLoading, inEditUi])

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

    const actionDisabled = saveState === 'saving'
    const actionStyle = (disabled) => disabled
        ? { pointerEvents: 'none', opacity: 0.6 }
        : {}

    return (
        <ConfigProvider theme={themeConfig.antdTheme}>
            {contextHolder}
            {/* 应用内路由/浏览器返回拦截 */}
            <EditorExitGuard
                enabled={inEditUi && isDirty}
                onSaveAndExit={async () => {
                    const res = await handleSave()
                    if (res.ok) await lock.release()
                    return res.ok
                }}
                onDiscard={() => lock.release()}
            />
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
                                inEditUi ?
                                    <div className={style.editLayout}>
                                        {lock.status === 'reconnecting' && (
                                            <div className={style.lockBanner}>网络异常，正在重新连接...</div>
                                        )}
                                        {lock.status === 'lockLost' && (
                                            <div className={`${style.lockBanner} ${style.lockBannerError}`}>
                                                编辑锁已失效，请先复制或导出未保存内容再退出
                                            </div>
                                        )}
                                        <div className={style.editHeader}>
                                            <div className={style.editHeaderRow}>
                                                <div
                                                    className={style.editHeaderToggle}
                                                    onClick={() => setHeaderCollapsed(c => !c)}
                                                >
                                                    {headerCollapsed ? <DownOutlined /> : <UpOutlined />}
                                                    <span>{headerCollapsed ? '展开信息' : '收起信息'}</span>
                                                </div>
                                                {isEdit && <span className={style.statusIndicator}>{saveStatusText}</span>}
                                            </div>
                                            {!headerCollapsed && (
                                                <Form
                                                    className={style.editBox}
                                                    initialValues={{ title: title.current, author: author.current }}
                                                    validateTrigger='onChange'
                                                >
                                                    <Form.Item
                                                        name='title'
                                                        label='题目'
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
                                                        label='作者'
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
                                                contentType={docContentType}
                                                editable={editorEditable}
                                                onChange={handleEditorChange}
                                                folderId={param.folder}
                                                lockToken={lock.lockToken}
                                                resourceId={param.id}
                                                isNewDoc={false}
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
                                            <TiptapEditor key="preview" content={value} contentType={docContentType} editable={false} folderId={param.folder} fullHeight />
                                        </div>
                                    </div>

                            )
                    }
                </Content>
                </div>
                <div className={style.floatBtns}>
                    {isEdit ? (
                        <>
                            <div
                                className={style.editFloatBtn}
                                onClick={handleSave}
                                title="保存"
                                style={actionStyle(actionDisabled)}
                            >
                                <span className={style.editFloatBtnIcon}>
                                    <SaveOutlined />
                                </span>
                                <span className={style.editFloatBtnText}>保存</span>
                            </div>
                            <div
                                className={style.editFloatBtn}
                                onClick={handleSaveAndExit}
                                title="保存并退出"
                                style={actionStyle(actionDisabled)}
                            >
                                <span className={style.editFloatBtnIcon}>
                                    <SaveOutlined />
                                </span>
                                <span className={style.editFloatBtnText}>保存并退出</span>
                            </div>
                            <div
                                className={style.exitFloatBtn}
                                onClick={handleRequestExit}
                                title="退出编辑"
                                style={actionStyle(actionDisabled)}
                            >
                                <span className={style.editFloatBtnIcon}>
                                    <LogoutOutlined />
                                </span>
                                <span className={style.editFloatBtnText}>退出编辑</span>
                            </div>
                        </>
                    ) : (
                        inEditUi ? (
                            <div className={style.exitFloatBtn} onClick={handleRequestExit} title="退出编辑">
                                <span className={style.editFloatBtnIcon}>
                                    <LogoutOutlined />
                                </span>
                                <span className={style.editFloatBtnText}>退出编辑</span>
                            </div>
                        ) : (
                            <div
                                className={style.editFloatBtn}
                                onClick={handleEnterEdit}
                                style={actionStyle(lock.status === 'acquiring')}
                            >
                                <span className={style.editFloatBtnIcon}>
                                    {lock.status === 'acquiring' ? <Spin size="small" /> : <HighlightOutlined />}
                                </span>
                                <span className={style.editFloatBtnText}>
                                    {lock.status === 'acquiring' ? '获取编辑权限...' : '编辑文档'}
                                </span>
                            </div>
                        )
                    )}
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
            {/* 页内「退出编辑」三选项确认（有未保存修改时） */}
            <Modal
                open={exitPromptOpen}
                title="有未保存的修改"
                closable={false}
                maskClosable={false}
                onCancel={handleExitCancel}
                footer={[
                    <Button key="cancel" onClick={handleExitCancel} disabled={exitSaving}>取消</Button>,
                    <Button key="discard" danger onClick={handleExitDiscard} disabled={exitSaving}>不保存退出</Button>,
                    <Button key="save" type="primary" onClick={handleExitSave} loading={exitSaving}>保存并退出</Button>,
                ]}
            >
                <div>退出编辑将丢失未保存的修改，是否保存并退出？</div>
            </Modal>
        </ConfigProvider>
    )
}

export const MemoContent = memo(Area)
