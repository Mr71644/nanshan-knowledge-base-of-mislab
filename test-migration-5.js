const [{ Editor }, { StarterKit }, { Markdown: Me }, linkMod, tableMod, { Underline },
    { FontFamily }, { TextStyle }, { Color }, { Highlight }] =
await Promise.all([
    import('/node_modules/.vite/deps/@tiptap_core.js?v=8c628478'),
    import('/node_modules/.vite/deps/@tiptap_starter-kit.js?v=8c628478'),
    import('/node_modules/.vite/deps/@tiptap_markdown.js?v=8c628478'),
    import('/node_modules/.vite/deps/@tiptap_extension-link.js?v=8c628478'),
    import('/node_modules/.vite/deps/@tiptap_extension-table.js?v=8c628478'),
    import('/node_modules/.vite/deps/@tiptap_extension-underline.js?v=8c628478'),
    import('/node_modules/.vite/deps/@tiptap_extension-font-family.js?v=8c628478'),
    import('/node_modules/.vite/deps/@tiptap_extension-text-style.js?v=8c628478'),
    import('/node_modules/.vite/deps/@tiptap_extension-color.js?v=8c628478'),
    import('/node_modules/.vite/deps/@tiptap_extension-highlight.js?v=8c628478'),
])

const { Link: LinkExt } = linkMod
const { Table, TableRow, TableCell, TableHeader } = tableMod
const EXT = [
    StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: false, codeBlock: false, underline: false }),
    Underline, LinkExt.configure({ openOnClick: false }),
    Table.configure({ resizable: true }), TableRow, TableCell, TableHeader, Me,
    FontFamily.configure({ types: ['textStyle'] }), TextStyle,
    Color.configure({ types: ['textStyle'] }), Highlight.configure({ multicolor: true }),
]

function extractText(node) {
    const t = []
    function w(n) { if (n.text !== undefined) t.push(n.text); if (n.content) n.content.forEach(w) }
    w(node); return t.join('')
}

const LT = String.fromCharCode(60)

const TESTS = [
    { name: '空文档', md: '', check: (j) => j.type === 'doc' },
    { name: '纯空白', md: '   \n\n   ', check: () => true },
    { name: 'Emoji + Unicode', md: '# 🚀\n\n中文 日本語', check: (j, t) => t.includes('🚀') },
    { name: '特殊标点', md: '`' + LT + 'script' + String.fromCharCode(62) + 'alert(1)' + LT + '/script' + String.fromCharCode(62) + '`', check: () => true },
    { name: 'URL链接特殊字符', md: '[链接](https://example.com/path?a=1&b=2#frag)', check: (j) => {
        let ok = false;
        (function w(n) { if (n.marks) n.marks.forEach(m => { if (m.type === 'link') ok = m.attrs.href === 'https://example.com/path?a=1&b=2#frag' }); if (n.content) n.content.forEach(w) })(j);
        return ok
    }},
    { name: '深层嵌套列表(5层)', md: '- 1\n  - 2\n    - 3\n      - 4\n        - 5', check: (j) => {
        let depth = 0
        function w(n, d) {
            if (n.type === 'bulletList') { depth = Math.max(depth, d); if (n.content) n.content.forEach(c => w(c, d + 1)) }
            else if (n.content) n.content.forEach(c => w(c, d))
        }
        w(j, 1); return depth >= 3
    }},
    { name: '空表格', md: '| A | B |\n| --- | --- |\n|  |  |', check: (j) => {
        let c = 0; (function w(n) { if (n.type === 'table') c++; if (n.content) n.content.forEach(w) })(j); return c === 1
    }},
    { name: '空代码块', md: '```\n```', check: () => true },
    { name: '纯链接无文本', md: '[](http://example.com)', check: (j) => {
        let ok = false;
        (function w(n) { if (n.marks) n.marks.forEach(m => { if (m.type === 'link') ok = m.attrs.href === 'http://example.com' }); if (n.content) n.content.forEach(w) })(j);
        return ok
    }},
    { name: '图片无描述', md: '![](minio:noalt_test)', check: (j) => {
        let ok = false;
        (function w(n) { if (n.type === 'image') ok = n.attrs && n.attrs.src === 'minio:noalt_test'; if (n.content) n.content.forEach(w) })(j);
        return ok
    }},
    { name: 'H1-H3连续标题', md: '# H1\n\n## H2\n\n### H3\n\n正文', check: (j) => {
        let h = 0; (function w(n) { if (n.type === 'heading') h++; if (n.content) n.content.forEach(w) })(j); return h === 3
    }},
    { name: '多表格(3个)', md: '| A |\n|---|\n| 1 |\n\n| X |\n|---|\n| a |\n\n| M |\n|---|\n| x |', check: (j) => {
        let c = 0; (function w(n) { if (n.type === 'table') c++; if (n.content) n.content.forEach(w) })(j); return c === 3
    }},
    { name: '引文中含粗体', md: '> **粗体引用** 普通引用', check: (j) => {
        let bq = false, b = false;
        (function w(n) { if (n.type === 'blockquote') bq = true; if (n.marks && n.marks.some(m => m.type === 'bold')) b = true; if (n.content) n.content.forEach(w) })(j);
        return bq && b
    }},
    { name: '超大文本(100KB)', md: '测试文档\n\n' + '这是一段很长的文本。'.repeat(10000), check: (j, t) => t.length > 50000 },
    { name: 'HTML实体', md: '价格: 5 &lt; 10 &amp;&amp; 3 &gt; 1 &quot;test&quot;', check: (j, t) => t.includes(LT) && t.includes('>') && t.includes('&') && t.includes('"') },
]

