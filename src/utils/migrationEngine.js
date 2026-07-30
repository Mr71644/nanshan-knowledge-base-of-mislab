import { Editor } from '@tiptap/core'
import { createLowlight, common } from 'lowlight'
import { createBaseExtensions } from '@/components/TiptapEditor/createExtensions'

const lowlight = createLowlight(common)

/**
 * 将 Markdown 字符串转换为 ProseMirror JSON 字符串
 *
 * 使用 Headless Editor.create + 离屏 DOM 实现，
 * 扩展配置与 React 编辑器通过 createBaseExtensions 保持 100% 一致。
 *
 * @param {string} markdownContent - Markdown 格式的文档内容
 * @returns {string} ProseMirror JSON 字符串
 */
export function convertMarkdownToJSON(markdownContent) {
    const el = document.createElement('div')
    const editor = new Editor({
        element: el,
        extensions: createBaseExtensions({ lowlight }),
        content: markdownContent || '',
        contentType: 'markdown',
        editable: false,
    })
    const json = editor.getJSON()
    editor.destroy()
    return JSON.stringify(json)
}

/**
 * 将 ProseMirror JSON 字符串转回 Markdown 字符串
 *
 * 用于编辑旧 Markdown 文档时保持原始格式（不触发迁移），
 * 使用 Headless Editor + getMarkdown() 反向转换。
 *
 * @param {string} jsonContent - ProseMirror JSON 字符串
 * @returns {string} Markdown 字符串
 */
export function convertJSONToMarkdown(jsonContent) {
    const el = document.createElement('div')
    const editor = new Editor({
        element: el,
        extensions: createBaseExtensions({ lowlight }),
        content: JSON.parse(jsonContent),
        contentType: 'json',
        editable: false,
    })
    const markdown = editor.storage.markdown.getMarkdown()
    editor.destroy()
    return markdown
}
