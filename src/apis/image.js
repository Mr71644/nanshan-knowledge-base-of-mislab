import { request } from "@/utils";

// 上传 Markdown 图片
const uploadMarkdownImage = ({ id = '', folderId = '', file }) => {
  let data = new FormData()
  // 只在 id 是有效的数字时添加 id 参数，确保是整数类型
  if (id !== undefined && id !== null && id !== '') {
    const intId = parseInt(id, 10)
    if (!isNaN(intId)) {
      data.append('id', intId)
      console.log('Adding id:', intId)
    }
  }
  // 只在 folderId 是有效的数字时添加 folderId 参数，确保是整数类型
  if (folderId !== undefined && folderId !== null && folderId !== '') {
    const intFolderId = parseInt(folderId, 10)
    if (!isNaN(intFolderId)) {
      data.append('folderId', intFolderId)
      console.log('Adding folderId:', intFolderId)
    }
  }
  // 确保 file 参数正确
  if (file) {
    data.append('file', file)
  }
  console.log('Uploading Markdown image')
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
