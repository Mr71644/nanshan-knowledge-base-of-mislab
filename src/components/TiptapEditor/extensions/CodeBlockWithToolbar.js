import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight'
import { message } from 'antd'

const COPY_ICON = '<svg viewBox="64 64 896 896" width="14" height="14" fill="currentColor"><path d="M832 64H296c-4.4 0-8 3.6-8 8v56c0 4.4 3.6 8 8 8h496v688c0 4.4 3.6 8 8 8h56c4.4 0 8-3.6 8-8V144c0-17.7-14.3-32-32-32zM704 192H192c-17.7 0-32 14.3-32 32v656c0 17.7 14.3 32 32 32h512c17.7 0 32-14.3 32-32V224c0-17.7-14.3-32-32-32zm-40 640H232.1c-4.2 0-7.6-3.8-6.7-7.9L336 448h265.3l110.6 376.1c.9 4.1-2.5 7.9-6.7 7.9H664z"/></svg>'
const CHECK_ICON = '<svg viewBox="64 64 896 896" width="14" height="14" fill="currentColor"><path d="M912 190h-69.9c-9.8 0-19.1 4.5-25.1 12.2L404.7 724.5 207 474a32 32 0 0 0-25.1-12.2H112c-6.7 0-10.4 7.7-6.3 12.9l281.9 358.2a32 32 0 0 0 50.3 0L918.3 202.9c4.1-5.2.4-12.9-6.3-12.9z"/></svg>'

const THEMES = [
    { key: 'one-dark', label: 'One Dark Pro' },
    { key: 'github', label: 'GitHub' },
    { key: 'monokai', label: 'Monokai' },
    { key: 'solarized', label: 'Solarized' },
]

const FONT_SIZES = [
    { value: '12px', label: '12px' },
    { value: '13px', label: '13px' },
    { value: '14px', label: '14px' },
    { value: '15px', label: '15px' },
    { value: '16px', label: '16px' },
    { value: '18px', label: '18px' },
]

let currentFontSize = '14px'

let currentTheme = 'github'

function applyTheme(theme) {
    currentTheme = theme
    document.querySelectorAll('.codeblock-wrapper').forEach(el => {
        THEMES.forEach(t => el.classList.remove(`theme-${t.key}`))
        el.classList.add(`theme-${theme}`)
        const select = el.querySelector('.codeblock-theme-select')
        if (select) select.value = theme
    })
}

const CodeBlockWithToolbar = CodeBlockLowlight.extend({
    addNodeView() {
        return ({ node }) => {
            const wrapper = document.createElement('div')
            wrapper.classList.add('codeblock-wrapper', `theme-${currentTheme}`)

            const bar = document.createElement('div')
            bar.classList.add('codeblock-bar')

            const select = document.createElement('select')
            select.classList.add('codeblock-theme-select')
            select.title = '切换配色方案'
            THEMES.forEach(t => {
                const opt = document.createElement('option')
                opt.value = t.key
                opt.textContent = t.label
                if (t.key === currentTheme) opt.selected = true
                select.appendChild(opt)
            })
            select.addEventListener('change', (e) => {
                e.stopPropagation()
                applyTheme(e.target.value)
            })
            bar.appendChild(select)

            const fontSelect = document.createElement('select')
            fontSelect.classList.add('codeblock-font-select')
            fontSelect.title = '字号'
            FONT_SIZES.forEach(s => {
                const opt = document.createElement('option')
                opt.value = s.value
                opt.textContent = s.label
                if (s.value === currentFontSize) opt.selected = true
                fontSelect.appendChild(opt)
            })
            fontSelect.addEventListener('change', (e) => {
                e.stopPropagation()
                currentFontSize = e.target.value
                document.querySelectorAll('.codeblock-wrapper pre').forEach(pre => {
                    pre.style.fontSize = currentFontSize
                })
                document.querySelectorAll('.codeblock-font-select').forEach(sel => {
                    sel.value = currentFontSize
                })
            })
            bar.appendChild(fontSelect)

            const copyBtn = document.createElement('button')
            copyBtn.classList.add('codeblock-copy')
            copyBtn.title = '复制代码'
            copyBtn.innerHTML = COPY_ICON
            bar.appendChild(copyBtn)

            const pre = document.createElement('pre')
            const code = document.createElement('code')
            if (node.attrs.language) {
                code.classList.add(`language-${node.attrs.language}`)
            }
            pre.appendChild(code)

            wrapper.appendChild(bar)
            wrapper.appendChild(pre)

            copyBtn.addEventListener('click', (e) => {
                e.stopPropagation()
                const text = node.textContent
                navigator.clipboard.writeText(text).then(() => {
                    message.success('复制成功')
                    copyBtn.innerHTML = CHECK_ICON
                    copyBtn.classList.add('copied')
                    setTimeout(() => {
                        copyBtn.innerHTML = COPY_ICON
                        copyBtn.classList.remove('copied')
                    }, 2000)
                })
            })

            return {
                dom: wrapper,
                contentDOM: code,
                update(updatedNode) {
                    if (updatedNode.type.name !== 'codeBlock') return false
                    node = updatedNode
                    return true
                },
            }
        }
    },
})

export default CodeBlockWithToolbar
