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

function extractText(node) {
    const t = []
    function w(n) { if (n.text !== undefined) t.push(n.text); if (n.content) n.content.forEach(w) }
    w(node); return t.join('')
}

function countNodes(node, type) {
    let c = 0
    function w(n) { if (n.type === type) c++; if (n.content) n.content.forEach(w) }
    w(node); return c
}

const LT = String.fromCharCode(60)
const GT = String.fromCharCode(62)

// ============================================================
// 测试 5 补测：之前失败的项目，完整扩展集覆盖
// ============================================================
const TEST_5_FIXES = [
    {
        name: '5-9: 纯链接无文本',
        md: '[](http://example.com)',
        check: (j) => {
            let ok = false
            function w(n) { if (n.marks) n.marks.forEach(m => { if (m.type === 'link') ok = m.attrs.href === 'http://example.com' }); if (n.content) n.content.forEach(w) }
            w(j); return ok
        },
    },
    {
        name: '5-10: 图片无描述（MinioImage）',
        md: '![](minio:noalt_retest)',
        check: (j) => {
            let ok = false
            function w(n) { if (n.type === 'image' && n.attrs?.src === 'minio:noalt_retest') ok = true; if (n.content) n.content.forEach(w) }
            w(j); return ok
        },
    },
]

// ============================================================
// 测试 2 补测：之前图片丢失的文档，完整扩展集覆盖
// ============================================================
const TEST_2_FIXES = [
    {
        name: '2-40: MD语法图片',
        md: '![图片描述](minio:test_md_format)',
        check: (j) => {
            let img = null
            function w(n) { if (n.type === 'image') img = n; if (n.content) n.content.forEach(w) }
            w(j)
            return img && img.attrs?.src === 'minio:test_md_format' && img.attrs?.alt === '图片描述'
        },
    },
    {
        name: '2-50: HTML标签图片(有width)',
        md: `${LT}img src="minio:test_html_format" alt="测试" width="800"${GT}`,
        check: (j) => {
            let img = null
            function w(n) { if (n.type === 'image') img = n; if (n.content) n.content.forEach(w) }
            w(j)
            return img && img.attrs?.src === 'minio:test_html_format' && img.attrs?.width === 800
        },
    },
    {
        name: '2-85: 混合MD+HTML图片',
        md: `正文\n\n![图1](minio:md_img_01)\n\n正文\n\n${LT}img src="minio:html_img_02" width="600"${GT}\n\n正文`,
        check: (j) => {
            let imgs = []
            function w(n) { if (n.type === 'image') imgs.push(n.attrs); if (n.content) n.content.forEach(w) }
            w(j)
            const mdImg = imgs.find(a => a.src === 'minio:md_img_01')
            const htmlImg = imgs.find(a => a.src === 'minio:html_img_02')
            return imgs.length === 2 && !!mdImg && !!htmlImg && htmlImg.width === 600
        },
    },
    {
        name: '2-105: HTML标签图片(无width)',
        md: `${LT}img src="minio:test_nowidth" alt="test"${GT}`,
        check: (j) => {
            let img = null
            function w(n) { if (n.type === 'image') img = n; if (n.content) n.content.forEach(w) }
            w(j)
            return img && img.attrs?.src === 'minio:test_nowidth' && !img.attrs?.width
        },
    },
]

// ============================================================
// 测试 5 新增补充：代码块（CodeBlockWithToolbar 完整扩展）
// ============================================================
const CODE_TESTS = [
    {
        name: '代码块: JavaScript',
        md: '```javascript\nconst x = 1;\nconsole.log(x);\n```',
        check: (j) => {
            let ok = false
            function w(n) { if (n.type === 'codeBlock') ok = n.attrs?.language === 'javascript'; if (n.content) n.content.forEach(w) }
            w(j); return ok
        },
    },
    {
        name: '代码块: 无语言',
        md: '```\nplain text\n```',
        check: (j) => {
            let count = 0
            function w(n) { if (n.type === 'codeBlock') count++; if (n.content) n.content.forEach(w) }
            w(j); return count === 1
        },
    },
    {
        name: '代码块: Python',
        md: '```python\ndef hello():\n    print("hello")\n```',
        check: (j) => {
            let ok = false
            function w(n) { if (n.type === 'codeBlock') ok = n.attrs?.language === 'python'; if (n.content) n.content.forEach(w) }
            w(j); return ok
        },
    },
]

