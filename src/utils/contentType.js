/**
 * 检测内容是否为旧版 HTML（来自 Quill 编辑器）
 * Quill 生成的内容总是包含 <p> 等块级标签和 data:image/ base64 URI
 * 注意：Tiptap 编辑器的图片缩放会输出 <img width="300"> 形式的内联 HTML，
 * 这类内容仍是 Markdown 主体，不应误判为旧版 HTML。
 */
export function isHtmlContent(content) {
    if (!content || typeof content !== 'string') return false

    const trimmed = content.trim()
    if (!trimmed) return false

    const dataUriPattern = /data:image\/[a-zA-Z+]+;base64,/i
    if (dataUriPattern.test(trimmed)) return true

    const markdownPattern = /^(!\[.*?\]\(.*?\)|#{1,6}\s|\*\s|-\s|\d+\.\s|>\s|```)/m
    if (markdownPattern.test(trimmed)) return false

    const htmlBlockPattern = /<(p|div|span|h[1-6]|ul|ol|li|table|thead|tbody|tr|th|td|blockquote|pre|img|br|hr|strong|em|a |sub|sup|u|s )\b[^>]*>/i
    return htmlBlockPattern.test(trimmed)
}
