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

function buildExtensions() {
    return [
        StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: false, codeBlock: false, underline: false }),
        CodeBlockWithToolbar.configure({ lowlight }),
        Underline,
        Link.configure({ openOnClick: false }),
        MinioImage,
        Table.configure({ resizable: true }), TableRow, TableCell, TableHeader,
        Markdown,
        FontFamily.configure({ types: ['textStyle'] }), TextStyle,
        Color.configure({ types: ['textStyle'] }), Highlight.configure({ multicolor: true }),
    ]
}

function convert(md) {
    const el = document.createElement('div')
    const editor = new Editor({ element: el, extensions: buildExtensions(), content: md || '', contentType: 'markdown' })
    const json = editor.getJSON()
    editor.destroy()
    return json
}

function extractImages(json) {
    const imgs = []
    function walk(n) {
        if (n.type === 'image') imgs.push({ src: n.attrs?.src, alt: n.attrs?.alt, width: n.attrs?.width, height: n.attrs?.height })
        if (n.content) n.content.forEach(walk)
    }
    walk(json)
    return imgs
}

// 还原 renderMarkdown 的逻辑生成测试样本
function mdImage(id) { return `![图片描述](minio:${id})` }
function htmlImage(id, w) { return `<img src="minio:${id}" alt="图片描述" width="${w}">` }

const SAMPLES = [
    { name: 'MD 语法单图', md: mdImage('abc123'), expectImg: 1, expectSrc: 'minio:abc123', expectWidth: undefined },
    { name: 'HTML 标签单图(有width)', md: htmlImage('def456', '800'), expectImg: 1, expectSrc: 'minio:def456', expectWidth: 800 },
    { name: 'MD + HTML 混合', md: `正文前\n\n${mdImage('img01')}\n\n正文中\n\n${htmlImage('img02', '600')}\n\n正文后`, expectImg: 2 },
    { name: 'MD 语法无alt', md: '![](minio:noalt001)', expectImg: 1, expectSrc: 'minio:noalt001' },
    { name: 'HTML 标签无width', md: '<img src="minio:nowidth001" alt="test">', expectImg: 1, expectSrc: 'minio:nowidth001', expectWidth: undefined },
    { name: '带其他markdown的混合', md: '**粗体文字**\n\n' + mdImage('bold01') + '\n\n- 列表项\n- 列表项2', expectImg: 1 },
    { name: '表格内图片', md: '| A | B |\n|---|---|\n| ' + mdImage('tbl01') + ' | 值2 |', expectImg: 1 },
]

