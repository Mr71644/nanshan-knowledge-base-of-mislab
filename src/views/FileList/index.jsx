import React, { memo, useEffect, useLayoutEffect, useState, useRef, useMemo } from 'react';
import { useParams, useNavigate, useLocation, useOutletContext } from 'react-router-dom';
import { Table, Dropdown, Spin, Modal, Form, Input, Checkbox, Popover, Empty, DatePicker } from 'antd';
import { FolderOutlined, DeleteOutlined, DownloadOutlined, EllipsisOutlined, EditOutlined, TableOutlined, FileOutlined, PushpinOutlined, SwapOutlined, ExportOutlined, FilterOutlined, FilterFilled, CaretDownOutlined } from '@ant-design/icons';
import { getFileList, togglePin } from '@/apis/fileList';
import { delContent, delExcel, delFolder, delFile, delBatch } from '@/apis/delete';
import { downloadSingle, downloadBatch } from '@/utils/download'
import { renameResource } from '@/apis/file'
import { useMessage } from '@/hooks/useMessage';
import { formatDate } from '@/utils';
import style from './index.module.less'

/**
 * FileList 视图
 * - 显示当前目录下的文件/文件夹/文档/Excel 列表
 * - 数据来自 `src/apis/fileList.js` 的 `getFileList(id)`，返回结构包含 data 数组
 * - 列表项 `record.status` 用于区分类型：1=富文本，2=文件夹，3=Excel，4=普通文件
 * - 操作（删除/重命名/预览/下载）会调用 `src/apis/delete.js`、`src/apis/folder.js` 和 `src/apis/file.js` 中的方法
 * - 点击行会基于 `status` 跳转到对应的详情页（content/excel 或进入文件夹）
 */

// 每列默认宽度（初始显示，作为按比例分配容器宽度的基准）与最小宽度（拖拽下限）
const COLUMN_DEFAULTS = { name: 360, owner: 100, updateTime: 160, permission: 80, operation: 60 }
const COLUMN_MINS = { name: 120, owner: 80, updateTime: 120, permission: 70, operation: 52 }
const DEFAULT_SUM = Object.values(COLUMN_DEFAULTS).reduce((a, b) => a + b, 0) // 760

