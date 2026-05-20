import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { uploadMarkdownImage } from '@/apis/image'

async function uploadFile(file, folderId) {
    const uploadParams = { file }
    const parsedId = parseInt(folderId, 10)
    if (!isNaN(parsedId) && parsedId > 0) {
        uploadParams.id = parsedId
        uploadParams.folderId = parsedId
    }

    const uploadRes = await uploadMarkdownImage(uploadParams)

    let fileId = null
    if (typeof uploadRes === 'string') {
        fileId = uploadRes
    } else if (uploadRes.data) {
        if (uploadRes.data.id) fileId = uploadRes.data.id
        else if (uploadRes.data.fileId) fileId = uploadRes.data.fileId
        else if (uploadRes.data.file_id) fileId = uploadRes.data.file_id
    } else if (uploadRes.id) {
        fileId = uploadRes.id
    }

    if (fileId) {
        return 'minio:' + fileId
    }
    return URL.createObjectURL(file)
}

const ImageUpload = Extension.create({
    name: 'imageUpload',

    addOptions() {
        return {
            folderId: '',
            onError: null,
        }
    },

    addCommands() {
        return {
            uploadImage: () => ({ editor }) => {
                const input = document.createElement('input')
                input.type = 'file'
                input.accept = 'image/*'
                input.onchange = async (e) => {
                    const file = e.target.files?.[0]
                    if (!file) return

                    try {
                        const src = await uploadFile(file, this.options.folderId)
                        editor.chain().focus().insertContent({
                            type: 'image',
                            attrs: { src, alt: '图片描述' },
                        }).run()
                    } catch {
                        this.options.onError?.('图片上传到服务器失败')
                        const blobUrl = URL.createObjectURL(file)
                        editor.chain().focus().insertContent({
                            type: 'image',
                            attrs: { src: blobUrl, alt: '图片描述' },
                        }).run()
                    }
                }
                input.click()
                return true
            },
        }
    },

    addProseMirrorPlugins() {
        const editor = this.editor
        const folderId = this.options.folderId
        const onError = this.options.onError

        const handleFile = async (file, pos) => {
            try {
                const src = await uploadFile(file, folderId)
                const node = editor.schema.nodes.image.create({ src, alt: '图片描述' })
                const tr = editor.state.tr.insert(pos, node)
                editor.view.dispatch(tr)
            } catch {
                onError?.('图片上传到服务器失败')
                const blobUrl = URL.createObjectURL(file)
                const node = editor.schema.nodes.image.create({ src: blobUrl, alt: '图片描述' })
                const tr = editor.state.tr.insert(pos, node)
                editor.view.dispatch(tr)
            }
        }

        return [
            new Plugin({
                key: new PluginKey('imageUpload'),
                props: {
                    handlePaste(view, event) {
                        const items = event.clipboardData?.items
                        if (!items) return false

                        for (let i = 0; i < items.length; i++) {
                            if (items[i].type.indexOf('image') !== -1) {
                                event.preventDefault()
                                const file = items[i].getAsFile()
                                if (file) {
                                    handleFile(file, view.state.selection.from)
                                }
                                return true
                            }
                        }
                        return false
                    },
                    handleDrop(view, event) {
                        const files = event.dataTransfer?.files
                        if (!files || files.length === 0) return false

                        for (let i = 0; i < files.length; i++) {
                            if (files[i].type.indexOf('image') !== -1) {
                                event.preventDefault()
                                const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos
                                if (pos !== undefined) {
                                    handleFile(files[i], pos)
                                }
                                return true
                            }
                        }
                        return false
                    },
                },
            }),
        ]
    },
})

export default ImageUpload
