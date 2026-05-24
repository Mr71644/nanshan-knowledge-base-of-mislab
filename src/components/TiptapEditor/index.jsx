import { useEffect, useRef, useState } from 'react'
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

const TiptapEditor = ({ content, editable = true, onChange, folderId, onError, fullHeight }) => {
    const lastEditorMd = useRef(content)
    const onChangeRef = useRef(onChange)
    onChangeRef.current = onChange
    const [contextMenu, setContextMenu] = useState(null)
    const menuRef = useRef(null)

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

    useEffect(() => {
        if (!editor || !editable) return
        const dom = editor.view.dom
        const handleContextMenu = (e) => {
            const coords = editor.view.posAtCoords({ left: e.clientX, top: e.clientY })
            if (!coords) return
            let $pos = editor.state.doc.resolve(coords.pos)
            let inTable = false
            for (let d = $pos.depth; d > 0; d--) {
                if ($pos.node(d).type.name === 'table') { inTable = true; break }
            }
            if (!inTable) return
            e.preventDefault()
            editor.commands.setTextSelection(coords.pos)
            setContextMenu({ x: e.clientX, y: e.clientY })
        }
        dom.addEventListener('contextmenu', handleContextMenu)
        return () => { dom.removeEventListener('contextmenu', handleContextMenu) }
    }, [editor, editable])

    useEffect(() => {
        if (!contextMenu) return
        const close = (e) => {
            if (menuRef.current?.contains(e.target)) return
            setContextMenu(null)
        }
        document.addEventListener('mousedown', close)
        return () => { document.removeEventListener('mousedown', close) }
    }, [contextMenu])

    const handleTableAction = (action) => {
        if (!editor) return
        const chain = editor.chain().focus()
        switch (action) {
            case 'addRowBefore': chain.addRowBefore().run(); break
            case 'addRowAfter': chain.addRowAfter().run(); break
            case 'addColumnBefore': chain.addColumnBefore().run(); break
            case 'addColumnAfter': chain.addColumnAfter().run(); break
            case 'deleteRow': chain.deleteRow().run(); break
            case 'deleteColumn': chain.deleteColumn().run(); break
            case 'deleteTable': chain.deleteTable().run(); break
        }
        setContextMenu(null)
    }

    const tableMenuItems = [
        { label: '在上方插入行', action: 'addRowBefore' },
        { label: '在下方插入行', action: 'addRowAfter' },
        { label: '在左侧插入列', action: 'addColumnBefore' },
        { label: '在右侧插入列', action: 'addColumnAfter' },
        { type: 'divider' },
        { label: '删除行', action: 'deleteRow' },
        { label: '删除列', action: 'deleteColumn' },
        { type: 'divider' },
        { label: '删除表格', action: 'deleteTable' },
    ]

    if (!editor) return null

    return (
        <div className={`${style.tiptapEditor} ${fullHeight ? style.tiptapEditorFlex : ''}`}>
            {editable && <EditorToolbar editor={editor} />}
            <EditorContent editor={editor} className={`${style.tiptapContent} ${fullHeight ? style.tiptapContentFlex : ''}`} />
            {contextMenu && (
                <div
                    ref={menuRef}
                    className={style.contextMenu}
                    style={{ left: contextMenu.x, top: contextMenu.y }}
                >
                    {tableMenuItems.map((item, i) =>
                        item.type === 'divider' ? (
                            <div key={i} className={style.contextMenuDivider} />
                        ) : (
                            <div
                                key={i}
                                className={style.contextMenuItem}
                                onClick={() => handleTableAction(item.action)}
                            >
                                {item.label}
                            </div>
                        ),
                    )}
                </div>
            )}
        </div>
    )
}

export default TiptapEditor
