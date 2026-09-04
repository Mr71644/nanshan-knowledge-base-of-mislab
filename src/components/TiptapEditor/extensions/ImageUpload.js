import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { uploadMarkdownImage } from '@/apis/image'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

function extractFileId(uploadRes) {
    if (typeof uploadRes === 'string') return uploadRes
    if (uploadRes.data) {
        if (uploadRes.data.id) return uploadRes.data.id
        if (uploadRes.data.fileId) return uploadRes.data.fileId
        if (uploadRes.data.file_id) return uploadRes.data.file_id
    }
    if (uploadRes.id) return uploadRes.id
    return null
}

async function uploadFile(file, options = {}) {
    const { folderId, lockToken, resourceId, isNewDoc } = options
    // 已有文档（非新建）上传必须持有锁凭证，锁失效/只读时禁止上传
    if (!isNewDoc && !lockToken) {
        throw new Error('编辑锁已失效，无法上传')
    }

    const parsedId = parseInt(folderId, 10)
    if (isNaN(parsedId) || parsedId <= 0) {
        throw new Error('无效的文件夹ID')
    }

    // 已有文档：form-data id=folderId，锁鉴权信息通过请求头携带
    // 新建文档：走 /minio/upload/markdown/new，不验锁但必须传 id=folderId 作为图片归属
    const uploadRes = await uploadMarkdownImage({ folderId: parsedId, file, documentId: resourceId, lockToken, isNew: isNewDoc })

    const fileId = extractFileId(uploadRes)
    if (!fileId) {
        throw new Error('上传响应中无法提取文件ID')
    }
    return 'minio:' + fileId
}

const ImageUpload = Extension.create({
    name: 'imageUpload',

    addOptions() {
        return {
            folderId: '',
            onError: null,
            onUploading: null,
            lockToken: '',
            resourceId: '',
            isNewDoc: false,
        }
    },

    addCommands() {
        return {
            uploadImage: () => ({ editor }) => {
                const extension = this
                if (extension.storage.isUploading) return true

                const input = document.createElement('input')
                input.type = 'file'
                input.accept = 'image/*'
                input.onchange = async (e) => {
                    const file = e.target.files?.[0]
                    input.value = ''
                    if (!file) return

                    if (file.size > MAX_FILE_SIZE) {
                        extension.options.onError?.(`图片大小不能超过 10MB（当前 ${(file.size / 1024 / 1024).toFixed(1)}MB）`)
                        return
                    }

                    extension.storage.isUploading = true
                    extension.options.onUploading?.(true)
                    try {
                        const src = await uploadFile(file, extension.options)
                        editor.chain().focus().insertContent({
                            type: 'image',
                            attrs: { src, alt: '图片描述' },
                        }).run()
                    } catch {
                        extension.options.onError?.('图片上传到服务器失败')
                    } finally {
                        extension.storage.isUploading = false
                        extension.options.onUploading?.(false)
                    }
                }
                input.click()
                return true
            },
        }
    },

    addStorage() {
        return { isUploading: false }
    },

    addProseMirrorPlugins() {
        const editor = this.editor
        const extension = this

        const handleFile = async (file, pos) => {
            if (extension.storage.isUploading) {
                extension.options.onError?.('图片正在上传中，请稍后再试')
                return
            }

            if (file.size > MAX_FILE_SIZE) {
                extension.options.onError?.(`图片大小不能超过 10MB（当前 ${(file.size / 1024 / 1024).toFixed(1)}MB）`)
                return
            }

            extension.storage.isUploading = true
            extension.options.onUploading?.(true)
            try {
                const src = await uploadFile(file, extension.options)
                const node = editor.schema.nodes.image.create({ src, alt: '图片描述' })
                const docSize = editor.view.state.doc.content.size
                const safePos = Math.max(0, Math.min(pos, docSize))
                editor.view.dispatch(editor.view.state.tr.insert(safePos, node))
            } catch {
                extension.options.onError?.('图片上传到服务器失败')
            } finally {
                extension.storage.isUploading = false
                extension.options.onUploading?.(false)
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
