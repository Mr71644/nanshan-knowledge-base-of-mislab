import { request } from "@/utils";

const getContentDetail = (id) => {
    return request({
        url: `/text/get/${id}`,
        method: 'GET'
    })
}

const editContent = ({ title, author, content, id, contentType = 'markdown' } = {}) => {
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
        data
    })
}

const addContent = ({ title, author, content, folderId, contentType = 'markdown' } = {}) => {
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