import { request } from "@/utils";

/**
 * 图片上传 API
 */

// 上传图片（通用）
const uploadImage = ({ id = '', file, isEmbedded = true }) => {
  let data = new FormData()
  // 只在 folderId 存在时添加 id 参数
  if (id !== undefined && id !== null && id !== '') {
    data.append('id', id)
  }
  // 确保 file 参数正确
  if (file) {
    data.append('file', file)
  }
  // 强制添加 isEmbedded 参数为 true，确保服务器知道这是文档内嵌图片
  data.append('isEmbedded', 'true') // 使用字符串 'true' 确保服务器能正确解析
  data.append('embedded', 'true') // 添加备用参数名，增加兼容性
  console.log('Uploading image with isEmbedded:', 'true')
  return request({
    url: '/minio/upload',
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    method: 'POST',
    data
  })
}

// 上传 Markdown 图片（专门用于 Markdown 文件的图片上传）
const uploadMarkdownImage = ({ id = '', folderId = '', file }) => {
  let data = new FormData()
  // 只在 id 是有效的数字时添加 id 参数，确保是整数类型
  if (id !== undefined && id !== null && id !== '') {
    const intId = parseInt(id, 10)
    if (!isNaN(intId)) {
      data.append('id', intId) // 确保 id 是整数类型
      console.log('Adding id:', intId)
    }
  }
  // 只在 folderId 是有效的数字时添加 folderId 参数，确保是整数类型
  if (folderId !== undefined && folderId !== null && folderId !== '') {
    const intFolderId = parseInt(folderId, 10)
    if (!isNaN(intFolderId)) {
      data.append('folderId', intFolderId) // 确保 folderId 是整数类型
      console.log('Adding folderId:', intFolderId)
    }
  }
  // 确保 file 参数正确
  if (file) {
    data.append('file', file)
  }
  // 上传 Markdown 接口不需要手动传递 isMarkdownImage，后端会自动设置
  console.log('Uploading Markdown image')
  return request({
    url: '/minio/upload/markdown',
    // 不要手动写 Content-Type，让浏览器自动带 boundary
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
