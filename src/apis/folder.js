import { request } from "@/utils";

// folder API:
// - getLayer(id): 获取当前 id 的层级（用于面包屑），后端使用 POST /folder/list
// - getFolderTree(): 获取整棵文件夹树（用于侧边栏展示）
// - addFolder({ name, parentId }): 新建文件夹，返回新 folder id
// - updateFolder({ name, folderId }): 修改文件夹名称

const getLayer = (id) => {
    return request({
        url: '/folder/list',
        method: 'POST',
        data: {
            id,
            status: 2
        }
    })
}

const getFolderTree = () => {
    return request({
        url: '/home/tree',
        method: 'GET'
    })
}

const addFolder = ({ name, parentId }) => {
    return request({
        url: '/folder/add',
        method: 'POST',
        data: {
            name,
            parentId
        }
    })
}

const updateFolder = ({name, folderId}) => {
    return request({
        url: '/folder/update',
        method: 'PUT',
        data: {
            name,
            folderId
        }
    })
}

export {
    getLayer,
    getFolderTree,
    addFolder,
    updateFolder
}