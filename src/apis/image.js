import { request } from "@/utils";

// 上传 Markdown 图片
const uploadMarkdownImage = ({ id = '', folderId = '', file }) => {
  let data = new FormData()
  if (id !== undefined && id !== null && id !== '') {
    const intId = parseInt(id, 10)
    if (!isNaN(intId)) {
      data.append('id', intId)
    }
  }
  if (folderId !== undefined && folderId !== null && folderId !== '') {
    const intFolderId = parseInt(folderId, 10)
    if (!isNaN(intFolderId)) {
      data.append('folderId', intFolderId)
    }
  }
  if (file) {
    data.append('file', file)
  }
  return request({
    url: '/minio/upload/markdown',
    method: 'POST',
    data
  })
}

// 获取 Markdown 图片预览 URL
const previewMarkdownImage = (id) => {
  return request({
    url: `/minio/preview/markdown/${id}`,
    method: 'GET'
  })
}

// 获取 Markdown 图片列表
const getMarkdownImageList = () => {
  return request({
    url: '/minio/markdownImageList',
    method: 'GET'
  })
}

export {
  uploadMarkdownImage,
  previewMarkdownImage,
  getMarkdownImageList
}
