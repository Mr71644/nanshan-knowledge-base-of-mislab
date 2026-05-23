import { useState, useEffect, useRef } from 'react'
import { Button, Space, Tooltip } from 'antd'
import {
    BoldOutlined, ItalicOutlined, LinkOutlined,
    OrderedListOutlined, UnorderedListOutlined, PictureOutlined,
    CodeOutlined, TableOutlined, MessageOutlined, CodeSandboxOutlined,
    ClearOutlined, HighlightOutlined,
} from '@ant-design/icons'
import style from './index.module.css'

const toolbarButtons = [
    { icon: <BoldOutlined />, command: 'bold', title: '粗体' },
    { icon: <ItalicOutlined />, command: 'italic', title: '斜体' },
    { icon: <CodeOutlined />, command: 'code', title: '行内代码' },
    { icon: <LinkOutlined />, command: 'link', title: '链接' },
    { icon: <PictureOutlined />, command: 'image', title: '图片' },
    { type: 'divider' },
    { icon: <OrderedListOutlined />, command: 'orderedList', title: '有序列表' },
    { icon: <UnorderedListOutlined />, command: 'bulletList', title: '无序列表' },
    { icon: <TableOutlined />, command: 'table', title: '表格' },
    { type: 'divider' },
    { icon: <MessageOutlined />, command: 'blockquote', title: '引用' },
    { icon: <CodeSandboxOutlined />, command: 'codeBlock', title: '代码块' },
    { type: 'divider' },
    { icon: 'H1', command: 'heading1', title: '标题1' },
    { icon: 'H2', command: 'heading2', title: '标题2' },
    { icon: 'H3', command: 'heading3', title: '标题3' },
    { type: 'divider' },
    { icon: <ClearOutlined />, command: 'clearFormat', title: '清除格式' },
    { type: 'divider' },
    { icon: <HighlightOutlined />, command: 'formatPainter', title: '格式刷' },
]

