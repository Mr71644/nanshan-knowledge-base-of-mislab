import { memo, useRef, useState, useEffect, useMemo } from 'react'
import * as XLSX from 'xlsx'
import { useNavigate, useParams } from 'react-router-dom'
import { Drawer, Form, Input, Spin, Modal, Tooltip, Tree, Empty } from 'antd';
import { SaveOutlined, VerticalAlignBottomOutlined, LinkOutlined, MinusSquareOutlined, PlusSquareOutlined, FileOutlined, HighlightOutlined, LogoutOutlined } from '@ant-design/icons'
import { MemoSheet } from '@/components/UniverSheet';
/**
 * Excel 视图说明
 * - 使用 `MemoSheet`（Univer 封装）作为编辑器，父组件通过 `ref` 调用 `getData()` 获取工作簿数据
 * - 与 Content 一致的两态模型：进入路由默认预览态（不加锁），点击「编辑表格」才 acquire；
 *   刷新后按 sessionStorage token 恢复编辑会话（先 heartbeat 再恢复）
 * - 取消自动保存，只有用户显式点击「保存」才提交（携带 X-Editor-Lock-Token）
 * - 导出基于前端当前内存数据（预览态/锁失效态也可用，用于抢救未保存内容）
 */
import { useMessage } from '@/hooks/useMessage';
import { getExcelDetail, updateExcel } from '@/apis/excel';
import { useEditorLock } from '@/hooks/useEditorLock';
import EditorExitGuard from '@/components/EditorExitGuard';
import UnsavedChangesModal from '@/components/UnsavedChangesModal';
import { getCommonFileList, queryCommonFileList } from '@/apis/file';
import { convertToExcelFormat } from '@/utils';
import style from './index.module.less'

const buildFileTreeData = (list = []) => {
    return (Array.isArray(list) ? list : [])
        .map((item) => {
            const status = Number(item?.status)
            if (status !== 2 && status !== 4) return null

            const children = buildFileTreeData(item?.children || [])
            const isFile = status === 4

            return {
                key: `${status}-${item?.id}-${item?.name || ''}`,
                title: item?.name || `文件 ${item?.id ?? ''}`,
                children: children.length > 0 ? children : undefined,
                isLeaf: isFile,
                selectable: isFile,
                icon: isFile ? <FileOutlined /> : undefined,
                className: isFile ? style.fileLinkItem : style.folderItem,
                raw: item,
            }
        })
        .filter(Boolean)
}

const collectTreeKeys = (nodes = []) => {
    return nodes.reduce((keys, node) => {
        if (!node) return keys
        keys.push(node.key)
        if (node.children?.length) {
            keys.push(...collectTreeKeys(node.children))
        }
        return keys
    }, [])
}

