import { request } from "@/utils";

// Excel 相关 API 封装
// - getExcelDetail(id): 返回 { data: { title, url, createTime, updateTime } }
//   注意：url 为字符串化的 workbook JSON，需要在视图中使用 JSON.parse(url)
// - updateExcel({ id, title, url }): 更新已有 Excel，url 期望为序列化字符串
// - addExcel({ folderId, title, url }): 新建 Excel，返回新记录 id

const getExcelDetail = (id) => {
    return request({
        url: `/excel/get/${id}`,
        method: 'GET'
    })
}

const updateExcel = ({ id, title, url, lockToken }) => {
    return request({
        url: '/excel/update',
        method: 'PUT',
        data: {
            id,
            title,
            url
        },
        // 编辑态保存携带锁凭证，由后端原子校验并续租当前锁
        headers: lockToken ? { 'X-Editor-Lock-Token': lockToken } : {}
    })
}

const addExcel = ({ folderId, title, url }) => {
    return request({
        url: '/excel/upload',
        method: 'POST',
        data: {
            folderId,
            title,
            url
        }
    })
}

export {
    getExcelDetail,
    updateExcel,
    addExcel
}