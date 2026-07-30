import { useState, useEffect, useRef } from 'react'
import { Button, Space, Tooltip, Select, ColorPicker } from 'antd'
import {
    BoldOutlined, ItalicOutlined, LinkOutlined,
    OrderedListOutlined, UnorderedListOutlined, PictureOutlined,
    CodeOutlined, TableOutlined, MessageOutlined, CodeSandboxOutlined,
    FontColorsOutlined, HighlightOutlined,
} from '@ant-design/icons'
import style from './index.module.css'

const FONT_FAMILIES = [
    { label: '默认字体', value: '' },
    { label: '宋体', value: 'SimSun, serif' },
    { label: '黑体', value: 'SimHei, sans-serif' },
    { label: '楷体', value: 'KaiTi, serif' },
    { label: '微软雅黑', value: 'Microsoft YaHei, sans-serif' },
    { label: 'Arial', value: 'Arial, sans-serif' },
    { label: 'Times New Roman', value: 'Times New Roman, serif' },
    { label: 'Courier New', value: 'Courier New, monospace' },
]

// 仿 Word 字号列表（中文对应字号）
const FONT_SIZES = [
    { label: '八号', value: '5pt' },
    { label: '七号', value: '5.5pt' },
    { label: '小六', value: '6.5pt' },
    { label: '六号', value: '7.5pt' },
    { label: '小五', value: '9pt' },
    { label: '五号', value: '10.5pt' },
    { label: '小四', value: '12pt' },
    { label: '四号', value: '14pt' },
    { label: '小三', value: '15pt' },
    { label: '三号', value: '16pt' },
    { label: '小二', value: '18pt' },
    { label: '二号', value: '22pt' },
    { label: '小一', value: '24pt' },
    { label: '一号', value: '26pt' },
    { label: '小初', value: '36pt' },
    { label: '初号', value: '42pt' },
]

const PRESET_COLORS = [
    '#000000', '#333333', '#666666', '#999999', '#cccccc', '#ffffff',
    '#e60000', '#ff4d4f', '#fa8c16', '#fadb14', '#52c41a', '#13c2c2',
    '#1677ff', '#2f54eb', '#722ed1', '#eb2f96',
]

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
    { type: 'fontFamily', title: '字体' },
    { type: 'fontSize', title: '字号' },
    { type: 'textColor', title: '文字颜色' },
    { type: 'highlight', title: '高亮' },
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
            case 'highlight': return editor.isActive('highlight')
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
                    if (button.type === 'fontFamily') {
                        const currentFont = editor.getAttributes('textStyle').fontFamily || ''
                        return (
                            <Select
                                key={index}
                                size="small"
                                value={currentFont || undefined}
                                onChange={(val) => {
                                    if (val) editor.chain().focus().setFontFamily(val).run()
                                    else editor.chain().focus().unsetFontFamily().run()
                                }}
                                style={{ width: 110 }}
                                options={FONT_FAMILIES}
                                placeholder="字体"
                                className={style.toolbarFontSelect}
                            />
                        )
                    }
                    if (button.type === 'fontSize') {
                        const currentSize = editor.getAttributes('textStyle').fontSize || ''
                        return (
                            <Select
                                key={index}
                                size="small"
                                value={currentSize || undefined}
                                onChange={(val) => {
                                    if (val) editor.chain().focus().setFontSize(val).run()
                                    else editor.chain().focus().unsetFontSize().run()
                                }}
                                style={{ width: 72 }}
                                options={FONT_SIZES}
                                placeholder="字号"
                                className={style.toolbarFontSelect}
                            />
                        )
                    }
                    if (button.type === 'textColor') {
                        return (
                            <ColorPicker
                                key={index}
                                size="small"
                                value={editor.getAttributes('textStyle').color || '#000000'}
                                onChange={(color) => editor.chain().focus().setColor(color.toHexString()).run()}
                                presets={[{ label: '预设', colors: PRESET_COLORS }]}
                            >
                                <Tooltip title="文字颜色">
                                    <Button type="text" size="small" className={style.toolbarButton}>
                                        <FontColorsOutlined style={{ color: editor.getAttributes('textStyle').color || '#000' }} />
                                    </Button>
                                </Tooltip>
                            </ColorPicker>
                        )
                    }
                    if (button.type === 'highlight') {
                        const isHighlightActive = editor.isActive('highlight')
                        return (
                            <ColorPicker
                                key={index}
                                size="small"
                                value={editor.getAttributes('highlight').color || '#ffff00'}
                                onChange={(color) => editor.chain().focus().toggleHighlight({ color: color.toHexString() }).run()}
                                presets={[{ label: '预设', colors: PRESET_COLORS }]}
                            >
                                <Tooltip title="高亮">
                                    <Button
                                        type={isHighlightActive ? 'primary' : 'text'}
                                        size="small"
                                        className={`${style.toolbarButton} ${isHighlightActive ? style.toolbarButtonActive : ''}`}
                                    >
                                        <HighlightOutlined />
                                    </Button>
                                </Tooltip>
                            </ColorPicker>
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
