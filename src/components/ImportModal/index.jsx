import { memo, useState } from 'react'
import { Modal, Upload, Button, Alert, Table, Space } from 'antd'
import { FileExcelOutlined, DownloadOutlined, InboxOutlined } from '@ant-design/icons'
import { useMessage } from '@/hooks/useMessage'

/**
 * 通用 Excel 批量导入弹窗
 *
 * - 选择 .xlsx/.xls 文件 → 开始导入 → 展示后端返回的 ImportResultVO
 * - 全部成功：success Alert + 关闭
 * - 存在错误行：error Alert + 错误明细表格（行号 + 原因），可换文件重新导入
 * - 支持下载导入模板、通过 children 注入额外字段（如角色导入的上级文件夹选择）
 */
const ImportModal = memo(function ImportModal({
    open,
    title,
    onCancel,
    downloadTemplate,
    onImport,
    onSuccess,
    extraFields,
    accept = '.xlsx,.xls'
}) {
    const { success, error, contextHolder } = useMessage()
    const [file, setFile] = useState(null)
    const [importing, setImporting] = useState(false)
    const [result, setResult] = useState(null) // ImportResultVO | null

    const reset = () => {
        setFile(null)
        setResult(null)
    }

    // 下载导入模板（后端返回 blob）
    const handleTemplateDownload = async () => {
        try {
            const blob = await downloadTemplate()
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = '导入模板.xlsx'
            document.body.appendChild(a)
            a.click()
            a.remove()
            setTimeout(() => URL.revokeObjectURL(url), 1000)
        } catch {
            error({
                content: '模板下载失败'
            })
        }
    }

    const handleImport = async () => {
        if (!file) {
            error({
                content: '请先选择要导入的 Excel 文件'
            })
            return
        }
        setImporting(true)
        try {
            const res = await onImport(file)
            const importResult = res?.data
            setResult(importResult)
            if (importResult?.success) {
                success({
                    content: importResult.message || '导入成功'
                })
                onSuccess?.()
            }
        } catch (e) {
            error({
                content: e.response?.data?.message || '导入失败'
            })
        } finally {
            setImporting(false)
        }
    }

    // 有结果时点击"完成"关闭；无结果时触发导入
    const handleOk = () => {
        if (result) {
            onCancel()
            return
        }
        handleImport()
    }

    return (
        <>
            {contextHolder}
            <Modal
                title={title}
                open={open}
                onOk={handleOk}
                onCancel={onCancel}
                okText={result ? '完成' : '开始导入'}
                cancelText="取消"
                confirmLoading={importing}
                okButtonProps={{ disabled: !file }}
                width={640}
                afterClose={reset}
            >
                <Space direction="vertical" style={{ width: '100%' }} size={12}>
                    {extraFields}

                    <Upload
                        beforeUpload={(rawFile) => {
                            setFile(rawFile)
                            setResult(null)
                            return false
                        }}
                        maxCount={1}
                        accept={accept}
                        fileList={file ? [{ uid: file.uid || file.name, name: file.name, status: 'done' }] : []}
                        onRemove={() => reset()}
                        disabled={importing}
                    >
                        <Button icon={<FileExcelOutlined />}>选择 Excel 文件</Button>
                    </Upload>

                    <Button
                        type="link"
                        size="small"
                        icon={<DownloadOutlined />}
                        onClick={handleTemplateDownload}
                        style={{ paddingLeft: 0 }}
                    >
                        下载导入模板
                    </Button>

                    {result && (result.success ? (
                        <Alert
                            type="success"
                            showIcon
                            message={result.message || '导入成功'}
                            description={`共 ${result.total} 条数据，成功导入 ${result.successCount} 条`}
                        />
                    ) : (
                        <>
                            <Alert
                                type="error"
                                showIcon
                                message={result.message || '导入失败'}
                            />
                            {result.errors && result.errors.length > 0 && (
                                <Table
                                    size="small"
                                    columns={[
                                        { title: '行号', dataIndex: 'rowNum', width: 80 },
                                        { title: '错误原因', dataIndex: 'message' }
                                    ]}
                                    dataSource={result.errors}
                                    rowKey="rowNum"
                                    pagination={false}
                                    scroll={{ y: 220 }}
                                    locale={{ emptyText: '暂无错误明细' }}
                                />
                            )}
                        </>
                    ))}

                    {!result && file && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-ink-secondary)', fontSize: 13 }}>
                            <InboxOutlined />
                            已选择：{file.name}（{(file.size / 1024).toFixed(1)} KB）
                        </div>
                    )}
                </Space>
            </Modal>
        </>
    )
})

export { ImportModal }