const FileList = () => {
    const param = useParams()
    const navigate = useNavigate()
    const location = useLocation()
    const { error, contextHolder } = useMessage()
    const { batchTrigger, clearBatchTrigger, searchKeyword, searchIndex, onMatchedCountChange } = useOutletContext() || {}
    const [list, setList] = useState([])
    const [loading, setLoading] = useState(true)
    const [selectedRowKeys, setSelectedRowKeys] = useState([])
    const [selectedRows, setSelectedRows] = useState([])
    const [batchType, setBatchType] = useState(null) // null | 'batch' | 'delete' | 'download'
    const [ownerFilter, setOwnerFilter] = useState([]) // 选中的所有者名
    const [dateFilter, setDateFilter] = useState(null) // [dayjs, dayjs] | null
    const [sortOrder, setSortOrder] = useState('desc') // 'desc'=最近→最早(默认) | 'asc'=最早→最近
    const [permissionFilter, setPermissionFilter] = useState([]) // 选中的权限：'EDIT' | 'VIEW'
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [modalLoding, setModalLoading] = useState(false)
    const [currentRecord, setCurrentRecord] = useState(null)
    const [downloading, setDownloading] = useState(false)
    const newName = useRef('')

    /**
     * 获取重命名弹窗中显示的初始名称
     * - type=4（文件）：去掉扩展名
     * - 其他类型：使用原始名称
     */
    const getRenameDisplayName = (record) => {
        if (!record) return ''
        if (record.status === 4) {
            const lastDot = record.name.lastIndexOf('.')
            return lastDot > 0 ? record.name.substring(0, lastDot) : record.name
        }
        return record.name
    }

    const [columnWidths, setColumnWidths] = useState({ ...COLUMN_DEFAULTS })

    // ---------- 列宽拖拽 ----------
    const resizeRef = useRef(null)
    const wrapperRef = useRef(null)
    const initialWidthsApplied = useRef(false)

    useEffect(() => {
        const onMove = (e) => {
            const r = resizeRef.current
            if (!r) return
            setColumnWidths(prev => ({
                ...prev,
                [r.key]: Math.max(COLUMN_MINS[r.key] ?? 60, r.startWidth + (e.clientX - r.startX)),
            }))
        }
        const onUp = () => {
            if (resizeRef.current) {
                resizeRef.current = null
                document.body.style.cursor = ''
                document.body.style.userSelect = ''
            }
        }
        document.addEventListener('mousemove', onMove)
        document.addEventListener('mouseup', onUp)
        return () => {
            document.removeEventListener('mousemove', onMove)
            document.removeEventListener('mouseup', onUp)
        }
    }, [])

    // 初始宽度：首次加载完成后测量容器实际宽度，按各列默认比例分配给每一列，
    // 保证每列都有初始宽度且整体铺满卡片（不留白、无横向滚动）。仅执行一次——
    // 不随文件夹切换重置，用户拖拽结果会被保留。
    useLayoutEffect(() => {
        if (initialWidthsApplied.current || loading) return
        const wrapper = wrapperRef.current
        if (!wrapper) return
        const body = wrapper.querySelector('.ant-table-body') || wrapper
        const containerWidth = body.clientWidth
        if (!containerWidth) return
        const next = {}
        let rest = containerWidth
        // name 放最后吸收舍入差，使总和精确等于容器宽
        ;['owner', 'updateTime', 'permission', 'operation'].forEach(k => {
            const w = Math.max(COLUMN_MINS[k], Math.round(containerWidth * COLUMN_DEFAULTS[k] / DEFAULT_SUM))
            next[k] = w
            rest -= w
        })
        next.name = Math.max(COLUMN_MINS.name, rest)
        setColumnWidths(next)
        initialWidthsApplied.current = true
    }, [loading])

    const renderTitle = (text, colKey) => (
        <div className={style.headerCell}>
            <span>{text}</span>
            <div
                className={style.resizeHandle}
                onMouseDown={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    resizeRef.current = {
                        key: colKey,
                        startX: e.clientX,
                        startWidth: columnWidths[colKey],
                    }
                    document.body.style.cursor = 'col-resize'
                    document.body.style.userSelect = 'none'
                }}
            />
        </div>
    )

    // ---------- 所有者筛选 ----------
    // 从当前列表中提取去重的所有者选项
    const ownerOptions = useMemo(() => {
        const set = new Set()
        list.forEach(item => { if (item.owner) set.add(item.owner) })
        return Array.from(set)
    }, [list])

    // 应用所有者筛选后的列表
    const ownerFilteredList = useMemo(() => {
        if (ownerFilter.length === 0) return list
        return list.filter(item => ownerFilter.includes(item.owner))
    }, [list, ownerFilter])

    // 权限筛选可选项（仅当前列表中实际存在的权限）
    const permissionOptions = useMemo(() => {
        const has = { EDIT: false, VIEW: false }
        list.forEach(item => {
            if (item.permissionType === 'EDIT') has.EDIT = true
            else has.VIEW = true
        })
        const opts = []
        if (has.EDIT) opts.push('EDIT')
        if (has.VIEW) opts.push('VIEW')
        return opts
    }, [list])

    // 叠加权限筛选
    const permissionFilteredList = useMemo(() => {
        if (permissionFilter.length === 0) return ownerFilteredList
        return ownerFilteredList.filter(item => {
            const p = item.permissionType === 'EDIT' ? 'EDIT' : 'VIEW'
            return permissionFilter.includes(p)
        })
    }, [ownerFilteredList, permissionFilter])

    // 叠加日期筛选
    const filteredList = useMemo(() => {
        if (!dateFilter || !dateFilter[0] || !dateFilter[1]) return permissionFilteredList
        const [start, end] = dateFilter
        const startDay = start.startOf('day')
        const endDay = end.endOf('day')
        return permissionFilteredList.filter(item => {
            const t = new Date(item.updateTime)
            return t >= startDay.toDate() && t <= endDay.toDate()
        })
    }, [permissionFilteredList, dateFilter])

    // 排序：置顶项固定置顶且不参与排序，其余项按修改时间排序（默认最近→最早）
    const displayList = useMemo(() => {
        const pinned = []
        const normal = []
        filteredList.forEach(item => {
            const isPinned = item.pinned === true || item.pinned === 'true'
            ;(isPinned ? pinned : normal).push(item)
        })
        normal.sort((a, b) => {
            const diff = new Date(a.updateTime) - new Date(b.updateTime)
            return sortOrder === 'desc' ? -diff : diff
        })
        return [...pinned, ...normal]
    }, [filteredList, sortOrder])

    // 所有者筛选浮层内容
    const ownerFilterContent = (
        <div className={style.ownerFilterPanel}>
            <div className={style.ownerFilterHeader}>
                <span>筛选所有者</span>
                {ownerFilter.length > 0 && (
                    <span className={style.ownerFilterClear} onClick={() => setOwnerFilter([])}>清除</span>
                )}
            </div>
            {ownerOptions.length === 0 ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无数据" />
            ) : (
                <Checkbox.Group
                    value={ownerFilter}
                    onChange={(checked) => setOwnerFilter(checked)}
                    className={style.ownerFilterGroup}
                >
                    {ownerOptions.map(name => (
                        <Checkbox key={name} value={name} className={style.ownerFilterItem}>
                            {name}
                        </Checkbox>
                    ))}
                </Checkbox.Group>
            )}
        </div>
    )

    // 所有者列标题（带筛选图标）
    const renderOwnerTitle = (colKey) => (
        <div className={style.headerCell}>
            <span className={style.ownerTitleText}>
                所有者
                <Popover
                    content={ownerFilterContent}
                    trigger="click"
                    placement="bottomLeft"
                    overlayClassName={style.ownerFilterPopover}
                >
                    <span
                        className={`${style.filterIcon} ${ownerFilter.length > 0 ? style.filterIconActive : ''}`}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {ownerFilter.length > 0 ? <FilterFilled /> : <FilterOutlined />}
                        {ownerFilter.length > 0 && (
                            <span className={style.filterBadge}>{ownerFilter.length}</span>
                        )}
                    </span>
                </Popover>
            </span>
            <div
                className={style.resizeHandle}
                onMouseDown={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    resizeRef.current = {
                        key: colKey,
                        startX: e.clientX,
                        startWidth: columnWidths[colKey],
                    }
                    document.body.style.cursor = 'col-resize'
                    document.body.style.userSelect = 'none'
                }}
            />
        </div>
    )

    // 日期筛选内容
    const dateFilterContent = (
        <div className={style.dateFilterPanel}>
            <div className={style.dateFilterHeader}>
                <span>筛选日期范围</span>
                {dateFilter && (
                    <span className={style.dateFilterClear} onClick={() => setDateFilter(null)}>清除</span>
                )}
            </div>
            <DatePicker.RangePicker
                value={dateFilter}
                onChange={(dates) => setDateFilter(dates?.[0] && dates?.[1] ? dates : null)}
                allowClear
                placeholder={['开始日期', '结束日期']}
                className={style.dateFilterPicker}
            />
        </div>
    )

    // 修改时间列标题（可点击切换排序 + 日期筛选图标）
    const renderDateTitle = (colKey) => (
        <div className={style.headerCell}>
            <span className={style.ownerTitleText}>
                <span
                    className={style.sortLabel}
                    onClick={() => setSortOrder(prev => (prev === 'desc' ? 'asc' : 'desc'))}
                >
                    修改时间
                    <span className={`${style.sortArrow} ${sortOrder === 'asc' ? style.sortArrowAsc : ''}`}>
                        <CaretDownOutlined />
                    </span>
                </span>
                <Popover
                    content={dateFilterContent}
                    trigger="click"
                    placement="bottomLeft"
                    overlayClassName={style.dateFilterPopover}
                >
                    <span
                        className={`${style.filterIcon} ${dateFilter ? style.filterIconActive : ''}`}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {dateFilter ? <FilterFilled /> : <FilterOutlined />}
                        {dateFilter && <span className={style.filterBadge}>1</span>}
                    </span>
                </Popover>
            </span>
            <div
                className={style.resizeHandle}
                onMouseDown={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    resizeRef.current = {
                        key: colKey,
                        startX: e.clientX,
                        startWidth: columnWidths[colKey],
                    }
                    document.body.style.cursor = 'col-resize'
                    document.body.style.userSelect = 'none'
                }}
            />
        </div>
    )

    // 权限筛选浮层内容
    const permissionFilterContent = (
        <div className={style.ownerFilterPanel}>
            <div className={style.ownerFilterHeader}>
                <span>筛选权限</span>
                {permissionFilter.length > 0 && (
                    <span className={style.ownerFilterClear} onClick={() => setPermissionFilter([])}>清除</span>
                )}
            </div>
            {permissionOptions.length === 0 ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无数据" />
            ) : (
                <Checkbox.Group
                    value={permissionFilter}
                    onChange={(checked) => setPermissionFilter(checked)}
                    className={style.ownerFilterGroup}
                >
                    {permissionOptions.map(p => (
                        <Checkbox key={p} value={p} className={style.ownerFilterItem}>
                            {p === 'EDIT' ? '可编辑' : '可阅读'}
                        </Checkbox>
                    ))}
                </Checkbox.Group>
            )}
        </div>
    )

    // 权限列标题（带筛选图标）
    const renderPermissionTitle = (colKey) => (
        <div className={style.headerCell}>
            <span className={style.ownerTitleText}>
                权限
                <Popover
                    content={permissionFilterContent}
                    trigger="click"
                    placement="bottomLeft"
                    overlayClassName={style.ownerFilterPopover}
                >
                    <span
                        className={`${style.filterIcon} ${permissionFilter.length > 0 ? style.filterIconActive : ''}`}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {permissionFilter.length > 0 ? <FilterFilled /> : <FilterOutlined />}
                        {permissionFilter.length > 0 && (
                            <span className={style.filterBadge}>{permissionFilter.length}</span>
                        )}
                    </span>
                </Popover>
            </span>
            <div
                className={style.resizeHandle}
                onMouseDown={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    resizeRef.current = {
                        key: colKey,
                        startX: e.clientX,
                        startWidth: columnWidths[colKey],
                    }
                    document.body.style.cursor = 'col-resize'
                    document.body.style.userSelect = 'none'
                }}
            />
        </div>
    )

    const getTypeStyle = (status) => {
        const map = {
            1: { cls: style.typeDoc,    icon: <EditOutlined /> },
            2: { cls: style.typeFolder, icon: <FolderOutlined /> },
            3: { cls: style.typeExcel,  icon: <TableOutlined /> },
            4: { cls: style.typeFile,   icon: <FileOutlined /> },
        }
        return map[status] || map[4]
    }

    // 列宽总和 —— 作为 scroll.x，保证空数据时表头列宽不塌陷，拖拽时横向滚动区同步变化
    const totalWidth = useMemo(
        () => Object.values(columnWidths).reduce((a, b) => a + b, 0),
        [columnWidths]
    )

    const columns = [
        {
            title: renderTitle('名称', 'name'),
            dataIndex: 'name',
            key: 'name',
            width: columnWidths.name,
            render: (text, record) => {
                const iconStyle = getTypeStyle(record.status)
                const clickable = !batchType
                return (
                    <span style={{ display: 'inline-flex', alignItems: 'center', maxWidth: '100%' }}>
                        <span className={`${style.typeIcon} ${iconStyle.cls}`}>
                            {iconStyle.icon}
                        </span>
                        <span
                            className={`${style.nameText} ${clickable ? style.nameLink : ''}`}
                            onClick={clickable ? (e) => {
                                e.stopPropagation()
                                handleClick(record)
                            } : undefined}
                        >
                            {highlightName(text)}
                        </span>
                    </span>
                )
            }
        },
        {
            title: renderOwnerTitle('owner'),
            dataIndex: 'owner',
            key: 'owner',
            width: columnWidths.owner,
            ellipsis: { showTitle: false },
        },
        {
            title: renderDateTitle('updateTime'),
            dataIndex: 'updateTime',
            key: 'updateTime',
            width: columnWidths.updateTime,
            ellipsis: { showTitle: false },
        },
        {
            title: renderPermissionTitle('permission'),
            key: 'permission',
            width: columnWidths.permission,
            render: (text, record) => {
                const isEdit = record.permissionType === 'EDIT'
                return (
                    <span
                        className={`${style.permissionTag} ${isEdit ? style.permissionEdit : style.permissionView}`}
                    >
                        {isEdit ? '可编辑' : '可阅读'}
                    </span>
                )
            }
        },
        {
            title: (
                <div className={style.headerCell}>
                    {batchType ? (
                        <div className={style.batchHeader}>
                            <Checkbox
                                checked={list.length > 0 && selectedRowKeys.length === list.length}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => {
                                    if (e.target.checked) {
                                        setSelectedRowKeys(list.map(item => `${item.id}${item.status}`))
                                        setSelectedRows([...list])
                                    } else {
                                        setSelectedRowKeys([])
                                        setSelectedRows([])
                                    }
                                }}
                            />
                        </div>
                    ) : <span>操作</span>}
                    <div
                        className={style.resizeHandle}
                        onMouseDown={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            resizeRef.current = {
                                key: 'operation',
                                startX: e.clientX,
                                startWidth: columnWidths.operation,
                            }
                            document.body.style.cursor = 'col-resize'
                            document.body.style.userSelect = 'none'
                        }}
                    />
                </div>
            ),
            key: 'operation',
            width: columnWidths.operation,
            render: (text, record) => {
                let menuItems = []
                // 确保 pinned 字段存在且为 true
                const isPinned = record.pinned === true || record.pinned === 'true';

                if (record.status === 1 || record.status === 3) menuItems = [
                    {
                        key: 'update',
                        icon: <SwapOutlined />,
                        label: (<span className={style.menuItemLabel}>重命名</span>),
                        onClick: () => handleMenuClick('update', record),
                    },
                    {
                        key: 'export',
                        icon: <ExportOutlined />,
                        label: (<span className={style.menuItemLabel}>导出</span>),
                        onClick: () => handleMenuClick('export', record),
                    },
                    { type: 'divider' },
                    {
                        key: isPinned ? 'unpin' : 'pin',
                        icon: <PushpinOutlined />,
                        label: (<span className={style.menuItemLabel}>{isPinned ? '取消置顶' : '置顶'}</span>),
                        onClick: () => handleMenuClick(isPinned ? 'unpin' : 'pin', record),
                    },
                    {
                        key: 'download',
                        icon: <DownloadOutlined />,
                        label: (<span className={style.menuItemLabel}>下载</span>),
                        onClick: () => handleMenuClick('download', record),
                    },
                    { type: 'divider' },
                    {
                        key: 'delete',
                        icon: <DeleteOutlined />,
                        label: (<span className={style.menuItemLabel}>删除</span>),
                        onClick: () => handleMenuClick('delete', record),
                    },
                ]
                if (record.status === 2) menuItems = [
                    {
                        key: 'update',
                        icon: <SwapOutlined />,
                        label: (<span className={style.menuItemLabel}>重命名</span>),
                        onClick: () => handleMenuClick('update', record),
                    },
                    {
                        key: 'export',
                        icon: <ExportOutlined />,
                        label: (<span className={style.menuItemLabel}>导出</span>),
                        onClick: () => handleMenuClick('export', record),
                    },
                    { type: 'divider' },
                    {
                        key: isPinned ? 'unpin' : 'pin',
                        icon: <PushpinOutlined />,
                        label: (<span className={style.menuItemLabel}>{isPinned ? '取消置顶' : '置顶'}</span>),
                        onClick: () => handleMenuClick(isPinned ? 'unpin' : 'pin', record),
                    },
                    {
                        key: 'download',
                        icon: <DownloadOutlined />,
                        label: (<span className={style.menuItemLabel}>下载</span>),
                        onClick: () => handleMenuClick('download', record),
                    },
                    { type: 'divider' },
                    {
                        key: 'delete',
                        icon: <DeleteOutlined />,
                        label: (<span className={style.menuItemLabel}>删除</span>),
                        onClick: () => handleMenuClick('delete', record),
                    },
                ]
                if (record.status === 4) {
                    menuItems = [
                        {
                            key: 'update',
                            icon: <SwapOutlined />,
                            label: (<span className={style.menuItemLabel}>重命名</span>),
                            onClick: () => handleMenuClick('update', record),
                        },
                        {
                            key: 'export',
                            icon: <ExportOutlined />,
                            label: (<span className={style.menuItemLabel}>导出</span>),
                            onClick: () => handleMenuClick('export', record),
                        },
                        {
                            key: 'download',
                            icon: <DownloadOutlined />,
                            label: (<span className={style.menuItemLabel}>下载</span>),
                            onClick: () => handleMenuClick('download', record),
                        },
                        {
                            key: isPinned ? 'unpin' : 'pin',
                            icon: <PushpinOutlined />,
                            label: (<span className={style.menuItemLabel}>{isPinned ? '取消置顶' : '置顶'}</span>),
                            onClick: () => handleMenuClick(isPinned ? 'unpin' : 'pin', record),
                        },
                        { type: 'divider' },
                        {
                            key: 'delete',
                            icon: <DeleteOutlined />,
                            label: (<span className={style.menuItemLabel}>删除</span>),
                            onClick: () => handleMenuClick('delete', record),
                        },
                    ]
                }
                return (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 16 }}>
                        {batchType && (
                            <span onClick={(e) => e.stopPropagation()}>
                                <Checkbox
                                    checked={selectedRowKeys.includes(`${record.id}${record.status}`)}
                                    onChange={() => {
                                        const key = `${record.id}${record.status}`
                                        const isSelected = selectedRowKeys.includes(key)
                                        if (isSelected) {
                                            setSelectedRowKeys(prev => prev.filter(k => k !== key))
                                            setSelectedRows(prev => prev.filter(r => `${r.id}${r.status}` !== key))
                                        } else {
                                            setSelectedRowKeys(prev => [...prev, key])
                                            setSelectedRows(prev => [...prev, record])
                                        }
                                    }}
                                />
                            </span>
                        )}
                        <div onClick={(e) => e.stopPropagation()}>
                            <Dropdown
                                menu={{ items: menuItems }}
                                trigger={['click']}
                                overlayClassName={style.dropdownMenu}
                                placement="bottomRight"
                            >
                                <span className={style.moreBtn}>
                                    <EllipsisOutlined />
                                </span>
                            </Dropdown>
                        </div>
                    </div>
                );
            },
        },
    ];
    const getList = async (id = '') => {
        try {
            setLoading(true)
            const res = await getFileList(id)
            // 排序交由 displayList 处理（按 sortOrder，置顶项不参与排序）
            setList(res.data)
            setLoading(false)
        } catch (e) {
            error({
                content: '数据获取失败'
            })
            setLoading(false)
        }
    }
    const handleSingleDownload = async (record) => {
        try {
            setDownloading(true)
            await downloadSingle(record.status, record.id, record.name)
        } catch (e) {
            error({ content: '下载失败，请检查网络' })
        } finally {
            setDownloading(false)
        }
    }
    const handleBatchDownload = async () => {
        if (selectedRows.length === 0) return
        try {
            setDownloading(true)
            const items = selectedRows.map(r => ({ id: r.id, status: r.status }))
            await downloadBatch(`批量下载_${selectedRows.length}项`, items)
        } catch (e) {
            error({ content: '批量下载失败，请检查网络' })
        } finally {
            setDownloading(false)
        }
    }
    const refreshUrl = () => {
        if (param.id === undefined) navigate(`/home`, { state: { refresh: Date.now() } })
        else navigate(`/home/list/${param.id}`, { state: { refresh: Date.now() } })
    }
    const clearSelection = () => {
        setSelectedRowKeys([])
        setSelectedRows([])
        setBatchType(null)
    }
    const handleBatchDelete = () => {
        Modal.confirm({
            title: '确认删除',
            content: `确定将选中的 ${selectedRows.length} 项移入回收站吗？`,
            okText: '确认',
            cancelText: '取消',
            onOk: async () => {
                try {
                    setLoading(true)
                    const items = selectedRows.map(r => ({ id: r.id, status: r.status }))
                    await delBatch(items)
                    clearSelection()
                    refreshUrl()
                } catch (e) {
                    error({ content: '批量删除失败' })
                }
                if (param.id === undefined) getList()
                else getList(param.id)
            }
        })
    }
    const handleMenuClick = async (action, record) => {
        if (action === 'export') {
            handleSingleDownload(record)
        } else if (action === 'delete') {
            try {
                if (record.status === 1) {
                    setLoading(true)
                    await delContent(record.id)
                }
                if (record.status === 2) {
                    setLoading(true)
                    await delFolder(record.id)
                }
                if (record.status === 3) {
                    setLoading(true)
                    await delExcel(record.id)
                }
                if (record.status === 4) {
                    setLoading(true)
                    await delFile(record.id)
                }
                refreshUrl()
            } catch (e) {
                error({
                    content: '删除失败',
                    callBack: () => setLoading(false)
                })
            }
            if (param.id === undefined) getList()
            else getList(param.id)
        } else if (action === 'update') {
            setCurrentRecord(record);
            newName.current = getRenameDisplayName(record);
            setIsModalOpen(true);
        } else if (action === 'download') {
            handleSingleDownload(record)
        } else if (action === 'pin' || action === 'unpin') {
            try {
                setLoading(true)
                const pin = action === 'pin'
                console.log('Toggling pin for record:', record.id, 'status:', record.status, 'pin:', pin)
                const res = await togglePin(record.id, record.status, pin)
                console.log('Toggle pin response:', res)
                refreshUrl()
            } catch (e) {
                console.error('Toggle pin error:', e)
                console.error('Error details:', e.response?.data || e.message)
                error({
                    content: action === 'pin' ? '置顶失败' : '取消置顶失败',
                    callBack: () => setLoading(false)
                })
            } finally {
                setLoading(false)
            }
            if (param.id === undefined) getList()
            else getList(param.id)
        }
    };
    const handleClick = (record) => {
        if (record.status === 1) {
            const path = param.id === undefined ? `/content/main/${record.id}` : `/content/${param.id}/${record.id}`
            window.open(`${window.location.origin}${window.location.pathname}#${path}`, '_blank')
        }
        if (record.status === 2) {
            navigate(`/home/list/${record.id}`)
        }
        if (record.status === 3) {
            const path = param.id === undefined ? `/excel/main/${record.id}` : `/excel/${param.id}/${record.id}`
            window.open(`${window.location.origin}${window.location.pathname}#${path}`, '_blank')
        }
        if (record.status === 4) {
            const url = `${window.location.origin}${window.location.pathname}#/preview?from=${record.id}&name=${encodeURIComponent(record.name)}`
            window.open(url, '_blank')
        }
    }
    const handleOk = async () => {
        if (!newName.current || !newName.current.trim()) {
            error({ content: '名称不能为空' })
            return
        }
        setModalLoading(true);
        try {
            await renameResource({
                id: currentRecord.id,
                newName: newName.current,
                type: currentRecord.status
            });
            setIsModalOpen(false);
            setModalLoading(false);
            refreshUrl()
        } catch (e) {
            error({ content: '重命名失败' });
            setModalLoading(false);
        }
    };

    /**
     * 获取重命名弹窗标题
     */
    const getRenameModalTitle = (record) => {
        if (!record) return '重命名'
        const map = { 1: '更改文档名称', 2: '更改文件夹名称', 3: '更改 Excel 名称', 4: '更改文件名称' }
        return map[record.status] || '重命名'
    }

    /**
     * 获取重命名弹窗输入框占位符
     */
    const getRenamePlaceholder = (record) => {
        if (!record) return '请输入新名称'
        if (record.status === 4) return '请输入文件名称（不含扩展名）'
        return '请输入新名称'
    }

    const handleCancel = () => {
        setIsModalOpen(false);
    };

    useEffect(() => {
        if (param.id === undefined) getList()
        else getList(param.id)
    }, [param.id])
    useEffect(() => {
        if (location.state?.refresh)
            if (param.id === undefined) getList()
            else getList(param.id)
    }, [location.state])

    // 从 Home 页功能框触发批量模式
    useEffect(() => {
        if (batchTrigger) {
            setBatchType(batchTrigger)
            clearBatchTrigger?.()
        }
    }, [batchTrigger])

    // 切换目录时清除筛选
    useEffect(() => {
        setOwnerFilter([])
        setDateFilter(null)
        setPermissionFilter([])
    }, [param.id])

    // ---------- 搜索匹配 ----------
    const matchKeys = useMemo(() => {
        if (!searchKeyword) return []
        return displayList
            .map(item => `${item.id}${item.status}`)
            .filter((key, i) => displayList[i].name.toLowerCase().includes(searchKeyword))
    }, [displayList, searchKeyword])

    const currentMatchKey = matchKeys.length > 0 && searchIndex < matchKeys.length
        ? matchKeys[searchIndex]
        : null

    // 通知 Home matchedCount
    useEffect(() => {
        onMatchedCountChange?.(matchKeys.length)
    }, [matchKeys.length])

    // 滚动到当前匹配行
    useEffect(() => {
        if (currentMatchKey) {
            // 等 DOM 更新后滚动
            const timer = setTimeout(() => {
                const row = document.querySelector('[data-match-row="true"]')
                row?.scrollIntoView({ block: 'center', behavior: 'smooth' })
            }, 50)
            return () => clearTimeout(timer)
        }
    }, [currentMatchKey])

    // 高亮搜索关键词
    const highlightName = (text) => {
        if (!searchKeyword) return text
        const lowerText = text.toLowerCase()
        const lowerKw = searchKeyword
        const idx = lowerText.indexOf(lowerKw)
        if (idx === -1) return text
        const parts = []
        let lastIdx = 0
        let i = idx
        while (i !== -1) {
            if (i > lastIdx) parts.push(text.slice(lastIdx, i))
            parts.push(<span key={i} className={style.searchHighlight}>{text.slice(i, i + searchKeyword.length)}</span>)
            lastIdx = i + searchKeyword.length
            i = lowerText.indexOf(lowerKw, lastIdx)
        }
        if (lastIdx < text.length) parts.push(text.slice(lastIdx))
        return parts
    }

    return (
        <>
            <style>{`
                .ant-checkbox-checked .ant-checkbox-inner {
                    background-color: var(--color-accent) !important;
                    border-color: var(--color-accent) !important;
                }
                .ant-checkbox-wrapper:hover .ant-checkbox-inner,
                .ant-checkbox:hover .ant-checkbox-inner {
                    border-color: var(--color-accent) !important;
                }
                .ant-checkbox-inner {
                    border-color: var(--color-icon-sep) !important;
                }
            `}</style>
            {contextHolder}
            {
                loading
                    ? <Spin size='large' className={style.spin} />
                    : <div className={style.tableWrapper} ref={wrapperRef}>
                        {batchType && (
                            <div className={style.batchBar}>
                                <span className={style.batchText}>
                                    已选 <strong>{selectedRowKeys.length}</strong> 项
                                </span>
                                <div className={style.batchActions}>
                                    <span className={style.cancelBtn} onClick={clearSelection}>取消</span>
                                    <span
                                        className={style.confirmBtn}
                                        onClick={selectedRowKeys.length > 0 && !downloading ? handleBatchDownload : undefined}
                                    >
                                        {downloading ? '下载中...' : '批量下载'}
                                    </span>
                                    <span
                                        className={style.confirmBtn}
                                        onClick={selectedRowKeys.length > 0 ? handleBatchDelete : undefined}
                                    >
                                        移入回收站
                                    </span>
                                </div>
                            </div>
                        )}
                        <Table
                            columns={columns}
                            dataSource={displayList.map(item => ({ ...item, key: `${item.id}` + `${item.status}`, updateTime: formatDate(item.updateTime) }))}
                            pagination={false}
                            scroll={{ y: 'calc(100vh - 250px)', x: totalWidth }}
                            rowClassName={(record) => {
                                const key = `${record.id}${record.status}`
                                const isPinned = record.pinned === true || record.pinned === 'true'
                                const isMatch = key === currentMatchKey
                                const classes = []
                                if (isPinned) classes.push(style.pinnedRow)
                                if (isMatch) classes.push(style.matchRow)
                                return classes.join(' ')
                            }}
                            onRow={(record) => {
                                const key = `${record.id}${record.status}`
                                if (key === currentMatchKey) {
                                    return { 'data-match-row': true }
                                }
                                return {}
                            }}
                            className={style.fileList}
                        />
                    </div>
            }
            <Modal title={getRenameModalTitle(currentRecord)}
                open={isModalOpen}
                onOk={handleOk}
                onCancel={handleCancel}
                okText={'确认'}
                cancelText={'取消'}
                destroyOnClose={true}
                confirmLoading={modalLoding}
            >
                <Form validateTrigger='onChange' colon={false}>
                    <Form.Item name='name' label={'名称'}
                        initialValue={newName.current}
                        rules={[() => ({
                            validator(_, value) {
                                newName.current = value
                                return Promise.resolve()
                            }
                        })]}
                    >
                        <Input placeholder={getRenamePlaceholder(currentRecord)} />
                    </Form.Item>
                </Form>
            </Modal>
        </>
    );
};

export const MemoFileList = memo(FileList);