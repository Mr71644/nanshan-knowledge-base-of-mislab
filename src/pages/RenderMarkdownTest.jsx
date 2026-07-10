import { useState } from 'react'
import { Editor } from '@tiptap/core'
import { StarterKit } from '@tiptap/starter-kit'
import { Link } from '@tiptap/extension-link'
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table'
import { Underline } from '@tiptap/extension-underline'
import { Markdown } from '@tiptap/markdown'
import { createLowlight, common } from 'lowlight'
import { FontFamily } from '@tiptap/extension-font-family'
import { TextStyle } from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import { Highlight } from '@tiptap/extension-highlight'
import CodeBlockWithToolbar from '@/components/TiptapEditor/extensions/CodeBlockWithToolbar'
import MinioImage from '@/components/TiptapEditor/extensions/MinioImage'

const lowlight = createLowlight(common)

// 克隆 MinioImage 并删除 renderMarkdown 方法
const MinioImageNoRenderMarkdown = MinioImage.extend({
    renderMarkdown() {
        // 故意不实现 — 模拟删除后的行为
        // 父类 Image 的 renderMarkdown 会被调用（输出 ![alt](src)）
        return null
    },
})

function buildExtensions(removeRenderMarkdown) {
    const imgExt = removeRenderMarkdown ? MinioImageNoRenderMarkdown : MinioImage
    return [
        StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: false, codeBlock: false, underline: false }),
        CodeBlockWithToolbar.configure({ lowlight }),
        Underline,
        Link.configure({ openOnClick: false }),
        imgExt,
        Table.configure({ resizable: true }), TableRow, TableCell, TableHeader,
        Markdown,
        FontFamily.configure({ types: ['textStyle'] }), TextStyle,
        Color.configure({ types: ['textStyle'] }), Highlight.configure({ multicolor: true }),
    ]
}

function convert(md, removeRenderMarkdown) {
    const el = document.createElement('div')
    const editor = new Editor({
        element: el,
        extensions: buildExtensions(removeRenderMarkdown),
        content: md || '',
        contentType: 'markdown',
    })
    const json = editor.getJSON()
    let md2 = ''
    try { md2 = editor.storage?.markdown?.getMarkdown?.() || editor.getMarkdown?.() || '(无)' } catch (e) { md2 = 'ERROR: ' + e.message }
    editor.destroy()
    return { json, markdownOutput: md2 }
}

function extractImages(json) {
    const imgs = []
    function w(n) { if (n.type === 'image') imgs.push({ src: n.attrs?.src, width: n.attrs?.width, alt: n.attrs?.alt }); if (n.content) n.content.forEach(w) }
    w(json); return imgs
}

const LT = String.fromCharCode(60)
const GT = String.fromCharCode(62)

const SCENARIOS = [
    {
        group: 'JSON 解析（不应受影响）',
        items: [
            { name: 'MD语法图片: src保留', md: '![图片](minio:render_test_md)', check: (json) => { const imgs = extractImages(json); return imgs.length === 1 && imgs[0].src === 'minio:render_test_md' } },
            { name: 'HTML标签+width: src+width保留', md: `${LT}img src="minio:render_test_html" width="800"${GT}`, check: (json) => { const imgs = extractImages(json); return imgs.length === 1 && imgs[0].src === 'minio:render_test_html' && imgs[0].width === 800 } },
            { name: '图片调整大小后width保留', md: `${LT}img src="minio:resized" alt="resized" width="600"${GT}`, check: (json) => { const imgs = extractImages(json); return imgs.length === 1 && imgs[0].width === 600 && imgs[0].alt === 'resized' } },
        ],
    },
    {
        group: 'Markdown 序列化（预期退化）',
        items: [
            { name: 'MD语法: 正常输出', md: '![图片](minio:md_out)', check: (json, mdOut) => mdOut.includes('minio:md_out'), checkTarget: 'md' },
            { name: 'HTML+width: width丢失(预期)', md: `${LT}img src="minio:html_out" width="800"${GT}`, check: (json, mdOut) => !mdOut.includes('width') && mdOut.includes('minio:html_out'), checkTarget: 'md' },
        ],
    },
    {
        group: '不崩溃验证',
        items: [
            { name: '多图混合不崩溃', md: `![a](minio:a1)\n\n正文\n\n${LT}img src="minio:a2" width="400"${GT}\n\n![c](minio:a3)`, check: (json) => extractImages(json).length === 3 },
            { name: '无图片的文档不崩溃', md: '# 纯标题\n\n**粗体**文字\n\n- 列表\n- 列表2', check: (json) => json.type === 'doc' },
        ],
    },
]

