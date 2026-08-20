import { request } from "@/utils";

// 分页查询角色列表（支持角色名模糊搜索）
const getRoleList = ({ current, pageSize = 10, roleName }) => {
    return request({
        url: '/role/list',
        method: 'POST',
        data: {
            current,
            pageSize,
            roleName
        }
    })
}

// 新增角色
const createRole = ({ roleName, roleCode, description, status = 1 }) => {
    return request({
        url: '/role/add',
        method: 'POST',
        data: {
            roleName,
            roleCode,
            description,
            status
        }
    })
}

// 更新角色
const updateRole = ({ id, roleName, roleCode, description, status }) => {
    return request({
        url: '/role/update',
        method: 'PUT',
        data: {
            id,
            roleName,
            roleCode,
            description,
            status
        }
    })
}

// 删除角色
const deleteRole = (id) => {
    return request({
        url: `/role/delete/${id}`,
        method: 'DELETE'
    })
}

// 批量删除角色
const batchDeleteRoles = ({ ids }) => {
    return request({
        url: '/role/delete/batch',
        method: 'DELETE',
        data: {
            ids
        }
    })
}

// 批量分配文件夹权限给多个角色
// folderPermissions: [{ folderId, permissionType }]
const batchAssignRoleFolderPermissions = ({ roleIds, folderPermissions }) => {
    return request({
        url: '/role/folder/batch-assign',
        method: 'POST',
        data: {
            roleIds,
            folderPermissions
        }
    })
}

// 获取多角色文件夹权限的交集（批量编辑回显）
const getRoleFolderIntersection = ({ roleIds }) => {
    return request({
        url: '/role/folder/intersection',
        method: 'POST',
        data: {
            roleIds
        }
    })
}

// 批量导入角色（multipart/form-data），parentFolderId 为可选参数（整数）
const importRoles = ({ file, parentFolderId }) => {
    const data = new FormData()
    data.append('file', file)
    return request({
        url: '/role/import',
        method: 'POST',
        params: parentFolderId !== undefined && parentFolderId !== null ? { parentFolderId } : {},
        data
    })
}

// 下载角色导入模板（空表头 xlsx）
const downloadRoleTemplate = () => {
    return request({
        url: '/role/import/template',
        method: 'GET',
        responseType: 'blob'
    })
}

// 获取角色详情
const getRoleDetail = (id) => {
    return request({
        url: `/role/${id}`,
        method: 'GET'
    })
}

// 获取角色的文件夹权限
const getRoleFolderPermissions = (roleId) => {
    return request({
        url: `/role/folder/${roleId}`,
        method: 'GET'
    })
}

// 分配角色文件夹权限
const assignRoleFolderPermissions = ({ roleId, folderPermissions }) => {
    return request({
        url: `/role/folder/${roleId}/assign`,
        method: 'POST',
        data: {
            folderPermissions  // [{folderId: 1, permissionType: 'edit'/'read'}, ...]
        }
    })
}

const roleFolderTree = () => {
    return request({
        url: `/role/folder/tree`,
        method: 'GET'
    })
}

// 获取权限类型列表
const getPermissionTypes = () => {
    return request({
        url: `/role/folder/permission-types`,
        method: 'GET'
    })
}

// 移除角色的文件夹权限（支持批量）
const removeRoleFolderPermissions = ({ roleId, folderPermissions }) => {
    return request({
        url: `/role/folder/${roleId}/remove`,
        method: 'DELETE',
        data: {
            folderPermissions  // [{folderId: 1, permissionType: 'EDIT'/'VIEW'}, ...]
        }
    })
}

export {
    getRoleList,
    createRole,
    updateRole,
    deleteRole,
    batchDeleteRoles,
    getRoleDetail,
    getRoleFolderPermissions,
    assignRoleFolderPermissions,
    roleFolderTree,
    getPermissionTypes,
    removeRoleFolderPermissions,
    batchAssignRoleFolderPermissions,
    getRoleFolderIntersection,
    importRoles,
    downloadRoleTemplate
}