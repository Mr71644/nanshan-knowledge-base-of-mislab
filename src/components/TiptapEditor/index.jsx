import { useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import { Markdown } from '@tiptap/markdown'
import { common, createLowlight } from 'lowlight'
import { createBaseExtensions } from './createExtensions'
import ImageUpload from './extensions/ImageUpload'
import EditorToolbar from './EditorToolbar'
import { previewMarkdownImage } from '@/apis/image'
import style from './index.module.css'

const lowlight = createLowlight(common)

const TiptapEditor = ({ content, editable = true, onChange, folderId, onError, onUploading, fullHeight, lockToken, resourceId, isNewDoc, contentType: initialContentType = 'prosemirror' }) => {
    const lastEditorMd = useRef(content)
    const onChangeRef = useRef(onChange)
    onChangeRef.current = onChange
    const contentTypeRef = useRef(initialContentType)
    const [contextMenu, setContextMenu] = useState(null)
    const menuRef = useRef(null)
    const [headings, setHeadings] = useState([])
    const [activeHeadingIndex, setActiveHeadingIndex] = useState(-1)
    const [outlineWidth, setOutlineWidth] = useState(280)
    const resizingRef = useRef(false)
    const startXRef = useRef(0)
    const startWidthRef = useRef(0)
    const outlineRef = useRef(null)

    const editor = useEditor({
        extensions: [
            ...createBaseExtensions({ lowlight }),
            ImageUpload.configure({ folderId, onError, onUploading, lockToken, resourceId, isNewDoc }),
        ],
        content: initialContentType === 'prosemirror'
            ? (content ? JSON.parse(content) : { type: 'doc', content: [] })
            : (content || ''),
        contentType: initialContentType === 'prosemirror' ? 'json' : 'markdown',
        editable,
        onUpdate: ({ editor }) => {
            const json = editor.getJSON()
            const jsonStr = JSON.stringify(json)
            lastEditorMd.current = jsonStr
            contentTypeRef.current = 'prosemirror'
            onChangeRef.current?.(jsonStr, 'prosemirror')
        },
        editorProps: {
            attributes: {
                class: 'tiptap-prosemirror',
            },
        },
    })

    useEffect(() => {
        if (editor && content !== lastEditorMd.current) {
            contentTypeRef.current = initialContentType
            if (initialContentType === 'prosemirror') {
                editor.commands.setContent(content ? JSON.parse(content) : { type: 'doc', content: [] })
            } else {
                editor.commands.setContent(content || '', { contentType: 'markdown' })
            }
            lastEditorMd.current = content
        }
    }, [content, editor, initialContentType])

    useEffect(() => {
        if (editor) {
            editor.setEditable(editable)
        }
    }, [editable, editor])

    useEffect(() => {
        if (!editor) return
        const ext = editor.extensionManager.extensions.find(e => e.name === 'imageUpload')
        if (ext) {
            ext.options.folderId = folderId
            ext.options.onError = onError
            ext.options.onUploading = onUploading
            ext.options.lockToken = lockToken
            ext.options.resourceId = resourceId
            ext.options.isNewDoc = isNewDoc
        }
    }, [editor, folderId, onError, onUploading, lockToken, resourceId, isNewDoc])

    // 处理 data-minio-src 属性的图片（用于只读模式）
    useEffect(() => {
        if (!editor) return

        const processMinioImages = async () => {
            const dom = editor.view.dom
            const images = dom.querySelectorAll('img[data-minio-src]')

            for (const img of images) {
                const minioSrc = img.getAttribute('data-minio-src')
                if (!minioSrc || !minioSrc.startsWith('minio:')) continue

                const fileId = minioSrc.slice(6)
                img.style.minHeight = '200px'
                img.style.background = '#f5f5f5'

                try {
                    const res = await previewMarkdownImage(fileId)
                    const url = res?.data || res
                    if (url) {
                        img.src = url
                        img.removeAttribute('data-minio-src')
                    } else {
                        img.alt = '图片加载失败'
                        img.style.color = 'red'
                    }
                } catch {
                    img.alt = '图片加载失败'
                    img.style.color = 'red'
                } finally {
                    img.style.minHeight = ''
                    img.style.background = ''
                }
            }
        }

        processMinioImages()

        const handleUpdate = () => {
            processMinioImages()
        }

        editor.on('update', handleUpdate)
        return () => {
            editor.off('update', handleUpdate)
        }
    }, [editor])

    useEffect(() => {
        if (!editor) return
        const extract = () => {
            const items = []
            editor.state.doc.descendants((node, pos) => {
                if (node.type.name === 'heading') {
                    items.push({ level: node.attrs.level, text: node.textContent, pos })
                }
            })
            setHeadings(items)
        }
        extract()
        editor.on('update', extract)
        return () => { editor.off('update', extract) }
    }, [editor])

    // 滚动监听 — 高亮当前可见区域的标题
    useEffect(() => {
        if (!editor || headings.length === 0) return
        const container = editor.view.dom.closest('.tiptapContent') || editor.view.dom.parentElement
        if (!container) return

        const handleScroll = () => {
            const containerRect = container.getBoundingClientRect()
            const viewTop = containerRect.top
            let activeIdx = -1

            for (let i = headings.length - 1; i >= 0; i--) {
                const coords = editor.view.coordsAtPos(headings[i].pos)
                if (coords.top < viewTop + containerRect.height * 0.3) {
                    activeIdx = i
                    break
                }
            }
            setActiveHeadingIndex(activeIdx)
        }

        container.addEventListener('scroll', handleScroll, { passive: true })
        // 初始检测
        handleScroll()
        return () => { container.removeEventListener('scroll', handleScroll) }
    }, [editor, headings])

    // 大纲自动跟随 — 激活标题变化时滚动大纲面板
    useEffect(() => {
        if (activeHeadingIndex < 0 || !outlineRef.current) return
        const outline = outlineRef.current
        const activeItem = outline.children[2 + activeHeadingIndex] // 跳过 resizeHandle + outlineTitle
        if (activeItem) {
            const outlineRect = outline.getBoundingClientRect()
            const itemRect = activeItem.getBoundingClientRect()
            if (itemRect.top < outlineRect.top || itemRect.bottom > outlineRect.bottom) {
                activeItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
            }
        }
    }, [activeHeadingIndex])

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

    const scrollToHeading = (pos) => {
        const coords = editor.view.coordsAtPos(pos)
        const container = editor.view.dom.closest('.tiptapContent') || editor.view.dom.parentElement
        if (container) {
            const containerRect = container.getBoundingClientRect()
            container.scrollTo({
                top: container.scrollTop + coords.top - containerRect.top - containerRect.height / 3,
                behavior: 'smooth',
            })
        }
    }

    const handleResizeStart = (e) => {
        e.preventDefault()
        resizingRef.current = true
        startXRef.current = e.clientX
        startWidthRef.current = outlineWidth

        const handleResizeMove = (e) => {
            if (!resizingRef.current) return
            const diff = startXRef.current - e.clientX
            const newWidth = Math.max(200, Math.min(500, startWidthRef.current + diff))
            setOutlineWidth(newWidth)
        }

        const handleResizeEnd = () => {
            resizingRef.current = false
            document.removeEventListener('mousemove', handleResizeMove)
            document.removeEventListener('mouseup', handleResizeEnd)
            document.body.style.cursor = ''
            document.body.style.userSelect = ''
        }

        document.body.style.cursor = 'col-resize'
        document.body.style.userSelect = 'none'
        document.addEventListener('mousemove', handleResizeMove)
        document.addEventListener('mouseup', handleResizeEnd)
    }

    return (
        <div className={`${style.tiptapEditor} ${fullHeight ? style.tiptapEditorFlex : ''}`}>
            {editable && <EditorToolbar editor={editor} />}
            <div className={style.editorBody}>
                <div className={style.editorMain}>
                    <EditorContent editor={editor} className={`${style.tiptapContent} ${fullHeight ? style.tiptapContentFlex : ''}`} />
                </div>
                {headings.length > 0 && (
                    <div className={style.outline} style={{ width: outlineWidth }} ref={outlineRef}>
                        <div
                            className={style.outlineResizeHandle}
                            onMouseDown={handleResizeStart}
                        />
                        <div className={style.outlineTitle}>大纲</div>
                        {headings.map((h, i) => (
                            <div
                                key={i}
                                className={`${style.outlineItem} ${style[`outlineH${h.level}`]} ${i === activeHeadingIndex ? style.outlineItemActive : ''}`}
                                onClick={() => scrollToHeading(h.pos)}
                                title={h.text}
                            >
                                {h.text || '空标题'}
                            </div>
                        ))}
                    </div>
                )}
            </div>
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
