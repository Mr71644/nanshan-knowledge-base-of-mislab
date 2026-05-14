import { request } from "@/utils";

// 删除相关 API：各资源采用 RESTful 风格，直接通过 id 路径参数删除
// - delContent(id): 删除富文本内容，DELETE /text/delete/:id
// - delExcel(id): 删除 Excel，DELETE /excel/delete/:id
// - delFolder(id): 删除文件夹，DELETE /folder/delete/:id
// - delFile(id): 删除存储文件（minio），DELETE /minio/delete/:id
const delContent = (id) => {
    return request({
        url: `/text/delete/${id}`,
        method: 'DELETE'
    })
}

const delExcel = (id) => {
    return request({
        url: `/excel/delete/${id}`,
        method: 'DELETE'
    })
}

const delFolder = (id) => {
    return request({
        url: `/folder/delete/${id}`,
        method: 'DELETE'
    })
}

const delFile = (id) => {
    return request({
        url: `/minio/delete/${id}`,
        method: 'DELETE'
    })
}

export {
    delContent,
    delExcel,
    delFolder,
    delFile
}