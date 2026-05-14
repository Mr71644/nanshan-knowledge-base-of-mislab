import { request } from "@/utils";

// 文件存储（minio）相关 API

const uploadFile = ({ id, file }) => {
    const data = new FormData()
    if (id !== undefined && id !== null && id !== '' && !isNaN(parseInt(id, 10))) {
        const intId = parseInt(id, 10)
        data.append('id', intId.toString())
    }
    if (file) {
        data.append('file', file)
    }
    return request({
        url: '/minio/upload',
        method: 'POST',
        data
    })
}

const uploadFilesBatch = ({ id, files }) => {
    // 验证文件列表
    if (!files || files.length === 0) {
        return Promise.reject(new Error('请选择要上传的文件'))
    }

    const data = new FormData()

    // 添加文件列表（参数名必须是 files）
    files.forEach(file => {
        data.append('files', file)
    })

    // 处理文件夹ID（只有当 id 是有效数字时才添加）
    if (id && id !== 'undefined' && id !== 'null' && id !== '') {
        const intId = parseInt(id, 10)
        if (!isNaN(intId) && intId > 0) {
            data.append('id', intId.toString())
        }
    }

    return request({
        url: '/minio/upload/batch',
        method: 'POST',
        data
    })
}

const downloadFile = (id) => {
    return request({
        url: `/minio/download/${id}`,
        method: 'GET',
        responseType: 'blob',
    })
        .then(response => {
            const blob = new Blob([response.data]);
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `file_${id}`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        })
        .catch(error => {
            console.error('Error downloading file:', error);
            throw error;
        });
}

const previewFile = (id) => {
    return request({
        url: `/minio/preview/${id}`,
        method: 'GET'
    })
}

const getCommonFileList = () => {
    return request({
        url: '/excel/files',
        method: 'GET'
    })
}

const queryCommonFileList = ({ keyword = '' } = {}) => {
    return request({
        url: '/excel/files/search',
        method: 'GET',
        params: {
            keyword
        }
    })
}

export {
    uploadFile,
    uploadFilesBatch,
    downloadFile,
    previewFile,
    getCommonFileList,
    queryCommonFileList
}