const results = TESTS.map((tc, i) => {
    try {
        const el = document.createElement('div')
        const ed = new Editor({ element: el, extensions: EXT, content: tc.md, contentType: 'markdown' })
        const json = ed.getJSON()
        ed.destroy()
        const text = extractText(json)
        const passed = tc.check(json, text)
        return { index: i, name: tc.name, ok: true, passed, mdLen: tc.md.length, jsonPreview: JSON.stringify(json).slice(0, 200), textPreview: text.slice(0, 80) }
    } catch (e) {
        return { index: i, name: tc.name, ok: false, error: e.message, mdLen: tc.md.length }
    }
})

const passCount = results.filter(r => r.ok && r.passed).length
const crashCount = results.filter(r => !r.ok).length
const total = TESTS.length

let html = '<table><thead><tr><th>#</th><th>样本</th><th>MD长度</th><th>状态</th><th>文本提取</th></tr></thead><tbody>'
results.forEach(r => {
    if (!r.ok) {
        html += '<tr class="fail"><td>' + (r.index + 1) + '</td><td>' + r.name + '</td><td>' + r.mdLen + '</td><td colspan="3" style="color:#ff4d4f">异常: ' + r.error + '</td></tr>'
        return
    }
    html += '<tr class="' + (r.passed ? 'ok' : 'fail') + '"><td>' + (r.passed ? 'OK' : 'FAIL') + ' ' + (r.index + 1) + '</td><td>' + r.name + '</td><td>' + r.mdLen + '</td><td style="font-weight:bold;color:' + (r.passed ? '#52c41a' : '#ff4d4f') + '">' + (r.passed ? 'PASS' : 'FAIL') + '</td><td style="font-size:11px">' + r.textPreview + '</td></tr>'
})
html += '</tbody></table>'

const allPass = crashCount === 0 && passCount === total
html += '<div class="banner ' + (allPass ? 'pass' : 'nopass') + '"><strong>' + (allPass ? 'PASS: all ' + total + ' passed' : 'FAIL: ' + crashCount + ' crashes ' + (total - passCount) + ' checks failed') + '</strong><br>pass=' + passCount + '/' + total + ' crashes=' + crashCount + '</div>'

document.getElementById('results').innerHTML = html
console.log('TEST 5 DONE: pass=' + passCount + '/' + total + ' crashes=' + crashCount + ' all=' + allPass)
