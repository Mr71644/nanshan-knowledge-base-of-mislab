import { useState, useEffect, useRef } from 'react'
import { Editor } from '@tiptap/core'
import { useEditor } from '@tiptap/react'
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

// ============================================================
// 完全相同的扩展配置 — 一个地方定义，测试两端共用
// ============================================================
function buildExtensions() {
    return [
        StarterKit.configure({
            heading: { levels: [1, 2, 3] },
            link: false,
            codeBlock: false,
            underline: false,
        }),
        CodeBlockWithToolbar.configure({ lowlight }),
        Underline,
        Link.configure({ openOnClick: false }),
        MinioImage,
        Table.configure({ resizable: true }),
        TableRow,
        TableCell,
        TableHeader,
        Markdown,
        FontFamily.configure({ types: ['textStyle'] }),
        TextStyle,
        Color.configure({ types: ['textStyle'] }),
        Highlight.configure({ multicolor: true }),
    ]
}

// ============================================================
// Headless 转换：Editor.create + 离屏 DOM → getJSON() → destroy()
// 这是静默迁移引擎的核心逻辑
// ============================================================
function convertHeadless(markdown) {
    const el = document.createElement('div')
    // 不挂载到文档树中，完全离屏
    const editor = new Editor({
        element: el,
        extensions: buildExtensions(),
        content: markdown || '',
        contentType: 'markdown',
    })
    const json = editor.getJSON()
    editor.destroy()
    return json
}

// ============================================================
// 测试样本
// ============================================================
const TEST_SAMPLES = [
    { name: '纯文本段落', md: '# 标题\n\n正文段落内容。' },
    { name: '粗体+斜体+行内代码', md: '**粗体** *斜体* `code`' },
    { name: '链接', md: '[示例链接](https://example.com)' },
    { name: '图片(minio)', md: '![测试图片](minio:test123)' },
    { name: '无序列表', md: '- 项目1\n- 项目2\n  - 嵌套子项' },
    { name: '有序列表', md: '1. 第一项\n2. 第二项' },
    { name: '表格', md: '| 列A | 列B |\n| --- | --- |\n| 值1 | 值2 |' },
    { name: '引用', md: '> 这是引用文字\n> 第二行引用' },
    { name: '代码块', md: '```javascript\nconsole.log("hello");\n```' },
    {
        name: '组合文档',
        md: `# 完整文档

## 第一节

这是**粗体**和*斜体*文字，包含[链接](http://example.com)。

- 列表1
- 列表2
  - 嵌套列表

| A | B |
|---|---|
| 1 | 2 |

> 引用

\`\`\`javascript
const x = 1;
\`\`\`

![图片](minio:abc123)`,
    },
    { name: '数字列表(bug场景)', md: '- 1. 第一项\n- 2. 第二项' },
    { name: '空文档', md: '' },
]

// ============================================================
// 辅助函数
// ============================================================
function extractTexts(node) {
    const texts = []
    function walk(n) {
        if (n.text !== undefined) texts.push(n.text)
        if (n.content) n.content.forEach(walk)
    }
    walk(node)
    return texts
}

function countNodes(node, type) {
    let count = 0
    function walk(n) {
        if (n.type === type) count++
        if (n.content) n.content.forEach(walk)
    }
    walk(node)
    return count
}

function nodeStats(json) {
    return {
        paragraphs: countNodes(json, 'paragraph'),
        headings: countNodes(json, 'heading'),
        tables: countNodes(json, 'table'),
        images: countNodes(json, 'image'),
        codeBlocks: countNodes(json, 'codeBlock'),
        listItems: countNodes(json, 'listItem'),
        orderedLists: countNodes(json, 'orderedList'),
        bulletLists: countNodes(json, 'bulletList'),
        blockquotes: countNodes(json, 'blockquote'),
    }
}

