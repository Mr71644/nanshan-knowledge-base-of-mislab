import { memo, useRef, useState, useEffect, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, Drawer, Form, Input, Space, FloatButton, Modal, Spin, Tooltip, Tree, Empty } from 'antd';
import { RollbackOutlined, SaveOutlined, VerticalAlignBottomOutlined, UpOutlined, LinkOutlined, MinusSquareOutlined, PlusSquareOutlined, FileOutlined } from '@ant-design/icons'
import * as XLSX from 'xlsx'
import { MemoSheet } from '@/components/UniverSheet';
import { useMessage } from '@/hooks/useMessage';
import { convertToExcelFormat } from '@/utils';
import { addExcel } from '@/apis/excel';
import { getCommonFileList, queryCommonFileList } from '@/apis/file';
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

const AddExcel = () => {
    const { success, error, contextHolder } = useMessage()
    const [open, setOpen] = useState(false);
    const [data] = useState({})
    const [loading, setLoading] = useState(false)
    const [btnLoading, setBtnLoading] = useState(false)
    const [fileDrawerOpen, setFileDrawerOpen] = useState(false)
    const [fileKeyword, setFileKeyword] = useState('')
    const [searchedKeyword, setSearchedKeyword] = useState('')
    const [commonFiles, setCommonFiles] = useState([])
    const [fileLoading, setFileLoading] = useState(false)
    const [expandedKeys, setExpandedKeys] = useState([])
    const [autoExpandParent, setAutoExpandParent] = useState(true)
    const univerRef = useRef();
    const clickTimeoutRef = useRef(null)
    const excelName = useRef('')
    const navigate = useNavigate()
    const param = useParams()
    const fileTreeData = useMemo(() => buildFileTreeData(commonFiles), [commonFiles])

    useEffect(() => {
        if (param.folder === 'main') {
            navigate('/home', { replace: true })
        }
    }, [param.folder, navigate])
    const allTreeKeys = useMemo(() => collectTreeKeys(fileTreeData), [fileTreeData])

    const getFileLink = (fileItem = {}) => {
        return fileItem.url || fileItem.link || fileItem.fileUrl || fileItem.previewUrl || ''
    }
    const back = () => {
        if (param.folder === 'main') navigate('/home')
        else navigate(`/home/list/${param.folder}`)
    }
    // 新增逻辑
    const showDrawer = () => {
        setOpen(true);
    };
    const onClose = () => {
        setOpen(false);
    };
    const add = async () => {
        try {
            setLoading(true)
            setBtnLoading(true)
            let folder = ''
            if (param.folder !== 'main') folder = param.folder
            await addExcel({
                title: excelName.current,
                url: JSON.stringify(univerRef.current?.getData()),
                folderId: folder
            })
            setBtnLoading(false)
            if (param.folder === 'main') navigate('/home')
            else navigate(`/home/list/${param.folder}`)
        } catch (e) {
            error({
                content: e.response?.data?.message || '新增失败',
                callBack: () => {
                    setBtnLoading(false)
                    setLoading(false)
                }
            })
        }
    }
    // 导出逻辑
    const [isModalOpen, setIsModalOpen] = useState(false);
    const ExportExcelName = useRef('MISLab-Excel')
    const showModal = () => {
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
        // 创建一个工作簿
        const workbook = XLSX.utils.book_new();

        // 遍历每个工作表并将其添加到工作簿中
        // 使用 univerRef.current?.getData() 可以避免Univer组件修改data，从而实现多次进入新增页面可以得到空表
        Object.keys(univerRef.current?.getData().sheets).forEach(sheetName => {
            const sheetData = univerRef.current?.getData().sheets[sheetName].cellData;
            const excelFormat = convertToExcelFormat(sheetData);
            if (excelFormat['!ref'] === 'A1:\x00-Infinity') excelFormat['!ref'] = 'A1:A2'
            // console.log("format", excelFormat);
            XLSX.utils.book_append_sheet(workbook, excelFormat, univerRef.current?.getData().sheets[sheetName].name);
        });
        XLSX.writeFile(workbook, `${ExportExcelName.current}.xlsx`, { compression: true });
    };
    const loadCommonFiles = async (keyword = '') => {
        try {
            setFileLoading(true)
            const keywordText = (keyword || '').trim()
            const res = keywordText
                ? await queryCommonFileList({ keyword: keywordText })
                : await getCommonFileList()
            setCommonFiles(Array.isArray(res?.data) ? res.data : [])
        } catch (e) {
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
        } catch (e) {
            error({ content: '复制失败' })
        }
    }

    useEffect(() => {
        const isSearching = Boolean(searchedKeyword)
        if (isSearching) {
            setExpandedKeys(allTreeKeys)
            setAutoExpandParent(true)
            return
        }
        setExpandedKeys([])
    }, [allTreeKeys, searchedKeyword])

    useEffect(() => {
        if (!loading) {
            setTimeout(() => {
                const toolbar = document.querySelector('.univer-toolbar');
                if (toolbar) {
                    toolbar.style.opacity = '1';
                }
            }, 500);
        }
    }, []);
    return (
        <>
            {contextHolder}
            {
                loading ?
                    <Spin size='large' className={style.spin} /> :
                    <>
                        <MemoSheet style={{ flex: 1 }} ref={univerRef} data={data} />
                        <FloatButton.Group
                            shape="circle"
                            trigger="hover"
                            icon={<UpOutlined />}
                            style={{
                                insetInlineEnd: 24,
                                bottom: 24,
                            }}
                        >
                            <Tooltip title="保存 Excel" placement="left">
                                <FloatButton
                                    type="primary"
                                    icon={<SaveOutlined />}
                                    onClick={showDrawer}
                                    style={{
                                        boxShadow: '0 4px 12px rgba(24, 144, 255, 0.3)',
                                    }}
                                />
                            </Tooltip>
                            <Tooltip title="导出 Excel" placement="left">
                                <FloatButton
                                    icon={<VerticalAlignBottomOutlined />}
                                    onClick={showModal}
                                    style={{
                                        color: '#fff',
                                        boxShadow: '0 4px 12px rgba(82, 196, 26, 0.3)',
                                    }}
                                />
                            </Tooltip>
                            <Tooltip title="插入文件链接" placement="left">
                                <FloatButton
                                    icon={<LinkOutlined />}
                                    onClick={handleOpenFileDrawer}
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
                    </>
            }
            <Drawer
                title="请输入Excel名称"
                placement={'right'}
                closable={false}
                onClose={onClose}
                open={open}
            >
                <Form validateTrigger='onChange'>
                    <Form.Item name={'excel'}
                        rules={[() => ({
                            validator(_, value) {
                                excelName.current = value
                                return Promise.resolve()
                            }
                        })]}
                    >
                        <Input />
                    </Form.Item>
                </Form>
                <Space size={130} style={{ width: '100%' }}>
                    <Button onClick={add} type='primary' style={{ width: 100 }} loading={btnLoading}>确认</Button>
                    <Button onClick={onClose} danger style={{ width: 100 }}>取消</Button>
                </Space>
            </Drawer>
            <Modal title="请输入下载 Excel 文件的名称：" open={isModalOpen} onOk={handleOk} onCancel={handleCancel} okText="确认" cancelText="取消">
                <Form validateTrigger='onChange'>
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

export const MemoAddExcel = memo(AddExcel)