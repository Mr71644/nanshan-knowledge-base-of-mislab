import { useState, useEffect, useRef } from 'react'
import { Button, Space, Tooltip } from 'antd'
import {
    BoldOutlined, ItalicOutlined, LinkOutlined,
    OrderedListOutlined, UnorderedListOutlined, PictureOutlined,
    CodeOutlined, TableOutlined, MessageOutlined, CodeSandboxOutlined,
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
]

const EditorToolbar = ({ editor }) => {
    const [, forceRender] = useState(0)
    const [tablePicker, setTablePicker] = useState(false)
    const [tableHover, setTableHover] = useState({ rows: 0, cols: 0 })
    const tablePickerRef = useRef(null)

    useEffect(() => {
        if (!editor) return
        const handler = () => forceRender(c => c + 1)
        editor.on('transaction', handler)
        return () => { editor.off('transaction', handler) }
    }, [editor])

    useEffect(() => {
        if (!tablePicker) return
        const close = (e) => {
            if (tablePickerRef.current?.contains(e.target)) return
            setTablePicker(false)
        }
        document.addEventListener('mousedown', close)
        return () => { document.removeEventListener('mousedown', close) }
    }, [tablePicker])

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
                    if (button.command === 'table') {
                        return (
                            <Tooltip key={index} title="表格">
                                <div ref={tablePickerRef} style={{ position: 'relative', display: 'inline-block' }}>
                                    <Button
                                        type={tablePicker ? 'primary' : 'text'}
                                        size="small"
                                        onClick={() => setTablePicker(v => !v)}
                                        className={`${style.toolbarButton} ${tablePicker ? style.toolbarButtonActive : ''}`}
                                    >
                                        {button.icon}
                                    </Button>
                                    {tablePicker && (
                                        <div className={style.tablePicker}>
                                            <div className={style.tablePickerLabel}>
                                                {tableHover.rows > 0 ? `${tableHover.rows} × ${tableHover.cols}` : '选择表格大小'}
                                            </div>
                                            <div
                                                className={style.tablePickerGrid}
                                                onMouseLeave={() => setTableHover({ rows: 0, cols: 0 })}
                                            >
                                                {Array.from({ length: 6 }, (_, r) =>
                                                    Array.from({ length: 8 }, (_, c) => (
                                                        <div
                                                            key={`${r}-${c}`}
                                                            className={`${style.tablePickerCell} ${r < tableHover.rows && c < tableHover.cols ? style.tablePickerCellActive : ''}`}
                                                            onMouseEnter={() => setTableHover({ rows: r + 1, cols: c + 1 })}
                                                            onClick={() => {
                                                                editor.chain().focus()
                                                                    .insertTable({ rows: r + 1, cols: c + 1, withHeaderRow: true })
                                                                    .run()
                                                                setTablePicker(false)
                                                                setTableHover({ rows: 0, cols: 0 })
                                                            }}
                                                        />
                                                    ))
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
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
