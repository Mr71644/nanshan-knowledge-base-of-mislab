import { Quill } from 'react-quill'
import ImageResize from 'quill-image-resize-module-react'

Quill.register('modules/imageResize', ImageResize)

const BaseImageFormat = Quill.import('formats/image')
const IMAGE_ATTRIBUTES = ['alt', 'height', 'width', 'style']

class CustomImageFormat extends BaseImageFormat {
    static formats(domNode) {
        return IMAGE_ATTRIBUTES.reduce((formats, attribute) => {
            if (domNode.hasAttribute(attribute)) {
                formats[attribute] = domNode.getAttribute(attribute)
            }
            return formats
        }, {})
    }

    format(name, value) {
        if (IMAGE_ATTRIBUTES.includes(name)) {
            if (value) this.domNode.setAttribute(name, value)
            else this.domNode.removeAttribute(name)
            return
        }
        super.format(name, value)
    }
}

Quill.register(CustomImageFormat, true)

// 定义工具栏模块
export const useQuillTooBar = () => {
    const modules = {
        toolbar: [
            [{ 'header': [1, 2, false] }],
            ['bold', 'italic', 'underline', 'strike', 'blockquote'],
            [{ 'list': 'ordered' }, { 'list': 'bullet' }, { 'indent': '-1' }, { 'indent': '+1' }],
            ['link', 'image', 'video'],
            ['clean']
        ],
        clipboard: {
            // 配置粘贴时的行为
        },
        history: {
            // 配置撤销/重做功能
        },
        imageResize: {
            // 选中图片后显示拖拽手柄与尺寸调整能力
            modules: ['Resize', 'DisplaySize']
        }
    };
    
    // 定义工具栏样式
    const formats = [
        'header', 'bold', 'italic', 'underline', 'strike', 'blockquote',
        'list', 'bullet', 'indent', 'link', 'image', 'video', 'clean',
        'width', 'height', 'style'
    ];

    return {
        modules,
        formats
    }
}