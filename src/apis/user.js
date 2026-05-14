import { request } from "@/utils";

// 分页查询用户列表
const getUserList = ({ current, pageSize = 10 }) => {
    return request({
        url: '/user/list',
        method: 'POST',
        data: {
            current,
            pageSize
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
const batchAssignUserRoles = ({ userIds, roleIds }) => {
    return request({
        url: '/user/batch-assign-roles',
        method: 'POST',
        data: {
            userIds,
            roleIds
        }
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

export {
    getUserList,
    createUser,
    updateUser,
    deleteUser,
    assignUserRoles,
    batchAssignUserRoles,
    getUserRoles,
    getUnassignedRoles,
    getUserInfo,
    userProfileUpdate
}