// ============================================================
// Phase 1: Editor.create (headless, 离屏 DOM)
// ============================================================
function HeadlessPhase() {
    const results = TEST_SAMPLES.map((s, i) => {
        try {
            const json = convertHeadless(s.md)
            const texts = extractTexts(json)
            const stats = nodeStats(json)
            return { ok: true, index: i, json, texts, stats, jsonLen: JSON.stringify(json).length }
        } catch (e) {
            return { ok: false, index: i, error: e.message }
        }
    })

    return (
        <div>
            <h2>阶段 A：Editor.create（离屏 DOM — 静默迁移引擎方案）</h2>
            <p style={{ color: '#666', marginBottom: 12 }}>
                使用 <code>new Editor(&#123; element, extensions, content, contentType: 'markdown' &#125;)</code> 在离屏 DOM 上创建编辑器，
                调用 <code>getJSON()</code> 后立即 <code>destroy()</code>。不依赖 React，可在任何浏览器环境运行。
            </p>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
                <thead>
                    <tr style={{ background: '#f0f0f0' }}>
                        <th style={{ padding: '6px 8px', border: '1px solid #ddd' }}></th>
                        <th style={{ padding: '6px 8px', border: '1px solid #ddd' }}>#</th>
                        <th style={{ padding: '6px 8px', border: '1px solid #ddd' }}>样本</th>
                        <th style={{ padding: '6px 8px', border: '1px solid #ddd' }}>JSON长度</th>
                        <th style={{ padding: '6px 8px', border: '1px solid #ddd' }}>文本字符</th>
                        <th style={{ padding: '6px 8px', border: '1px solid #ddd', minWidth: 200 }}>节点统计</th>
                    </tr>
                </thead>
                <tbody>
                    {results.map(r => {
                        if (!r.ok) return (
                            <tr key={r.index}>
                                <td style={{ color: '#ff4d4f', padding: '4px 8px', border: '1px solid #ddd' }}>💥</td>
                                <td style={{ padding: '4px 8px', border: '1px solid #ddd' }}>{r.index + 1}</td>
                                <td style={{ padding: '4px 8px', border: '1px solid #ddd' }}>{TEST_SAMPLES[r.index].name}</td>
                                <td colSpan={3} style={{ color: '#ff4d4f', padding: '4px 8px', border: '1px solid #ddd' }}>异常: {r.error}</td>
                            </tr>
                        )
                        return (
                            <tr key={r.index}>
                                <td style={{ color: '#52c41a', padding: '4px 8px', border: '1px solid #ddd', fontWeight: 'bold' }}>✅</td>
                                <td style={{ padding: '4px 8px', border: '1px solid #ddd' }}>{r.index + 1}</td>
                                <td style={{ padding: '4px 8px', border: '1px solid #ddd' }}>{TEST_SAMPLES[r.index].name}</td>
                                <td style={{ padding: '4px 8px', border: '1px solid #ddd' }}>{r.jsonLen} 字符</td>
                                <td style={{ padding: '4px 8px', border: '1px solid #ddd' }}>{r.texts.join('').length} 文本字符</td>
                                <td style={{ padding: '4px 8px', border: '1px solid #ddd', fontSize: 11 }}>
                                    {Object.entries(r.stats).filter(([, v]) => v > 0).map(([k, v]) => `${k}:${v}`).join(', ') || '(空文档)'}
                                </td>
                            </tr>
                        )
                    })}
                </tbody>
            </table>
        </div>
    )
}

// ============================================================
// Phase 2: useEditor (React — 编辑器实际使用的路径)
// ============================================================
function EditorPhase({ onDone }) {
    const [currentIndex, setCurrentIndex] = useState(0)
    const resultsRef = useRef([])
    const [results, setResults] = useState([])
    const [editorReady, setEditorReady] = useState(false)
    const processTimerRef = useRef(null)

    const editor = useEditor({
        extensions: buildExtensions(),
        content: '',
        onUpdate: () => {
            if (!editorReady) setEditorReady(true)
        },
    })

    // 编辑器就绪后逐样本处理
    useEffect(() => {
        if (!editor || !editorReady) return

        const processNext = () => {
            if (currentIndex >= TEST_SAMPLES.length) {
                onDone(resultsRef.current)
                return
            }

            const md = TEST_SAMPLES[currentIndex].md
            editor.commands.setContent(md || '', { contentType: 'markdown' })

            // ProseMirror 解析是同步的，但为了安全给一个小延迟
            processTimerRef.current = setTimeout(() => {
                const json = editor.getJSON()
                resultsRef.current = [...resultsRef.current, { index: currentIndex, json }]
                setResults(resultsRef.current)
                setCurrentIndex(i => i + 1)
            }, 30)
        }

        processNext()
    }, [editor, editorReady, currentIndex])

    useEffect(() => {
        return () => {
            if (processTimerRef.current) clearTimeout(processTimerRef.current)
        }
    }, [])

    const resultMap = {}
    results.forEach(r => { resultMap[r.index] = r.json })

    return (
        <div>
            <h2>阶段 B：useEditor（React Hook — 编辑器实际运行路径）</h2>
            <p style={{ color: '#666', marginBottom: 12 }}>
                使用 <code>useEditor()</code> React Hook，通过 <code>editor.commands.setContent(md, {{ contentType: 'markdown' }})</code>
                来加载 Markdown 并获取 <code>editor.getJSON()</code>。这是编辑器中当前使用的方式。
            </p>
            <div style={{ marginBottom: 12, padding: '8px 12px', background: '#fafafa', borderRadius: 6 }}>
                进度: {currentIndex}/{TEST_SAMPLES.length}
                {!editorReady && ' (等待编辑器初始化...)'}
                {currentIndex >= TEST_SAMPLES.length && ' ✅ 完成'}
            </div>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
                <thead>
                    <tr style={{ background: '#f0f0f0' }}>
                        <th style={{ padding: '6px 8px', border: '1px solid #ddd' }}></th>
                        <th style={{ padding: '6px 8px', border: '1px solid #ddd' }}>#</th>
                        <th style={{ padding: '6px 8px', border: '1px solid #ddd' }}>样本</th>
                        <th style={{ padding: '6px 8px', border: '1px solid #ddd' }}>JSON长度</th>
                        <th style={{ padding: '6px 8px', border: '1px solid #ddd' }}>文本字符</th>
                        <th style={{ padding: '6px 8px', border: '1px solid #ddd', minWidth: 200 }}>节点统计</th>
                    </tr>
                </thead>
                <tbody>
                    {TEST_SAMPLES.map((s, i) => {
                        const json = resultMap[i]
                        if (!json) return (
                            <tr key={i}>
                                <td style={{ color: '#faad14', padding: '4px 8px', border: '1px solid #ddd' }}>⏳</td>
                                <td style={{ padding: '4px 8px', border: '1px solid #ddd' }}>{i + 1}</td>
                                <td style={{ padding: '4px 8px', border: '1px solid #ddd' }}>{s.name}</td>
                                <td colSpan={3} style={{ padding: '4px 8px', border: '1px solid #ddd' }}>等待中...</td>
                            </tr>
                        )
                        const texts = extractTexts(json)
                        const stats = nodeStats(json)
                        return (
                            <tr key={i}>
                                <td style={{ color: '#1890ff', padding: '4px 8px', border: '1px solid #ddd', fontWeight: 'bold' }}>📝</td>
                                <td style={{ padding: '4px 8px', border: '1px solid #ddd' }}>{i + 1}</td>
                                <td style={{ padding: '4px 8px', border: '1px solid #ddd' }}>{s.name}</td>
                                <td style={{ padding: '4px 8px', border: '1px solid #ddd' }}>{JSON.stringify(json).length} 字符</td>
                                <td style={{ padding: '4px 8px', border: '1px solid #ddd' }}>{texts.join('').length} 文本字符</td>
                                <td style={{ padding: '4px 8px', border: '1px solid #ddd', fontSize: 11 }}>
                                    {Object.entries(stats).filter(([, v]) => v > 0).map(([k, v]) => `${k}:${v}`).join(', ') || '(空文档)'}
                                </td>
                            </tr>
                        )
                    })}
                </tbody>
            </table>
        </div>
    )
}

// ============================================================
// Phase 3: 逐项 JSON 对比
// ============================================================
function ComparePhase({ headlessResults, editorResults }) {
    const editorMap = {}
    editorResults.forEach(r => { editorMap[r.index] = r.json })

    let passCount = 0
    let failCount = 0
    const rows = TEST_SAMPLES.map((s, i) => {
        const hJson = headlessResults[i]?.json
        const eJson = editorMap[i]
        if (!hJson || !eJson) return null

        const h = JSON.stringify(hJson)
        const e = JSON.stringify(eJson)
        const match = h === e
        if (match) passCount++
        else failCount++

        return { index: i, name: s.name, match, h, e, hJson, eJson, hLen: h.length, eLen: e.length }
    })

    return (
        <div>
            <h2>阶段 C：JSON 逐项对比</h2>
            <p style={{ color: '#666', marginBottom: 12 }}>
                比较 <code>Editor.create</code> (离屏 DOM) 与 <code>useEditor</code> (React) 对同一 Markdown 输入产生的 JSON。
                如果完全一致，说明静默迁移引擎可以安全使用离屏 DOM 方案。
            </p>

            <div style={{
                padding: 16, marginBottom: 16, borderRadius: 8, fontSize: 16,
                background: failCount === 0 ? '#f6ffed' : '#fff2f0',
                border: `2px solid ${failCount === 0 ? '#52c41a' : '#ff4d4f'}`,
            }}>
                <strong>
                    {failCount === 0
                        ? `✅ 全部通过！${passCount}/${TEST_SAMPLES.length} 样本 JSON 完全一致`
                        : `❌ ${failCount} 个差异！${passCount}/${TEST_SAMPLES.length} 通过`
                    }
                </strong>
                <div style={{ marginTop: 8, fontSize: 13, color: '#666' }}>
                    结论：{failCount === 0
                        ? 'Editor.create（离屏DOM）可以作为静默迁移的 headless 转换引擎。'
                        : '存在差异，需要分析和修复。迁移引擎需要进一步调整。'}
                </div>
            </div>

            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
                <thead>
                    <tr style={{ background: '#f0f0f0' }}>
                        <th style={{ padding: '6px 8px', border: '1px solid #ddd' }}>结果</th>
                        <th style={{ padding: '6px 8px', border: '1px solid #ddd' }}>#</th>
                        <th style={{ padding: '6px 8px', border: '1px solid #ddd' }}>样本</th>
                        <th style={{ padding: '6px 8px', border: '1px solid #ddd' }}>离屏</th>
                        <th style={{ padding: '6px 8px', border: '1px solid #ddd' }}>编辑器</th>
                        <th style={{ padding: '6px 8px', border: '1px solid #ddd' }}>详情</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.filter(Boolean).map(row => (
                        <tr key={row.index} style={{ background: row.match ? '#f6ffed' : '#fff2f0' }}>
                            <td style={{ padding: '4px 8px', border: '1px solid #ddd', fontWeight: 'bold', color: row.match ? '#52c41a' : '#ff4d4f' }}>
                                {row.match ? '✅' : '❌'}
                            </td>
                            <td style={{ padding: '4px 8px', border: '1px solid #ddd' }}>{row.index + 1}</td>
                            <td style={{ padding: '4px 8px', border: '1px solid #ddd' }}>{row.name}</td>
                            <td style={{ padding: '4px 8px', border: '1px solid #ddd' }}>{row.hLen} 字符</td>
                            <td style={{ padding: '4px 8px', border: '1px solid #ddd' }}>{row.eLen} 字符</td>
                            <td style={{ padding: '4px 8px', border: '1px solid #ddd' }}>
                                {row.match ? (
                                    <span style={{ color: '#52c41a' }}>完全一致</span>
                                ) : (
                                    <details>
                                        <summary style={{ color: '#ff4d4f', cursor: 'pointer' }}>
                                            差异 ({Math.abs(row.hLen - row.eLen)} 字符差)
                                        </summary>
                                        <div style={{ display: 'flex', gap: 12, marginTop: 8, maxHeight: 300, overflow: 'auto' }}>
                                            <div style={{ flex: 1 }}>
                                                <strong>离屏 (Editor.create):</strong>
                                                <pre style={{ fontSize: 10, whiteSpace: 'pre-wrap', background: '#fff', padding: 8, border: '1px solid #ddd' }}>{row.h.slice(0, 2000)}</pre>
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <strong>编辑器 (useEditor):</strong>
                                                <pre style={{ fontSize: 10, whiteSpace: 'pre-wrap', background: '#fff', padding: 8, border: '1px solid #ddd' }}>{row.e.slice(0, 2000)}</pre>
                                            </div>
                                        </div>
                                    </details>
                                )}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}

// ============================================================
// Main
// ============================================================
export default function MigrationTest() {
    const [phase, setPhase] = useState('headless') // headless → editor → compare
    const [editorResults, setEditorResults] = useState(null)

    // Phase 1: 立即计算 headless 结果
    const headlessResults = TEST_SAMPLES.map((s, i) => {
        try {
            const json = convertHeadless(s.md)
            return { ok: true, index: i, json }
        } catch (e) {
            return { ok: false, index: i, error: e.message }
        }
    })

    const handleEditorDone = (results) => {
        setEditorResults(results)
        setPhase('compare')
    }

    const startEditor = () => {
        setPhase('editor')
    }

    return (
        <div style={{ maxWidth: 1500, margin: '0 auto', padding: 24, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
            <h1 style={{ borderBottom: '2px solid #1890ff', paddingBottom: 12 }}>
                测试 1：Headless 转换引擎 与 Editor.getJSON 输出一致性
            </h1>

            <div style={{ marginBottom: 24, padding: 12, background: '#e6f7ff', borderRadius: 8, fontSize: 13 }}>
                <strong>验证假设：</strong>使用 <code>Editor.create(&#123; element: detachedDiv &#125;)</code> 在离屏 DOM 上
                创建的编辑器，其 <code>getJSON()</code> 输出与 React <code>useEditor()</code> 的 <code>getJSON()</code>
                输出完全一致。这是静默迁移引擎能否使用离屏 DOM 方案的前提。
            </div>

            <div style={{ marginBottom: 24, padding: 12, background: '#fffbe6', borderRadius: 8, fontSize: 13 }}>
                <strong>环境信息：</strong>
                @tiptap/core 3.23.4 | @tiptap/markdown 3.23.4 | @tiptap/starter-kit 3.23.4 |
                extensions: Markdown, StarterKit, Link, Underline, Table, MinioImage, CodeBlockWithToolbar,
                FontFamily, TextStyle, Color, Highlight
            </div>

            <HeadlessPhase />

            <hr style={{ margin: '32px 0', border: '1px dashed #ddd' }} />

            {phase === 'headless' && (
                <div style={{ textAlign: 'center', padding: 24 }}>
                    <button
                        onClick={startEditor}
                        style={{
                            padding: '12px 32px', fontSize: 16, cursor: 'pointer',
                            background: '#1890ff', color: '#fff', border: 'none', borderRadius: 6,
                        }}
                    >
                        启动阶段 B：Editor (useEditor) 测试
                    </button>
                    <p style={{ color: '#999', marginTop: 8 }}>需要用户点击以触发 React 编辑器初始化</p>
                </div>
            )}

            {phase === 'editor' && (
                <EditorPhase onDone={handleEditorDone} />
            )}

            {phase === 'compare' && editorResults && (
                <>
                    <hr style={{ margin: '32px 0', border: '1px dashed #ddd' }} />
                    <ComparePhase headlessResults={headlessResults} editorResults={editorResults} />
                </>
            )}
        </div>
    )
}