export default function RenderMarkdownTest() {
    const [results, setResults] = useState(null)
    const [removed, setRemoved] = useState(true)

    const run = () => {
        const allItems = SCENARIOS.flatMap(g => g.items.map(i => ({ ...i, group: g.group })))
        const r = allItems.map((tc, i) => {
            try {
                const { json, markdownOutput } = convert(tc.md, removed)
                const jsonStr = JSON.stringify(json)
                const imgs = extractImages(json)
                const passed = tc.checkTarget === 'md' ? tc.check(json, markdownOutput) : tc.check(json, markdownOutput)

                return {
                    index: i, group: tc.group, name: tc.name, ok: true, passed,
                    mdInLen: tc.md.length, jsonLen: jsonStr.length,
                    mdOutPreview: typeof markdownOutput === 'string' ? markdownOutput.slice(0, 120) : String(markdownOutput).slice(0, 120),
                    imgCount: imgs.length,
                    imgDetails: imgs.map(img => `${img.src}${img.width ? ` w:${img.width}` : ''}`).join(', '),
                }
            } catch (e) {
                return { index: i, group: tc.group, name: tc.name, ok: false, error: e.message }
            }
        })
        setResults(r)
    }

    const groups = [...new Set((results || []).map(r => r.group))]

    return (
        <div style={{ maxWidth: 1600, margin: '0 auto', padding: 24, fontFamily: 'monospace' }}>
            <h1 style={{ borderBottom: '2px solid #1890ff', paddingBottom: 12 }}>
                测试 6：移除 renderMarkdown 影响验证
            </h1>

            <div style={{ padding: 12, background: '#e6f7ff', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
                <strong>renderMarkdown 状态:</strong>
                <span style={{ color: removed ? '#cf1322' : '#52c41a', fontWeight: 'bold', marginLeft: 8 }}>
                    {removed ? '已移除（return null）' : '原始实现'}
                </span>
                <br />
                <strong>预期：</strong>JSON 解析和图片属性保留完全不受影响；getMarkdown() 输出中 width 属性丢失（不再需要）。
            </div>

            <div style={{ marginBottom: 16 }}>
                <button onClick={() => { setRemoved(!removed); setResults(null) }}
                    style={{ padding: '8px 16px', marginRight: 12, cursor: 'pointer', background: removed ? '#ff4d4f' : '#52c41a', color: '#fff', border: 'none', borderRadius: 6 }}>
                    切换: {removed ? '当前=已移除' : '当前=原始'}
                </button>
                <button onClick={run} style={{ padding: '10px 24px', fontSize: 14, cursor: 'pointer', background: '#1890ff', color: '#fff', border: 'none', borderRadius: 6 }}>
                    开始测试
                </button>
            </div>

            {results && (
                <>
                    {groups.map(g => {
                        const gr = results.filter(r => r.group === g)
                        const pass = gr.filter(r => r.ok && r.passed).length
                        const crash = gr.filter(r => !r.ok).length
                        return (
                            <div key={g} style={{ marginBottom: 24 }}>
                                <h2>{g} <span style={{ color: crash === 0 && pass === gr.length ? '#52c41a' : '#ff4d4f', fontSize: 16 }}>
                                    {pass}/{gr.length} {crash > 0 ? ` ${crash}崩溃` : ''}
                                </span></h2>
                                <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
                                    <thead>
                                        <tr style={{ background: '#f0f0f0' }}>
                                            <th style={{ padding: '6px 8px', border: '1px solid #ddd' }}>#</th>
                                            <th style={{ padding: '6px 8px', border: '1px solid #ddd' }}>场景</th>
                                            <th style={{ padding: '6px 8px', border: '1px solid #ddd' }}>结果</th>
                                            <th style={{ padding: '6px 8px', border: '1px solid #ddd' }}>MD输入→JSON</th>
                                            <th style={{ padding: '6px 8px', border: '1px solid #ddd' }}>图片</th>
                                            <th style={{ padding: '6px 8px', border: '1px solid #ddd' }}>getMarkdown输出</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {gr.map(r => {
                                            if (!r.ok) return (
                                                <tr key={r.index} style={{ background: '#fff2f0' }}>
                                                    <td style={{ padding: '4px 8px', border: '1px solid #ddd' }}>{r.index + 1}</td>
                                                    <td style={{ padding: '4px 8px', border: '1px solid #ddd' }}>{r.name}</td>
                                                    <td colSpan={4} style={{ color: '#ff4d4f', padding: '4px 8px', border: '1px solid #ddd' }}>💥 {r.error}</td>
                                                </tr>
                                            )
                                            return (
                                                <tr key={r.index} style={{ background: r.passed ? '#f6ffed' : '#fff2f0' }}>
                                                    <td style={{ padding: '4px 8px', border: '1px solid #ddd' }}>{r.index + 1}</td>
                                                    <td style={{ padding: '4px 8px', border: '1px solid #ddd' }}>{r.name}</td>
                                                    <td style={{ padding: '4px 8px', border: '1px solid #ddd', fontWeight: 'bold', color: r.passed ? '#52c41a' : '#ff4d4f' }}>{r.passed ? '✅' : '❌'}</td>
                                                    <td style={{ padding: '4px 8px', border: '1px solid #ddd' }}>{r.mdInLen}→{r.jsonLen}</td>
                                                    <td style={{ padding: '4px 8px', border: '1px solid #ddd', fontSize: 11 }}>{r.imgCount}张: {r.imgDetails}</td>
                                                    <td style={{ padding: '4px 8px', border: '1px solid #ddd', fontSize: 10, maxWidth: 350, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }} title={r.mdOutPreview}>{r.mdOutPreview}</td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )
                    })}

                    <div style={{ padding: 16, borderRadius: 8, fontSize: 16,
                        background: results.every(r => r.ok) ? '#f6ffed' : '#fff2f0',
                        border: `2px solid ${results.every(r => r.ok) ? '#52c41a' : '#ff4d4f'}` }}>
                        <strong>
                            {results.every(r => r.ok)
                                ? `✅ 零崩溃！renderMarkdown 移除安全`
                                : `❌ ${results.filter(r => !r.ok).length} 个崩溃`
                            }
                        </strong>
                        <div style={{ marginTop: 8, fontSize: 13, color: '#666' }}>
                            JSON 解析通过: {results.filter(r => r.group === 'JSON 解析（不应受影响）' && r.passed).length}/{results.filter(r => r.group === 'JSON 解析（不应受影响）').length}
                            &nbsp;|&nbsp; Markdown退化(预期): {results.filter(r => r.group === 'Markdown 序列化（预期退化）' && r.passed).length}/{results.filter(r => r.group === 'Markdown 序列化（预期退化）').length}
                            &nbsp;|&nbsp; 不崩溃: {results.filter(r => r.group === '不崩溃验证' && r.passed).length}/{results.filter(r => r.group === '不崩溃验证').length}
                        </div>
                    </div>
                </>
            )}
        </div>
    )
}
