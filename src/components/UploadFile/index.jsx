import { useState } from 'react'
import { Button, Upload, Result, Modal, Progress } from 'antd'
import { CloudUploadOutlined, LoadingOutlined } from '@ant-design/icons'
import { useParams, useNavigate } from 'react-router-dom'
import { useMessage } from '@/hooks/useMessage'
import { uploadFilesBatch, uploadFile } from '@/apis/file'
import style from './index.module.css'

export const UploadFile = ({ value = [], onChange, maxCount = 10, folderId, className }) => {
    const { success, error, contextHolder } = useMessage()
    const param = useParams()
    const navigate = useNavigate()
    const [loading, setLoading] = useState(false)
    const [uploadProgress, setUploadProgress] = useState(0)
    const [selectedFiles, setSelectedFiles] = useState([])
    const [confirmModalVisible, setConfirmModalVisible] = useState(false)

    const getFolderId = () => {
        if (folderId !== undefined && folderId !== null && folderId !== 'undefined' && folderId !== 'null') {
            return folderId
        }
        if (param.id !== undefined && param.id !== 'undefined' && param.id !== 'null' && param.id !== '') {
            return param.id
        }
        return null
    }

    const handleCustomRequest = ({ file, onSuccess }) => {
        const originFile = file.originFileObj || file
        if (!(originFile instanceof File)) {
            error({ content: '文件对象无效' })
            return
        }

        setSelectedFiles(prev => {
            const exists = prev.find(f => f.name === originFile.name && f.size === originFile.size)
            if (exists) {
                error({ content: `文件 "${originFile.name}" 已存在` })
                return prev
            }
            if (prev.length >= maxCount) {
                error({ content: `最多只能上传 ${maxCount} 个文件` })
                return prev
            }
            const newFiles = [...prev, {
                file: originFile,
                name: originFile.name,
                size: originFile.size,
                type: originFile.type,
                uid: file.uid
            }]
            if (newFiles.length > 0) {
                setTimeout(() => setConfirmModalVisible(true), 100)
            }
            return newFiles
        })
        onSuccess('success', file)
    }

    const handleConfirmUpload = async () => {
        if (selectedFiles.length === 0) {
            error({ content: '请先选择要上传的文件' })
            return
        }

        setConfirmModalVisible(false)
        setLoading(true)
        setUploadProgress(0)

        const id = getFolderId()
        const files = selectedFiles.map(f => f.file)

        const progressInterval = setInterval(() => {
            setUploadProgress(prev => {
                if (prev >= 90) {
                    clearInterval(progressInterval)
                    return 90
                }
                return prev + 10
            })
        }, 200)

        try {
            let response
            let uploadResults = []
            // 优先尝试批量上传
            try {
                response = await uploadFilesBatch({ id, files })
                uploadResults = response?.data || []
            } catch (batchError) {
                // 批量失败，改为单个上传
                for (let i = 0; i < files.length; i++) {
                    const file = files[i]
                    setUploadProgress(((i + 1) / files.length) * 100)
                    try {
                        const singleRes = await uploadFile({ id, file })
                        uploadResults.push({
                            id: singleRes?.data?.id || singleRes?.id,
                            url: singleRes?.data?.url || singleRes?.url,
                            name: file.name,
                            owner: singleRes?.data?.owner,
                            createTime: singleRes?.data?.createTime,
                            updateTime: singleRes?.data?.updateTime
                        })
                    } catch (singleError) {
                        uploadResults.push({
                            id: null,
                            url: null,
                            name: file.name
                        })
                    }
                }
                response = { code: 200, data: uploadResults }
            }

            clearInterval(progressInterval)
            setUploadProgress(100)

            if (response && response.code === 200) {
                const successCount = uploadResults.filter(r => r && r.id !== null).length

                onChange?.(selectedFiles.map((file, index) => ({
                    ...file,
                    response: uploadResults[index],
                    status: uploadResults[index]?.id !== null ? 'success' : 'error'
                })))

                success({
                    content: `成功上传 ${successCount} 个文件`,
                    duration: 3,
                    callBack: () => {
                        setLoading(false)
                        setSelectedFiles([])
                        setUploadProgress(0)
                        const refreshState = { state: { refresh: Date.now() } }
                        const targetId = getFolderId()
                        if (!targetId || targetId === 'undefined' || targetId === 'null') {
                            navigate('/home', refreshState)
                        } else {
                            navigate(`/home/list/${targetId}`, refreshState)
                        }
                    }
                })
            } else {
                throw new Error('上传失败')
            }
        } catch (e) {
            clearInterval(progressInterval)
            setUploadProgress(0)
            error({
                content: e.response?.data?.message || e.message || '上传文件失败',
                duration: 4,
                callBack: () => setLoading(false)
            })
        }
    }

    const handleCancel = () => {
        setConfirmModalVisible(false)
        setSelectedFiles([])
    }

    const folderIdValue = getFolderId()
    const isInRoot = folderIdValue === null

    return (
        <>
            {contextHolder}
            <div className={style.uploadContainer}>
                <Upload
                    fileList={[]}
                    onChange={() => { }}
                    maxCount={maxCount}
                    multiple
                    accept="*/*"
                    className={style.box}
                    customRequest={handleCustomRequest}
                    disabled={loading || isInRoot}
                    showUploadList={false}
                >
                    <Button type='default' disabled={loading || isInRoot} className={className}>
                        <CloudUploadOutlined className={style.firIcon} />
                        {loading ? '上传中...' : '上传文件'}
                    </Button>
                </Upload>
            </div>

            <Modal
                title="确认上传"
                open={confirmModalVisible}
                onOk={handleConfirmUpload}
                onCancel={handleCancel}
                okText="确认上传"
                cancelText="取消"
                confirmLoading={loading}
                width={550}
                okButtonProps={{ disabled: selectedFiles.length === 0 }}
            >
                <div>
                    <p>您将要上传 <strong style={{ color: '#5e963c' }}>{selectedFiles.length}</strong> 个文件：</p>
                    <div className={style.modalFileList}>
                        {selectedFiles.map(file => (
                            <div key={file.uid} className={style.modalFileItem}>
                                <span>📄 {file.name}</span>
                                <span>{(file.size / 1024).toFixed(2)} KB</span>
                            </div>
                        ))}
                    </div>
                </div>
            </Modal>

            {loading && (
                <div className={style.fullScreen}>
                    <div className={style.loadingContainer}>
                        <Result
                            icon={<LoadingOutlined spin style={{ fontSize: 48 }} />}
                            title='文件上传中'
                            subTitle={`正在上传 ${Math.floor(uploadProgress)}%`}
                            status='info'
                        />
                        <Progress percent={Math.floor(uploadProgress)} status="active" style={{ width: 300, marginTop: 20 }} />
                    </div>
                </div>
            )}
        </>
    )
}