export default function FullExtensionTest() {
    const [results, setResults] = useState(null)

    const run = () => {
        const all = [
            ...TEST_5_FIXES.map(t => ({ ...t, group: '测试5补测' })),
            ...TEST_2_FIXES.map(t => ({ ...t, group: '测试2补测' })),
            ...CODE_TESTS.map(t => ({ ...t, group: '代码块' })),
        ]

        const r = all.map((tc, i) => {
            try {
                // 第一次转换
                const json1 = convert(tc.md)
                const s1 = JSON.stringify(json1)
                const passed = tc.check(json1)

                // 第二次重载：验证确定性
                const json2 = convert(tc.md)
                const s2 = JSON.stringify(json2)
                const deterministic = s1 === s2

                const text = extractText(json1)
                return {
                    index: i, group: tc.group, name: tc.name, ok: true, passed, deterministic,
                    jsonLen: s1.length, mdLen: tc.md.length,
                    jsonPreview: s1.slice(0, 250), textPreview: text.slice(0, 60),
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
                补测：完整扩展集（含 MinioImage + CodeBlockWithToolbar）
            </h1>

            <div style={{ padding: 12, background: '#e6f7ff', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
                <strong>验证目标：</strong>将之前测试中因环境限制（缺 MinioImage / CodeBlockWithToolbar）失败的项，
                用完整扩展集重测。<br />
                扩展: StarterKit, CodeBlockWithToolbar, Underline, Link, <strong>MinioImage</strong>, Table,
                Markdown, FontFamily, TextStyle, Color, Highlight
            </div>

            <button onClick={run} style={{ padding: '10px 24px', fontSize: 14, cursor: 'pointer', background: '#1890ff', color: '#fff', border: 'none', borderRadius: 6, marginBottom: 16 }}>
                开始测试
            </button>

            {results && (
                <>
                    {groups.map(g => {
                        const groupResults = results.filter(r => r.group === g)
                        const passCount = groupResults.filter(r => r.ok && r.passed).length
                        const crashCount = groupResults.filter(r => !r.ok).length
                        const allOk = crashCount === 0 && passCount === groupResults.length

                        return (
                            <div key={g} style={{ marginBottom: 24 }}>
                                <h2>{g} <span style={{ color: allOk ? '#52c41a' : '#ff4d4f', fontSize: 16 }}>
                                    {allOk ? '✅ ' + passCount + '/' + groupResults.length : '⚠️ ' + passCount + '/' + groupResults.length}
                                </span></h2>
                                <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
                                    <thead>
                                        <tr style={{ background: '#f0f0f0' }}>
                                            <th style={{ padding: '6px 8px', border: '1px solid #ddd' }}>#</th>
                                            <th style={{ padding: '6px 8px', border: '1px solid #ddd' }}>样本</th>
                                            <th style={{ padding: '6px 8px', border: '1px solid #ddd' }}>MD→JSON</th>
                                            <th style={{ padding: '6px 8px', border: '1px solid #ddd' }}>结果</th>
                                            <th style={{ padding: '6px 8px', border: '1px solid #ddd' }}>确定性</th>
                                            <th style={{ padding: '6px 8px', border: '1px solid #ddd' }}>文本提取</th>
                                            <th style={{ padding: '6px 8px', border: '1px solid #ddd' }}>JSON片段</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {groupResults.map(r => {
                                            if (!r.ok) return (
                                                <tr key={r.index} style={{ background: '#fff2f0' }}>
                                                    <td style={{ padding: '4px 8px', border: '1px solid #ddd' }}>{r.index + 1}</td>
                                                    <td style={{ padding: '4px 8px', border: '1px solid #ddd' }}>{r.name}</td>
                                                    <td colSpan={5} style={{ color: '#ff4d4f', padding: '4px 8px', border: '1px solid #ddd' }}>异常: {r.error}</td>
                                                </tr>
                                            )
                                            return (
                                                <tr key={r.index} style={{ background: r.passed ? '#f6ffed' : '#fff2f0' }}>
                                                    <td style={{ padding: '4px 8px', border: '1px solid #ddd' }}>{r.index + 1}</td>
                                                    <td style={{ padding: '4px 8px', border: '1px solid #ddd' }}>{r.name}</td>
                                                    <td style={{ padding: '4px 8px', border: '1px solid #ddd' }}>{r.mdLen}→{r.jsonLen}</td>
                                                    <td style={{ padding: '4px 8px', border: '1px solid #ddd', fontWeight: 'bold', color: r.passed ? '#52c41a' : '#ff4d4f' }}>
                                                        {r.passed ? '✅' : '❌'}
                                                    </td>
                                                    <td style={{ padding: '4px 8px', border: '1px solid #ddd', color: r.deterministic ? '#52c41a' : '#ff4d4f' }}>
                                                        {r.deterministic ? '✅' : '❌'}
                                                    </td>
                                                    <td style={{ padding: '4px 8px', border: '1px solid #ddd', fontSize: 11 }}>{r.textPreview}</td>
                                                    <td style={{ padding: '4px 8px', border: '1px solid #ddd', fontSize: 10, maxWidth: 300, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }} title={r.jsonPreview}>{r.jsonPreview}</td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )
                    })}

                    <div style={{ padding: 16, borderRadius: 8, fontSize: 16,
                        background: results.every(r => r.ok && r.passed) ? '#f6ffed' : '#fff2f0',
                        border: `2px solid ${results.every(r => r.ok && r.passed) ? '#52c41a' : '#ff4d4f'}` }}>
                        <strong>
                            {results.every(r => r.ok && r.passed)
                                ? `✅ 全部通过！${results.length}/${results.length} 完整扩展集验证通过`
                                : `❌ ${results.filter(r => !r.passed || !r.ok).length} 个失败`
                            }
                        </strong>
                        <div style={{ marginTop: 8, fontSize: 13, color: '#666' }}>
                            之前的环境限制项已用完整扩展集验证。确定性: {results.filter(r => r.deterministic).length}/{results.length}
                        </div>
                    </div>
                </>
            )}
        </div>
    )
}
