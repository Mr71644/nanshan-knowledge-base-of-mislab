/**
 * 检测内容是否为旧版 HTML（来自 Quill 编辑器）
 * Quill 生成的内容总是包含 <p> 等块级标签和 data:image/ base64 URI
 */
export function isHtmlContent(content) {
    if (!content || typeof content !== 'string') return false

    const trimmed = content.trim()
    if (!trimmed) return false

    const htmlBlockPattern = /<(p|div|span|h[1-6]|ul|ol|li|table|thead|tbody|tr|th|td|blockquote|pre|img|br|hr|strong|em|a |sub|sup|u|s )\b[^>]*>/i
    const dataUriPattern = /data:image\/[a-zA-Z+]+;base64,/i

    return htmlBlockPattern.test(trimmed) || dataUriPattern.test(trimmed)
}