const Excel = () => {
    const param = useParams()
    const navigate = useNavigate()
    const univerRef = useRef()
    const clickTimeoutRef = useRef(null)
    const excelName = useRef('')
    const sheetAreaRef = useRef(null)
    const previewTipTimeRef = useRef(0)
    const { success, error, warn, contextHolder } = useMessage()
    const lock = useEditorLock({ resourceType: 'EXCEL', resourceId: param.id })
    const [data, setData] = useState(false);
    const [title, setTitle] = useState('')
    const [loading, setLoading] = useState(true)
    const [isDirty, setIsDirty] = useState(false)
    const [saveState, setSaveState] = useState('saved') // saved | dirty | saving | failed
    const [exitPromptOpen, setExitPromptOpen] = useState(false)
    const [exitSaving, setExitSaving] = useState(false)
    const [fileDrawerOpen, setFileDrawerOpen] = useState(false)
    const [fileKeyword, setFileKeyword] = useState('')
    const [searchedKeyword, setSearchedKeyword] = useState('')
    const [commonFiles, setCommonFiles] = useState([])
    const [fileLoading, setFileLoading] = useState(false)
    const [expandedKeys, setExpandedKeys] = useState([])
    const [autoExpandParent, setAutoExpandParent] = useState(true)
    const isInitializingRef = useRef(true)

    // 与 Content 一致：只有 acquire 成功（status === 'editing'）才算真正进入编辑，预览态不加锁
    const isEdit = lock.status === 'editing'
    // 编辑布局状态（含只读的锁失效/重连态）
    const inEditUi = lock.status === 'editing' || lock.status === 'reconnecting' || lock.status === 'lockLost'
    // 保存中临时切换为只读，确保提交快照与界面内容一致
    const sheetEditable = isEdit && saveState !== 'saving'

    const listPath = param.folder === 'main' ? '/home' : `/home/list/${param.folder}`
    const saveStatusText = saveState === 'saving'
        ? '保存中...'
        : saveState === 'failed'
            ? '保存失败'
            : isDirty
                ? '有未保存修改'
                : '已保存'

    // 初始化：预览态加载（无锁 GET）
    const getDetail = async (id = param.id) => {
        const res = await getExcelDetail(id)
        const { title, url } = res.data
        setData(JSON.parse(url))
        excelName.current = title
        setTitle(title)
    }
    // 重新拉取服务器内容（丢弃退出后预览回显已保存版本）；表格重建期间屏蔽 onChange 误置脏
    const refreshDetail = async () => {
        isInitializingRef.current = true
        try {
            await getDetail(param.id)
        } finally {
            setTimeout(() => { isInitializingRef.current = false }, 0)
        }
    }
    // 保存逻辑：显式保存，携带锁凭证
    const handleSave = async () => {
        if (lock.status !== 'editing' || !lock.lockToken) {
            return { ok: false, reason: 'no-lock' }
        }
        setSaveState('saving')
        try {
            const currentData = univerRef.current?.getData();
            if (!currentData) {
                throw new Error('无法获取工作簿数据');
            }
            await updateExcel({
                title: excelName.current,
                url: JSON.stringify(currentData),
                id: param.id,
                lockToken: lock.lockToken
            })
            setIsDirty(false)
            setSaveState('saved')
            success({ content: '保存成功', delayTime: 1000 })
            return { ok: true }
        } catch (e) {
            if (e.httpStatus === 423) {
                // 保存返回 423：锁已失效，不得自动重试覆盖，保留当前内存数据
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
    // 进入编辑：先 acquire，成功后才启用编辑器（预览态保持不变）
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
            error({ content: '没有编辑该 Excel 的权限' })
        } else if (res.reason !== 'unauthorized') {
            // 401 已由 request.js 统一处理（清理登录态并跳转登录页）
            error({ content: '无法获取编辑权限，请稍后重试' })
        }
    }
    // 退出编辑回预览：必须释放锁；refresh 为 true 时重新拉取服务器内容回显已保存版本
    const exitToPreview = async ({ refresh = false } = {}) => {
        setIsDirty(false)
        setSaveState('saved')
        await lock.release()
        if (refresh) {
            try {
                await refreshDetail()
            } catch {
                error({ content: '表格内容刷新失败' })
            }
        }
    }

    // 退出编辑按钮：可保存（editing）且有未保存修改时弹三选项确认；锁失效/重连等不可保存状态直接退出
    const handleRequestExit = () => {
        if (isDirty && lock.status === 'editing') {
            setExitPromptOpen(true)
        } else {
            exitToPreview({ refresh: isDirty })
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
        await exitToPreview({ refresh: true })
    }

    const handleExitCancel = () => {
        setExitPromptOpen(false)
    }
    // 导出逻辑
    const [isModalOpen, setIsModalOpen] = useState(false);
    const ExportExcelName = useRef('MISLab-Excel')
    const showModal = () => {
        // 打开对话框时，将当前 Excel 标题设置为默认导出名称
        ExportExcelName.current = title || 'MISLab-Excel';
        setIsModalOpen(true);
    };
    const handleOk = () => {
        setIsModalOpen(false);
        handleExportExcel()
    };
    const handleCancel = () => {
        setIsModalOpen(false);
    };
    const handleExportExcel = () => {
        // 获取最新的工作簿数据（基于前端当前内存内容，用于锁失效时抢救未保存数据）
        const currentData = univerRef.current?.getData();
        if (!currentData || !currentData.sheets) {
            error({ content: '无法获取工作簿数据' });
            return;
        }

        // 创建一个工作簿
        const workbook = XLSX.utils.book_new();

        // 遍历每个工作表并将其添加到工作簿中
        // 注意：0.15.x 版本的 sheets 结构中，键是工作表 ID，不是名称
        Object.keys(currentData.sheets).forEach(sheetId => {
            const sheet = currentData.sheets[sheetId];
            const sheetData = sheet.cellData;
            const excelFormat = convertToExcelFormat(sheetData);
            if (excelFormat['!ref'] === 'A1:\x00-Infinity') excelFormat['!ref'] = 'A1:A2'
            // 使用工作表的 name 属性作为导出的工作表名称
            XLSX.utils.book_append_sheet(workbook, excelFormat, sheet.name);
        });

        XLSX.writeFile(workbook, `${ExportExcelName.current}.xlsx`, { compression: true });
    };
    const getFileLink = (fileItem = {}) => {
        return fileItem.url || fileItem.link || fileItem.fileUrl || fileItem.previewUrl || ''
    }
    const fileTreeData = useMemo(() => buildFileTreeData(commonFiles), [commonFiles])
    const allTreeKeys = useMemo(() => collectTreeKeys(fileTreeData), [fileTreeData])
    const loadCommonFiles = async (keyword = '') => {
        try {
            setFileLoading(true)
            const keywordText = (keyword || '').trim()
            const res = keywordText
                ? await queryCommonFileList({ keyword: keywordText })
                : await getCommonFileList()
            setCommonFiles(Array.isArray(res?.data) ? res.data : [])
        } catch {
            setCommonFiles([])
            error({ content: '普通文件获取失败' })
        } finally {
            setFileLoading(false)
        }
    }
    const handleOpenFileDrawer = () => {
        setFileDrawerOpen(true)
        setFileKeyword('')
        setSearchedKeyword('')
        setExpandedKeys([])
        setAutoExpandParent(true)
        loadCommonFiles('')
    }
    const handleSearchCommonFile = (value) => {
        const keyword = value ?? ''
        setFileKeyword(keyword)
        setSearchedKeyword(keyword.trim())
        loadCommonFiles(keyword)
    }
    const insertExcelHyperlink = (fileItem) => {
        const link = getFileLink(fileItem)
        if (!link) {
            error({ content: '该文件暂无可插入链接' })
            return
        }

        try {
            const workbook = univerRef.current?.getActiveWorkbook()
            if (workbook) {
                const activeSheet = workbook.getActiveSheet()
                const activeRange = activeSheet.getActiveRange()
                if (activeRange) {
                    const title = fileItem.name ? fileItem.name.replace(/"/g, '""') : '链接'
                    activeRange.setValue(`=HYPERLINK("${link}", "${title}")`)
                    success({ content: '已插入链接' })
                } else {
                    error({ content: '请先在左侧表格中选中一个单元格' })
                }
            }
        } catch (e) {
            error({ content: '插入链接失败' })
            console.error('Insert link error:', e)
        }
    }
    const handleSelectFileNode = (_, info) => {
        const fileItem = info?.node?.raw
        if (!fileItem || Number(fileItem?.status) !== 4) return

        if (clickTimeoutRef.current) {
            clearTimeout(clickTimeoutRef.current)
        }
        clickTimeoutRef.current = setTimeout(() => {
            copyFileLink(fileItem)
            clickTimeoutRef.current = null
        }, 250)
    }
    const handleDoubleClickFileNode = (e, node) => {
        if (clickTimeoutRef.current) {
            clearTimeout(clickTimeoutRef.current)
            clickTimeoutRef.current = null
        }
        const fileItem = node?.raw || node?.props?.raw || node
        if (!fileItem || Number(fileItem?.status) !== 4) return
        insertExcelHyperlink(fileItem)
    }
    const handleTreeExpand = (keys) => {
        setExpandedKeys(keys)
        setAutoExpandParent(false)
    }
    const copyFileLink = async (fileItem) => {
        const link = getFileLink(fileItem)
        if (!link) {
            error({ content: '该文件暂无可复制链接' })
            return
        }

        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(link)
            } else {
                const textArea = document.createElement('textarea')
                textArea.value = link
                textArea.style.position = 'fixed'
                textArea.style.opacity = '0'
                document.body.appendChild(textArea)
                textArea.focus()
                textArea.select()
                document.execCommand('copy')
                document.body.removeChild(textArea)
            }
            success({ content: '链接已复制' })
        } catch {
            error({ content: '复制失败' })
        }
    }

    // 初始化：预览态加载（不申请锁），随后按需恢复上次编辑会话
    useEffect(() => {
        let cancelled = false
        const init = async () => {
            try {
                await getDetail(param.id)
            } catch {
                if (!cancelled) {
                    setLoading(false)
                    error({
                        content: 'Excel加载失败',
                        callBack: () => navigate(listPath, { replace: true })
                    })
                }
                return
            }
            if (cancelled) return
            isInitializingRef.current = true
            setTimeout(() => { isInitializingRef.current = false }, 0)
            setLoading(false)
            // 刷新/重进路由恢复编辑会话：先 heartbeat，成功后自动恢复编辑态（不能先 acquire 制造自我锁死）
            const lockStorageKey = `editor-lock:EXCEL:${param.id}`
            const token = sessionStorage.getItem(lockStorageKey)
            if (!token) return
            lock.restore(token).then((res) => {
                if (cancelled) return
                if (res.ok) {
                    isInitializingRef.current = true
                    setTimeout(() => { isInitializingRef.current = false }, 0)
                    setIsDirty(false)
                    setSaveState('saved')
                }
                // 失败：restore 内部已清除残留 token 并保持预览态，用户可点击「编辑表格」重新 acquire
            })
        }
        init()
        return () => { cancelled = true }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- lock/navigate 等每次渲染重建，加入依赖会导致初始化流程重复执行
    }, [param.id])

    useEffect(() => {
        const isSearching = Boolean(searchedKeyword)
        if (isSearching) {
            setExpandedKeys(allTreeKeys)
            setAutoExpandParent(true)
            return
        }
        setExpandedKeys([])
    }, [allTreeKeys, searchedKeyword])

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

    // 说明：Univer 0.15 的 DOM 中不存在 .univer-toolbar 类（历史隐藏代码一直未生效），
    // 也没有运行时收起工具栏的官方 API。预览态工具栏按钮的修改操作由工作簿权限拦截，
    // 弹窗文案已在 UniverSheet 中统一改为预览提示。

    // 编辑变化：立即置脏（不防抖），屏蔽编辑器初始化导致的 onChange，预览态/只读态不置脏
    const handleChange = () => {
        if (isInitializingRef.current) return
        if (lock.status !== 'editing') return
        setIsDirty(true)
        setSaveState('dirty')
    }

    const warnRef = useRef(warn)
    warnRef.current = warn

    // 预览态拦截编辑动作：捕获阶段先于 Univer 处理，直接阻断进入编辑（Univer 自带提示也不会出现），
    // 统一弹出自定义提示。初次进入预览与退出编辑后的预览行为一致。
    useEffect(() => {
        if (inEditUi) return
        const el = sheetAreaRef.current
        if (!el) return
        // 放行复制等组合键与选择/滚动按键，仅拦截会修改内容的输入
        const isEditIntent = (e) => {
            if (e.ctrlKey || e.metaKey || e.altKey) return false
            if (e.key.length === 1) return true
            return ['Enter', 'F2', 'Delete', 'Backspace'].includes(e.key)
        }
        const block = (e) => {
            if (e.type === 'contextmenu') {
                // 仅阻断 Univer 右键菜单（含插入行列等结构操作），保留浏览器原生菜单
                e.stopPropagation()
                return
            }
            if (e.type === 'keydown' && !isEditIntent(e)) return
            e.stopPropagation()
            e.preventDefault()
            const now = Date.now()
            if (now - previewTipTimeRef.current > 1000) {
                previewTipTimeRef.current = now
                warnRef.current?.({ content: '当前为预览状态，请点击编辑按钮进行编辑' })
            }
        }
        el.addEventListener('dblclick', block, true)
        el.addEventListener('keydown', block, true)
        el.addEventListener('contextmenu', block, true)
        return () => {
            el.removeEventListener('dblclick', block, true)
            el.removeEventListener('keydown', block, true)
            el.removeEventListener('contextmenu', block, true)
        }
        // loading 结束后 sheetArea 才渲染进 DOM，必须在这个时机重新附加拦截器
    }, [inEditUi, loading])

    const actionDisabled = saveState === 'saving'
    const actionStyle = (disabled) => disabled
        ? { pointerEvents: 'none', opacity: 0.6 }
        : {}

    // 覆盖层仅作视觉提示（只读由 editable prop 驱动），不阻挡选择/复制，便于抢救内容
    const overlayText = saveState === 'saving'
        ? '保存中...'
        : lock.status === 'lockLost'
            ? '编辑锁已失效，请先复制或导出未保存内容再退出'
            : lock.status === 'reconnecting'
                ? '网络异常，正在重新连接...'
                : ''

    return (
        <>
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
            {
                loading
                    ? <Spin size='large' className={style.spin} />
                    : (
                        <div className={style.excelContainer}>
                            <div className={style.titleBar}>
                                <span className={style.titleBarText}>
                                    {title || '未命名表格'}
                                    <span className={style.statusIndicator}>{inEditUi ? saveStatusText : '预览中'}</span>
                                </span>
                                <div className={style.titleBarActions}>
                                    {isEdit && (
                                        <Tooltip title="保存表格">
                                            <button className={style.titleBarBtn} onClick={handleSave} style={actionStyle(actionDisabled)}>
                                                <SaveOutlined />
                                            </button>
                                        </Tooltip>
                                    )}
                                    {inEditUi && (
                                        <Tooltip title="退出编辑">
                                            <button className={style.titleBarBtn} onClick={handleRequestExit} style={actionStyle(actionDisabled)}>
                                                <LogoutOutlined />
                                            </button>
                                        </Tooltip>
                                    )}
                                    {inEditUi && (
                                        <Tooltip title="插入文件链接">
                                            <button className={style.titleBarBtn} onClick={handleOpenFileDrawer} style={actionStyle(actionDisabled || !isEdit)}>
                                                <LinkOutlined />
                                            </button>
                                        </Tooltip>
                                    )}
                                    <Tooltip title="导出表格">
                                        <button className={style.titleBarBtn} onClick={showModal} style={actionStyle(actionDisabled)}>
                                            <VerticalAlignBottomOutlined />
                                        </button>
                                    </Tooltip>
                                    {!inEditUi && (
                                        <button className={style.primaryBtn} onClick={handleEnterEdit} style={actionStyle(lock.status === 'acquiring')}>
                                            <HighlightOutlined />
                                            <span>{lock.status === 'acquiring' ? '获取编辑权限...' : '编辑表格'}</span>
                                        </button>
                                    )}
                                </div>
                            </div>
                            <div ref={sheetAreaRef} className={style.sheetArea}>
                                <MemoSheet style={{ flex: 1 }} ref={univerRef} data={data} editable={sheetEditable} onChange={handleChange} />
                                {overlayText && (
                                    <div className={`${style.lockOverlay} ${lock.status === 'lockLost' ? style.lockOverlayError : ''}`}>
                                        {overlayText}
                                    </div>
                                )}
                            </div>
                        </div>
                    )
            }
            {/* 保存 / 退出 / 编辑表格等操作按钮已统一放置在顶部标题栏 */}
            <Modal title="请输入导出 Excel 文件的名称：" open={isModalOpen} onOk={handleOk} onCancel={handleCancel} okText="确认" cancelText="取消">
                <Form validateTrigger='onChange' initialValues={{ excel: title }}>
                    <Form.Item name={'excel'}
                        rules={[() => ({
                            validator(_, value) {
                                ExportExcelName.current = value
                                return Promise.resolve()
                            }
                        })]}
                    >
                        <Input />
                    </Form.Item>
                </Form>
            </Modal>
            {/* 页内「退出编辑」三选项确认（有未保存修改时） */}
            <UnsavedChangesModal
                open={exitPromptOpen}
                saving={exitSaving}
                description="退出编辑将丢失未保存的修改，是否保存并退出？"
                onCancel={handleExitCancel}
                onDiscard={handleExitDiscard}
                onSave={handleExitSave}
            />
            <Drawer
                title={(
                    <Input.Search
                        allowClear
                        placeholder="搜索普通文件"
                        enterButton="搜索"
                        value={fileKeyword}
                        onChange={(e) => setFileKeyword(e.target.value)}
                        onSearch={handleSearchCommonFile}
                    />
                )}
                placement='right'
                mask={false}
                onClose={() => setFileDrawerOpen(false)}
                open={fileDrawerOpen}
                width={window.innerWidth < 1280 ? 340 : 420}
            >
                {
                    fileLoading
                        ? <Spin size='large' className={style.drawerSpin} />
                        : (
                            fileTreeData.length === 0
                                ? <Empty description='暂无普通文件' />
                                : (
                                    <Tree
                                        showLine
                                        showIcon
                                        blockNode
                                        treeData={fileTreeData}
                                        expandedKeys={expandedKeys}
                                        autoExpandParent={autoExpandParent}
                                        onExpand={handleTreeExpand}
                                        switcherIcon={({ expanded }) => expanded ? <MinusSquareOutlined /> : <PlusSquareOutlined />}
                                        onSelect={handleSelectFileNode}
                                        onDoubleClick={handleDoubleClickFileNode}
                                    />
                                )
                        )
                }
            </Drawer>
        </>
    )
}

export const MemoExcel = memo(Excel)
