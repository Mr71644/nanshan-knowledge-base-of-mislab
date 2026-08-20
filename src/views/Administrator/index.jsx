import { memo, useState, useEffect } from 'react'
import { theme, Layout, FloatButton, Tooltip, Tabs, Table, Button, Modal, Form, Input, Select, Tag, Space, Popconfirm, Transfer, Tree, Radio, Pagination, Checkbox, Spin, Avatar, TreeSelect } from 'antd'
import { RollbackOutlined, UserOutlined, TeamOutlined, SafetyOutlined, PlusOutlined, EditOutlined, DeleteOutlined, FolderOutlined, ImportOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useMessage } from '@/hooks/useMessage'
import { getRoleList, createRole, updateRole, deleteRole, batchDeleteRoles, getRoleFolderPermissions, assignRoleFolderPermissions, roleFolderTree, getPermissionTypes, removeRoleFolderPermissions, batchAssignRoleFolderPermissions, getRoleFolderIntersection, importRoles, downloadRoleTemplate } from '@/apis/role'
import { getUserList, createUser, updateUser, deleteUser, batchDeleteUsers, assignUserRoles, batchAssignUserRoles, getUserRoles, getUnassignedRoles, importUsers, downloadUserTemplate } from '@/apis/user'
import { ImportModal } from '@/components/ImportModal'
import { diffPermissions } from '@/utils/permission'
import style from './index.module.less'
import themeConfig from '#theme'

const { Content } = Layout

