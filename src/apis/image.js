import { request } from "@/utils";

// 上传图片（通用）
const uploadImage = ({ id = '', file, isEmbedded = true }) => {
  let data = new FormData()
  if (id !== undefined && id !== null && id !== '') {
    data.append('id', id)
  }
  if (file) {
    data.append('file', file)
  }
  data.append('isEmbedded', 'true')
  data.append('embedded', 'true')
  return request({
    url: '/minio/upload',
    method: 'POST',
    data
  })
}

// 上传 Markdown 图片（专门用于 Markdown 文件的图片上传）
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

// 获取图片预览 URL
const previewImage = (id) => {
  return request({
    url: `/minio/preview/${id}`,
    method: 'GET'
  })
}

// 获取 Markdown 图片预览 URL
const previewMarkdownImage = (id) => {
  return request({
    url: `/minio/preview/markdown/${id}`,
    method: 'GET'
  })
}

// 获取图片列表
const getImageList = () => {
  return request({
    url: '/minio/imageList',
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
  uploadImage,
  uploadMarkdownImage,
  previewImage,
  previewMarkdownImage,
  getImageList,
  getMarkdownImageList
}
