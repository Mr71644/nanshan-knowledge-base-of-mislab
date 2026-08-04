import { memo, useRef, useState, useEffect, useMemo } from 'react'
import * as XLSX from 'xlsx'
import { useParams } from 'react-router-dom'
import { Drawer, Form, Input, Spin, Modal, Tooltip, Tree, Empty } from 'antd';
import { SaveOutlined, VerticalAlignBottomOutlined, LinkOutlined, MinusSquareOutlined, PlusSquareOutlined, FileOutlined } from '@ant-design/icons'
import { MemoSheet } from '@/components/UniverSheet';
/**
 * Excel 视图说明
 * - 使用 `MemoSheet`（Univer 封装）作为编辑器，父组件通过 `ref` 调用 `getData()` 获取工作簿数据
 * - 页面初始化通过 `getExcelDetail(id)` 获取 title/url（url 存储为 JSON 字符串，解为 workbook 数据）
 * - 保存时调用 `updateExcel`，传回 `title` 与序列化后的 `url`
 * - 导出/下载等功能使用 `xlsx` 库（已在本文件中引入），并与 `convertToExcelFormat` 配合（若需要）
 */
import { useMessage } from '@/hooks/useMessage';
import { getExcelDetail, updateExcel } from '@/apis/excel';
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
    const univerRef = useRef()
    const clickTimeoutRef = useRef(null)
    const excelName = useRef('')
    const { success, error, contextHolder } = useMessage()
    const [data, setData] = useState(false);
    const [title, setTitle] = useState('')
    const [loading, setLoading] = useState(true)
    const [fileDrawerOpen, setFileDrawerOpen] = useState(false)
    const [fileKeyword, setFileKeyword] = useState('')
    const [searchedKeyword, setSearchedKeyword] = useState('')
    const [commonFiles, setCommonFiles] = useState([])
    const [fileLoading, setFileLoading] = useState(false)
    const [expandedKeys, setExpandedKeys] = useState([])
    const [autoExpandParent, setAutoExpandParent] = useState(true)
    const [saving, setSaving] = useState(false)
    // 初始化逻辑
    const getDetail = async (id = param.id) => {
        const res = await getExcelDetail(id)
        const { title, url, createTime, updateTime } = res.data
        setData(JSON.parse(url))
        excelName.current = title
        setTitle(title)
        setLoading(false)
    }
    // 保存逻辑
    const handleSave = async () => {
        try {
            const currentData = univerRef.current?.getData();
            if (!currentData) {
                throw new Error('无法获取工作簿数据');
            }
            await updateExcel({
                title: excelName.current,
                url: JSON.stringify(currentData),
                id: param.id
            })
            success({ content: '保存成功' })
        } catch (e) {
            error({ content: '保存失败' })
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
        // 获取最新的工作簿数据
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
        try {
            getDetail(param.id)
        } catch (e) {
            error({
                content: 'Excel加载失败',
                callBack: () => setLoading(false)
            })
        }
    }, [])
    useEffect(() => {
        const isSearching = Boolean(searchedKeyword)
        if (isSearching) {
            setExpandedKeys(allTreeKeys)
            setAutoExpandParent(true)
            return
        }
        setExpandedKeys([])
    }, [allTreeKeys, searchedKeyword])

    // 编辑后自动保存
    const saveTimeoutRef = useRef(null);
    const handleChange = () => {

        // 使用防抖，避免频繁保存
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }

        saveTimeoutRef.current = setTimeout(async () => {
            try {
                setSaving(true)
                const currentData = univerRef.current?.getData();
                if (!currentData) {
                    setSaving(false)
                    return;
                }

                await updateExcel({
                    title: excelName.current,
                    url: JSON.stringify(currentData),
                    id: param.id
                });
            } catch (e) {
                error({
                    content: e.response?.data?.message || '自动保存失败',
                    delayTime: 2000
                });
            } finally {
                setSaving(false)
            }
        }, 1000); // 1秒防抖
    };

    useEffect(() => {
        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }
        };
    }, [])
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
    return (
        <>
            {contextHolder}
            {
                loading
                    ? <Spin size='large' className={style.spin} />
                    : (
                        <div className={style.excelContainer}>
                            <div className={style.titleBar}>
                                <span className={style.titleBarText}>{title || '未命名表格'}{saving && <span className={style.savingIndicator}> 自动保存中...</span>}</span>
                                <div className={style.titleBarActions}>
                                    <Tooltip title="保存表格">
                                        <button className={style.titleBarBtn} onClick={handleSave}>
                                            <SaveOutlined />
                                        </button>
                                    </Tooltip>
                                    <Tooltip title="导出表格">
                                        <button className={style.titleBarBtn} onClick={showModal}>
                                            <VerticalAlignBottomOutlined />
                                        </button>
                                    </Tooltip>
                                    <Tooltip title="插入文件链接">
                                        <button className={style.titleBarBtn} onClick={handleOpenFileDrawer}>
                                            <LinkOutlined />
                                        </button>
                                    </Tooltip>
                                </div>
                            </div>
                            <MemoSheet style={{ flex: 1 }} ref={univerRef} data={data} onChange={handleChange} />
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