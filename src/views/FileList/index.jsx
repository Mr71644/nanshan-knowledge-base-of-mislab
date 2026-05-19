import React, { memo, useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Table, Dropdown, Button, Spin, Modal, Form, Input, Space, Popover, Checkbox } from 'antd';
import { FolderOutlined, DeleteOutlined, EllipsisOutlined, EditOutlined, TableOutlined, FileOutlined, EyeOutlined } from '@ant-design/icons';
import { getFileList, togglePin } from '@/apis/fileList';
import { updateFolder } from '@/apis/folder';
import { delContent, delExcel, delFolder, delFile, delBatch } from '@/apis/delete';
import { previewFile } from '@/apis/file';
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
    const [batchMode, setBatchMode] = useState(false)
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [modalLoding, setModalLoading] = useState(false)
    const [currentFolder, setCurrentFolder] = useState('')
    const folderName = useRef('')
    const columns = [
        {
            title: '名称',
            dataIndex: 'name',
            key: 'name',
            render: (text, record) => {
                if (record.status === 1) {
                    return (
                        <span>
                            <EditOutlined style={{ marginRight: 8 }} />
                            {text}
                        </span>
                    )
                } else if (record.status === 2) {
                    return (
                        <span>
                            <FolderOutlined style={{ marginRight: 8 }} />
                            {text}
                        </span>
                    )
                } else if (record.status === 3) {
                    return (
                        <span>
                            <TableOutlined style={{ marginRight: 8 }} />
                            {text}
                        </span>
                    )
                } else if (record.status === 4) {
                    return (
                        <span>
                            <FileOutlined style={{ marginRight: 8 }} />
                            {text}
                        </span>
                    )
                }
            }
        },
        {
            title: '所有者',
            dataIndex: 'owner',
            key: 'owner',
        },
        {
            title: '修改时间',
            dataIndex: 'updateTime',
            key: 'updateTime',
        },
        {
            title: (
                <div style={{ display: 'flex', justifyContent: 'flex-end', cursor: 'pointer' }} onClick={() => { setBatchMode(true) }}>
                    {batchMode ? (
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
                    ) : <DeleteOutlined />}
                </div>
            ),
            key: 'operation',
            width: 100,
            render: (text, record) => {
                let menuItems = []
                // 确保 pinned 字段存在且为 true
                const isPinned = record.pinned === true || record.pinned === 'true';

                if (record.status === 1 || record.status === 3) menuItems = [
                    {
                        key: 'details',
                        label: '详情',
                        onClick: () => handleMenuClick('details', record),
                    },
                    {
                        key: isPinned ? 'unpin' : 'pin',
                        label: isPinned ? '取消置顶' : '置顶',
                        onClick: () => handleMenuClick(isPinned ? 'unpin' : 'pin', record),
                    },
                    {
                        key: 'delete',
                        label: '删除',
                        danger: true,
                        onClick: () => handleMenuClick('delete', record),
                    },
                ]
                if (record.status === 2) menuItems = [
                    {
                        key: 'details',
                        label: '详情',
                        onClick: () => handleMenuClick('details', record),
                    },
                    {
                        key: 'update',
                        label: '更名',
                        onClick: () => handleMenuClick('update', record),
                    },
                    {
                        key: isPinned ? 'unpin' : 'pin',
                        label: isPinned ? '取消置顶' : '置顶',
                        onClick: () => handleMenuClick(isPinned ? 'unpin' : 'pin', record),
                    },
                    {
                        key: 'delete',
                        label: '删除',
                        danger: true,
                        onClick: () => handleMenuClick('delete', record),
                    },
                ]
                if (record.status === 4) menuItems = [
                    {
                        key: 'download',
                        label: '操作',
                        onClick: () => handleMenuClick('download', record),
                    },
                    {
                        key: isPinned ? 'unpin' : 'pin',
                        label: isPinned ? '取消置顶' : '置顶',
                        onClick: () => handleMenuClick(isPinned ? 'unpin' : 'pin', record),
                    },
                    {
                        key: 'delete',
                        label: '删除',
                        danger: true,
                        onClick: () => handleMenuClick('delete', record),
                    },
                ]
                const roleName = () => {
                    if (record.permissionType === 'EDIT') return '可编辑'
                    if (record.permissionType === 'VIEW') return '可阅读'
                }
                return (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 16 }}>
                        {batchMode && (
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
                        <Popover content={roleName()} className={style.eyeIcon}>
                            <span><EyeOutlined /></span>
                        </Popover>
                        <div onClick={(e) => e.stopPropagation()}>
                            <Dropdown
                                menu={{ items: menuItems }}
                                trigger={['click']}
                                overlayStyle={{
                                    width: '60px'
                                }}
                            >
                                <Button
                                    icon={<EllipsisOutlined />}
                                    size="big"
                                    style={{ border: 'none' }}
                                />
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
    const preview = async (id) => {
        try {
            const res = await previewFile(id)
            window.open(res.data, '_blank')
        } catch (e) {
            error({
                content: '下载文件失败，请检查网络'
            })
        }
    }
    const refreshUrl = () => {
        if (param.id === undefined) navigate(`/home`, { state: { refresh: Date.now() } })
        else navigate(`/home/list/${param.id}`, { state: { refresh: Date.now() } })
    }
    const clearSelection = () => {
        setSelectedRowKeys([])
        setSelectedRows([])
        setBatchMode(false)
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
        if (action === 'details') {
            handleClick(record)
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
            preview(record.id)
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
            if (param.id === undefined) navigate(`/content/main/${record.id}`)
            else navigate(`/content/${param.id}/${record.id}`)
        }
        if (record.status === 2) {
            navigate(`/home/list/${record.id}`)
        }
        if (record.status === 3) {
            if (param.id === undefined) navigate(`/excel/main/${record.id}`)
            else navigate(`/excel/${param.id}/${record.id}`)
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
            {contextHolder}
            {
                loading
                    ? <Spin size='large' className={style.spin} />
                    : <div className={style.tableWrapper}>
                        <div className={style.batchBar} style={{ visibility: batchMode ? 'visible' : 'hidden' }}>
                            {selectedRowKeys.length > 0 && (
                                <span className={style.batchText}>
                                    已选择 {selectedRowKeys.length} 项
                                </span>
                            )}
                            <div className={style.batchActions}>
                                <Button size="small" onClick={clearSelection}>取消</Button>
                                <Button size="small" danger type="primary" disabled={selectedRowKeys.length === 0} onClick={handleBatchDelete}>移入回收站</Button>
                            </div>
                        </div>
                        <Table
                            columns={columns}
                            dataSource={list.map(item => ({ ...item, key: `${item.id}` + `${item.status}`, updateTime: formatDate(item.updateTime) }))}
                            pagination={false}
                            scroll={{ y: 'calc(100vh - 260px)' }}
                            onRow={(record) => ({
                                onClick: () => {
                                    if (batchMode) {
                                        const key = `${record.id}${record.status}`
                                        const isSelected = selectedRowKeys.includes(key)
                                        if (isSelected) {
                                            setSelectedRowKeys(prev => prev.filter(k => k !== key))
                                            setSelectedRows(prev => prev.filter(r => `${r.id}${r.status}` !== key))
                                        } else {
                                            setSelectedRowKeys(prev => [...prev, key])
                                            setSelectedRows(prev => [...prev, record])
                                        }
                                        return
                                            }
                                            handleClick(record)
                                        }
                                    })}
                                    rowClassName={(record) => {
                                        const isPinned = record.pinned === true || record.pinned === 'true';
                                        return isPinned ? style.pinnedRow : '';
                                    }}
                                    className={style.fileList}
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