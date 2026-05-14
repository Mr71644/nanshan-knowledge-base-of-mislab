import { request } from "@/utils";

const getContentDetail = (id) => {
    return request({
        url: `/text/get/${id}`,
        method: 'GET'
    })
}

const editContent = ({ title, author, content, id } = {}) => {
    const data = {
        title,
        author,
        content,
        id
    }
    return request({
        url: 'text/update',
        method: 'PUT',
        data
    })
}

const addContent = ({ title, author, content, folderId } = {}) => {
    const data = {
        title,
        author,
        content,
        folderId
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