export default function ImageMigrationTest() {
    const [results, setResults] = useState(null)

    const run = () => {
        const r = SAMPLES.map((s, i) => {
            try {
                const json = convert(s.md)
                const imgs = extractImages(json)
                const jsonStr = JSON.stringify(json)
                const checks = {
                    imgCount: imgs.length === s.expectImg,
                    srcPrefix: imgs.every(img => img.src?.startsWith('minio:')),
                }
                if (s.expectSrc) checks.expectSrc = imgs.some(img => img.src === s.expectSrc)
                if (s.expectWidth !== undefined) checks.expectWidth = imgs.some(img => img.width === s.expectWidth)

                const allPass = Object.values(checks).every(Boolean)
                return { index: i, ok: true, allPass, checks, imgs, jsonLen: jsonStr.length, mdLen: s.md.length, jsonPreview: jsonStr.slice(0, 300) }
            } catch (e) {
                return { index: i, ok: false, error: e.message }
            }
        })
        setResults(r)
    }

    return (
        <div style={{ maxWidth: 1500, margin: '0 auto', padding: 24, fontFamily: 'monospace' }}>
            <h1 style={{ borderBottom: '2px solid #1890ff', paddingBottom: 12 }}>图片迁移专项测试</h1>

            <div style={{ padding: 12, background: '#e6f7ff', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
                <strong>验证：</strong>MinioImage 扩展在 Editor.create 中对两种图片格式的处理能力<br />
                格式 A: <code>![alt](minio:xxx)</code> — 标准 Markdown，无缩放时产生<br />
                格式 B: <code>&lt;img src="minio:xxx" width="800"&gt;</code> — HTML 标签，拖拽缩放后产生<br />
                扩展集: 完整加载 MinioImage + CodeBlockWithToolbar（与正式编辑器一致）
            </div>

            <button onClick={run} style={{ padding: '10px 24px', fontSize: 14, cursor: 'pointer', background: '#1890ff', color: '#fff', border: 'none', borderRadius: 6, marginBottom: 16 }}>
                开始测试
            </button>

            {results && (
                <>
                    <div style={{ padding: 16, marginBottom: 16, borderRadius: 8, fontSize: 16,
                        background: results.every(r => r.allPass) ? '#f6ffed' : '#fff2f0',
                        border: `2px solid ${results.every(r => r.allPass) ? '#52c41a' : '#ff4d4f'}` }}>
                        <strong>
                            {results.every(r => r.allPass)
                                ? `✅ 全部通过！${results.length}/${results.length}`
                                : `❌ ${results.filter(r => !r.allPass).length} 个失败`
                            }
                        </strong>
                    </div>

                    <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
                        <thead>
                            <tr style={{ background: '#f0f0f0' }}>
                                <th style={{ padding: '6px 8px', border: '1px solid #ddd' }}>#</th>
                                <th style={{ padding: '6px 8px', border: '1px solid #ddd' }}>样本</th>
                                <th style={{ padding: '6px 8px', border: '1px solid #ddd' }}>MD输入</th>
                                <th style={{ padding: '6px 8px', border: '1px solid #ddd' }}>图片数</th>
                                <th style={{ padding: '6px 8px', border: '1px solid #ddd' }}>minio:前缀</th>
                                <th style={{ padding: '6px 8px', border: '1px solid #ddd' }}>src精确</th>
                                <th style={{ padding: '6px 8px', border: '1px solid #ddd' }}>width</th>
                                <th style={{ padding: '6px 8px', border: '1px solid #ddd' }}>结果</th>
                            </tr>
                        </thead>
                        <tbody>
                            {results.map((r, i) => {
                                if (!r.ok) return (
                                    <tr key={i} style={{ background: '#fff2f0' }}>
                                        <td style={{ padding: '4px 8px', border: '1px solid #ddd' }}>{i + 1}</td>
                                        <td style={{ padding: '4px 8px', border: '1px solid #ddd' }}>{SAMPLES[i].name}</td>
                                        <td colSpan={6} style={{ color: '#ff4d4f', padding: '4px 8px', border: '1px solid #ddd' }}>异常: {r.error}</td>
                                    </tr>
                                )
                                return (
                                    <tr key={i} style={{ background: r.allPass ? '#f6ffed' : '#fff2f0' }}>
                                        <td style={{ padding: '4px 8px', border: '1px solid #ddd' }}>{i + 1}</td>
                                        <td style={{ padding: '4px 8px', border: '1px solid #ddd' }}>{SAMPLES[i].name}</td>
                                        <td style={{ padding: '4px 8px', border: '1px solid #ddd', fontSize: 11, maxWidth: 250, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }} title={SAMPLES[i].md}>{SAMPLES[i].md.slice(0, 80)}</td>
                                        <td style={{ padding: '4px 8px', border: '1px solid #ddd' }}>{r.checks.imgCount ? '✅' : `❌ 期望${SAMPLES[i].expectImg} 实际${r.imgs.length}`}</td>
                                        <td style={{ padding: '4px 8px', border: '1px solid #ddd' }}>{r.checks.srcPrefix ? '✅' : '❌'}</td>
                                        <td style={{ padding: '4px 8px', border: '1px solid #ddd' }}>{r.checks.expectSrc === undefined ? '-' : r.checks.expectSrc ? '✅' : '❌'}</td>
                                        <td style={{ padding: '4px 8px', border: '1px solid #ddd' }}>{r.checks.expectWidth === undefined ? '-' : r.checks.expectWidth ? '✅' : '❌'}</td>
                                        <td style={{ padding: '4px 8px', border: '1px solid #ddd', fontWeight: 'bold', color: r.allPass ? '#52c41a' : '#ff4d4f' }}>
                                            {r.allPass ? '✅' : '❌'}
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>

                    <h3 style={{ marginTop: 24 }}>JSON 输出详情</h3>
                    {results.filter(r => r.ok).map((r, i) => (
                        <details key={i} style={{ margin: '4px 0' }}>
                            <summary style={{ cursor: 'pointer', padding: '4px 8px', background: '#fafafa' }}>
                                {SAMPLES[i].name} — {r.imgs.length} 张图片: {r.imgs.map(im => `${im.src}${im.width ? ` (w:${im.width})` : ''}`).join(', ')}
                            </summary>
                            <pre style={{ fontSize: 11, whiteSpace: 'pre-wrap', background: '#fff', padding: 8, border: '1px solid #ddd', maxHeight: 200, overflow: 'auto' }}>{r.jsonPreview}</pre>
                        </details>
                    ))}
                </>
            )}
        </div>
    )
}
