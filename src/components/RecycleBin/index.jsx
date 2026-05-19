import React, { useState, useEffect } from 'react';
import { Drawer, Table, Button, Space, Select, Input, Modal, Tree, Popconfirm, Dropdown } from 'antd';
import { EditOutlined, FolderOutlined, TableOutlined, FileOutlined } from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import { getRecycleBinList, restoreRecycleBinItems, purgeRecycleBinItems } from '@/apis/recycleBin';
import { getFolderTree } from '@/apis/folder';
import { useMessage } from '@/hooks/useMessage';
import { formatDate } from '@/utils';
import style from './index.module.css'

const typeOptions = [
    { label: '全部类型', value: undefined },
    { label: '在线文档', value: 1 },
    { label: '文件夹', value: 2 },
    { label: '在线Excel', value: 3 },
    { label: '普通文件', value: 4 },
]

const getIcon = (status) => {
    if (status === 1) return <EditOutlined style={{ marginRight: 8 }} />
    if (status === 2) return <FolderOutlined style={{ marginRight: 8 }} />
    if (status === 3) return <TableOutlined style={{ marginRight: 8 }} />
    if (status === 4) return <FileOutlined style={{ marginRight: 8 }} />
    return null
}

const transformFolderTree = (data) => {
    return data
        .filter(item => item.status === 2)
        .map(item => ({
            title: item.name,
            key: String(item.id),
            children: item.children ? transformFolderTree(item.children) : []
        }))
}

