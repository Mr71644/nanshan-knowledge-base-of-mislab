import { BoldOutlined, ItalicOutlined, LinkOutlined, OrderedListOutlined, UnorderedListOutlined, PictureOutlined, CodeOutlined, TableOutlined, AlignLeftOutlined, AlignCenterOutlined } from '@ant-design/icons'

export const toolbarButtons = [
    { icon: <BoldOutlined />, before: '**', after: '**', placeholder: '粗体文本', title: '粗体' },
    { icon: <ItalicOutlined />, before: '*', after: '*', placeholder: '斜体文本', title: '斜体' },
    { icon: <CodeOutlined />, before: '`', after: '`', placeholder: '代码', title: '行内代码' },
    { icon: <LinkOutlined />, before: '[', after: '](url)', placeholder: '链接文本', title: '链接' },
    { icon: <PictureOutlined />, before: '![', after: '](url)', placeholder: '图片描述', title: '图片', isImage: true },
    { type: 'divider' },
    { icon: <OrderedListOutlined />, before: '1. ', after: '', placeholder: '列表项', title: '有序列表' },
    { icon: <UnorderedListOutlined />, before: '- ', after: '', placeholder: '列表项', title: '无序列表' },
    { icon: <TableOutlined />, before: '| 表头1 | 表头2 |\n| ------ | ------ |\n| 内容1 | 内容2 |', after: '', placeholder: '', title: '表格' },
    { type: 'divider' },
    { icon: <AlignLeftOutlined />, before: '> ', after: '', placeholder: '引用文本', title: '引用' },
    { icon: <AlignCenterOutlined />, before: '```\n', after: '\n```', placeholder: '代码块', title: '代码块' },
    { type: 'divider' },
    { icon: 'H1', before: '# ', after: '', placeholder: '标题1', title: '标题1' },
    { icon: 'H2', before: '## ', after: '', placeholder: '标题2', title: '标题2' },
    { icon: 'H3', before: '### ', after: '', placeholder: '标题3', title: '标题3' },
]

export const insertText = (textareaRef, before, after = '', placeholder = '') => {
    const textarea = textareaRef.current
    if (!textarea) return

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const text = textarea.value
    const selectedText = text.substring(start, end) || placeholder

    const newText = text.substring(0, start) + before + selectedText + after + text.substring(end)
    return { newText, cursorStart: start + before.length, cursorEnd: start + before.length + selectedText.length }
}

const useMarkDownToolbar = () => {
    const components = {
        img: ({ node, src, alt, title, ...props }) => {
            console.log('Image props:', { src, alt, title, props })
            // 确保 src 存在且是字符串
            if (!src || typeof src !== 'string') {
                return <span style={{ color: 'red' }}>图片加载失败</span>
            }
            return (
                <img 
                    src={src} 
                    alt={alt || '图片'} 
                    title={title}
                    {...props} 
                    style={{ 
                        maxWidth: '100%',
                        height: 'auto',
                        display: 'block',
                        margin: '10px 0',
                        border: '1px solid #ddd',
                        padding: '4px',
                        borderRadius: '4px',
                        ...props.style 
                    }} 
                    onError={(e) => {
                        console.error('Image load error:', e)
                        e.target.style.display = 'none'
                        const errorSpan = document.createElement('span')
                        errorSpan.textContent = '图片加载失败'
                        errorSpan.style.color = 'red'
                        errorSpan.style.display = 'block'
                        errorSpan.style.textAlign = 'center'
                        e.target.parentNode.insertBefore(errorSpan, e.target.nextSibling)
                    }}
                />
            )
        },
        a: ({ node, ...props }) => {
            return (
                <a 
                    {...props} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                />
            )
        },
        table: ({ node, ...props }) => {
            return (
                <div style={{ overflowX: 'auto' }}>
                    <table {...props} style={{ borderCollapse: 'collapse', width: '100%' }} />
                </div>
            )
        },
        th: ({ node, ...props }) => {
            return <th {...props} style={{ border: '1px solid #ddd', padding: '8px' }} />
        },
        td: ({ node, ...props }) => {
            return <td {...props} style={{ border: '1px solid #ddd', padding: '8px' }} />
        },
        blockquote: ({ node, ...props }) => {
            return (
                <blockquote 
                    {...props} 
                    style={{ 
                        borderLeft: '4px solid #ccc',
                        margin: '1em 0',
                        paddingLeft: '1em',
                        color: '#666',
                        fontStyle: 'italic'
                    }} 
                />
            )
        },
        code: ({ node, inline, className, children, ...props }) => {
            if (inline) {
                return (
                    <code 
                        {...props} 
                        style={{ 
                            backgroundColor: '#f4f4f4',
                            padding: '2px 4px',
                            borderRadius: '3px',
                            fontFamily: 'monospace'
                        }}
                    >
                        {children}
                    </code>
                )
            }
            return (
                <code 
                    className={className} 
                    {...props}
                    style={{
                        display: 'block',
                        backgroundColor: '#f4f4f4',
                        padding: '1em',
                        borderRadius: '5px',
                        overflow: 'auto',
                        fontFamily: 'monospace'
                    }}
                >
                    {children}
                </code>
            )
        },
        pre: ({ node, ...props }) => {
            return (
                <pre 
                    {...props} 
                    style={{
                        backgroundColor: '#f4f4f4',
                        padding: '1em',
                        borderRadius: '5px',
                        overflow: 'auto'
                    }}
                />
            )
        }
    }

    return {
        toolbarButtons,
        insertText,
        components
    }
}

export default useMarkDownToolbar