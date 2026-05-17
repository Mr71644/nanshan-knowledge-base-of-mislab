import { uploadMarkdownImage } from '@/apis/image'

/**
 * 将 HTML 中的 base64 图片上传到 MinIO，返回替换后的 HTML
 * @param {string} html - 包含 base64 图片的 HTML 内容
 * @param {string|number} folderId - 文件夹 ID
 * @param {function} onProgress - 进度回调 (current, total)
 * @returns {Promise<string>} 替换后的 HTML
 */
export async function migrateBase64Images(html, folderId, onProgress) {
    const imgRegex = /<img[^>]+src="(data:image\/([^;]+);base64,([^"]+))"[^>]*>/gi
    const matches = [...html.matchAll(imgRegex)]

    if (matches.length === 0) {
        return html
    }

    let migratedHtml = html

    for (let i = 0; i < matches.length; i++) {
        const dataUri = matches[i][1]
        const mimeType = matches[i][2]
        const base64Data = matches[i][3]

        onProgress?.(i + 1, matches.length)

        try {
            const byteCharacters = atob(base64Data)
            const byteNumbers = new Array(byteCharacters.length)
            for (let j = 0; j < byteCharacters.length; j++) {
                byteNumbers[j] = byteCharacters.charCodeAt(j)
            }
            const byteArray = new Uint8Array(byteNumbers)
            const blob = new Blob([byteArray], { type: `image/${mimeType}` })
            const file = new File([blob], `migrated_image_${i}.${mimeType}`, { type: `image/${mimeType}` })

            const uploadParams = { file }
            const parsedId = parseInt(folderId, 10)
            if (!isNaN(parsedId) && parsedId > 0) {
                uploadParams.id = parsedId
                uploadParams.folderId = parsedId
            }
            const uploadRes = await uploadMarkdownImage(uploadParams)

            let fileId = null
            if (typeof uploadRes === 'string') fileId = uploadRes
            else if (uploadRes.data?.id) fileId = uploadRes.data.id
            else if (uploadRes.data?.fileId) fileId = uploadRes.data.fileId
            else if (uploadRes.data?.file_id) fileId = uploadRes.data.file_id
            else if (uploadRes.id) fileId = uploadRes.id

            if (fileId) {
                migratedHtml = migratedHtml.replace(dataUri, 'minio:' + fileId)
            }
        } catch (e) {
            console.error(`图片迁移失败 (第${i + 1}张):`, e)
        }
    }

    return migratedHtml
}
