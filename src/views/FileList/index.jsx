import React, { memo, useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Table, Dropdown, Button, Spin, Modal, Form, Input, Space, Popover, Checkbox } from 'antd';
import { FolderOutlined, DeleteOutlined, DownloadOutlined, EllipsisOutlined, EditOutlined, TableOutlined, FileOutlined, PushpinOutlined, SwapOutlined, ExportOutlined } from '@ant-design/icons';
import { Resizable } from 'react-resizable';
import { getFileList, togglePin } from '@/apis/fileList';
import { updateFolder } from '@/apis/folder';
import { delContent, delExcel, delFolder, delFile, delBatch } from '@/apis/delete';
import { downloadSingle, downloadBatch } from '@/utils/download'
import { useMessage } from '@/hooks/useMessage';
import { formatDate } from '@/utils';
import style from './index.module.css'

/**
 * FileList 视图
 * - 显示当前目录下的文件/文件夹/文档/Excel 列表
 * - 数据来自 `src/apis/fileList.js` 的 `getFileList(id)`，返回结构包含 data 数组
 * - 列表项 `record.status` 用于区分类型：1=富文本，2=文件夹，3=Excel，4=普通文件
 * - 操作（删除/重命名/预览/下载）会调用 `src/apis/delete.js`、`src/apis/folder.js` 和 `src/apis/file.js` 中的方法
 * - 点击行会基于 `status` 跳转到对应的详情页（content/excel 或进入文件夹）
 */

