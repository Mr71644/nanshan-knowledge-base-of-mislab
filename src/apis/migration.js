import { request } from '@/utils'

/**
 * 获取待迁移的文档列表（content_type IS NULL 的旧 Markdown 文档）
 * 返回 [{ id, content }]
 */
export const fetchMigrateList = () => {
    return request({
        url: '/text/migrate-list',
        method: 'GET',
    })
}

/**
 * 批量写回转换后的 JSON 文档
 * @param {Array} documents - [{ id, content, contentType: 'prosemirror' }]
 */
export const migrateBatch = (documents) => {
    return request({
        url: '/text/migrate-batch',
        method: 'POST',
        data: { documents },
    })
}
