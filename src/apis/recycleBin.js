import { request } from "@/utils"

const getRecycleBinList = ({ current, pageSize, type, keyword }) => {
    return request({
        url: '/recycle-bin/list',
        method: 'GET',
        params: { current, pageSize, type, keyword }
    })
}

const restoreRecycleBinItems = ({ items, targetFolderId, renameOnConflict }) => {
    return request({
        url: '/recycle-bin/restore',
        method: 'POST',
        data: { items, targetFolderId, renameOnConflict }
    })
}

const purgeRecycleBinItems = ({ items }) => {
    return request({
        url: '/recycle-bin/purge',
        method: 'DELETE',
        data: { items }
    })
}

export { getRecycleBinList, restoreRecycleBinItems, purgeRecycleBinItems }