export const RecycleBin = ({ open, onClose }) => {
    const navigate = useNavigate()
    const location = useLocation()
    const { success, error, warn, contextHolder } = useMessage()

    const [list, setList] = useState([])
    const [loading, setLoading] = useState(false)
    const [total, setTotal] = useState(0)
    const [current, setCurrent] = useState(1)
    const [pageSize, setPageSize] = useState(20)
    const [type, setType] = useState(undefined)
    const [keyword, setKeyword] = useState('')

    const [selectedRowKeys, setSelectedRowKeys] = useState([])
    const [selectedRows, setSelectedRows] = useState([])

    const [folderPickerVisible, setFolderPickerVisible] = useState(false)
    const [folderTreeData, setFolderTreeData] = useState([])
    const [targetFolderId, setTargetFolderId] = useState(undefined)
    const [pendingRestoreItems, setPendingRestoreItems] = useState([])
    const [restoreLoading, setRestoreLoading] = useState(false)

    const fetchList = async (page = current, size = pageSize, t = type, kw = keyword) => {
        try {
            setLoading(true)
            const res = await getRecycleBinList({ current: page, pageSize: size, type: t, keyword: kw || undefined })
            const data = res.data
            setList(data.records || [])
            setTotal(data.total || 0)
        } catch (e) {
            error({ content: '回收站列表加载失败' })
        } finally {
            setLoading(false)
        }
    }

    const fetchFolderTree = async () => {
        try {
            const res = await getFolderTree()
            setFolderTreeData(transformFolderTree(res.data.list || []))
        } catch (e) {
            error({ content: '文件夹树加载失败' })
        }
    }

    const refreshParent = () => {
        navigate(location.pathname, { state: { refresh: Date.now() } })
    }

    const openFolderPicker = (items) => {
        setPendingRestoreItems(items)
        setTargetFolderId(undefined)
        fetchFolderTree()
        setFolderPickerVisible(true)
    }

    const handleRestore = async (record) => {
        if (record.canRestore) {
            try {
                setRestoreLoading(true)
                await restoreRecycleBinItems({
                    items: [{ id: record.id, status: record.status }],
                    targetFolderId: null,
                    renameOnConflict: true
                })
                success({ content: '恢复成功' })
                setSelectedRowKeys(prev => prev.filter(k => k !== `${record.id}${record.status}`))
                setSelectedRows(prev => prev.filter(r => `${r.id}${r.status}` !== `${record.id}${record.status}`))
                fetchList()
                refreshParent()
            } catch (e) {
                error({ content: e.response?.data?.message || '恢复失败' })
            } finally {
                setRestoreLoading(false)
            }
        } else {
            openFolderPicker([{ id: record.id, status: record.status }])
        }
    }

    const handlePurge = (record) => {
        Modal.confirm({
            title: '确认彻底删除',
            content: `确定要彻底删除「${record.name}」吗？此操作不可恢复！`,
            okText: '确认删除',
            okButtonProps: { danger: true },
            cancelText: '取消',
            onOk: async () => {
                try {
                    await purgeRecycleBinItems({ items: [{ id: record.id, status: record.status }] })
                    success({ content: '已彻底删除' })
                    setSelectedRowKeys(prev => prev.filter(k => k !== `${record.id}${record.status}`))
                    setSelectedRows(prev => prev.filter(r => `${r.id}${r.status}` !== `${record.id}${record.status}`))
                    fetchList()
                } catch (e) {
                    error({ content: '彻底删除失败' })
                }
            }
        })
    }

    const handleBatchRestore = () => {
        if (selectedRows.length === 0) return
        const hasCannotRestore = selectedRows.some(r => !r.canRestore)
        if (hasCannotRestore) {
            const items = selectedRows.map(r => ({ id: r.id, status: r.status }))
            openFolderPicker(items)
        } else {
            Modal.confirm({
                title: '确认恢复',
                content: `确定将选中的 ${selectedRows.length} 项恢复到原目录吗？`,
                okText: '确认恢复',
                cancelText: '取消',
                onOk: async () => {
                    try {
                        setRestoreLoading(true)
                        const items = selectedRows.map(r => ({ id: r.id, status: r.status }))
                        await restoreRecycleBinItems({ items, targetFolderId: null, renameOnConflict: true })
                        success({ content: `已恢复 ${selectedRows.length} 项` })
                        clearSelection()
                        fetchList()
                        refreshParent()
                    } catch (e) {
                        error({ content: '批量恢复失败' })
                    } finally {
                        setRestoreLoading(false)
                    }
                }
            })
        }
    }

    const handleBatchPurge = () => {
        if (selectedRows.length === 0) return
        Modal.confirm({
            title: '确认彻底删除',
            content: `确定要彻底删除选中的 ${selectedRows.length} 项吗？此操作不可恢复！`,
            okText: '确认删除',
            okButtonProps: { danger: true },
            cancelText: '取消',
            onOk: async () => {
                try {
                    const items = selectedRows.map(r => ({ id: r.id, status: r.status }))
                    await purgeRecycleBinItems({ items })
                    success({ content: `已彻底删除 ${items.length} 项` })
                    clearSelection()
                    fetchList()
                } catch (e) {
                    error({ content: '批量彻底删除失败' })
                }
            }
        })
    }

    const handleEmptyAll = async () => {
        try {
            setLoading(true)
            let allItems = []
            let page = 1
            let hasMore = true
            while (hasMore) {
                const res = await getRecycleBinList({ current: page, pageSize: 100 })
                const records = res.data.records || []
                allItems = [...allItems, ...records]
                hasMore = records.length === 100
                page++
                if (page > 100) break
            }
            if (allItems.length === 0) {
                success({ content: '回收站已为空' })
                setLoading(false)
                return
            }
            const purgeItems = allItems.map(item => ({ id: item.id, status: item.status }))
            await purgeRecycleBinItems({ items: purgeItems })
            success({ content: `已清空回收站，共删除 ${purgeItems.length} 项` })
            fetchList()
            refreshParent()
        } catch (e) {
            error({ content: '清空回收站失败' })
        } finally {
            setLoading(false)
        }
    }

    const handleFolderPickerConfirm = async () => {
        if (targetFolderId === undefined) {
            warn({ content: '请选择目标文件夹' })
            return
        }
        try {
            setRestoreLoading(true)
            // null/undefined 不传 targetFolderId = 恢复到原目录
            // 0 = 恢复到根目录
            // 数字 = 恢复到指定文件夹
            const payload = {
                items: pendingRestoreItems,
                renameOnConflict: true
            }
            if (targetFolderId !== null) {
                payload.targetFolderId = targetFolderId
            }
            await restoreRecycleBinItems(payload)
            success({ content: '恢复成功' })
            setFolderPickerVisible(false)
            clearSelection()
            fetchList()
            refreshParent()
        } catch (e) {
            error({ content: e.response?.data?.message || '恢复失败' })
        } finally {
            setRestoreLoading(false)
        }
    }

    const clearSelection = () => {
        setSelectedRowKeys([])
        setSelectedRows([])
    }

    const handleDrawerClose = () => {
        setType(undefined)
        setKeyword('')
        setCurrent(1)
        clearSelection()
        onClose()
    }

    useEffect(() => {
        if (open) fetchList(1, pageSize, type, keyword)
    }, [open])

    const columns = [
        {
            title: '名称',
            dataIndex: 'name',
            key: 'name',
            render: (text, record) => (
                <span>{getIcon(record.status)}{text}</span>
            )
        },
        {
            title: '原始路径',
            dataIndex: 'originalPath',
            key: 'originalPath',
            render: (text) => <span style={{ color: '#999' }}>{text}</span>
        },
        {
            title: '类型',
            dataIndex: 'typeName',
            key: 'typeName',
        },
        {
            title: '删除人',
            dataIndex: 'deletedBy',
            key: 'deletedBy',
        },
        {
            title: '删除时间',
            dataIndex: 'deletedAt',
            key: 'deletedAt',
            render: (text) => text ? formatDate(text) : '-'
        },
        {
            title: '操作',
            key: 'action',
            width: 220,
            render: (_, record) => {
                const restoreMenuItems = []
                if (record.canRestore) {
                    restoreMenuItems.push({
                        key: 'direct',
                        label: '还原到原目录',
                        onClick: () => handleRestore(record)
                    })
                }
                restoreMenuItems.push({
                    key: 'pickFolder',
                    label: '选择目录还原',
                    onClick: () => openFolderPicker([{ id: record.id, status: record.status }])
                })
                return (
                    <Space size="small">
                        <Dropdown menu={{ items: restoreMenuItems }}>
                            <Button size="small" type="primary" loading={restoreLoading} onClick={(e) => e.stopPropagation()}>
                                还原 ▾
                            </Button>
                        </Dropdown>
                        <Popconfirm
                        title="彻底删除"
                        description={`确定彻底删除「${record.name}」吗？不可恢复！`}
                        onConfirm={(e) => { e?.stopPropagation?.(); handlePurge(record) }}
                        onCancel={(e) => e?.stopPropagation?.()}
                        okText="确认"
                        cancelText="取消"
                        okButtonProps={{ danger: true }}
                    >
                        <Button size="small" danger onClick={(e) => e.stopPropagation()}>
                            彻底删除
                        </Button>
                    </Popconfirm>
                </Space>
                )
            }
        }
    ]

    const rowSelection = {
        selectedRowKeys,
        onChange: (keys, rows) => {
            setSelectedRowKeys(keys)
            setSelectedRows(rows)
        }
    }

    return (
        <>
            {contextHolder}
            <Drawer
                title="回收站"
                placement="right"
                width={960}
                open={open}
                onClose={handleDrawerClose}
                destroyOnClose={true}
            >
                <div className={style.toolbar}>
                    <Space>
                        <Select
                            placeholder="全部类型"
                            allowClear
                            style={{ width: 140 }}
                            value={type}
                            onChange={(val) => {
                                setType(val)
                                setCurrent(1)
                                fetchList(1, pageSize, val, keyword)
                            }}
                            options={typeOptions}
                        />
                        <Input.Search
                            placeholder="搜索文件名"
                            allowClear
                            enterButton
                            onSearch={(val) => {
                                setKeyword(val)
                                setCurrent(1)
                                fetchList(1, pageSize, type, val)
                            }}
                            style={{ width: 200 }}
                        />
                    </Space>
                    <Space>
                        <Button
                            onClick={handleBatchRestore}
                            disabled={selectedRowKeys.length === 0}
                        >
                            批量还原
                        </Button>
                        <Button
                            danger
                            onClick={handleBatchPurge}
                            disabled={selectedRowKeys.length === 0}
                        >
                            批量彻底删除
                        </Button>
                        <Popconfirm
                            title="清空回收站"
                            description="确定要清空回收站吗？所有资源将被彻底删除，不可恢复！"
                            onConfirm={handleEmptyAll}
                            okText="确认清空"
                            cancelText="取消"
                            okButtonProps={{ danger: true }}
                        >
                            <Button danger type="primary">清空回收站</Button>
                        </Popconfirm>
                    </Space>
                </div>

                <Table
                    rowSelection={rowSelection}
                    columns={columns}
                    dataSource={list}
                    rowKey={(record) => `${record.id}${record.status}`}
                    loading={loading}
                    pagination={{
                        current,
                        pageSize,
                        total,
                        showTotal: (t) => `共 ${t} 条`,
                        showSizeChanger: true,
                        showQuickJumper: true,
                        pageSizeOptions: [10, 20, 50, 100],
                        onChange: (page, size) => {
                            setCurrent(page)
                            setPageSize(size)
                            fetchList(page, size, type, keyword)
                        }
                    }}
                    scroll={{ y: 'calc(100vh - 320px)' }}
                />

                <Modal
                    title="选择还原目标文件夹"
                    open={folderPickerVisible}
                    onOk={handleFolderPickerConfirm}
                    onCancel={() => setFolderPickerVisible(false)}
                    okText="确认还原"
                    cancelText="取消"
                    confirmLoading={restoreLoading}
                    width={500}
                >
                    <div className={style.folderPickerTree}>
                        <Tree
                            defaultExpandAll
                            treeData={folderTreeData}
                            onSelect={(keys) => {
                                if (keys.length > 0) setTargetFolderId(Number(keys[0]))
                            }}
                            selectedKeys={targetFolderId !== undefined && targetFolderId !== null && targetFolderId !== 0 ? [String(targetFolderId)] : []}
                        />
                    </div>
                </Modal>
            </Drawer>
        </>
    )
}
