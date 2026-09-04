import { memo, useRef, useState, useEffect, useMemo } from 'react'
import * as XLSX from 'xlsx'
import { useNavigate, useParams } from 'react-router-dom'
import { Drawer, Form, Input, Spin, Modal, Tooltip, Tree, Empty } from 'antd';
import { SaveOutlined, VerticalAlignBottomOutlined, LinkOutlined, MinusSquareOutlined, PlusSquareOutlined, FileOutlined, RollbackOutlined } from '@ant-design/icons'
import { MemoSheet } from '@/components/UniverSheet';
/**
 * Excel 视图说明
 * - 使用 `MemoSheet`（Univer 封装）作为编辑器，父组件通过 `ref` 调用 `getData()` 获取工作簿数据
 * - 进入路由先 acquire 独占编辑锁，成功后 getDetail 再挂载可编辑表格（无预览态）
 * - 取消自动保存，只有用户显式点击「保存」才提交（携带 X-Editor-Lock-Token）
 * - 导出/下载等功能使用 `xlsx` 库（已在本文件中引入），导出基于前端当前内存数据
 */
import { useMessage } from '@/hooks/useMessage';
import { getExcelDetail, updateExcel } from '@/apis/excel';
import { useEditorLock } from '@/hooks/useEditorLock';
import EditorExitGuard from '@/components/EditorExitGuard';
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
    const { success, error, contextHolder } = useMessage()
    const lock = useEditorLock({ resourceType: 'EXCEL', resourceId: param.id })
    const [data, setData] = useState(false);
    const [title, setTitle] = useState('')
    const [loading, setLoading] = useState(true)
    const [isDirty, setIsDirty] = useState(false)
    const [saveState, setSaveState] = useState('saved') // saved | dirty | saving | failed
    const [fileDrawerOpen, setFileDrawerOpen] = useState(false)
    const [fileKeyword, setFileKeyword] = useState('')
    const [searchedKeyword, setSearchedKeyword] = useState('')
    const [commonFiles, setCommonFiles] = useState([])
    const [fileLoading, setFileLoading] = useState(false)
    const [expandedKeys, setExpandedKeys] = useState([])
    const [autoExpandParent, setAutoExpandParent] = useState(true)
    const isInitializingRef = useRef(true)

    const listPath = param.folder === 'main' ? '/home' : `/home/list/${param.folder}`
    const saveStatusText = saveState === 'saving'
        ? '保存中...'
        : saveState === 'failed'
            ? '保存失败'
            : isDirty
                ? '有未保存修改'
                : '已保存'

    // 初始化：先申请独占编辑锁，成功后才加载数据并挂载可编辑表格
    const getDetail = async (id = param.id) => {
        const res = await getExcelDetail(id)
        const { title, url } = res.data
        setData(JSON.parse(url))
        excelName.current = title
        setTitle(title)
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

    // 进入已有 Excel 路由：先 acquire → getDetail → 挂载 MemoSheet（不能先渲染空表格再等锁）
    useEffect(() => {
        let cancelled = false
        const init = async () => {
            const res = await lock.acquire()
            if (cancelled) return
            if (!res.ok) {
                setLoading(false)
                if (res.reason === 'occupied') {
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
                navigate(listPath, { replace: true })
                return
            }
            try {
                await getDetail(param.id)
                if (cancelled) return
                isInitializingRef.current = true
                setTimeout(() => { isInitializingRef.current = false }, 0)
                setLoading(false)
            } catch {
                // acquire 成功但数据加载失败 → best-effort release 再报错离开
                await lock.release()
                if (cancelled) return
                setLoading(false)
                error({
                    content: 'Excel加载失败',
                    callBack: () => navigate(listPath, { replace: true })
                })
            }
        }
        init()
        return () => { cancelled = true }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- lock/navigate 等每次渲染重建，加入依赖会导致 acquire 流程重复执行
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

    useEffect(() => {
        if (!loading) {
            setTimeout(() => {
                const toolbar = document.querySelector('.univer-toolbar');
                if (toolbar) {
                    toolbar.style.opacity = '1';
                }
            }, 500);
        }
    }, [loading]);

    // 返回列表：无未保存修改直接 release + 返回；有未保存修改走导航拦截三选项确认
    const handleBackToList = () => {
        if (isDirty) {
            navigate(listPath)
        } else {
            lock.release()
            navigate(listPath)
        }
    }

    // 编辑变化：立即置脏（不防抖），屏蔽编辑器初始化导致的 onChange
    const handleChange = () => {
        if (!isInitializingRef.current) {
            setIsDirty(true)
            setSaveState('dirty')
        }
    }

    const actionDisabled = saveState === 'saving'
    const actionStyle = (disabled) => disabled
        ? { pointerEvents: 'none', opacity: 0.6 }
        : {}

    // 覆盖层优先级：保存中 > 锁已失效 > 重连中
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
                enabled={isDirty}
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
                                    <span className={style.statusIndicator}>{saveStatusText}</span>
                                </span>
                                <div className={style.titleBarActions}>
                                    <Tooltip title="保存表格">
                                        <button className={style.titleBarBtn} onClick={handleSave} style={actionStyle(actionDisabled)}>
                                            <SaveOutlined />
                                        </button>
                                    </Tooltip>
                                    <Tooltip title="导出表格">
                                        <button className={style.titleBarBtn} onClick={showModal} style={actionStyle(actionDisabled)}>
                                            <VerticalAlignBottomOutlined />
                                        </button>
                                    </Tooltip>
                                    <Tooltip title="插入文件链接">
                                        <button className={style.titleBarBtn} onClick={handleOpenFileDrawer} style={actionStyle(actionDisabled || lock.status !== 'editing')}>
                                            <LinkOutlined />
                                        </button>
                                    </Tooltip>
                                    <button className={style.returnBtn} onClick={handleBackToList} style={actionStyle(actionDisabled)}>
                                        <RollbackOutlined />
                                        <span>返回列表</span>
                                    </button>
                                </div>
                            </div>
                            <div className={style.sheetArea}>
                                <MemoSheet style={{ flex: 1 }} ref={univerRef} data={data} onChange={handleChange} />
                                {overlayText && (
                                    <div className={`${style.lockOverlay} ${lock.status === 'lockLost' ? style.lockOverlayError : ''}`}>
                                        {overlayText}
                                    </div>
                                )}
                            </div>
                        </div>
                    )
            }
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
