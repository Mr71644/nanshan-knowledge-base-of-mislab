import { request } from "@/utils";

// getFileList(id, options) 返回当前目录下的所有条目（数组），每项包含字段：id,name,status,owner,updateTime 等
// status 含义：1=在线文档，2=文件夹，3=excel，4=普通文件
const getFileList = (id = '', options = {}) => {
    const {
        keyword = '',
        sortBy = 'updateTime',
        sortOrder = 'desc'
    } = options;

    return request({
        url: `/home/get`,
        method: 'POST',
        data: {
            id,
            keyword,
            sortBy,
            sortOrder
        }
    })
}

// 置顶/取消置顶文件或文件夹
const togglePin = (itemId, itemStatus, pin) => {
    return request({
        url: `/home/pin/toggle`,
        method: 'POST',
        data: {
            itemId,
            itemStatus,
            pin
        }
    })
}

// 排序文件树中的同级节点（mock 版，后端接口就绪后替换为真实请求）
const sortTreeItems = (parentFolderId, orderedIds) => {
    console.log('[mock] sortTreeItems', { parentFolderId, orderedIds })
    return Promise.resolve({ data: { code: 200, message: 'success' } })
    // return request({
    //     url: '/home/sort',
    //     method: 'PUT',
    //     data: { parentFolderId, orderedIds }
    // })
}

export {
    getFileList,
    togglePin,
    sortTreeItems
}