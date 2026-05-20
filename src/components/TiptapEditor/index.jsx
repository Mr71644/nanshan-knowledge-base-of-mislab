import { useEffect, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import { StarterKit } from '@tiptap/starter-kit'
import { Link } from '@tiptap/extension-link'
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table'
import { Placeholder } from '@tiptap/extension-placeholder'
import { Underline } from '@tiptap/extension-underline'
import { Markdown } from '@tiptap/markdown'
import { common, createLowlight } from 'lowlight'
import MinioImage from './extensions/MinioImage'
import ImageUpload from './extensions/ImageUpload'
import CodeBlockWithToolbar from './extensions/CodeBlockWithToolbar'
import EditorToolbar from './EditorToolbar'
import style from './index.module.css'

const lowlight = createLowlight(common)

const TiptapEditor = ({ content, editable = true, onChange, folderId, onError }) => {
    const lastEditorMd = useRef(content)
    const onChangeRef = useRef(onChange)
    onChangeRef.current = onChange

    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                heading: { levels: [1, 2, 3] },
                link: false,
                codeBlock: false,
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
            ImageUpload.configure({ folderId, onError }),
        ],
        content: content || '',
        contentType: 'markdown',
        editable,
        onUpdate: ({ editor }) => {
            const md = editor.getMarkdown()
            lastEditorMd.current = md
            onChangeRef.current?.(md)
        },
        editorProps: {
            attributes: {
                class: 'tiptap-prosemirror',
            },
        },
    })

    useEffect(() => {
        if (editor && content !== lastEditorMd.current) {
            editor.commands.setContent(content || '', { contentType: 'markdown' })
            lastEditorMd.current = content
        }
    }, [content, editor])

    useEffect(() => {
        if (editor) {
            editor.setEditable(editable)
        }
    }, [editable, editor])

    if (!editor) return null

    return (
        <div className={style.tiptapEditor}>
            {editable && <EditorToolbar editor={editor} />}
            <EditorContent editor={editor} className={style.tiptapContent} />
        </div>
    )
}

export default TiptapEditor
