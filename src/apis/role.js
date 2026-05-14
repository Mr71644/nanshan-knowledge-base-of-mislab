import { request } from "@/utils";

// 分页查询角色列表
const getRoleList = ({ current, pageSize = 8 }) => {
    return request({
        url: '/role/list',
        method: 'POST',
        data: {
            current,
            pageSize
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
    getRoleDetail,
    getRoleFolderPermissions,
    assignRoleFolderPermissions,
    roleFolderTree,
    getPermissionTypes,
    removeRoleFolderPermissions
}