const EditorToolbar = ({ editor }) => {
    const [, forceRender] = useState(0)
    const [formatPainter, setFormatPainter] = useState(null)
    const painterTimerRef = useRef(null)

    const deactivateFormatPainter = () => {
        setFormatPainter(null)
        if (editor?.view.dom) editor.view.dom.style.cursor = ''
    }

    const activateFormatPainter = (persistent) => {
        if (!editor) return
        const marks = editor.state.selection.$from.marks()
        const listType = editor.isActive('orderedList') ? 'ordered'
            : editor.isActive('bulletList') ? 'bullet' : null
        if (marks.length === 0 && !listType) return
        setFormatPainter({ marks, listType, persistent })
        if (editor.view.dom) editor.view.dom.style.cursor = 'crosshair'
    }

    useEffect(() => {
        if (!editor) return
        const handler = () => forceRender(c => c + 1)
        editor.on('transaction', handler)
        return () => { editor.off('transaction', handler) }
    }, [editor])

    useEffect(() => {
        if (!editor || !formatPainter) return
        const handleMouseUp = () => {
            const { from, to, empty } = editor.state.selection
            if (empty) return
            const { marks, listType } = formatPainter
            if (marks.length > 0) {
                const { tr } = editor.state
                tr.removeMark(from, to)
                for (const mark of marks) {
                    tr.addMark(from, to, mark.type.create(mark.attrs))
                }
                editor.view.dispatch(tr)
            }
            if (listType === 'ordered') {
                editor.chain().focus().toggleOrderedList().run()
            } else if (listType === 'bullet') {
                editor.chain().focus().toggleBulletList().run()
            }
            if (!formatPainter.persistent) deactivateFormatPainter()
        }
        const dom = editor.view.dom
        dom.addEventListener('mouseup', handleMouseUp)
        return () => { dom.removeEventListener('mouseup', handleMouseUp) }
    }, [editor, formatPainter])

    useEffect(() => {
        if (!editor || !formatPainter?.persistent) return
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') deactivateFormatPainter()
        }
        const dom = editor.view.dom
        dom.addEventListener('keydown', handleKeyDown)
        return () => { dom.removeEventListener('keydown', handleKeyDown) }
    }, [editor, formatPainter])

    if (!editor) return null

    const handleClick = (button) => {
        if (!editor) return

        const chain = editor.chain().focus()

        switch (button.command) {
            case 'bold':
                chain.toggleBold().run()
                break
            case 'italic':
                chain.toggleItalic().run()
                break
            case 'code':
                chain.toggleCode().run()
                break
            case 'link': {
                const selectedText = editor.state.selection.empty
                    ? '链接文本'
                    : editor.state.doc.textBetween(
                        editor.state.selection.from,
                        editor.state.selection.to,
                    )
                const url = prompt('请输入链接 URL:', 'http://')
                if (url) {
                    chain.extendMarkRange('link').setLink({ href: url }).run()
                }
                return
            }
            case 'image':
                editor.commands.uploadImage()
                return
            case 'orderedList':
                chain.toggleOrderedList().run()
                break
            case 'bulletList':
                chain.toggleBulletList().run()
                break
            case 'table':
                chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
                break
            case 'blockquote':
                chain.toggleBlockquote().run()
                break
            case 'codeBlock':
                chain.toggleCodeBlock().run()
                break
            case 'heading1':
                chain.toggleHeading({ level: 1 }).run()
                break
            case 'heading2':
                chain.toggleHeading({ level: 2 }).run()
                break
            case 'heading3':
                chain.toggleHeading({ level: 3 }).run()
                break
            case 'clearFormat': {
                const { from, to, empty } = editor.state.selection
                if (empty) {
                    const $pos = editor.state.selection.$head
                    const lineFrom = $pos.start()
                    const lineTo = $pos.end()
                    editor.chain().focus()
                        .setTextSelection({ from: lineFrom, to: lineTo })
                        .command(({ tr, dispatch }) => {
                            tr.removeMark(lineFrom, lineTo)
                            if (dispatch) dispatch(tr)
                            return true
                        })
                        .setTextSelection(from)
                        .run()
                } else {
                    editor.chain().focus()
                        .command(({ tr, dispatch }) => {
                            tr.removeMark(from, to)
                            if (dispatch) dispatch(tr)
                            return true
                        })
                        .run()
                }
                return
            }
            case 'formatPainter': {
                if (formatPainter) {
                    deactivateFormatPainter()
                } else {
                    activateFormatPainter(false)
                }
                return
            }
        }
    }

    const isActive = (button) => {
        if (!editor) return false

        switch (button.command) {
            case 'bold': return editor.isActive('bold')
            case 'italic': return editor.isActive('italic')
            case 'code': return editor.isActive('code')
            case 'link': return editor.isActive('link')
            case 'orderedList': return editor.isActive('orderedList')
            case 'bulletList': return editor.isActive('bulletList')
            case 'blockquote': return editor.isActive('blockquote')
            case 'codeBlock': return editor.isActive('codeBlock')
            case 'heading1': return editor.isActive('heading', { level: 1 })
            case 'heading2': return editor.isActive('heading', { level: 2 })
            case 'heading3': return editor.isActive('heading', { level: 3 })
            case 'formatPainter': return formatPainter !== null
            default: return false
        }
    }

    return (
        <div className={style.toolbar}>
            <Space wrap size={[0, 0]}>
                {toolbarButtons.map((button, index) => {
                    if (button.type === 'divider') {
                        return <div key={index} className={style.toolbarDivider} />
                    }
                    const active = isActive(button)
                    if (button.command === 'formatPainter') {
                        return (
                            <Tooltip key={index} title="格式刷">
                                <Button
                                    type={active ? 'primary' : 'text'}
                                    size="small"
                                    onClick={() => {
                                        if (painterTimerRef.current) {
                                            clearTimeout(painterTimerRef.current)
                                            painterTimerRef.current = null
                                        }
                                        painterTimerRef.current = setTimeout(() => {
                                            painterTimerRef.current = null
                                            handleClick(button)
                                        }, 250)
                                    }}
                                    onDoubleClick={() => {
                                        if (painterTimerRef.current) {
                                            clearTimeout(painterTimerRef.current)
                                            painterTimerRef.current = null
                                        }
                                        if (formatPainter) {
                                            deactivateFormatPainter()
                                        }
                                        activateFormatPainter(true)
                                    }}
                                    className={`${style.toolbarButton} ${active ? style.toolbarButtonActive : ''}`}
                                >
                                    {button.icon}
                                </Button>
                            </Tooltip>
                        )
                    }
                    return (
                        <Tooltip key={index} title={button.title}>
                            <Button
                                type={active ? 'primary' : 'text'}
                                size="small"
                                onClick={() => handleClick(button)}
                                className={`${style.toolbarButton} ${active ? style.toolbarButtonActive : ''}`}
                            >
                                {button.icon}
                            </Button>
                        </Tooltip>
                    )
                })}
            </Space>
        </div>
    )
}

export default EditorToolbar
