import TurndownService from 'turndown'

/**
 * 将 HTML 内容转为 Markdown
 * 调用前应已将 base64 图片替换为 MinIO URL
 */
export function convertHtmlToMarkdown(html) {
    const turndown = new TurndownService({
        headingStyle: 'atx',
        bulletListMarker: '-',
        codeBlockStyle: 'fenced',
    })

    turndown.addRule('image', {
        filter: 'img',
        replacement: (content, node) => {
            const src = node.getAttribute('src')
            const alt = node.getAttribute('alt') || '图片'
            if (!src) return ''
            return `![${alt}](${src})`
        }
    })

    return turndown.turndown(html)
}
