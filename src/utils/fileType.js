const FILE_CATEGORIES = {
    image: ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp', 'ico'],
    pdf: ['pdf'],
    video: ['mp4', 'webm', 'ogg', 'mov'],
    audio: ['mp3', 'wav', 'aac', 'flac'],
    text: [
        'txt', 'json', 'csv', 'xml',
        'js', 'ts', 'jsx', 'tsx', 'css', 'html',
        'py', 'java', 'c', 'cpp', 'h', 'go', 'rs', 'sh',
        'yml', 'yaml', 'toml', 'ini', 'conf', 'log', 'sql',
    ],
    markdown: ['md', 'markdown'],
}

export function getFileType(fileName) {
    const ext = (fileName.split('.').pop() || '').toLowerCase()
    for (const [category, extensions] of Object.entries(FILE_CATEGORIES)) {
        if (extensions.includes(ext)) return { category, extension: ext }
    }
    return { category: 'unsupported', extension: ext }
}