const Administrator = ({ embedded = false, activeTab: propActiveTab = 'users' }) => {
    const {
        token: { colorBgContainer, borderRadiusLG },
    } = theme.useToken();
    const navigate = useNavigate()
    const { success, error, contextHolder } = useMessage()
    const [activeTab, setActiveTab] = useState(propActiveTab)

    // 同步外部传入的 activeTab prop（用于 embedded 模式）
    useEffect(() => {
        setActiveTab(propActiveTab)
    }, [propActiveTab])

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
    const [userStatusFilter, setUserStatusFilter] = useState(null) // 用户状态筛选：null=全部, 1=启用, 0=禁用
    const [selectedUserIds, setSelectedUserIds] = useState([]) // 存储选中的用户 ID

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
    const [selectedRoleIds, setSelectedRoleIds] = useState([]) // 存储选中的角色 ID

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
    const [folderPermissionModalReadOnly, setFolderPermissionModalReadOnly] = useState(false) // 系统角色只读模式
    const [folderPagination, setFolderPagination] = useState({
        current: 1,
        pageSize: 10,
        total: 0
    })
    const [permissionTypes, setPermissionTypes] = useState([]) // 存储权限类型列表

    // 多角色批量文件夹权限状态
    const [batchFolderModalVisible, setBatchFolderModalVisible] = useState(false)
    const [batchFolderSelectedRoles, setBatchFolderSelectedRoles] = useState([]) // 选中的角色
    const [batchFolderPermissions, setBatchFolderPermissions] = useState([]) // 交集权限 {folderId, permissions}
    const [batchFolderLoading, setBatchFolderLoading] = useState(false)
    const [batchFolderReadOnly, setBatchFolderReadOnly] = useState(false) // 选中角色含系统角色时只读
    const [batchFolderPagination, setBatchFolderPagination] = useState({
        current: 1,
        pageSize: 10,
        total: 0
    })

    // 导入弹窗状态
    const [importUserModalVisible, setImportUserModalVisible] = useState(false)
    const [importRoleModalVisible, setImportRoleModalVisible] = useState(false)
    const [importRoleParentId, setImportRoleParentId] = useState(null) // 角色导入的上级文件夹 id（可选）

    // 数据初始化
    useEffect(() => {
        loadUsers()
        loadRoles()
        loadFolderTree()
        loadPermissionTypes()
    }, [])

    // 加载用户列表（服务端分页，支持用户名模糊搜索 + 状态筛选）
    // filters 用于搜索/筛选时显式传入新值（避免 setState 异步导致的闭包旧值）
    const loadUsers = async (page = userPagination.current, pageSize = userPagination.pageSize, filters = {}) => {
        setUserLoading(true)
        try {
            const username = (filters.username !== undefined ? filters.username : searchKeyword) || undefined
            const status = (filters.status !== undefined ? filters.status : userStatusFilter) ?? undefined
            const res = await getUserList({
                current: page,
                pageSize: pageSize,
                username,
                status
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
            setUserPagination({
                current: page,
                pageSize: pageSize,
                total: res.data.total
            })
        } catch {
            error({
                content: '加载用户列表失败'
            })
        } finally {
            setUserLoading(false)
        }
    }

    // 服务端搜索用户（按用户名模糊搜索）
    const handleUserSearch = (keyword) => {
        const kw = (keyword || '').trim()
        setSearchKeyword(kw)
        loadUsers(1, userPagination.pageSize, { username: kw || undefined })
    }

    // 服务端按状态筛选用户
    const handleUserStatusFilter = (status) => {
        setUserStatusFilter(status ?? null)
        loadUsers(1, userPagination.pageSize, { status: status ?? undefined })
    }

    const loadRoles = async (page = rolePagination.current, pageSize = rolePagination.pageSize, filters = {}) => {
        setRoleLoading(true)

        try {
            const roleName = (filters.roleName !== undefined ? filters.roleName : roleSearchKeyword) || undefined
            const res = await getRoleList({ current: page, pageSize: pageSize, roleName })
            // 将后端返回的数据格式转换为前端需要的格式
            const roleList = res.data.records.map(item => ({
                id: item.id,
                name: item.roleName,
                roleType: item.roleType,
                isDeletable: item.isDeletable,
                description: item.description,
                status: item.status,
                userCount: item.userCount,
                createTime: item.createTime,
                updateTime: item.updateTime
            }))
            setRoles(roleList)
            setRolePagination({
                current: page,
                pageSize: pageSize,
                total: res.data.total
            })
        } catch {
            error({
                content: '加载角色列表失败'
            })
        } finally {
            setRoleLoading(false)
        }
    }

    // 服务端搜索角色（按角色名模糊搜索）
    const handleRoleSearch = (keyword) => {
        const kw = (keyword || '').trim()
        setRoleSearchKeyword(kw)
        loadRoles(1, rolePagination.pageSize, { roleName: kw || undefined })
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

    // 批量删除用户
    const handleBatchDeleteUsers = async () => {
        try {
            await batchDeleteUsers({ ids: selectedUserIds })
            success({
                content: `成功删除 ${selectedUserIds.length} 个用户`
            })
            setSelectedUserIds([])
            loadUsers(userPagination.current, userPagination.pageSize)
            // 同时刷新角色列表，因为角色列表显示用户数量
            loadRoles(rolePagination.current, rolePagination.pageSize)
        } catch (e) {
            error({
                content: e.response?.data?.message || '批量删除用户失败'
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

    // 批量删除角色
    const handleBatchDeleteRoles = async () => {
        try {
            await batchDeleteRoles({ ids: selectedRoleIds })
            success({
                content: `成功删除 ${selectedRoleIds.length} 个角色`
            })
            setSelectedRoleIds([])
            loadRoles(rolePagination.current, rolePagination.pageSize)
            // 同时刷新用户列表，因为用户列表中显示角色信息
            loadUsers(userPagination.current, userPagination.pageSize)
        } catch (e) {
            error({
                content: e.response?.data?.message || '批量删除角色失败'
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
    const avatarColors = [
        themeConfig.colors.accent,
        themeConfig.colors.accentDeep,
        themeConfig.colors.accentHover,
        themeConfig.colors.pageBg,
        themeConfig.colors.loginAccent,
        themeConfig.colors.loginAccentDeep,
        themeConfig.colors.loginAccentHover,
        themeConfig.colors.accent,
    ]
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
            // 逐个获取用户现有角色，与所选角色合并去重（保留已有角色）
            const users = await Promise.all(selectedUserIds.map(async (userId) => {
                const existingRolesRes = await getUserRoles(userId)
                const existingRoles = existingRolesRes.data || []
                const existingRoleIds = existingRoles.map(role => role.roleId.toString())

                // 合并现有角色和新角色，去重
                const allRoleIds = [...new Set([...existingRoleIds, ...batchTargetKeys])]

                return {
                    userId,
                    roleIds: allRoleIds
                }
            }))

            // 一次性调用批量分配接口
            await batchAssignUserRoles({ users })

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

    // 将后端返回的扁平权限行 [{folderId, permissionType}, ...] 转换为按文件夹分组的 [{folderId, permissions: []}]
    const groupFolderPermissions = (rawRows) => {
        const permissionMap = new Map()
        rawRows.forEach(item => {
            const folderId = item.folderId
            if (!permissionMap.has(folderId)) {
                permissionMap.set(folderId, [])
            }
            permissionMap.get(folderId).push(item.permissionType)
        })
        return Array.from(permissionMap.entries()).map(([folderId, permissions]) => ({
            folderId,
            permissions
        }))
    }

    // 文件夹权限管理相关方法
    const handleManageFolderPermission = async (record) => {
        setSelectedRole(record)
        setFolderPermissionLoading(true)
        setFolderPermissionModalVisible(true)
        setFolderPagination({ current: 1, pageSize: 10, total: 0 })

        // 检测系统角色：roleType === 'SYSTEM' 且 isDeletable === 0
        const isSystemRole = record.roleType === 'SYSTEM' && record.isDeletable === 0
        setFolderPermissionModalReadOnly(isSystemRole)

        try {
            // 如果文件夹树还未加载，先加载文件夹树
            if (!folderTreeData || folderTreeData.length === 0) {
                await loadFolderTree()
            }

            // 获取该角色已分配的文件夹权限
            const res = await getRoleFolderPermissions(record.id)
            // 后端返回格式: [{folderId: 1, permissionType: 'VIEW'}, {folderId: 1, permissionType: 'EDIT'}, ...]
            // 需要转换为: [{folderId: 1, permissions: ['VIEW', 'EDIT']}, ...]
            const permissions = groupFolderPermissions(res.data || [])

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
            // 将 folderPermissions 和 originalFolderPermissions 展开为扁平 (folderId, permissionType) 数组
            const toFlatPairs = (arr) => {
                const pairs = []
                arr.forEach(item => {
                    item.permissions.forEach(p => {
                        pairs.push({ folderId: item.folderId, permissionType: p })
                    })
                })
                return pairs
            }

            const previousPairs = toFlatPairs(originalFolderPermissions)
            const nextPairs = toFlatPairs(folderPermissions)

            const { additions, removals } = diffPermissions(previousPairs, nextPairs)

            // 执行删除操作
            if (removals.length > 0) {
                await removeRoleFolderPermissions({
                    roleId: selectedRole.id,
                    folderPermissions: removals
                })
            }

            // 执行新增操作
            if (additions.length > 0) {
                await assignRoleFolderPermissions({
                    roleId: selectedRole.id,
                    folderPermissions: additions
                })
            }

            if (additions.length === 0 && removals.length === 0) {
                success({
                    content: '没有权限变化'
                })
            } else {
                success({
                    content: '文件夹权限分配成功'
                })
            }

            // 保存成功后重新加载权限（后端可能级联写入子文件夹）
            const refreshed = await getRoleFolderPermissions(selectedRole.id)
            const permissions = groupFolderPermissions(refreshed.data || [])
            setFolderPermissions(permissions)
            setOriginalFolderPermissions(JSON.parse(JSON.stringify(permissions)))
            setFolderPagination(prev => ({ ...prev, total: permissions.length, current: 1 }))
        } catch (e) {
            error({
                content: e.response?.data?.message || '文件夹权限分配失败'
            })
        } finally {
            setFolderPermissionLoading(false)
        }
    }



    // 处理权限级别变更（支持多选）
    // 规则：EDIT 或 DELETE 勾选时自动勾选 VIEW（由 EDIT/DELETE 自动获得只读能力）
    // EDIT 和 DELETE 相互独立，不互相自动勾选
    // 通用实现，供单角色/多角色弹窗复用（setter 指向各自的 permissions 状态）
    const updateFolderPermissions = (setter, folderId, permissions) => {
        const hasEditOrDelete = permissions.includes('EDIT') || permissions.includes('DELETE')
        // 自动添加 VIEW（若 EDIT 或 DELETE 被勾选）
        let effectivePermissions = permissions
        if (hasEditOrDelete && !effectivePermissions.includes('VIEW')) {
            effectivePermissions = ['VIEW', ...effectivePermissions]
        }

        setter(prev => {
            const exists = prev.find(p => p.folderId === folderId)
            if (exists) {
                return prev.map(p => p.folderId === folderId ? { ...p, permissions: effectivePermissions } : p)
            }
            return [...prev, { folderId, permissions: effectivePermissions }]
        })
    }

    const handlePermissionChange = (folderId, permissions) => {
        updateFolderPermissions(setFolderPermissions, folderId, permissions)
    }

    const handleBatchFolderPermissionChange = (folderId, permissions) => {
        updateFolderPermissions(setBatchFolderPermissions, folderId, permissions)
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

    // ---- 多角色批量文件夹权限 ----

    // 打开多角色批量文件夹权限弹窗，回显多角色权限交集
    const openBatchFolderPermission = async () => {
        if (selectedRoleIds.length === 0) {
            error({
                content: '请选择要分配文件夹权限的角色'
            })
            return
        }

        const selectedRoles = roles.filter(r => selectedRoleIds.includes(r.id))
        setBatchFolderSelectedRoles(selectedRoles)
        // 若选中角色包含系统角色，则整体只读（系统角色拥有全部权限，无需分配）
        const hasSystemRole = selectedRoles.some(r => r.roleType === 'SYSTEM' && r.isDeletable === 0)
        setBatchFolderReadOnly(hasSystemRole)

        setBatchFolderLoading(true)
        setBatchFolderModalVisible(true)
        setBatchFolderPagination({ current: 1, pageSize: 10, total: 0 })
        try {
            // 如果文件夹树还未加载，先加载文件夹树
            if (!folderTreeData || folderTreeData.length === 0) {
                await loadFolderTree()
            }
            // 获取多角色权限交集（系统角色视为拥有全部权限，交集即另一角色权限）
            const res = await getRoleFolderIntersection({ roleIds: selectedRoleIds })
            const permissions = groupFolderPermissions(res.data || [])
            setBatchFolderPermissions(permissions)
            setBatchFolderPagination(prev => ({ ...prev, total: permissions.length }))
        } catch (e) {
            error({
                content: e.response?.data?.message || '获取角色权限交集失败'
            })
            setBatchFolderModalVisible(false)
        } finally {
            setBatchFolderLoading(false)
        }
    }

    // 多角色弹窗文件夹树勾选处理（级联子节点 + 默认权限类型）
    const handleBatchFolderTreeCheck = (checkedKeysObj, e) => {
        const checkedKeys = checkedKeysObj.checked || []
        const currentIds = batchFolderPermissions.map(p => String(p.folderId))

        // 找出新增的ID
        let newIds = checkedKeys.filter(key => !currentIds.includes(String(key)))
        // 找出移除的ID
        const removedIds = currentIds.filter(id => !checkedKeys.includes(String(id)))

        // 只有在勾选操作时，才自动勾选所有子节点
        if (e.checked && e.node && newIds.length > 0) {
            const childKeys = getAllChildKeys(e.node.key, folderTreeData)
            newIds = [...new Set([...newIds, ...childKeys.filter(key => !currentIds.includes(String(key)))])]
        }

        // 获取默认权限类型（第一个权限类型或'VIEW'）
        const defaultPermission = permissionTypes.length > 0 ? permissionTypes[0].code : 'VIEW'

        // 添加新权限（使用数组存储）
        newIds.forEach(id => handleBatchFolderPermissionChange(Number(id), [defaultPermission]))

        // 移除权限时，同时移除所有子节点的权限
        if (removedIds.length > 0) {
            let allRemovedIds = [...removedIds]
            removedIds.forEach(id => {
                const childKeys = getAllChildKeys(id, folderTreeData)
                allRemovedIds = [...allRemovedIds, ...childKeys]
            })
            const removedSet = new Set(allRemovedIds.map(String))
            setBatchFolderPermissions(prev => prev.filter(p => !removedSet.has(String(p.folderId))))
            setBatchFolderPagination(prev => {
                const newTotal = prev.total - removedSet.size
                const maxPage = Math.ceil(newTotal / prev.pageSize) || 1
                return { ...prev, total: newTotal, current: prev.current > maxPage ? maxPage : prev.current }
            })
        }

        // 添加后更新分页总数
        if (newIds.length > 0) {
            setBatchFolderPagination(prev => ({ ...prev, total: prev.total + newIds.length }))
        }
    }

    // 提交多角色批量文件夹权限
    const handleBatchFolderPermissionSubmit = async () => {
        if (batchFolderLoading) return
        setBatchFolderLoading(true)
        try {
            // 摊平为 [{folderId, permissionType}] 列表
            const flatPairs = []
            batchFolderPermissions.forEach(item => {
                item.permissions.forEach(p => {
                    flatPairs.push({ folderId: item.folderId, permissionType: p })
                })
            })

            await batchAssignRoleFolderPermissions({
                roleIds: selectedRoleIds,
                folderPermissions: flatPairs
            })

            success({
                content: `成功为 ${selectedRoleIds.length} 个角色分配文件夹权限`
            })
            setBatchFolderModalVisible(false)
        } catch (e) {
            error({
                content: e.response?.data?.message || '批量分配文件夹权限失败'
            })
        } finally {
            setBatchFolderLoading(false)
        }
    }

    // 用户表格列定义
    const userColumns = [
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

    // 搜索/筛选控件：用户页（状态下拉 + 用户名搜索）；角色页（角色名搜索）
    const searchControls = (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {activeTab === 'users' && (
                <>
                    <Select
                        allowClear
                        placeholder="全部状态"
                        value={userStatusFilter}
                        onChange={handleUserStatusFilter}
                        style={{ width: 100 }}
                        options={[
                            { value: 1, label: '启用' },
                            { value: 0, label: '禁用' }
                        ]}
                    />
                    <div style={{ width: 1, height: 18, background: 'var(--color-border-card)' }} />
                </>
            )}
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
                        handleUserSearch(value)
                    } else {
                        handleRoleSearch(value)
                    }
                }}
                style={{ width: 240 }}
                enterButton="搜索"
                loading={activeTab === 'users' ? userLoading : roleLoading}
            />
        </div>
    )

    // 工具栏统一样式：暖色浅底 Dock，把左侧操作按钮和右侧搜索/筛选放在同一行
    const toolbarStyle = {
        marginBottom: 16,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap',
        padding: '10px 12px',
        borderRadius: 12,
        background: 'linear-gradient(180deg, rgba(var(--color-accent-rgb), 0.06) 0%, rgba(var(--color-accent-rgb), 0.015) 100%)',
        border: '1px solid var(--color-border-card)',
    }

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
                    <div style={toolbarStyle}>
                        <Button type="primary" icon={<PlusOutlined />} onClick={handleAddUser}>
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
                        <Popconfirm
                            title={`确定要删除选中的 ${selectedUserIds.length} 个用户吗？`}
                            onConfirm={handleBatchDeleteUsers}
                            okText="确定"
                            cancelText="取消"
                            okButtonProps={{ danger: true }}
                            disabled={selectedUserIds.length === 0}
                        >
                            <Button
                                danger
                                icon={<DeleteOutlined />}
                                disabled={selectedUserIds.length === 0}
                            >
                                批量删除
                            </Button>
                        </Popconfirm>
                        <Button
                            icon={<ImportOutlined />}
                            onClick={() => setImportUserModalVisible(true)}
                        >
                            批量导入
                        </Button>
                        <div style={{ flex: 1 }} />
                        {searchControls}
                    </div>
                    <Table
                        columns={userColumns}
                        dataSource={users}
                        rowKey="id"
                        rowSelection={{
                            selectedRowKeys: selectedUserIds,
                            onChange: (keys) => setSelectedUserIds(keys),
                        }}
                        loading={userLoading}
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
                                // 分页时保持搜索/筛选条件（loadUsers 内部读取当前 searchKeyword / userStatusFilter）
                                loadUsers(page, pageSize)
                            },
                            onShowSizeChange: (current, size) => {
                                loadUsers(1, size)
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
                    <div style={toolbarStyle}>
                        <Button type="primary" icon={<PlusOutlined />} onClick={handleAddRole}>
                            新建角色
                        </Button>
                        <Button
                            type={selectedRoleIds.length > 0 ? "primary" : "default"}
                            icon={<FolderOutlined />}
                            onClick={openBatchFolderPermission}
                            disabled={selectedRoleIds.length === 0}
                        >
                            批量分配文件夹权限
                        </Button>
                        <Popconfirm
                            title={`确定要删除选中的 ${selectedRoleIds.length} 个角色吗？`}
                            onConfirm={handleBatchDeleteRoles}
                            okText="确定"
                            cancelText="取消"
                            okButtonProps={{ danger: true }}
                            disabled={selectedRoleIds.length === 0}
                        >
                            <Button
                                danger
                                icon={<DeleteOutlined />}
                                disabled={selectedRoleIds.length === 0}
                            >
                                批量删除
                            </Button>
                        </Popconfirm>
                        <Button
                            icon={<ImportOutlined />}
                            onClick={() => setImportRoleModalVisible(true)}
                        >
                            批量导入
                        </Button>
                        <div style={{ flex: 1 }} />
                        {searchControls}
                    </div>
                    <Table
                        columns={roleColumns}
                        dataSource={roles}
                        rowKey="id"
                        rowSelection={{
                            selectedRowKeys: selectedRoleIds,
                            onChange: (keys) => setSelectedRoleIds(keys),
                        }}
                        loading={roleLoading}
                        tableLayout="fixed"
                        scroll={{ y: 'calc(100vh - 340px)', x: 1000 }}
                        rowClassName={(record) => selectedRoleIds.includes(record.id) ? style.selectedRow : ''}
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

    // ---- 核心内容（Tabs + 所有 Modal）----
    // 在 embedded 和非 embedded 模式下复用同一份内容
    const innerContent = (
        <>
            <Tabs
                activeKey={activeTab}
                items={tabItems}
                onChange={setActiveTab}
                tabBarStyle={embedded ? { display: 'none' } : undefined}
            />

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
                    title={`管理角色「${selectedRole?.name}」的文件夹权限${folderPermissionModalReadOnly ? '（只读）' : ''}`}
                    open={folderPermissionModalVisible}
                    onOk={handleFolderPermissionSubmit}
                    onCancel={() => setFolderPermissionModalVisible(false)}
                    okText="确定"
                    cancelText="取消"
                    confirmLoading={folderPermissionLoading}
                    okButtonProps={folderPermissionModalReadOnly ? { style: { display: 'none' } } : {}}
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
                                style={{ border: '1px solid var(--color-border-card)', borderRadius: 4, padding: 8, flex: 1, overflow: 'auto' }}
                            >
                                <Tree
                                    checkable={!folderPermissionModalReadOnly}
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

                                        // 移除权限时，同时移除所有子节点的权限
                                        if (removedIds.length > 0) {
                                            // 收集所有被移除节点及其子节点的 ID
                                            let allRemovedIds = [...removedIds]
                                            removedIds.forEach(id => {
                                                const childKeys = getAllChildKeys(id, folderTreeData)
                                                allRemovedIds = [...allRemovedIds, ...childKeys]
                                            })
                                            const removedSet = new Set(allRemovedIds.map(String))
                                            setFolderPermissions(prev => {
                                                const newPermissions = prev.filter(p => !removedSet.has(String(p.folderId)))
                                                return newPermissions
                                            })
                                            // 移除后更新分页和总数
                                            setFolderPagination(prev => {
                                                const newTotal = prev.total - removedSet.size
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
                                    <div style={{ textAlign: 'center', padding: '20px', color: 'var(--color-ink-muted)' }}>
                                        请在左侧选择文件夹
                                    </div>
                                ) : (
                                    <>
                                        {folderPermissions
                                            .slice((folderPagination.current - 1) * folderPagination.pageSize, folderPagination.current * folderPagination.pageSize)
                                            .map(item => (
                                                <div key={item.folderId} style={{ marginBottom: 12, padding: '8px', border: '1px solid var(--color-border-light)', borderRadius: 4 }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                                        <strong>{getFolderName(item.folderId, folderTreeData)}</strong>
                                                    </div>
                                                    <Checkbox.Group
                                                        value={item.permissions}
                                                        onChange={(checkedValues) => handlePermissionChange(item.folderId, checkedValues)}
                                                        style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}
                                                    >
                                                        {permissionTypes.length > 0 ? (
                                                            permissionTypes.map(type => {
                                                                const isView = type.code === 'VIEW'
                                                                const hasEditOrDelete = item.permissions.includes('EDIT') || item.permissions.includes('DELETE')
                                                                // VIEW 在 EDIT 或 DELETE 勾选时禁用（由上级权限自动获得）
                                                                const disabled = (isView && hasEditOrDelete) || folderPermissionModalReadOnly
                                                                return (
                                                                    <Tooltip key={type.code} title={isView && hasEditOrDelete ? `${type.name}（由可编辑/可删除权限自动获得）` : type.name}>
                                                                        <Checkbox value={type.code} disabled={disabled}>
                                                                            {type.name}
                                                                        </Checkbox>
                                                                    </Tooltip>
                                                                )
                                                            })
                                                        ) : (
                                                            // 默认fallback选项
                                                            <>
                                                                <Checkbox value="VIEW" disabled={folderPermissionModalReadOnly}>可阅读</Checkbox>
                                                                <Checkbox value="EDIT" disabled={folderPermissionModalReadOnly}>可编辑</Checkbox>
                                                                <Checkbox value="DELETE" disabled={folderPermissionModalReadOnly}>可删除</Checkbox>
                                                            </>
                                                        )}
                                                        {!folderPermissionModalReadOnly && (
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
                                                        )}
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

                {/* 多角色批量文件夹权限模态框 */}
                <Modal
                    title={`为「${batchFolderSelectedRoles.map(r => r.name).join('、')}」批量分配文件夹权限${batchFolderReadOnly ? '（只读）' : ''}`}
                    open={batchFolderModalVisible}
                    onOk={handleBatchFolderPermissionSubmit}
                    onCancel={() => setBatchFolderModalVisible(false)}
                    okText="确定"
                    cancelText="取消"
                    confirmLoading={batchFolderLoading}
                    okButtonProps={batchFolderReadOnly ? { style: { display: 'none' } } : {}}
                    width="90%"
                    style={{ top: 25 }}
                    destroyOnClose
                >
                    <div style={{ display: 'flex', gap: 24, height: 'calc(88vh - 80px)' }}>
                        {/* 左侧：选择文件夹 */}
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                            <h4 style={{ marginBottom: 12 }}>选择文件夹</h4>
                            <div
                                className={style.scrollbar}
                                style={{ border: '1px solid var(--color-border-card)', borderRadius: 4, padding: 8, flex: 1, overflow: 'auto' }}
                            >
                                <Tree
                                    checkable={!batchFolderReadOnly}
                                    checkStrictly
                                    defaultExpandAll
                                    checkedKeys={batchFolderPermissions.map(p => String(p.folderId))}
                                    onCheck={handleBatchFolderTreeCheck}
                                    treeData={folderTreeData}
                                />
                            </div>
                        </div>

                        {/* 右侧：权限配置 */}
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                            <h4 style={{ marginBottom: 12 }}>权限配置（交集回显，{batchFolderPermissions.length}）</h4>
                            <div className={style.scrollbar} style={{ flex: 1, overflow: 'auto' }}>
                                {batchFolderPermissions.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '20px', color: 'var(--color-ink-muted)' }}>
                                        请在左侧选择文件夹
                                    </div>
                                ) : (
                                    <>
                                        {batchFolderPermissions
                                            .slice((batchFolderPagination.current - 1) * batchFolderPagination.pageSize, batchFolderPagination.current * batchFolderPagination.pageSize)
                                            .map(item => (
                                                <div key={item.folderId} style={{ marginBottom: 12, padding: '8px', border: '1px solid var(--color-border-light)', borderRadius: 4 }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                                        <strong>{getFolderName(item.folderId, folderTreeData)}</strong>
                                                    </div>
                                                    <Checkbox.Group
                                                        value={item.permissions}
                                                        onChange={(checkedValues) => handleBatchFolderPermissionChange(item.folderId, checkedValues)}
                                                        style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}
                                                    >
                                                        {permissionTypes.length > 0 ? (
                                                            permissionTypes.map(type => {
                                                                const isView = type.code === 'VIEW'
                                                                const hasEditOrDelete = item.permissions.includes('EDIT') || item.permissions.includes('DELETE')
                                                                // VIEW 在 EDIT 或 DELETE 勾选时禁用（由上级权限自动获得）
                                                                const disabled = (isView && hasEditOrDelete) || batchFolderReadOnly
                                                                return (
                                                                    <Tooltip key={type.code} title={isView && hasEditOrDelete ? `${type.name}（由可编辑/可删除权限自动获得）` : type.name}>
                                                                        <Checkbox value={type.code} disabled={disabled}>
                                                                            {type.name}
                                                                        </Checkbox>
                                                                    </Tooltip>
                                                                )
                                                            })
                                                        ) : (
                                                            // 默认fallback选项
                                                            <>
                                                                <Checkbox value="VIEW" disabled={batchFolderReadOnly}>可阅读</Checkbox>
                                                                <Checkbox value="EDIT" disabled={batchFolderReadOnly}>可编辑</Checkbox>
                                                                <Checkbox value="DELETE" disabled={batchFolderReadOnly}>可删除</Checkbox>
                                                            </>
                                                        )}
                                                    </Checkbox.Group>
                                                </div>
                                            ))}
                                        {/* 分页 */}
                                        {batchFolderPermissions.length > batchFolderPagination.pageSize && (
                                            <Pagination
                                                style={{ marginTop: 16, textAlign: 'right' }}
                                                current={batchFolderPagination.current}
                                                pageSize={batchFolderPagination.pageSize}
                                                total={batchFolderPagination.total}
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
                                                    setBatchFolderPagination({ ...batchFolderPagination, current: page, pageSize })
                                                }}
                                            />
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </Modal>

                {/* 用户批量导入模态框 */}
                <ImportModal
                    open={importUserModalVisible}
                    title="批量导入用户"
                    onCancel={() => setImportUserModalVisible(false)}
                    downloadTemplate={downloadUserTemplate}
                    onImport={importUsers}
                    onSuccess={() => {
                        loadUsers(userPagination.current, userPagination.pageSize)
                        // 同时刷新角色列表，因为角色列表显示用户数量
                        loadRoles(rolePagination.current, rolePagination.pageSize)
                    }}
                />

                {/* 角色批量导入模态框 */}
                <ImportModal
                    open={importRoleModalVisible}
                    title="批量导入角色"
                    onCancel={() => setImportRoleModalVisible(false)}
                    downloadTemplate={downloadRoleTemplate}
                    onImport={(file) => importRoles({ file, parentFolderId: importRoleParentId })}
                    onSuccess={() => {
                        loadRoles(rolePagination.current, rolePagination.pageSize)
                        // 同时刷新用户列表，因为用户列表中显示角色信息
                        loadUsers(userPagination.current, userPagination.pageSize)
                    }}
                    extraFields={(
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <span style={{ fontWeight: 500 }}>上级文件夹（可选）</span>
                            <TreeSelect
                                allowClear
                                placeholder="留空则仅导入角色（或由 Excel「上级文件夹」列指定）"
                                treeData={folderTreeData}
                                fieldNames={{ label: 'title', value: 'key', children: 'children' }}
                                treeDefaultExpandAll
                                onChange={(v) => setImportRoleParentId(v ? Number(v) : null)}
                                style={{ width: '100%' }}
                            />
                        </div>
                    )}
                />

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
                                    <TeamOutlined style={{ fontSize: 48, color: 'var(--color-ink-muted)', marginBottom: 12, display: 'block', opacity: 0.5 }} />
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

                {!embedded && (
                    <Tooltip title="返回主页" placement="left">
                        <FloatButton
                            type="primary"
                            icon={<RollbackOutlined />}
                            onClick={() => navigate('/home')}
                            style={{
                                insetInlineEnd: 24,
                                bottom: 24,
                                boxShadow: 'var(--shadow-float-btn)',
                            }}
                        />
                    </Tooltip>
                )}
            </>
        )

        if (embedded) {
            return (
                <>
                    {contextHolder}
                    {innerContent}
                </>
            )
        }

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
                        {innerContent}
                    </Content>
                    <Tooltip title="返回主页" placement="left">
                        <FloatButton
                            type="primary"
                            icon={<RollbackOutlined />}
                            onClick={() => navigate('/home')}
                            style={{
                                insetInlineEnd: 24,
                                bottom: 24,
                                boxShadow: 'var(--shadow-float-btn)',
                            }}
                        />
                    </Tooltip>
                </Layout>
            </>
        )
    }

export const MemoAdministrator = memo(Administrator)