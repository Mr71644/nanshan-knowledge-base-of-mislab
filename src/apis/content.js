import { request } from "@/utils";

const getContentDetail = (id) => {
    return request({
        url: `/text/get/${id}`,
        method: 'GET'
    })
}

const editContent = ({ title, author, content, id, contentType = 'prosemirror', lockToken } = {}) => {
    const data = {
        title,
        author,
        content,
        id,
        contentType,
    }
    return request({
        url: 'text/update',
        method: 'PUT',
        data,
        // 编辑态保存携带锁凭证，由后端原子校验并续租当前锁
        headers: lockToken ? { 'X-Editor-Lock-Token': lockToken } : {}
    })
}

const addContent = ({ title, author, content, folderId, contentType = 'prosemirror' } = {}) => {
    const data = {
        title,
        author,
        content,
        folderId,
        contentType,
    }
    return request({
        url: '/text/add',
        method: "POST",
        data
    })
}

export {
    getContentDetail,
    editContent,
    addContent
}