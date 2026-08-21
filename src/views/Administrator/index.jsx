import { memo, useState, useEffect, useRef, useLayoutEffect } from 'react'
import { theme, Layout, FloatButton, Tooltip, Tabs, Table, Button, Modal, Form, Input, Select, Tag, Space, Popconfirm, Tree, Checkbox, Spin, Avatar, TreeSelect } from 'antd'
import { RollbackOutlined, UserOutlined, TeamOutlined, SafetyOutlined, PlusOutlined, EditOutlined, DeleteOutlined, FolderOutlined, ImportOutlined, InfoCircleOutlined } from '@ant-design/icons'
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
    const [permissionRoleSearch, setPermissionRoleSearch] = useState('') // 单个用户分配角色列表搜索关键词

    // 批量分配角色状态
    const [batchPermissionModalVisible, setBatchPermissionModalVisible] = useState(false)
    const [batchTargetKeys, setBatchTargetKeys] = useState([])
    const [batchAvailableRoles, setBatchAvailableRoles] = useState([])
    const [batchPermissionLoading, setBatchPermissionLoading] = useState(false)
    const [selectedUserNames, setSelectedUserNames] = useState([]) // 存储选中的用户名
    const [batchExistingRoles, setBatchExistingRoles] = useState([]) // 选中用户现有角色的并集（带计数）
    const [batchRoleSearch, setBatchRoleSearch] = useState('') // 新增角色列表搜索关键词

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
    const [permissionTypes, setPermissionTypes] = useState([]) // 存储权限类型列表

    // 多角色批量文件夹权限状态
    const [batchFolderModalVisible, setBatchFolderModalVisible] = useState(false)
    const [batchFolderSelectedRoles, setBatchFolderSelectedRoles] = useState([]) // 选中的角色
    const [batchFolderLoading, setBatchFolderLoading] = useState(false)
    const [batchFolderReadOnly, setBatchFolderReadOnly] = useState(false) // 选中角色含系统角色时只读
    const [batchCommonPerms, setBatchCommonPerms] = useState({}) // 交集（所有角色共同拥有）{folderId: [权限]}
    const [batchPermHints, setBatchPermHints] = useState({}) // 各权限被多少角色拥有 {folderId: {permission: {count, roleNames}}}
    const [batchFolderGrants, setBatchFolderGrants] = useState({}) // 本次新增授权 {folderId: [权限]}

    // 导入弹窗状态
    const [importUserModalVisible, setImportUserModalVisible] = useState(false)
    const [importRoleModalVisible, setImportRoleModalVisible] = useState(false)
    const [importRoleParentId, setImportRoleParentId] = useState(null) // 角色导入的上级文件夹 id（可选）

    // 表格高度自适应：测量当前激活 tab 表格的可用高度，使其铺满卡片避免下方留白
    const usersTableWrapRef = useRef(null)
    const rolesTableWrapRef = useRef(null)
    const [tableHeights, setTableHeights] = useState({ users: null, roles: null })

    const measureTable = (key) => {
        const wrap = key === 'users' ? usersTableWrapRef.current : rolesTableWrapRef.current
        if (!wrap) return
        const top = wrap.getBoundingClientRect().top
        const header = wrap.querySelector('.ant-table-header')
        const pagination = wrap.querySelector('.ant-pagination')
        const headerH = header ? header.offsetHeight : 0
        const pagH = pagination ? pagination.offsetHeight : 0
        // 视口高度 - 表格顶部 - 表头 - 分页 - 底部留白
        const h = Math.floor(window.innerHeight - top - headerH - pagH - 24)
        if (h > 120) {
            setTableHeights(prev => (prev[key] === h ? prev : { ...prev, [key]: h }))
        }
    }

    useLayoutEffect(() => {
        // 挂载 / 切换 tab / 数据加载完成后重新测量当前可见表格
        if (activeTab === 'users') measureTable('users')
        else if (activeTab === 'roles') measureTable('roles')
    }, [activeTab, userLoading, roleLoading])

    useEffect(() => {
        const onResize = () => {
            if (activeTab === 'users') measureTable('users')
            else if (activeTab === 'roles') measureTable('roles')
        }
        window.addEventListener('resize', onResize)
        return () => window.removeEventListener('resize', onResize)
    }, [activeTab])

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

            // 设置已分配的角色ID列表（统一为字符串，便于复选框状态对比）
            const assignedRoleIds = assignedRoles.map(role => role.roleId.toString())
            setTargetKeys(assignedRoleIds)
            setPermissionRoleSearch('')

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

            // 并行获取每个选中用户现有角色，聚合出"并集 + 计数 + 拥有者"用于回显
            const userMap = new Map(selectedUsers.map(u => [String(u.id), u.username]))
            const existingLists = await Promise.all(selectedUserIds.map(async uid => {
                const res = await getUserRoles(uid)
                return { userId: uid, list: res.data || [] }
            }))
            const countMap = new Map()
            existingLists.forEach(({ userId, list }) => {
                const username = userMap.get(String(userId)) || String(userId)
                list.forEach(role => {
                    const key = String(role.roleId)
                    if (!countMap.has(key)) {
                        countMap.set(key, { roleId: role.roleId, roleName: role.roleName, count: 0, users: [] })
                    }
                    countMap.get(key).count++
                    countMap.get(key).users.push(username)
                })
            })
            const existingRoles = Array.from(countMap.values())
            setBatchExistingRoles(existingRoles)

            // 直接更新状态并打开弹窗
            setBatchTargetKeys([])
            setBatchRoleSearch('')
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
        } catch (e) {
            error({
                content: e.response?.data?.message || '文件夹权限分配失败'
            })
        } finally {
            setFolderPermissionLoading(false)
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

    // ---- 文件夹权限树（行内权限） ----

    // 在某个文件夹上勾选/取消权限，级联应用到其所有子文件夹
    // （与后端“父权限级联写入子文件夹”及文档要求的“取消父权限时同步取消子权限”一致）
    const handleInlinePermissionChange = (folderId, code, checked) => {
        const added = checked ? [code] : []
        const removed = checked ? [] : [code]

        setFolderPermissions(prev => {
            const targetKeys = [String(folderId), ...getAllChildKeys(folderId, folderTreeData)]
            const targetSet = new Set(targetKeys.map(String))

            // 对单个文件夹应用权限差异，并处理隐含只读（EDIT/DELETE 自动获得 VIEW）
            const applyDelta = (perms) => {
                let result = [...perms]
                added.forEach(c => { if (!result.includes(c)) result.push(c) })
                removed.forEach(c => { result = result.filter(x => x !== c) })
                const hasEditOrDelete = result.includes('EDIT') || result.includes('DELETE')
                if (hasEditOrDelete && !result.includes('VIEW')) {
                    result = ['VIEW', ...result]
                }
                return result
            }

            // 更新已存在记录的目标文件夹
            const updated = prev.map(p =>
                targetSet.has(String(p.folderId))
                    ? { folderId: p.folderId, permissions: applyDelta(p.permissions) }
                    : p
            )

            // 为原本没有记录、但级联后获得权限的目标文件夹补充记录
            targetKeys.forEach(k => {
                if (!updated.some(p => String(p.folderId) === k)) {
                    const perms = applyDelta([])
                    if (perms.length > 0) {
                        updated.push({ folderId: Number(k), permissions: perms })
                    }
                }
            })

            return updated
        })
    }

    // 渲染单个文件夹的行内权限复选框
    const renderInlinePermissions = (folderId, readOnly) => {
        const perms = folderPermissions.find(p => String(p.folderId) === String(folderId))?.permissions || []
        const hasEditOrDelete = perms.includes('EDIT') || perms.includes('DELETE')
        const types = permissionTypes.length > 0 ? permissionTypes : [
            { code: 'VIEW', name: '可阅读' },
            { code: 'EDIT', name: '可编辑' },
            { code: 'DELETE', name: '可删除' }
        ]

        return types.map(type => {
            const isView = type.code === 'VIEW'
            const checked = isView ? (perms.includes('VIEW') || hasEditOrDelete) : perms.includes(type.code)
            const disabled = (isView && hasEditOrDelete) || readOnly
            return (
                <Tooltip
                    key={type.code}
                    title={isView && hasEditOrDelete ? `${type.name}（由可编辑/可删除权限自动获得）` : type.name}
                >
                    <Checkbox
                        checked={checked}
                        disabled={disabled}
                        onChange={(e) => handleInlinePermissionChange(folderId, type.code, e.target.checked)}
                    >
                        {type.name}
                    </Checkbox>
                </Tooltip>
            )
        })
    }

    // 将文件夹树转换为携带行内权限控件的树数据
    const renderPermissionTreeData = (nodes, readOnly) => {
        if (!nodes || !Array.isArray(nodes)) return []
        return nodes.map(node => ({
            key: node.key,
            title: (
                <div className={style.permNode}>
                    <FolderOutlined className={style.permNodeIcon} />
                    <span className={style.permNodeName} title={node.title}>{node.title}</span>
                    <div className={style.permNodeToggles} onClick={(e) => e.stopPropagation()}>
                        {renderInlinePermissions(node.key, readOnly)}
                    </div>
                </div>
            ),
            children: node.children && node.children.length > 0
                ? renderPermissionTreeData(node.children, readOnly)
                : undefined
        }))
    }

    // ---- 多角色批量文件夹权限 ----

    // 打开多角色批量文件夹权限弹窗：拉取每个角色权限，本地计算交集（共同）与个别差异
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
        setBatchFolderGrants({})
        try {
            // 如果文件夹树还未加载，先加载文件夹树
            if (!folderTreeData || folderTreeData.length === 0) {
                await loadFolderTree()
            }
            // 共同权限（交集）：交给后端计算（系统角色视为拥有全部权限，交集即另一角色权限）
            const interRes = await getRoleFolderIntersection({ roleIds: selectedRoleIds })
            const common = {}
            groupFolderPermissions(interRes.data || []).forEach(item => {
                common[String(item.folderId)] = item.permissions
            })

            // 逐个拉取每个角色的权限，用于标注"个别角色另有"
            const rolePermLists = await Promise.all(selectedRoleIds.map(async rid => {
                const res = await getRoleFolderPermissions(rid)
                return groupFolderPermissions(res.data || [])
            }))
            const perFolder = {} // folderId -> { 角色下标: [权限] }
            rolePermLists.forEach((perms, idx) => {
                perms.forEach(item => {
                    const k = String(item.folderId)
                    if (!perFolder[k]) perFolder[k] = {}
                    perFolder[k][idx] = item.permissions
                })
            })
            // 统计每个文件夹下各权限被多少角色拥有（用于"×N 位已拥有"标注）
            const permHints = {}
            Object.keys(perFolder).forEach(k => {
                const hintMap = {}
                Object.entries(perFolder[k]).forEach(([idx, perms]) => {
                    perms.forEach(p => {
                        if (!hintMap[p]) hintMap[p] = { count: 0, roleNames: [] }
                        hintMap[p].count++
                        hintMap[p].roleNames.push(selectedRoles[Number(idx)].name)
                    })
                })
                permHints[k] = hintMap
            })

            setBatchCommonPerms(common)
            setBatchPermHints(permHints)
        } catch (e) {
            error({
                content: e.response?.data?.message || '获取角色权限失败'
            })
            setBatchFolderModalVisible(false)
        } finally {
            setBatchFolderLoading(false)
        }
    }

    // 批量弹窗行内权限变更：勾选 = 授予给全部角色（只增），级联应用到子文件夹
    const handleBatchInlinePermissionChange = (folderId, code, checked) => {
        setBatchFolderGrants(prev => {
            const targetKeys = [String(folderId), ...getAllChildKeys(folderId, folderTreeData)]
            const next = { ...prev }
            targetKeys.forEach(k => {
                const perms = next[k] ? [...next[k]] : []
                if (checked) {
                    if (!perms.includes(code)) perms.push(code)
                    // 隐含只读：EDIT/DELETE 自动获得 VIEW
                    if ((code === 'EDIT' || code === 'DELETE') && !perms.includes('VIEW')) {
                        perms.unshift('VIEW')
                    }
                } else {
                    const idx = perms.indexOf(code)
                    if (idx >= 0) perms.splice(idx, 1)
                }
                if (perms.length > 0) next[k] = perms
                else delete next[k]
            })
            return next
        })
    }

    // 批量弹窗：渲染单个文件夹的行内权限（共同锁定 + 可勾选授予）
    const renderBatchInlinePermissions = (folderId, readOnly) => {
        const key = String(folderId)
        const common = batchCommonPerms[key] || []
        const granted = batchFolderGrants[key] || []
        const hasEditOrDelete = common.includes('EDIT') || common.includes('DELETE') || granted.includes('EDIT') || granted.includes('DELETE')
        const types = permissionTypes.length > 0 ? permissionTypes : [
            { code: 'VIEW', name: '可阅读' },
            { code: 'EDIT', name: '可编辑' },
            { code: 'DELETE', name: '可删除' }
        ]

        return (
            <>
                {types.map(type => {
                    const isView = type.code === 'VIEW'
                    const isCommon = common.includes(type.code)
                    const isGranted = granted.includes(type.code)
                    const impliedView = isView && hasEditOrDelete
                    const checked = isCommon || isGranted || impliedView
                    const disabled = isCommon || impliedView || readOnly
                    const tooltip = isCommon
                        ? `${type.name}（所有选中角色共同拥有）`
                        : (impliedView ? `${type.name}（由可编辑/可删除权限自动获得）` : type.name)
                    return (
                        <Tooltip key={type.code} title={tooltip}>
                            <Checkbox
                                checked={checked}
                                disabled={disabled}
                                onChange={(e) => handleBatchInlinePermissionChange(folderId, type.code, e.target.checked)}
                            >
                                {type.name}
                            </Checkbox>
                        </Tooltip>
                    )
                })}
            </>
        )
    }

    // 批量弹窗：渲染"×N 位已拥有"标注（放在文件夹名后，悬停显示具体角色）
    const renderBatchPermHints = (folderId) => {
        const key = String(folderId)
        const hints = batchPermHints[key] || {}
        const types = permissionTypes.length > 0 ? permissionTypes : [
            { code: 'VIEW', name: '可阅读' },
            { code: 'EDIT', name: '可编辑' },
            { code: 'DELETE', name: '可删除' }
        ]
        const nameOf = (code) => {
            const t = types.find(x => x.code === code)
            return t ? t.name : code
        }
        const items = types.filter(t => {
            const h = hints[t.code]
            return h && h.count > 0 && h.count < selectedRoleIds.length
        })
        if (items.length === 0) return null
        return (
            <span className={style.batchPermHints}>
                {items.map(t => (
                    <Tooltip key={t.code} title={`由 ${hints[t.code].roleNames.join('、')} 拥有`}>
                        <span className={style.batchPermHint}>×{hints[t.code].count}位已拥有{nameOf(t.code)}</span>
                    </Tooltip>
                ))}
            </span>
        )
    }

    // 批量弹窗：将文件夹树转换为携带行内权限控件的树数据
    const renderBatchPermissionTreeData = (nodes, readOnly) => {
        if (!nodes || !Array.isArray(nodes)) return []
        return nodes.map(node => ({
            key: node.key,
            title: (
                <div className={style.permNode}>
                    <FolderOutlined className={style.permNodeIcon} />
                    <span className={style.permNodeName} style={{ flex: '0 1 auto' }} title={node.title}>{node.title}</span>
                    {renderBatchPermHints(node.key)}
                    <div className={style.permNodeToggles} onClick={(e) => e.stopPropagation()} style={{ marginLeft: 'auto' }}>
                        {renderBatchInlinePermissions(node.key, readOnly)}
                    </div>
                </div>
            ),
            children: node.children && node.children.length > 0
                ? renderBatchPermissionTreeData(node.children, readOnly)
                : undefined
        }))
    }

    // 提交多角色批量文件夹权限（共同权限 + 新增授权 → 授予全部角色）
    const handleBatchFolderPermissionSubmit = async () => {
        if (batchFolderLoading) return
        setBatchFolderLoading(true)
        try {
            // 合并共同权限与新增授权，摊平为 [{folderId, permissionType}] 列表
            const flatPairs = []
            const allKeys = new Set([...Object.keys(batchCommonPerms), ...Object.keys(batchFolderGrants)])
            allKeys.forEach(k => {
                const perms = [...new Set([...(batchCommonPerms[k] || []), ...(batchFolderGrants[k] || [])])]
                perms.forEach(p => flatPairs.push({ folderId: Number(k), permissionType: p }))
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
                    <div ref={usersTableWrapRef}>
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
                        scroll={{ y: tableHeights.users || 'calc(100vh - 340px)', x: 1000 }}
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
                    </div>
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
                    <div ref={rolesTableWrapRef}>
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
                        scroll={{ y: tableHeights.roles || 'calc(100vh - 340px)', x: 1000 }}
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
                    </div>
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
                    title={`为用户「${selectedUser?.username}」分配角色`}
                    open={permissionModalVisible}
                    onOk={handlePermissionSubmit}
                    onCancel={() => setPermissionModalVisible(false)}
                    okText="确定"
                    cancelText="取消"
                    confirmLoading={permissionLoading}
                    width={960}
                    destroyOnClose
                >
                    <div className={style.batchRoleWrap}>
                        <div className={style.batchRoleUsers}>
                            <span className={style.batchRoleUsersLabel}>已选用户</span>
                            <span className={style.batchRoleUsersNames}>{selectedUser?.username || '-'}</span>
                        </div>

                        <div className={style.batchSection}>
                            <div className={style.batchSectionTitle}>
                                当前已拥有（可修改）
                                <span className={style.batchSectionHint}>勾选即保留，取消即移除</span>
                            </div>
                            <div className={style.batchChips}>
                                {availableRoles.filter(r => targetKeys.includes(r.id.toString())).length === 0 ? (
                                    <span className={style.batchEmpty}>该用户暂无角色</span>
                                ) : (
                                    availableRoles.filter(r => targetKeys.includes(r.id.toString())).map(r => (
                                        <span key={r.id} className={style.batchChip}>
                                            {r.roleName}
                                        </span>
                                    ))
                                )}
                            </div>
                        </div>

                        <div className={`${style.batchSection} ${style.batchSectionGrow}`}>
                            <div className={style.batchSectionTitle}>角色（勾选后生效）</div>
                            <Input.Search
                                placeholder="搜索角色名"
                                allowClear
                                value={permissionRoleSearch}
                                onChange={(e) => setPermissionRoleSearch(e.target.value)}
                                style={{ marginBottom: 8 }}
                            />
                            <div className={`${style.scrollbar} ${style.batchRoleList}`}>
                                {availableRoles.filter(r =>
                                    !permissionRoleSearch || r.roleName.toLowerCase().includes(permissionRoleSearch.toLowerCase())
                                ).map(role => {
                                    const isChecked = targetKeys.includes(role.id.toString())
                                    return (
                                        <div key={role.id} className={style.batchRoleItem}>
                                            <Checkbox
                                                checked={isChecked}
                                                onChange={(e) => {
                                                    if (e.target.checked) {
                                                        setTargetKeys(prev => [...new Set([...prev, role.id.toString()])])
                                                    } else {
                                                        setTargetKeys(prev => prev.filter(k => k !== role.id.toString()))
                                                    }
                                                }}
                                            >
                                                <span className={style.batchRoleName}>{role.roleName}</span>
                                            </Checkbox>
                                            {role.description && (
                                                <Tooltip title={role.description}>
                                                    <span className={style.batchRoleDesc}>ⓘ</span>
                                                </Tooltip>
                                            )}
                                        </div>
                                    )
                                })}
                                {availableRoles.length === 0 && (
                                    <div className={style.batchEmptyList}>暂无角色</div>
                                )}
                            </div>
                            <div className={style.batchFooter}>
                                已选 <strong>{targetKeys.length}</strong> 个角色
                            </div>
                        </div>
                    </div>
                </Modal>

                {/* 批量分配角色模态框 */}
                <Modal
                    title={`为 ${selectedUserIds.length} 位用户批量分配角色`}
                    open={batchPermissionModalVisible}
                    onOk={handleBatchPermissionSubmit}
                    onCancel={() => setBatchPermissionModalVisible(false)}
                    okText="确定"
                    cancelText="取消"
                    confirmLoading={batchPermissionLoading}
                    width={960}
                    destroyOnClose
                >
                    <div className={style.batchRoleWrap}>
                        <div className={style.batchRoleUsers}>
                            <span className={style.batchRoleUsersLabel}>已选用户</span>
                            <span className={style.batchRoleUsersNames}>{selectedUserNames.join(' · ') || '-'}</span>
                        </div>

                        <div className={style.batchSection}>
                            <div className={style.batchSectionTitle}>
                                当前已拥有（将保留）
                                <span className={style.batchSectionHint}>仅展示，不会受影响</span>
                            </div>
                            <div className={style.batchChips}>
                                {batchExistingRoles.length === 0 ? (
                                    <span className={style.batchEmpty}>所选用户暂无角色</span>
                                ) : (
                                    batchExistingRoles.map(r => (
                                        <Tooltip key={r.roleId} title={`由 ${(r.users || []).join('、')} 拥有`}>
                                            <span className={style.batchChip}>
                                                {r.roleName}
                                                <em className={style.batchChipCount}>×{r.count}</em>
                                            </span>
                                        </Tooltip>
                                    ))
                                )}
                            </div>
                        </div>

                        <div className={`${style.batchSection} ${style.batchSectionGrow}`}>
                            <div className={style.batchSectionTitle}>新增角色（勾选后提交）</div>
                            <Input.Search
                                placeholder="搜索角色名"
                                allowClear
                                value={batchRoleSearch}
                                onChange={(e) => setBatchRoleSearch(e.target.value)}
                                style={{ marginBottom: 8 }}
                            />
                            <div className={`${style.scrollbar} ${style.batchRoleList}`}>
                                {batchAvailableRoles.filter(r =>
                                    !batchRoleSearch || r.roleName.toLowerCase().includes(batchRoleSearch.toLowerCase())
                                ).map(role => {
                                    const existing = batchExistingRoles.find(r => String(r.roleId) === String(role.id))
                                    const ownedByAll = !!existing && existing.count === selectedUserIds.length
                                    const ownedBySome = !!existing && !ownedByAll
                                    const isChecked = batchTargetKeys.includes(role.id.toString())
                                    return (
                                        <div key={role.id} className={style.batchRoleItem}>
                                            <Checkbox
                                                checked={isChecked || ownedByAll}
                                                disabled={ownedByAll}
                                                onChange={(e) => {
                                                    if (e.target.checked) {
                                                        setBatchTargetKeys(prev => [...new Set([...prev, role.id.toString()])])
                                                    } else {
                                                        setBatchTargetKeys(prev => prev.filter(k => k !== role.id.toString()))
                                                    }
                                                }}
                                            >
                                                <span className={style.batchRoleName}>{role.roleName}</span>
                                            </Checkbox>
                                            {ownedByAll ? (
                                                <Tooltip title={`由 ${(existing.users || []).join('、')} 拥有`}>
                                                    <span className={style.batchRoleBadge}>已全部拥有</span>
                                                </Tooltip>
                                            ) : ownedBySome ? (
                                                <Tooltip title={`由 ${(existing.users || []).join('、')} 拥有`}>
                                                    <span className={style.batchRoleBadge}>{existing.count} 位已有</span>
                                                </Tooltip>
                                            ) : null}
                                            {role.description && (
                                                <Tooltip title={role.description}>
                                                    <span className={style.batchRoleDesc}>ⓘ</span>
                                                </Tooltip>
                                            )}
                                        </div>
                                    )
                                })}
                                {batchAvailableRoles.length === 0 && (
                                    <div className={style.batchEmptyList}>暂无角色</div>
                                )}
                            </div>
                            <div className={style.batchFooter}>
                                将新增 <strong>{batchTargetKeys.length}</strong> 项角色，每位用户保留原有角色
                            </div>
                        </div>
                    </div>
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
                    width={960}
                    style={{ top: 25 }}
                    destroyOnClose
                >
                    {/* 权限树：文件夹后直接显示权限，支持行内编辑 */}
                    <div className={style.permTreeWrap}>
                        {!folderPermissionModalReadOnly && (
                            <div className={style.permHint}>
                                <InfoCircleOutlined />
                                <span>勾选/取消某一权限会同步应用到该文件夹及其所有子文件夹；「可编辑」或「可删除」自动包含「可阅读」。</span>
                            </div>
                        )}
                        <div className={`${style.scrollbar} ${style.permTreeBody}`}>
                            <Tree
                                defaultExpandAll
                                blockNode
                                treeData={renderPermissionTreeData(folderTreeData, folderPermissionModalReadOnly)}
                            />
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
                    width={960}
                    style={{ top: 25 }}
                    destroyOnClose
                >
                    {/* 权限树：共同权限锁定 + 个别差异标注 + 勾选授予全部角色 */}
                    <div className={style.permTreeWrap}>
                        {!batchFolderReadOnly && (
                            <div className={style.permHint}>
                                <InfoCircleOutlined />
                                <span>勾选某权限 = 授予给所选全部角色（只增，不影响现有）；「可编辑」或「可删除」自动包含「可阅读」。</span>
                            </div>
                        )}
                        <div className={`${style.scrollbar} ${style.permTreeBody}`}>
                            <Tree
                                defaultExpandAll
                                blockNode
                                treeData={renderBatchPermissionTreeData(folderTreeData, batchFolderReadOnly)}
                            />
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