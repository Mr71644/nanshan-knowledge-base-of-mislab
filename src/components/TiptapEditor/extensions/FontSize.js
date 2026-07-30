import { Extension } from '@tiptap/core'

/**
 * 字体大小扩展 — 仿 Word 字号选择器
 *
 * 通过 TextStyle mark 的 fontSize 属性实现，
 * 设置/取消字号均通过 commands.setFontSize / unsetFontSize。
 */
export const FontSize = Extension.create({
    name: 'fontSize',

    addOptions() {
        return {
            types: ['textStyle'],
        }
    },

    addGlobalAttributes() {
        return [
            {
                types: this.options.types,
                attributes: {
                    fontSize: {
                        default: null,
                        parseHTML: (element) =>
                            element.style.fontSize?.replace(/['"]+/g, '') || null,
                        renderHTML: (attributes) => {
                            if (!attributes.fontSize) return {}
                            return { style: `font-size: ${attributes.fontSize}` }
                        },
                    },
                },
            },
        ]
    },

    addCommands() {
        return {
            setFontSize:
                (fontSize) =>
                ({ chain }) =>
                    chain().setMark('textStyle', { fontSize }).run(),
            unsetFontSize:
                () =>
                ({ chain }) =>
                    chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run(),
        }
    },
})
