import { request } from "@/utils";

// 分页查询用户列表（支持用户名/邮箱模糊搜索、状态筛选）
const getUserList = ({ current, pageSize = 10, username, email, status }) => {
    return request({
        url: '/user/list',
        method: 'POST',
        data: {
            current,
            pageSize,
            username,
            email,
            status
        }
    })
}

// 新增用户
const createUser = ({ username, email, password, status = 1 }) => {
    return request({
        url: '/user/add',
        method: 'POST',
        data: {
            username,
            email,
            password,
            status
        }
    })
}

// 更新用户
const updateUser = ({ id, username, email, status, newPassword }) => {
    return request({
        url: '/user/update',
        method: 'PUT',
        data: {
            id,
            username,
            email,
            status,
            newPassword
        }
    })
}

// 删除用户
const deleteUser = (id) => {
    return request({
        url: `/user/delete/${id}`,
        method: 'DELETE'
    })
}

// 为用户分配角色
const assignUserRoles = ({ userId, roleIds }) => {
    return request({
        url: '/user/assign-roles',
        method: 'POST',
        data: {
            userId,
            roleIds
        }
    })
}

// 批量为多个用户分配角色
// users: [{ userId, roleIds }] —— 每个用户可分配不同的角色
const batchAssignUserRoles = ({ users }) => {
    return request({
        url: '/user/batch-assign-roles',
        method: 'POST',
        data: {
            users
        }
    })
}

// 批量删除用户
const batchDeleteUsers = ({ ids }) => {
    return request({
        url: '/user/delete/batch',
        method: 'DELETE',
        data: {
            ids
        }
    })
}

// 批量导入用户（multipart/form-data）
const importUsers = (file) => {
    const data = new FormData()
    data.append('file', file)
    return request({
        url: '/user/import',
        method: 'POST',
        data
    })
}

// 下载用户导入模板（空表头 xlsx）
const downloadUserTemplate = () => {
    return request({
        url: '/user/import/template',
        method: 'GET',
        responseType: 'blob'
    })
}

// 获取用户已分配的角色
const getUserRoles = (userId) => {
    return request({
        url: `/user/${userId}/roles`,
        method: 'GET'
    })
}

// 获取用户未分配的角色
const getUnassignedRoles = (userId) => {
    return request({
        url: `/user/roles/all/${userId}`,
        method: 'GET'
    })
}

// 获取当前用户信息（包含管理员状态和角色信息）
const getUserInfo = () => {
    return request({
        url: '/user/is-admin',
        method: 'GET'
    })
}

// 普通用户修改自己的信息
const userProfileUpdate = ({ username, email, newPassword }) => {
    return request({
        url: '/user/profile',
        method: 'PUT',
        data: {
            username,
            email,
            newPassword
        }
    })
}

// 发送重置密码验证码
const sendResetCode = (email) => {
    return request({
        url: '/user/password/reset-code',
        method: 'POST',
        data: { email }
    })
}

// 重置密码
const resetPassword = ({ email, code, newPassword, confirmPassword }) => {
    return request({
        url: '/user/password/reset',
        method: 'POST',
        data: { email, code, newPassword, confirmPassword }
    })
}

export {
    getUserList,
    createUser,
    updateUser,
    deleteUser,
    assignUserRoles,
    batchAssignUserRoles,
    batchDeleteUsers,
    importUsers,
    downloadUserTemplate,
    getUserRoles,
    getUnassignedRoles,
    getUserInfo,
    userProfileUpdate,
    sendResetCode,
    resetPassword
}