const FileList = () => {
    const param = useParams()
    const navigate = useNavigate()
    const location = useLocation()
    const { error, contextHolder } = useMessage()
    const [list, setList] = useState([])
    const [loading, setLoading] = useState(true)
    const [selectedRowKeys, setSelectedRowKeys] = useState([])
    const [selectedRows, setSelectedRows] = useState([])
    const [batchType, setBatchType] = useState(null) // null | 'delete' | 'download'
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [modalLoding, setModalLoading] = useState(false)
    const [currentFolder, setCurrentFolder] = useState('')
    const [downloading, setDownloading] = useState(false)
    const folderName = useRef('')

    // 可拖拽列宽
    const [columnWidths, setColumnWidths] = useState({
        name: 220,
        owner: 100,
        updateTime: 160,
        permission: 80,
        operation: 60,
    })
    const handleResize = useCallback((key) => (e, { size }) => {
        setColumnWidths(prev => ({ ...prev, [key]: Math.max(60, size.width) }))
    }, [])
    const ResizableTitle = useCallback((props) => {
        const { onResize, width, ...restProps } = props
        if (!width) return <th {...restProps} />
        return (
            <Resizable
                width={width}
                height={0}
                onResize={onResize}
                draggableOpts={{ enableUserSelectHack: false }}
            >
                <th {...restProps} />
            </Resizable>
        )
    }, [])

    const getTypeStyle = (status) => {
        const map = {
            1: { cls: style.typeDoc,    icon: <EditOutlined /> },
            2: { cls: style.typeFolder, icon: <FolderOutlined /> },
            3: { cls: style.typeExcel,  icon: <TableOutlined /> },
            4: { cls: style.typeFile,   icon: <FileOutlined /> },
        }
        return map[status] || map[4]
    }
    const columns = [
        {
            title: '名称',
            dataIndex: 'name',
            key: 'name',
            width: columnWidths.name,
            ellipsis: true,
            onHeaderCell: (col) => ({
                width: col.width,
                onResize: handleResize('name'),
            }),
            render: (text, record) => {
                const iconStyle = getTypeStyle(record.status)
                return (
                    <span style={{ display: 'inline-flex', alignItems: 'center', maxWidth: '100%' }}>
                        <span className={`${style.typeIcon} ${iconStyle.cls}`}>
                            {iconStyle.icon}
                        </span>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{text}</span>
                    </span>
                )
            }
        },
        {
            title: '所有者',
            dataIndex: 'owner',
            key: 'owner',
            width: columnWidths.owner,
            onHeaderCell: (col) => ({
                width: col.width,
                onResize: handleResize('owner'),
            }),
        },
        {
            title: '修改时间',
            dataIndex: 'updateTime',
            key: 'updateTime',
            width: columnWidths.updateTime,
            onHeaderCell: (col) => ({
                width: col.width,
                onResize: handleResize('updateTime'),
            }),
        },
        {
            title: '权限',
            key: 'permission',
            width: columnWidths.permission,
            onHeaderCell: (col) => ({
                width: col.width,
                onResize: handleResize('permission'),
            }),
            render: (text, record) => {
                const isEdit = record.permissionType === 'EDIT'
                return (
                    <span
                        className={`${style.permissionTag} ${isEdit ? style.permissionEdit : style.permissionView}`}
                        onClick={(e) => {
                            e.stopPropagation()
                            if (!batchType) handleClick(record)
                        }}
                    >
                        {isEdit ? '可编辑' : '可阅读'}
                    </span>
                )
            }
        },
        {
            title: (
                <div className={style.batchHeader}>
                    {batchType ? (
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
                    ) : (
                        <div className={style.batchBtns}>
                            <span
                                className={style.batchBtn}
                                onClick={() => setBatchType('download')}
                            >
                                <DownloadOutlined />
                                批量下载
                            </span>
                            <span
                                className={style.batchBtn}
                                onClick={() => setBatchType('delete')}
                            >
                                <DeleteOutlined />
                                批量删除
                            </span>
                        </div>
                    )}
                </div>
            ),
            key: 'operation',
            width: columnWidths.operation,
            onHeaderCell: (col) => ({
                width: col.width,
                onResize: handleResize('operation'),
            }),
            render: (text, record) => {
                let menuItems = []
                // 确保 pinned 字段存在且为 true
                const isPinned = record.pinned === true || record.pinned === 'true';

                if (record.status === 1 || record.status === 3) menuItems = [
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

            // 排序：置顶项目排在前面，然后按修改时间降序
            const sortedList = res.data.sort((a, b) => {
                // 确保 pinned 字段存在且为 true
                const aPinned = a.pinned === true || a.pinned === 'true'
                const bPinned = b.pinned === true || b.pinned === 'true'

                // 置顶项目排在前面
                if (aPinned && !bPinned) return -1
                if (!aPinned && bPinned) return 1
                // 都置顶或都不置顶，按修改时间降序
                return new Date(b.updateTime) - new Date(a.updateTime)
            })
            setList(sortedList)
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
            setCurrentFolder(record);
            setIsModalOpen(true);
            folderName.current = record.name;
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
        setModalLoading(true);
        try {
            await updateFolder({ name: folderName.current, folderId: currentFolder.id });
            setIsModalOpen(false);
            setModalLoading(false);
            refreshUrl()
        } catch (e) {
            error({ content: '更名失败' });
            setModalLoading(false);
        }
    };

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
    return (
        <>
            <style>{`
                .ant-checkbox-checked .ant-checkbox-inner {
                    background-color: #5e963c !important;
                    border-color: #5e963c !important;
                }
                .ant-checkbox-wrapper:hover .ant-checkbox-inner,
                .ant-checkbox:hover .ant-checkbox-inner {
                    border-color: #5e963c !important;
                }
                .ant-checkbox-inner {
                    border-color: #b0c4a8 !important;
                }
            `}</style>
            {contextHolder}
            {
                loading
                    ? <Spin size='large' className={style.spin} />
                    : <div className={style.tableWrapper}>
                        {batchType && (
                            <div className={style.batchBar}>
                                <span className={style.batchText}>
                                    已选 <strong>{selectedRowKeys.length}</strong> 项
                                </span>
                                <div className={style.batchActions}>
                                    <span className={style.cancelBtn} onClick={clearSelection}>取消</span>
                                    {batchType === 'download' && (
                                        <span
                                            className={style.confirmBtn}
                                            onClick={selectedRowKeys.length > 0 && !downloading ? handleBatchDownload : undefined}
                                        >
                                            {downloading ? '下载中...' : '批量下载'}
                                        </span>
                                    )}
                                    {batchType === 'delete' && (
                                        <span
                                            className={style.confirmBtn}
                                            onClick={selectedRowKeys.length > 0 ? handleBatchDelete : undefined}
                                        >
                                            移入回收站
                                        </span>
                                    )}
                                </div>
                            </div>
                        )}
                        <Table
                            columns={columns}
                            dataSource={list.map(item => ({ ...item, key: `${item.id}` + `${item.status}`, updateTime: formatDate(item.updateTime) }))}
                            pagination={false}
                            scroll={{ y: 'calc(100vh - 310px)', x: 'max-content' }}
                            rowClassName={(record) => {
                                const isPinned = record.pinned === true || record.pinned === 'true';
                                return isPinned ? style.pinnedRow : '';
                            }}
                            className={style.fileList}
                            components={{
                                header: {
                                    cell: ResizableTitle,
                                },
                            }}
                        />
                    </div>
            }
            <Modal title={'更改文件夹名称'}
                open={isModalOpen}
                onOk={handleOk}
                onCancel={handleCancel}
                okText={'创建'}
                cancelText={'取消'}
                destroyOnClose={true}
                confirmLoading={modalLoding}
            >
                <Form validateTrigger='onChange' colon={false}>
                    <Form.Item name='name' label={'名称'}
                        initialValue={folderName.current}
                        rules={[() => ({
                            validator(_, value) {
                                folderName.current = value
                                return Promise.resolve()
                            }
                        })]}
                    >
                        <Input placeholder="请输入文件夹名称" />
                    </Form.Item>
                </Form>
            </Modal>
        </>
    );
};

export const MemoFileList = memo(FileList);