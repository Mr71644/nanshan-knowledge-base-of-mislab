import { StarterKit } from '@tiptap/starter-kit'
import { Link } from '@tiptap/extension-link'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import { Placeholder } from '@tiptap/extension-placeholder'
import { Underline } from '@tiptap/extension-underline'
import { Markdown } from '@tiptap/markdown'
import { FontFamily } from '@tiptap/extension-font-family'
import { TextStyle } from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import { Highlight } from '@tiptap/extension-highlight'
import MinioImage from './extensions/MinioImage'
import CodeBlockWithToolbar from './extensions/CodeBlockWithToolbar'
import { FontSize } from './extensions/FontSize'

/**
 * 共享扩展工厂 — React 编辑器和 Headless 迁移引擎共用
 *
 * 注意：不包含 ImageUpload（依赖 React hooks + Ant Design message，headless 环境不可用）
 *       任何新增扩展必须同时在此工厂中注册，确保两端扩展配置 100% 一致
 */
export function createBaseExtensions({ lowlight }) {
    return [
        StarterKit.configure({
            heading: { levels: [1, 2, 3] },
            link: false,
            codeBlock: false,
            underline: false,
        }),
        CodeBlockWithToolbar.configure({
            lowlight,
        }),
        Underline,
        Link.configure({ openOnClick: false }),
        MinioImage,
        Table.configure({ resizable: true }),
        TableRow,
        TableCell,
        TableHeader,
        Placeholder.configure({ placeholder: '在这里输入内容...' }),
        Markdown,
        FontFamily,
        TextStyle,
        Color,
        Highlight.configure({ multicolor: true }),
        FontSize,
    ]
}
