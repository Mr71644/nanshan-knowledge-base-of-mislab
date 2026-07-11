import { memo, useState, useEffect } from 'react'
import { theme, Layout, FloatButton, Tooltip, Tabs, Table, Button, Modal, Form, Input, Select, Tag, Space, Popconfirm, Transfer, Tree, Radio, Pagination, Checkbox, Spin, Avatar } from 'antd'
import { RollbackOutlined, UserOutlined, TeamOutlined, SafetyOutlined, PlusOutlined, EditOutlined, DeleteOutlined, FolderOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useMessage } from '@/hooks/useMessage'
import { getRoleList, createRole, updateRole, deleteRole, getRoleFolderPermissions, assignRoleFolderPermissions, roleFolderTree, getPermissionTypes, removeRoleFolderPermissions } from '@/apis/role'
import { getUserList, createUser, updateUser, deleteUser, assignUserRoles, getUserRoles, getUnassignedRoles } from '@/apis/user'
import style from './index.module.css'

const { Content } = Layout

const Administrator = () => {
    const {
        token: { colorBgContainer, borderRadiusLG },
    } = theme.useToken();
    const navigate = useNavigate()
    const { success, error, contextHolder } = useMessage()
    const [activeTab, setActiveTab] = useState('users')

    // 用户管理状态
    const [users, setUsers] = useState([])
    const [userModalVisible, setUserModalVisible] = useState(false)
    const [userForm] = Form.useForm()
    const [editingUser, setEditingUser] = useState(null)
    const [userLoading, setUserLoading] = useState(false)
    const [userPagination, setUserPagination] = useState({
        current: 1,
        pageSize: 10,
        total: 0
    })
    const [searchKeyword, setSearchKeyword] = useState('') // 搜索关键词
    const [allUsers, setAllUsers] = useState([]) // 存储所有用户数据
    const [selectedUserIds, setSelectedUserIds] = useState([]) // 存储选中的用户 ID
    const [userSearchLoading, setUserSearchLoading] = useState(false) // 用户搜索加载状态

    // 角色管理状态
    const [roles, setRoles] = useState([])
    const [roleModalVisible, setRoleModalVisible] = useState(false)
    const [roleForm] = Form.useForm()
    const [editingRole, setEditingRole] = useState(null)
    const [roleLoading, setRoleLoading] = useState(false)
    const [rolePagination, setRolePagination] = useState({
        current: 1,
        pageSize: 10,
        total: 0
    })
    const [roleSearchKeyword, setRoleSearchKeyword] = useState('')
    const [allRoles, setAllRoles] = useState([])
    const [roleSearchLoading, setRoleSearchLoading] = useState(false) // 角色搜索加载状态

    // 角色用户查看状态
    const [roleUsersModalVisible, setRoleUsersModalVisible] = useState(false)
    const [selectedRoleForUsers, setSelectedRoleForUsers] = useState(null)
    const [roleUsers, setRoleUsers] = useState([])
    const [roleUsersLoading, setRoleUsersLoading] = useState(false)

    // 权限分配状态
    const [permissionModalVisible, setPermissionModalVisible] = useState(false)
    const [selectedUser, setSelectedUser] = useState(null)
    const [targetKeys, setTargetKeys] = useState([])
    const [availableRoles, setAvailableRoles] = useState([])
    const [permissionLoading, setPermissionLoading] = useState(false)

    // 批量分配角色状态
    const [batchPermissionModalVisible, setBatchPermissionModalVisible] = useState(false)
    const [batchTargetKeys, setBatchTargetKeys] = useState([])
    const [batchAvailableRoles, setBatchAvailableRoles] = useState([])
    const [batchPermissionLoading, setBatchPermissionLoading] = useState(false)
    const [selectedUserNames, setSelectedUserNames] = useState([]) // 存储选中的用户名

    // 防抖 / 加载状态（防止重复提交）
    const [roleSubmitLoading, setRoleSubmitLoading] = useState(false)
    const [userSubmitLoading, setUserSubmitLoading] = useState(false)

    // 文件夹权限管理状态
    const [folderPermissionModalVisible, setFolderPermissionModalVisible] = useState(false)
    const [selectedRole, setSelectedRole] = useState(null)
    const [folderTreeData, setFolderTreeData] = useState([])
    const [folderPermissions, setFolderPermissions] = useState([]) // 存储文件夹权限映射 {folderId, permission}
    const [originalFolderPermissions, setOriginalFolderPermissions] = useState([]) // 存储原始权限，用于对比变化
    const [folderPermissionLoading, setFolderPermissionLoading] = useState(false)
    const [folderPagination, setFolderPagination] = useState({
        current: 1,
        pageSize: 10,
        total: 0
    })
    const [permissionTypes, setPermissionTypes] = useState([]) // 存储权限类型列表

    // 数据初始化
    useEffect(() => {
        loadUsers()
        loadRoles()
        loadFolderTree()
        loadPermissionTypes()
    }, [])

    // 加载所有用户数据
    const loadUsers = async (page = userPagination.current, pageSize = userPagination.pageSize) => {
        setUserLoading(true)
        try {
            const res = await getUserList({
                current: page,
                pageSize: pageSize
            })
            // 将后端返回的数据格式转换为前端需要的格式
            const userList = res.data.records.map(item => ({
                id: item.id,
                username: item.username,
                email: item.email,
                roles: item.roles || [], // 角色名称数组
                status: item.status,
                updateTime: item.updateTime
            }))
            setUsers(userList)
            setAllUsers(userList) // 存储所有用户数据
            setUserPagination({
                current: page,
                pageSize: pageSize,
                total: res.data.total
            })
        } catch (e) {
            error({
                content: '加载用户列表失败'
            })
        } finally {
            setUserLoading(false)
        }
    }

    // 搜索用户
    const searchUsers = (keyword) => {
        setUserSearchLoading(true)
        setTimeout(() => {
            try {
                if (keyword.trim()) {
                    // 前端搜索：根据用户名过滤用户列表
                    const filteredUsers = allUsers.filter(user =>
                        user.username.toLowerCase().includes(keyword.toLowerCase())
                    )
                    setUsers(filteredUsers)
                    setUserPagination({
                        ...userPagination,
                        total: filteredUsers.length,
                        current: 1 // 重置到第一页
                    })
                } else {
                    // 如果搜索关键词为空，显示所有用户
                    setUsers(allUsers)
                    setUserPagination({
                        ...userPagination,
                        total: allUsers.length,
                        current: 1 // 重置到第一页
                    })
                }
            } catch (e) {
                error({
                    content: '搜索用户失败'
                })
            } finally {
                setUserSearchLoading(false)
            }
        }, 300)
    }

    const loadRoles = async (page = rolePagination.current, pageSize = rolePagination.pageSize) => {
        setRoleLoading(true)

        try {
            const res = await getRoleList({ current: page, pageSize: pageSize })
            // 将后端返回的数据格式转换为前端需要的格式   
            const roleList = res.data.records.map(item => ({
                id: item.id,
                name: item.roleName,
                description: item.description,
                status: item.status,
                userCount: item.userCount,
                createTime: item.createTime,
                updateTime: item.updateTime
            }))
            setRoles(roleList)
            setAllRoles(roleList) // 存储所有角色数据
            setRolePagination({
                current: page,
                pageSize: pageSize,
                total: res.data.total
            })
        } catch (e) {
            error({
                content: '加载角色列表失败'
            })
        } finally {
            setRoleLoading(false)
        }
    }

    // 搜索角色
    const searchRoles = (keyword) => {
        setRoleSearchLoading(true)
        setTimeout(() => {
            try {
                if (keyword.trim()) {
                    // 前端搜索：根据角色名称过滤角色列表
                    const filteredRoles = allRoles.filter(role =>
                        role.name.toLowerCase().includes(keyword.toLowerCase())
                    )
                    setRoles(filteredRoles)
                    setRolePagination({
                        ...rolePagination,
                        total: filteredRoles.length,
                        current: 1 // 重置到第一页
                    })
                } else {
                    // 如果搜索关键词为空，显示所有角色
                    setRoles(allRoles)
                    setRolePagination({
                        ...rolePagination,
                        total: allRoles.length,
                        current: 1 // 重置到第一页
                    })
                }
            } catch (e) {
                error({
                    content: '搜索角色失败'
                })
            } finally {
                setRoleSearchLoading(false)
            }
        }, 300)
    }

    // 加载文件夹树
    const loadFolderTree = async () => {
        try {
            const res = await roleFolderTree()
            // 转换为Tree组件所需的格式
            const convertToTreeData = (nodes) => {
                if (!nodes || !Array.isArray(nodes)) return []
                return nodes.map(node => ({
                    title: node.name,
                    key: String(node.id),
                    children: convertToTreeData(node.children)
                }))
            }
            setFolderTreeData(convertToTreeData(res.data))
        } catch (e) {
            error({
                content: '加载文件夹树失败'
            })
        }
    }

    // 加载权限类型
    const loadPermissionTypes = async () => {
        try {
            const res = await getPermissionTypes()
            setPermissionTypes(res.data || [])
        } catch (e) {
            error({
                content: '加载权限类型失败'
            })
        }
    }

    // 用户管理相关方法
    const handleAddUser = () => {
        setEditingUser(null)
        userForm.resetFields()
        setUserModalVisible(true)
    }

    const handleEditUser = (record) => {
        setEditingUser(record)
        userForm.resetFields()
        userForm.setFieldsValue({
            username: record.username,
            email: record.email,
            status: record.status
        })
        setUserModalVisible(true)
    }

    const handleDeleteUser = async (id) => {
        try {
            await deleteUser(id)
            success({
                content: '删除用户成功'
            })
            // 删除后刷新当前页，如果当前页没数据了则回到上一页
            const newCurrent = users.length === 1 && userPagination.current > 1
                ? userPagination.current - 1
                : userPagination.current
            loadUsers(newCurrent, userPagination.pageSize)
        } catch (e) {
            error({
                content: e.response.data.message
            })
        }
    }

    const handleUserSubmit = async () => {
        if (userSubmitLoading) return
        setUserSubmitLoading(true)
        try {
            const values = await userForm.validateFields()

            if (editingUser) {
                // 编辑用户
                await updateUser({
                    id: editingUser.id,
                    username: values.username,
                    email: values.email,
                    status: values.status,
                    newPassword: values.newPassword || undefined
                })
                success({
                    content: '更新用户成功'
                })
            } else {
                // 新增用户
                await createUser({
                    username: values.username,
                    email: values.email,
                    password: values.password,
                    status: values.status
                })
                success({
                    content: '创建用户成功'
                })
            }

            setUserModalVisible(false)
            loadUsers(userPagination.current, userPagination.pageSize)
        } catch (e) {
            error({
                content: e.response?.data?.message || '操作失败'
            })
        } finally {
            setUserSubmitLoading(false)
        }
    }

    // 角色管理相关方法
    const handleAddRole = () => {
        setEditingRole(null)
        roleForm.resetFields()
        setRoleModalVisible(true)
    }

    const handleEditRole = (record) => {
        setEditingRole(record)
        roleForm.setFieldsValue(record)
        setRoleModalVisible(true)
    }

    const handleDeleteRole = async (id) => {
        try {
            await deleteRole(id)
            success({
                content: '删除角色成功'
            })
            // 删除后刷新当前页，如果当前页没数据了则回到上一页
            const newCurrent = roles.length === 1 && rolePagination.current > 1
                ? rolePagination.current - 1
                : rolePagination.current
            loadRoles(newCurrent, rolePagination.pageSize)
            // 同时刷新用户列表，因为用户列表中显示角色信息
            loadUsers(userPagination.current, userPagination.pageSize)
        } catch (e) {
            error({
                content: e.response.data.message
            })
        }
    }

    const handleRoleSubmit = async () => {
        if (roleSubmitLoading) return
        setRoleSubmitLoading(true)
        try {
            const values = await roleForm.validateFields()

            if (editingRole) {
                // 编辑角色
                await updateRole({
                    id: editingRole.id,
                    roleName: values.name,
                    description: values.description,
                    status: values.status
                })
                success({
                    content: '更新角色成功'
                })
            } else {
                // 新增角色
                await createRole({
                    roleName: values.name,
                    description: values.description,
                    status: values.status
                })
                success({
                    content: '创建角色成功'
                })
            }

            setRoleModalVisible(false)
            loadRoles(rolePagination.current, rolePagination.pageSize)
            // 同时刷新用户列表，因为用户列表中显示角色信息
            loadUsers(userPagination.current, userPagination.pageSize)
        } catch (e) {
            error({
                content: e.response.data.message
            })
        } finally {
            setRoleSubmitLoading(false)
        }
    }

    // 权限分配相关方法
    const handleAssignPermission = async (record) => {
        setSelectedUser(record)
        setPermissionLoading(true)
        try {
            // 并行获取所有角色和用户已分配的角色
            const [allRolesRes, assignedRolesRes] = await Promise.all([
                getUnassignedRoles(record.id),
                getUserRoles(record.id)
            ])

            // 获取所有可用角色和已分配的角色
            const allRoles = allRolesRes.data || []
            const assignedRoles = assignedRolesRes.data || []

            // 合并角色列表，确保已分配的角色也在列表中
            const allRolesMap = new Map(allRoles.map(r => [r.id, r]))
            assignedRoles.forEach(ar => {
                if (!allRolesMap.has(ar.roleId)) {
                    // 如果已分配的角色不在所有角色列表中，添加进去
                    allRolesMap.set(ar.roleId, {
                        id: ar.roleId,
                        roleName: ar.roleName,
                        description: ar.roleName,
                        status: 1
                    })
                }
            })

            const mergedRoles = Array.from(allRolesMap.values())
            setAvailableRoles(mergedRoles)

            // 设置已分配的角色ID列表
            const assignedRoleIds = assignedRoles.map(role => role.roleId)
            setTargetKeys(assignedRoleIds)

            setPermissionModalVisible(true)
        } catch (e) {
            error({
                content: e.response.data.message
            })
        } finally {
            setPermissionLoading(false)
        }
    }

    const handlePermissionSubmit = async () => {
        if (permissionLoading) return
        setPermissionLoading(true)
        try {
            await assignUserRoles({
                userId: selectedUser.id,
                roleIds: targetKeys
            })
            success({
                content: '权限分配成功'
            })
            setPermissionModalVisible(false)
            loadUsers(userPagination.current, userPagination.pageSize)
            // 同时刷新角色列表，因为角色列表显示用户数量
            loadRoles(rolePagination.current, rolePagination.pageSize)
        } catch (e) {
            error({
                content: e.response.data.message
            })
        } finally {
            setPermissionLoading(false)
        }
    }

    // 角色用户查看相关方法
    const avatarColors = ['#d4a84c', '#c49a3e', '#b8956e', '#a08060', '#8b6f4e', '#c4a060', '#ba8a50', '#a07040']
    const getAvatarColor = (username) => {
        let hash = 0
        for (let i = 0; i < username.length; i++) {
            hash = username.charCodeAt(i) + ((hash << 5) - hash)
        }
        return avatarColors[Math.abs(hash) % avatarColors.length]
    }

    const handleViewRoleUsers = async (record) => {
        setSelectedRoleForUsers(record)
        setRoleUsersModalVisible(true)
        setRoleUsersLoading(true)
        try {
            const res = await getUserList({ current: 1, pageSize: 1000 })
            const allUsers = res.data.records.map(item => ({
                id: item.id,
                username: item.username,
                email: item.email,
                roles: item.roles || [],
                status: item.status,
                updateTime: item.updateTime
            }))
            const filtered = allUsers.filter(user =>
                user.roles && user.roles.some(role => role.roleId === record.id)
            )
            setRoleUsers(filtered)
        } catch (e) {
            error({ content: '加载角色用户失败' })
            setRoleUsersModalVisible(false)
        } finally {
            setRoleUsersLoading(false)
        }
    }

    // 批量分配角色
    const handleBatchAssignPermission = async () => {
        if (selectedUserIds.length === 0) {
            error({
                content: '请选择要分配角色的用户'
            })
            return
        }

        setBatchPermissionLoading(true)
        try {
            // 获取选中用户的用户名
            const selectedUsers = users.filter(user => selectedUserIds.includes(user.id))
            const userNames = selectedUsers.map(user => user.username)
            setSelectedUserNames(userNames)

            // 获取所有角色（使用 getRoleList，设置较大的 pageSize 来获取所有角色）
            const allRolesRes = await getRoleList({ current: 1, pageSize: 100 })
            const allRoles = allRolesRes.data?.records || []

            // 直接更新状态并打开弹窗
            setBatchTargetKeys([])
            setBatchAvailableRoles(allRoles)
            setBatchPermissionModalVisible(true)
        } catch (e) {
            error({
                content: e.response?.data?.message || '获取角色列表失败'
            })
        } finally {
            setBatchPermissionLoading(false)
        }
    }

    // 批量提交角色分配
    const handleBatchPermissionSubmit = async () => {
        if (batchPermissionLoading) return
        if (selectedUserIds.length === 0) {
            error({
                content: '请选择要分配角色的用户'
            })
            return
        }
        if (!batchTargetKeys || batchTargetKeys.length === 0) {
            error({
                content: '请选择要分配的角色'
            })
            return
        }

        setBatchPermissionLoading(true)
        try {
            // 使用 Promise.all 并行为每个用户分配角色
            await Promise.all(selectedUserIds.map(async (userId) => {
                // 获取用户现有的角色
                const existingRolesRes = await getUserRoles(userId)
                const existingRoles = existingRolesRes.data || []
                const existingRoleIds = existingRoles.map(role => role.roleId.toString())

                // 合并现有角色和新角色，去重
                const allRoleIds = [...new Set([...existingRoleIds, ...batchTargetKeys])]

                // 为用户分配合并后的角色
                return assignUserRoles({
                    userId: userId,
                    roleIds: allRoleIds
                })
            }))

            success({
                content: `成功为 ${selectedUserIds.length} 个用户分配角色`
            })
            setBatchPermissionModalVisible(false)
            loadUsers(userPagination.current, userPagination.pageSize)
            loadRoles(rolePagination.current, rolePagination.pageSize)
        } catch (e) {
            error({
                content: e.response?.data?.message || '批量分配角色失败'
            })
        } finally {
            setBatchPermissionLoading(false)
        }
    }

    // 文件夹权限管理相关方法
    const handleManageFolderPermission = async (record) => {
        setSelectedRole(record)
        setFolderPermissionLoading(true)
        setFolderPermissionModalVisible(true)
        setFolderPagination({ current: 1, pageSize: 10, total: 0 })

        try {
            // 如果文件夹树还未加载，先加载文件夹树
            if (!folderTreeData || folderTreeData.length === 0) {
                await loadFolderTree()
            }

            // 获取该角色已分配的文件夹权限
            const res = await getRoleFolderPermissions(record.id)
            // 后端返回格式: [{folderId: 1, permissionType: 'VIEW'}, {folderId: 1, permissionType: 'EDIT'}, ...]
            // 需要转换为: [{folderId: 1, permissions: ['VIEW', 'EDIT']}, ...]
            const rawPermissions = res.data || []
            const permissionMap = new Map()

            rawPermissions.forEach(item => {
                const folderId = item.folderId
                if (!permissionMap.has(folderId)) {
                    permissionMap.set(folderId, [])
                }
                permissionMap.get(folderId).push(item.permissionType)
            })

            const permissions = Array.from(permissionMap.entries()).map(([folderId, permissions]) => ({
                folderId,
                permissions
            }))

            setFolderPermissions(permissions)
            // 保存原始数据用于对比
            setOriginalFolderPermissions(JSON.parse(JSON.stringify(permissions)))
            setFolderPagination(prev => ({ ...prev, total: permissions.length }))
        } catch (e) {
            error({
                content: e.response?.data?.message || '获取文件夹权限失败'
            })
            setFolderPermissionModalVisible(false)
        } finally {
            setFolderPermissionLoading(false)
        }
    }

    const handleFolderPermissionSubmit = async () => {
        if (folderPermissionLoading) return
        setFolderPermissionLoading(true)
        try {
            // 对比原始数据和当前数据，找出新增和删除的权限
            const addedPermissions = []
            const removedPermissions = []

            // 创建原始数据的 Map 以便快速查找
            const originalMap = new Map()
            originalFolderPermissions.forEach(item => {
                originalMap.set(item.folderId, new Set(item.permissions))
            })

            // 创建当前数据的 Map
            const currentMap = new Map()
            folderPermissions.forEach(item => {
                currentMap.set(item.folderId, new Set(item.permissions))
            })

            // 检查每个文件夹的权限变化
            // 1. 找出新增的权限
            folderPermissions.forEach(item => {
                const originalPerms = originalMap.get(item.folderId) || new Set()
                item.permissions.forEach(permission => {
                    if (!originalPerms.has(permission)) {
                        addedPermissions.push({
                            folderId: item.folderId,
                            permissionType: permission
                        })
                    }
                })
            })

            // 2. 找出删除的权限
            originalFolderPermissions.forEach(item => {
                const currentPerms = currentMap.get(item.folderId) || new Set()
                item.permissions.forEach(permission => {
                    if (!currentPerms.has(permission)) {
                        removedPermissions.push({
                            folderId: item.folderId,
                            permissionType: permission
                        })
                    }
                })
            })

            // 3. 处理完全删除的文件夹（原来有，现在没有）
            originalFolderPermissions.forEach(item => {
                if (!currentMap.has(item.folderId)) {
                    item.permissions.forEach(permission => {
                        removedPermissions.push({
                            folderId: item.folderId,
                            permissionType: permission
                        })
                    })
                }
            })

            // 执行删除操作
            if (removedPermissions.length > 0) {
                await removeRoleFolderPermissions({
                    roleId: selectedRole.id,
                    folderPermissions: removedPermissions
                })
            }

            // 执行新增操作
            if (addedPermissions.length > 0) {
                await assignRoleFolderPermissions({
                    roleId: selectedRole.id,
                    folderPermissions: addedPermissions
                })
            }

            if (addedPermissions.length === 0 && removedPermissions.length === 0) {
                success({
                    content: '没有权限变化'
                })
            } else {
                success({
                    content: '文件夹权限分配成功'
                })
            }

            setFolderPermissionModalVisible(false)
        } catch (e) {
            error({
                content: e.response?.data?.message || '文件夹权限分配失败'
            })
        } finally {
            setFolderPermissionLoading(false)
        }
    }



    // 处理权限级别变更（支持多选）
    const handlePermissionChange = (folderId, permissions) => {
        setFolderPermissions(prev => {
            const exists = prev.find(p => p.folderId === folderId)
            let newPermissions

            // 如果权限数组为空，保留该文件夹但权限为空数组（不删除）
            if (exists) {
                newPermissions = prev.map(p => p.folderId === folderId ? { ...p, permissions } : p)
            } else {
                newPermissions = [...prev, { folderId, permissions }]
            }

            // 不需要同步更新分页total，因为文件夹数量没有变化
            return newPermissions
        })
    }

    // 移除文件夹权限
    const handleRemovePermission = async (folderId) => {
        try {
            // 获取要删除的文件夹的所有权限
            const folderToRemove = folderPermissions.find(p => p.folderId === folderId)
            if (!folderToRemove) return

            // 调用后端API删除权限
            await removeRoleFolderPermissions({
                roleId: selectedRole.id,
                folderPermissions: folderToRemove.permissions.map(permission => ({
                    folderId,
                    permissionType: permission
                }))
            })

            // 从前端状态中移除
            setFolderPermissions(prev => prev.filter(p => p.folderId !== folderId))

            // 更新分页，确保当前页不会超出范围
            setFolderPagination(prev => {
                const newTotal = prev.total - 1
                const maxPage = Math.ceil(newTotal / prev.pageSize) || 1
                return {
                    ...prev,
                    total: newTotal,
                    current: prev.current > maxPage ? maxPage : prev.current
                }
            })

            success({
                content: '删除权限成功'
            })
        } catch (e) {
            error({
                content: e.response?.data?.message || '删除权限失败'
            })
        }
    }

    // 递归获取所有子节点的key
    const getAllChildKeys = (node, treeData) => {
        const keys = []
        const findChildren = (nodeKey, data) => {
            for (const item of data) {
                if (String(item.key) === String(nodeKey)) {
                    const collectKeys = (n) => {
                        if (n.children && n.children.length > 0) {
                            n.children.forEach(child => {
                                keys.push(child.key)
                                collectKeys(child)
                            })
                        }
                    }
                    collectKeys(item)
                    return
                }
                if (item.children && item.children.length > 0) {
                    findChildren(nodeKey, item.children)
                }
            }
        }
        findChildren(node, treeData)
        return keys
    }

    // 获取文件夹名称
    const getFolderName = (folderId, treeData) => {
        if (!treeData || !Array.isArray(treeData)) return '未知文件夹'

        for (const node of treeData) {
            if (String(node.key) === String(folderId)) {
                return node.title
            }
            if (node.children && node.children.length > 0) {
                const found = getFolderName(folderId, node.children)
                if (found !== '未知文件夹') return found
            }
        }
        return '未知文件夹'
    }

    // 用户表格列定义
    const userColumns = [
        {
            title: '选择',
            dataIndex: 'select',
            key: 'select',
            width: 60,
            align: 'center',
            render: (_, record) => (
                <input
                    type='checkbox'
                    checked={selectedUserIds.includes(record.id)}
                    onChange={(e) => {
                        if (e.target.checked) {
                            setSelectedUserIds([...selectedUserIds, record.id])
                        } else {
                            setSelectedUserIds(selectedUserIds.filter(id => id !== record.id))
                        }
                    }}
                />
            )
        },
        {
            title: 'ID',
            dataIndex: 'id',
            key: 'id',
            width: 60,
            align: 'center',
        },
        {
            title: '用户名',
            dataIndex: 'username',
            key: 'username',
            width: 110,
            align: 'center',
            render: (text) => (
                <span>
                    <UserOutlined style={{ marginRight: 8 }} />
                    {text}
                </span>
            )
        },
        {
            title: '邮箱',
            dataIndex: 'email',
            key: 'email',
            width: 200,
            align: 'center',
        },
        {
            title: '角色',
            dataIndex: 'roles',
            key: 'roles',
            width: 130,
            align: 'center',
            render: (roles) => (
                <>
                    {roles.map(role => (
                        <Tag color={role.status === 1 ? 'blue' : 'orange'} key={role.roleId}>{role.roleName}</Tag>
                    ))}
                </>
            )
        },
        {
            title: '状态',
            dataIndex: 'status',
            key: 'status',
            width: 60,
            align: 'center',
            render: (status) => (
                <Tag color={status === 1 ? 'green' : 'red'}>
                    {status === 1 ? '启用' : '禁用'}
                </Tag>
            )
        },
        {
            title: '更新时间',
            dataIndex: 'updateTime',
            key: 'updateTime',
            width: 200,
            align: 'center',
        },
        {
            title: '操作',
            key: 'action',
            width: 180,
            align: 'center',
            render: (_, record) => (
                <Space size="small">
                    <Button type="link" size="small" icon={<SafetyOutlined />} onClick={() => handleAssignPermission(record)}>
                        分配角色
                    </Button>
                    <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEditUser(record)}>
                        编辑
                    </Button>
                    <Popconfirm
                        title="确定要删除此用户吗？"
                        onConfirm={() => handleDeleteUser(record.id)}
                        okText="确定"
                        cancelText="取消"
                    >
                        <Button type="link" size="small" danger icon={<DeleteOutlined />}>
                            删除
                        </Button>
                    </Popconfirm>
                </Space>
            ),
        },
    ]

    // 角色表格列定义
    const roleColumns = [
        {
            title: 'ID',
            dataIndex: 'id',
            key: 'id',
            width: 60,
            align: 'center',
        },
        {
            title: '角色名称',
            dataIndex: 'name',
            key: 'name',
            width: 120,
            align: 'center',
            ellipsis: {
                showTitle: false,
            },
            render: (text) => (
                <Tooltip placement="topLeft" title={text}>
                    <span>
                        <UserOutlined style={{ marginRight: 8 }} />
                        {text}
                    </span>
                </Tooltip>
            ),
        },
        {
            title: '描述',
            dataIndex: 'description',
            key: 'description',
            width: 300,
            align: 'center',
            ellipsis: {
                showTitle: false,
            },
            render: (text) => (
                <Tooltip placement="topLeft" title={text}>
                    {text}
                </Tooltip>
            ),
        },
        {
            title: '状态',
            align: 'center',
            dataIndex: 'status',
            key: 'status',
            width: 60,
            render: (status) => (
                <Tag color={status === 1 ? 'green' : 'red'}>
                    {status === 1 ? '启用' : '禁用'}
                </Tag>
            )
        },
        {
            title: '用户数量',
            align: 'center',
            dataIndex: 'userCount',
            key: 'userCount',
            width: 100,
            render: (text, record) => (
                <Button
                    type="link"
                    size="small"
                    onClick={() => handleViewRoleUsers(record)}
                    style={{ fontWeight: 700, fontSize: 15, minWidth: 40 }}
                >
                    {text || 0}
                </Button>
            )
        },
        {
            title: '文件夹权限',
            align: 'center',
            key: 'folderPermission',
            width: 120,
            render: (_, record) => (
                <Button
                    type="link"
                    size="small"
                    icon={<FolderOutlined />}
                    onClick={() => handleManageFolderPermission(record)}
                >
                    管理权限
                </Button>
            )
        },
        {
            title: '更新时间',
            align: 'center',
            dataIndex: 'updateTime',
            key: 'updateTime',
            width: 120,
        },
        {
            title: '操作',
            key: 'action',
            width: 120,
            align: 'center',
            fixed: 'right',
            render: (_, record) => (
                <Space size="small">
                    <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEditRole(record)}>
                        编辑
                    </Button>
                    <Popconfirm
                        title="确定要删除此角色吗？"
                        onConfirm={() => handleDeleteRole(record.id)}
                        okText="确定"
                        cancelText="取消"
                    >
                        <Button type="link" size="small" danger icon={<DeleteOutlined />}>
                            删除
                        </Button>
                    </Popconfirm>
                </Space>
            ),
        },
    ]

    const tabItems = [
        {
            key: 'users',
            label: (
                <span>
                    <UserOutlined />
                    用户管理
                </span>
            ),
            children: (
                <>
                    <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-start', alignItems: 'center' }}>
                        <Button type="primary" icon={<PlusOutlined />} onClick={handleAddUser} style={{ marginRight: 8 }}>
                            新建用户
                        </Button>
                        <Button
                            type={selectedUserIds.length > 0 ? "primary" : "default"}
                            icon={<SafetyOutlined />}
                            onClick={handleBatchAssignPermission}
                            disabled={selectedUserIds.length === 0}
                        >
                            批量分配角色
                        </Button>
                    </div>
                    <Table
                        columns={userColumns}
                        dataSource={users}
                        rowKey="id"
                        loading={userLoading || userSearchLoading}
                        tableLayout="fixed"
                        scroll={{ y: 'calc(100vh - 340px)', x: 1000 }}
                        rowClassName={(record) => selectedUserIds.includes(record.id) ? style.selectedRow : ''}
                        pagination={{
                            current: userPagination.current,
                            pageSize: userPagination.pageSize,
                            total: userPagination.total,
                            showTotal: (total) => `共 ${total} 条`,
                            showSizeChanger: true,
                            showQuickJumper: true,
                            pageSizeOptions: [10, 15, 20, 50, 100],
                            locale: {
                                items_per_page: ' 条/页',
                                jump_to: '跳至',
                                jump_to_confirm: '确定',
                                page: '页'
                            },
                            onChange: (page, pageSize) => {
                                // 分页时保持搜索状态
                                if (searchKeyword.trim()) {
                                    searchUsers(searchKeyword)
                                } else {
                                    loadUsers(page, pageSize)
                                }
                            },
                            onShowSizeChange: (current, size) => {
                                // 改变每页大小时保持搜索状态
                                if (searchKeyword.trim()) {
                                    searchUsers(searchKeyword)
                                } else {
                                    loadUsers(1, size)
                                }
                            }
                        }}
                    />
                </>
            ),
        },
        {
            key: 'roles',
            label: (
                <span>
                    <TeamOutlined />
                    角色管理
                </span>
            ),
            children: (
                <>
                    <div style={{ marginBottom: 16 }}>
                        <Button type="primary" icon={<PlusOutlined />} onClick={handleAddRole}>
                            新建角色
                        </Button>
                    </div>
                    <Table
                        columns={roleColumns}
                        dataSource={roles}
                        rowKey="id"
                        loading={roleLoading || roleSearchLoading}
                        tableLayout="fixed"
                        scroll={{ y: 'calc(100vh - 340px)', x: 1000 }}
                        pagination={{
                            current: rolePagination.current,
                            pageSize: rolePagination.pageSize,
                            total: rolePagination.total,
                            showTotal: (total) => `共 ${total} 条`,
                            showSizeChanger: true,
                            showQuickJumper: true,
                            pageSizeOptions: [10, 15, 20, 50, 100],
                            locale: {
                                items_per_page: ' 条/页',
                                jump_to: '跳至',
                                jump_to_confirm: '确定',
                                page: '页'
                            },
                            onChange: (page, pageSize) => {
                                loadRoles(page, pageSize)
                            },
                            onShowSizeChange: (current, size) => {
                                loadRoles(1, size)
                            }
                        }}
                    />
                </>
            ),
        },
    ]

    return (
        <>
            {contextHolder}
            <Layout style={{ padding: 'var(--layout-padding)', height: '100vh' }}>
                <Content
                    className={style.adminContent}
                    style={{
                        paddingLeft: 'var(--layout-padding)',
                        paddingRight: 'var(--layout-padding)',
                        paddingBottom: 'var(--layout-padding)',
                        paddingTop: 6,
                        margin: 0,
                        minHeight: 280,
                        background: colorBgContainer,
                        borderRadius: borderRadiusLG,
                        overflow: 'hidden',
                    }}
                >
                    <h2 style={{ marginBottom: 24 }}>
                        <SafetyOutlined style={{ marginRight: 8 }} />
                        权限管理系统
                    </h2>
                    <Tabs
                        activeKey={activeTab}
                        items={tabItems}
                        onChange={setActiveTab}
                        tabBarExtraContent={
                            <Input.Search
                                placeholder={activeTab === 'users' ? '根据用户名查找' : '根据角色名称查找'}
                                value={activeTab === 'users' ? searchKeyword : roleSearchKeyword}
                                onChange={(e) => {
                                    if (activeTab === 'users') {
                                        setSearchKeyword(e.target.value)
                                    } else {
                                        setRoleSearchKeyword(e.target.value)
                                    }
                                }}
                                onSearch={(value) => {
                                    if (activeTab === 'users') {
                                        setSearchKeyword(value)
                                        searchUsers(value)
                                    } else {
                                        setRoleSearchKeyword(value)
                                        searchRoles(value)
                                    }
                                }}
                                style={{ width: 250 }}
                                enterButton="搜索"
                                loading={activeTab === 'users' ? userSearchLoading : roleSearchLoading}
                            />
                        }
                    />
                </Content>

                {/* 用户编辑/新建模态框 */}
                <Modal
                    title={editingUser ? '编辑用户' : '新建用户'}
                    open={userModalVisible}
                    onOk={handleUserSubmit}
                    onCancel={() => setUserModalVisible(false)}
                    okText="确定"
                    cancelText="取消"
                    confirmLoading={userSubmitLoading}
                    destroyOnClose
                >
                    <Form form={userForm} layout="vertical">
                        <Form.Item
                            label="用户名"
                            name="username"
                            rules={[{ required: true, message: '请输入用户名' }]}
                        >
                            <Input placeholder="请输入用户名" />
                        </Form.Item>
                        <Form.Item
                            label="邮箱"
                            name="email"
                            rules={[
                                { required: true, message: '请输入邮箱' },
                                { type: 'email', message: '请输入有效的邮箱地址' }
                            ]}
                        >
                            <Input placeholder="请输入邮箱" />
                        </Form.Item>
                        {!editingUser ? (
                            // 新建用户：密码必填
                            <>
                                <Form.Item
                                    label="密码"
                                    name="password"
                                    rules={[
                                        { required: true, message: '请输入密码' },
                                        { min: 6, message: '密码至少6位' }
                                    ]}
                                >
                                    <Input.Password placeholder="请输入密码" />
                                </Form.Item>
                                <Form.Item
                                    label="确认密码"
                                    name="confirmPassword"
                                    dependencies={['password']}
                                    rules={[
                                        { required: true, message: '请确认密码' },
                                        ({ getFieldValue }) => ({
                                            validator(_, value) {
                                                if (!value || getFieldValue('password') === value) {
                                                    return Promise.resolve();
                                                }
                                                return Promise.reject(new Error('两次密码输入不一致'));
                                            },
                                        }),
                                    ]}
                                >
                                    <Input.Password placeholder="请再次输入密码" />
                                </Form.Item>
                            </>
                        ) : (
                            // 编辑用户：密码选填
                            <>
                                <Form.Item
                                    label="新密码"
                                    name="newPassword"
                                    rules={[
                                        { min: 6, message: '密码至少6位' }
                                    ]}
                                >
                                    <Input.Password placeholder="不修改请留空" />
                                </Form.Item>
                                <Form.Item
                                    label="确认新密码"
                                    name="confirmNewPassword"
                                    dependencies={['newPassword']}
                                    rules={[
                                        ({ getFieldValue }) => ({
                                            validator(_, value) {
                                                const newPassword = getFieldValue('newPassword');
                                                if (!newPassword && !value) {
                                                    return Promise.resolve();
                                                }
                                                if (newPassword && !value) {
                                                    return Promise.reject(new Error('请确认新密码'));
                                                }
                                                if (value && newPassword !== value) {
                                                    return Promise.reject(new Error('两次密码输入不一致'));
                                                }
                                                return Promise.resolve();
                                            },
                                        }),
                                    ]}
                                >
                                    <Input.Password placeholder="请再次输入新密码" />
                                </Form.Item>
                            </>
                        )}
                        <Form.Item
                            label="状态"
                            name="status"
                            rules={[{ required: true, message: '请选择状态' }]}
                        >
                            <Select placeholder="请选择状态">
                                <Select.Option value={1}>启用</Select.Option>
                                <Select.Option value={0}>禁用</Select.Option>
                            </Select>
                        </Form.Item>
                    </Form>
                </Modal>

                {/* 角色编辑/新建模态框 */}
                <Modal
                    title={editingRole ? '编辑角色' : '新建角色'}
                    open={roleModalVisible}
                    onOk={handleRoleSubmit}
                    onCancel={() => setRoleModalVisible(false)}
                    okText="确定"
                    cancelText="取消"
                    confirmLoading={roleSubmitLoading}
                    destroyOnClose
                >
                    <Form form={roleForm} layout="vertical">
                        <Form.Item
                            label="角色名称"
                            name="name"
                            rules={[{ required: true, message: '请输入角色名称' }]}
                        >
                            <Input placeholder="请输入角色名称" />
                        </Form.Item>
                        <Form.Item
                            label="角色描述"
                            name="description"
                            rules={[{ required: true, message: '请输入角色描述' }]}
                        >
                            <Input.TextArea rows={4} placeholder="请输入角色描述" />
                        </Form.Item>
                        <Form.Item
                            label="状态"
                            name="status"
                            initialValue={1}
                            rules={[{ required: true, message: '请选择状态' }]}
                        >
                            <Select placeholder="请选择状态">
                                <Select.Option value={1}>启用</Select.Option>
                                <Select.Option value={0}>禁用</Select.Option>
                            </Select>
                        </Form.Item>
                    </Form>
                </Modal>

                {/* 权限分配模态框 */}
                <Modal
                    title={`为用户 "${selectedUser?.username}" 分配角色`}
                    open={permissionModalVisible}
                    onOk={handlePermissionSubmit}
                    onCancel={() => setPermissionModalVisible(false)}
                    okText="确定"
                    cancelText="取消"
                    confirmLoading={permissionLoading}
                    width={1000}
                    destroyOnClose
                >
                    <Transfer
                        dataSource={availableRoles.map(r => ({
                            key: r.id,
                            title: r.roleName,
                            description: r.description || ''
                        }))}
                        titles={['可选角色', '已分配角色']}
                        targetKeys={targetKeys}
                        onChange={setTargetKeys}
                        render={item => (
                            <Tooltip title={item.description || item.title} placement="topLeft">
                                <span>{item.title}</span>
                            </Tooltip>
                        )}
                        listStyle={{
                            width: 440,
                            height: 500,
                        }}
                    />
                </Modal>

                {/* 批量分配角色模态框 */}
                <Modal
                    title={`为 ${selectedUserNames.join('、')}  ${selectedUserIds.length} 个用户批量分配角色`}
                    open={batchPermissionModalVisible}
                    onOk={handleBatchPermissionSubmit}
                    onCancel={() => setBatchPermissionModalVisible(false)}
                    okText="确定"
                    cancelText="取消"
                    confirmLoading={batchPermissionLoading}
                    width={1000}
                    destroyOnClose
                >
                    <Transfer
                        dataSource={batchAvailableRoles.map(r => ({
                            key: r.id.toString(),
                            title: r.roleName,
                            description: r.description || ''
                        }))}
                        titles={['可选角色', '已分配角色']}
                        targetKeys={batchTargetKeys}
                        onChange={(targetKeys) => {
                            setBatchTargetKeys(targetKeys)
                        }}
                        render={item => (
                            <Tooltip title={item.description || item.title} placement="topLeft">
                                <span>{item.title}</span>
                            </Tooltip>
                        )}
                        listStyle={{
                            width: 440,
                            height: 500,
                        }}
                    />
                </Modal>

                {/* 文件夹权限管理模态框 */}
                <Modal
                    title={`管理角色「${selectedRole?.name}」的文件夹权限`}
                    open={folderPermissionModalVisible}
                    onOk={handleFolderPermissionSubmit}
                    onCancel={() => setFolderPermissionModalVisible(false)}
                    okText="确定"
                    cancelText="取消"
                    confirmLoading={folderPermissionLoading}
                    width="90%"
                    style={{ top: 25 }}
                    destroyOnClose
                >
                    {/* 横向布局：左侧文件夹树，右侧权限配置 */}
                    <div style={{ display: 'flex', gap: 24, height: 'calc(88vh - 80px)' }}>
                        {/* 左侧：选择文件夹 */}
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                            <h4 style={{ marginBottom: 12 }}>选择文件夹</h4>
                            <div
                                className={style.scrollbar}
                                style={{ border: '1px solid #d9d9d9', borderRadius: 4, padding: 8, flex: 1, overflow: 'auto' }}
                            >
                                <Tree
                                    checkable
                                    checkStrictly
                                    defaultExpandAll
                                    checkedKeys={folderPermissions.map(p => String(p.folderId))}
                                    onCheck={(checkedKeysObj, e) => {
                                        // checkStrictly为true时，checkedKeysObj是{checked: [], halfChecked: []}
                                        const checkedKeys = checkedKeysObj.checked || []
                                        const currentIds = folderPermissions.map(p => String(p.folderId))

                                        // 找出新增的ID
                                        let newIds = checkedKeys.filter(key => !currentIds.includes(String(key)))
                                        // 找出移除的ID
                                        const removedIds = currentIds.filter(id => !checkedKeys.includes(String(id)))

                                        // 只有在勾选操作时，才自动勾选所有子节点
                                        if (e.checked && e.node && newIds.length > 0) {
                                            const childKeys = getAllChildKeys(e.node.key, folderTreeData)
                                            // 合并父节点和子节点的ID
                                            newIds = [...new Set([...newIds, ...childKeys.filter(key => !currentIds.includes(String(key)))])]
                                        }

                                        // 获取默认权限类型（第一个权限类型或'VIEW'）
                                        const defaultPermission = permissionTypes.length > 0 ? permissionTypes[0].code : 'VIEW'

                                        // 添加新权限（使用数组存储）
                                        newIds.forEach(id => handlePermissionChange(Number(id), [defaultPermission]))

                                        // 移除权限（直接从状态删除，不调用API）
                                        if (removedIds.length > 0) {
                                            setFolderPermissions(prev => {
                                                const newPermissions = prev.filter(p => !removedIds.includes(String(p.folderId)))
                                                return newPermissions
                                            })
                                            // 移除后更新分页和总数
                                            setFolderPagination(prev => {
                                                const newTotal = prev.total - removedIds.length
                                                const maxPage = Math.ceil(newTotal / prev.pageSize) || 1
                                                return {
                                                    ...prev,
                                                    total: newTotal,
                                                    current: prev.current > maxPage ? maxPage : prev.current
                                                }
                                            })
                                        }

                                        // 添加后更新分页总数
                                        if (newIds.length > 0) {
                                            setFolderPagination(prev => ({
                                                ...prev,
                                                total: prev.total + newIds.length
                                            }))
                                        }
                                    }}
                                    treeData={folderTreeData}
                                />
                            </div>
                        </div>

                        {/* 右侧：权限配置 */}
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                            <h4 style={{ marginBottom: 12 }}>权限配置 ({folderPermissions.length})</h4>
                            <div className={style.scrollbar} style={{ flex: 1, overflow: 'auto' }}>
                                {folderPermissions.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '20px', color: '#999' }}>
                                        请在左侧选择文件夹
                                    </div>
                                ) : (
                                    <>
                                        {folderPermissions
                                            .slice((folderPagination.current - 1) * folderPagination.pageSize, folderPagination.current * folderPagination.pageSize)
                                            .map(item => (
                                                <div key={item.folderId} style={{ marginBottom: 12, padding: '8px', border: '1px solid #f0f0f0', borderRadius: 4 }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                                        <strong>{getFolderName(item.folderId, folderTreeData)}</strong>
                                                    </div>
                                                    <Checkbox.Group
                                                        value={item.permissions}
                                                        onChange={(checkedValues) => handlePermissionChange(item.folderId, checkedValues)}
                                                        style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}
                                                    >
                                                        {permissionTypes.length > 0 ? (
                                                            permissionTypes.map(type => (
                                                                <Checkbox key={type.code} value={type.code}>
                                                                    {type.name}
                                                                </Checkbox>
                                                            ))
                                                        ) : (
                                                            // 默认fallback选项
                                                            <>
                                                                <Checkbox value="VIEW">可阅读</Checkbox>
                                                                <Checkbox value="EDIT">可编辑</Checkbox>
                                                            </>
                                                        )}
                                                        <Button
                                                            type="link"
                                                            danger
                                                            size="small"
                                                            icon={<DeleteOutlined />}
                                                            onClick={() => handleRemovePermission(item.folderId)}
                                                            style={{ marginLeft: 'auto' }}
                                                        >
                                                            删除
                                                        </Button>
                                                    </Checkbox.Group>
                                                </div>
                                            ))}
                                        {/* 分页 */}
                                        {folderPermissions.length > folderPagination.pageSize && (
                                            <Pagination
                                                style={{ marginTop: 16, textAlign: 'right' }}
                                                current={folderPagination.current}
                                                pageSize={folderPagination.pageSize}
                                                total={folderPagination.total}
                                                showSizeChanger
                                                showQuickJumper
                                                showTotal={(total) => `共 ${total} 条`}
                                                locale={{
                                                    items_per_page: ' 条/页',
                                                    jump_to: '跳至',
                                                    jump_to_confirm: '确定',
                                                    page: '页'
                                                }}
                                                onChange={(page, pageSize) => {
                                                    setFolderPagination({ ...folderPagination, current: page, pageSize })
                                                }}
                                            />
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </Modal>

                {/* 角色用户查看模态框 */}
                <Modal
                    title={null}
                    open={roleUsersModalVisible}
                    onCancel={() => setRoleUsersModalVisible(false)}
                    footer={null}
                    width={620}
                    destroyOnClose
                    className={style.roleUsersModal}
                >
                    <div className={style.modalHeader}>
                        <div className={style.modalHeaderIcon}>
                            <TeamOutlined />
                        </div>
                        <div className={style.modalHeaderInfo}>
                            <h3 className={style.modalHeaderTitle}>{selectedRoleForUsers?.name}</h3>
                            {selectedRoleForUsers?.description && (
                                <p className={style.modalHeaderDesc}>{selectedRoleForUsers?.description}</p>
                            )}
                        </div>
                        <div className={style.modalHeaderCount}>
                            <span className={style.countNumber}>{roleUsers.length}</span>
                            <span className={style.countLabel}>位用户</span>
                        </div>
                    </div>
                    <Spin spinning={roleUsersLoading}>
                        <div className={`${style.userList} ${style.scrollbar}`}>
                            {roleUsers.length === 0 && !roleUsersLoading ? (
                                <div className={style.emptyState}>
                                    <TeamOutlined style={{ fontSize: 48, color: '#d1d5db', marginBottom: 12, display: 'block' }} />
                                    该角色下暂无用户
                                </div>
                            ) : (
                                roleUsers.map((user, index) => (
                                    <div
                                        key={user.id}
                                        className={style.userCard}
                                        style={{ animationDelay: `${index * 60}ms` }}
                                    >
                                        <Avatar
                                            size={44}
                                            style={{
                                                backgroundColor: getAvatarColor(user.username),
                                                flexShrink: 0,
                                                fontWeight: 600,
                                                fontSize: 17,
                                            }}
                                        >
                                            {user.username.charAt(0).toUpperCase()}
                                        </Avatar>
                                        <div className={style.userInfo}>
                                            <span className={style.userName}>{user.username}</span>
                                            <span className={style.userEmail}>{user.email}</span>
                                        </div>
                                        <div className={style.userMeta}>
                                            <span className={`${style.statusDot} ${user.status === 1 ? style.active : style.inactive}`} />
                                            <span className={style.statusText}>{user.status === 1 ? '启用' : '禁用'}</span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </Spin>
                </Modal>

                <Tooltip title="返回主页" placement="left">
                    <FloatButton
                        type="primary"
                        icon={<RollbackOutlined />}
                        onClick={() => navigate('/home')}
                        style={{
                            insetInlineEnd: 24,
                            bottom: 24,
                            boxShadow: '0 4px 12px rgba(24, 144, 255, 0.3)',
                        }}
                    />
                </Tooltip>
            </Layout>
        </>
    )
}

export const MemoAdministrator = memo(Administrator)