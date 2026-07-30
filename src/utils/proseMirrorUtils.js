/**
 * ProseMirror JSON 文档工具函数
 */

/**
 * 从 ProseMirror JSON 文档中提取纯文本
 * 用于 RAG 搜索索引、预览摘要等场景
 *
 * @param {Object} jsonDoc - ProseMirror JSON 文档（已解析的对象）
 * @returns {string} 提取的纯文本
 */
export function extractPlainText(jsonDoc) {
    if (!jsonDoc || !jsonDoc.content) return ''
    const parts = []
    const walk = (node) => {
        if (node.type === 'text' && node.text) {
            parts.push(node.text)
        }
        if (node.content) {
            node.content.forEach(walk)
        }
    }
    walk(jsonDoc)
    return parts.join(' ')
}

/**
 * 检测内容字符串的格式类型
 * 尝试解析 JSON，如果包含 type: 'doc' 且 content 为数组，则为 prosemirror
 *
 * @param {string} contentStr - 内容字符串
 * @returns {'prosemirror' | 'markdown'}
 */
export function detectContentType(contentStr) {
    if (!contentStr || typeof contentStr !== 'string') return 'markdown'
    try {
        const parsed = JSON.parse(contentStr)
        if (parsed && parsed.type === 'doc' && Array.isArray(parsed.content)) {
            return 'prosemirror'
        }
    } catch {
        // 不是有效 JSON，视为 markdown
    }
    return 'markdown'
}

// TODO: jsonToMarkdown — 将 ProseMirror JSON 转回 Markdown（紧急回滚用）
// 思路：使用 Editor.create + setContent(json) + getMarkdown()
// 或者手动遍历 JSON 树还原 Markdown 语法
