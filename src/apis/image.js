import { request } from "@/utils";

// 上传 Markdown 图片
// 已有在线文档：POST /minio/upload/markdown，需携带 X-Editor-Resource-Id（文档 ID，仅用于锁鉴权）
//               与 X-Editor-Lock-Token；form-data 的 id 仍是文件夹 ID（图片归集/权限/清理用），两者不可互换。
// 新建文档（无资源 ID）：POST /minio/upload/markdown/new，只传 form-data 的 id=folderId，不验锁但必须传归属。
const uploadMarkdownImage = ({ folderId = '', file, documentId, lockToken, isNew = false }) => {
  let data = new FormData()
  if (folderId !== undefined && folderId !== null && folderId !== '') {
    const intFolderId = parseInt(folderId, 10)
    if (!isNaN(intFolderId)) {
      data.append('id', intFolderId)
    }
  }
  if (file) {
    data.append('file', file)
  }
  const headers = {}
  if (!isNew) {
    if (documentId !== undefined && documentId !== null && documentId !== '') {
      headers['X-Editor-Resource-Id'] = documentId
    }
    if (lockToken) {
      headers['X-Editor-Lock-Token'] = lockToken
    }
  }
  return request({
    url: isNew ? '/minio/upload/markdown/new' : '/minio/upload/markdown',
    method: 'POST',
    data,
    headers
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
