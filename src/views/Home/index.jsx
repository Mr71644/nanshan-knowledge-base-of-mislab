import { memo, useEffect, useRef, useState, useCallback, useMemo, Fragment } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { Layout, Tree, theme, ConfigProvider, Tooltip, Button, notification, Modal, Form, Input, Avatar } from 'antd';
import { CloudOutlined, IdcardOutlined, LogoutOutlined, FolderOutlined, FolderOpenOutlined, EditOutlined, TableOutlined, FileOutlined, RightOutlined, SearchOutlined, SettingOutlined, DownloadOutlined, DeleteOutlined, UpOutlined, DownOutlined } from '@ant-design/icons';
import { MemoAddNewFile } from '@/components/AddNewFile';
/**
 * Home 视图（布局）说明：
 * - 负责整体布局（侧边栏 + 内容区）及菜单、面包屑的组织
 * - 在此文件中使用 `request`（src/utils/index.js）初始化全局拦截器，确保 store 可用
 * - 左侧文件夹树与层级由 `getFolderTree` / `getLayer` 提供，点击会通过导航改变 `FileList` 的 `id` 参数
 * - 全局退出逻辑会清除 token 并重定向到 `/login`
 */
import { UploadFile } from '@/components/UploadFile';
import { useMessage } from '@/hooks/useMessage';
import style from './index.module.less'
import themeConfig from '#theme'
import { useSelector, useDispatch } from 'react-redux';
import { request } from '@/utils';  // 页面开始前初始化store，不可删，需要在引入store前引入
import { showMessage } from '@/store/modules/message';
import { clearUserInfo } from '@/store/modules/user';

import { useParams } from 'react-router-dom';
import { getLayer, getFolderTree } from '@/apis/folder'
import { sortTreeItems, moveTreeItem } from '@/apis/fileList'
import { getUserInfo, userProfileUpdate } from '@/apis/user';
const { Content, Sider } = Layout;

const getMenuKeyByItem = (item) => {
    if (item.folderId === null) {
        if (item.status === 1) return `/content/main/${item.id}`
        if (item.status === 2) return `/home/list/${item.id}`
        if (item.status === 3) return `/excel/main/${item.id}`
        if (item.status === 4) return `file${item.id}`
    } else {
        if (item.status === 1) return `/content/${item.folderId}/${item.id}`
        if (item.status === 2) return `/home/list/${item.id}`
        if (item.status === 3) return `/excel/${item.folderId}/${item.id}`
        if (item.status === 4) return `file${item.id}`
    }
    return ''
}

const getRouteMenuKey = (pathname) => {
    if (pathname.startsWith('/home/list/')) return pathname
    if (pathname.startsWith('/content/')) return pathname
    if (pathname.startsWith('/excel/')) return pathname
    return ''
}

const findParentKeysByTargetKey = (tree = [], targetKey, parentKeys = []) => {
    if (!targetKey) return []

    for (const item of tree) {
        const currentKey = getMenuKeyByItem(item)
        const currentParentKeys = item.status === 2 ? [...parentKeys, currentKey] : parentKeys

        if (currentKey === targetKey) {
            return parentKeys
        }

        if (item.children && item.children.length > 0) {
            const found = findParentKeysByTargetKey(item.children, targetKey, currentParentKeys)
            if (found.length > 0) return found
        }
    }

    return []
}

const walkFilter = (items, keyword, parentKeys = []) => {
    let matchKeys = new Set()
    let ancestorKeys = new Set()

    for (const item of items) {
        const key = getMenuKeyByItem(item)
        const currentParentKeys = item.status === 2 ? [...parentKeys, key] : parentKeys
        const nameMatch = item.name.toLowerCase().includes(keyword)

        if (item.children && item.children.length > 0) {
            const childResult = walkFilter(item.children, keyword, currentParentKeys)
            if (nameMatch || childResult.matchKeys.size > 0) {
                if (nameMatch) matchKeys.add(key)
                matchKeys = new Set([...matchKeys, ...childResult.matchKeys])
                ancestorKeys = new Set([...ancestorKeys, ...currentParentKeys, ...childResult.ancestorKeys])
            }
        } else {
            if (nameMatch) {
                matchKeys.add(key)
                ancestorKeys = new Set([...ancestorKeys, ...currentParentKeys])
            }
        }
    }

    return { matchKeys, ancestorKeys }
}

const Home = () => {
    const {
        token: { },
    } = theme.useToken();
    const dispatch = useDispatch();
    const navigate = useNavigate()
    const location = useLocation()
    const param = useParams()
    const [userInfo, setUserInfo] = useState({})
    const [folderLayer, setFolderLayer] = useState([])
    const [folderTree, SetFolderTree] = useState([])
    const [openKeys, setOpenKeys] = useState([])
    const [selectedKeys, setSelectedKeys] = useState([])
    const [collapsed, setCollapsed] = useState(false);
    const [siderWidth, setSiderWidth] = useState(() => {
        const w = window.innerWidth
        if (w < 1280) return 240
        if (w < 1440) return 280
        return 320
    });
    const isDragging = useRef(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [form] = Form.useForm();
    const [searchText, setSearchText] = useState('')
    const [batchTrigger, setBatchTrigger] = useState(null) // null | 'download' | 'delete'
    const [fileSearchKeyword, setFileSearchKeyword] = useState('')
    const [fileSearchIndex, setFileSearchIndex] = useState(0)
    const [matchedCount, setMatchedCount] = useState(0)

    const { filteredMatchKeys, searchExpandedKeys } = useMemo(() => {
        const trimmed = searchText.trim().toLowerCase()
        if (!trimmed) return { filteredMatchKeys: new Set(), searchExpandedKeys: null }
        const { matchKeys, ancestorKeys } = walkFilter(folderTree, trimmed, [])
        return { filteredMatchKeys: matchKeys, searchExpandedKeys: ancestorKeys }
    }, [searchText, folderTree])
    const { message, type, visible } = useSelector(state => state.message)
    const { success, error, contextHolder } = useMessage()
    const [api, contextHolderNotification] = notification.useNotification({
        maxCount: 1
    })
    const [exitModalOpen, setExitModalOpen] = useState(false);
    const exit = () => {
        setExitModalOpen(true)
    }
    const handleExitConfirm = () => {
        dispatch(showMessage({ message: '退出成功', type: 'success' }))
        dispatch(clearUserInfo())
        navigate('/login')
    }
    const handleOpenModal = () => {
        form.setFieldsValue({
            username: userInfo.username,
            email: userInfo.email
        });
        setIsModalOpen(true);
    }
    const handleCloseModal = () => {
        setIsModalOpen(false);
        form.resetFields();
    }
    const handleUpdateProfile = async (values) => {
        try {
            await userProfileUpdate({
                username: values.username,
                email: values.email,
                newPassword: values.newPassword || undefined
            });
            success({
                content: '信息修改成功'
            });
            handleCloseModal();
            getUserInfomation();
        } catch (e) {
            error({
                content: e.response?.data?.message || '信息修改失败，请检查网络'
            });
        }
    }
    const getUserInfomation = async () => {
        try {
            const res = await getUserInfo()
            setUserInfo(res.data ?? res)
        } catch (e) {
            error({
                content: e.response?.data?.message || '用户信息获取失败，请检查网络'
            })
        }
    }
    const getLayerList = async (id) => {
        try {
            const res = await getLayer(id)
            let layer = res.data.reverse()
            setFolderLayer([
                {
                    title: '云盘',
                    onClick: () => navigate('/home')
                },
                ...layer.map(item => ({
                    title: item.name,
                    onClick: () => navigate(`/home/list/${item.id}`)
                }))
            ])
        } catch (e) {
            error({
                content: e.response?.data?.message || '导航加载失败，请检查网络'
            })
        }
    }
    const getTree = async () => {
        try {
            const res = await getFolderTree()
            SetFolderTree(res.data.list || [])
        } catch (e) {
            error({
                content: e.response?.data?.message || '文件树加载失败，请检查网络'
            })
        }
    }
    const preview = (id, name) => {
        const encodedName = encodeURIComponent(name || '')
        window.open(
            `${window.location.origin}${window.location.pathname}#/preview?from=${id}&name=${encodedName}`,
            '_blank'
        )
    }
    const handleOpenChange = (nextOpenKeys) => {
        setOpenKeys(nextOpenKeys)
    }
    const collectAllFolderKeys = (tree) => {
        const keys = []
        const walk = (items) => {
            for (const item of items) {
                if (item.status === 2) keys.push(getMenuKeyByItem(item))
                if (item.children) walk(item.children)
            }
        }
        walk(tree)
        return keys
    }
    const handleExpandAll = () => setOpenKeys(collectAllFolderKeys(folderTree))
    const handleCollapseAll = () => setOpenKeys([])
    const handleResizeMouseDown = useCallback((e) => {
        e.preventDefault()
        isDragging.current = true
        const startX = e.clientX
        const startWidth = siderWidth
        document.body.style.cursor = 'col-resize'
        document.body.style.userSelect = 'none'

        const onMouseMove = (e) => {
            if (!isDragging.current) return
            const newWidth = Math.min(500, Math.max(270, startWidth + e.clientX - startX))
            setSiderWidth(newWidth)
        }
        const onMouseUp = () => {
            isDragging.current = false
            document.body.style.cursor = ''
            document.body.style.userSelect = ''
            document.removeEventListener('mousemove', onMouseMove)
            document.removeEventListener('mouseup', onMouseUp)
        }
        document.addEventListener('mousemove', onMouseMove)
        document.addEventListener('mouseup', onMouseUp)
    }, [siderWidth])
    const getIconByStatus = (status) => {
        if (status === 1) return <EditOutlined />
        if (status === 2) return <FolderOutlined />
        if (status === 3) return <TableOutlined />
        if (status === 4) return <FileOutlined />
    }
    const transformToTreeData = (data) => {
        return data.map(item => {
            const hasChildren = item.children && item.children.length > 0
            return {
                key: getMenuKeyByItem(item),
                icon: getIconByStatus(item.status),
                isLeaf: !hasChildren,
                children: hasChildren ? transformToTreeData(item.children) : [],
                rawData: item
            }
        })
    }
    const renderTitle = (nodeData) => {
        const item = nodeData.rawData
        const key = nodeData.key
        const trimmed = searchText.trim()
        const isSearching = trimmed.length > 0
        const isMatch = filteredMatchKeys.has(key)
        const isAncestorOrSelf = searchExpandedKeys && searchExpandedKeys.has(key)

        let titleContent
        if (isSearching && isMatch) {
            const lowerName = item.name.toLowerCase()
            const lowerKeyword = trimmed.toLowerCase()
            const parts = []
            let lastIndex = 0
            let idx = lowerName.indexOf(lowerKeyword)
            while (idx !== -1) {
                if (idx > lastIndex) parts.push(item.name.slice(lastIndex, idx))
                parts.push(
                    <span key={idx} className={style.searchHighlight}>
                        {item.name.slice(idx, idx + trimmed.length)}
                    </span>
                )
                lastIndex = idx + trimmed.length
                idx = lowerName.indexOf(lowerKeyword, lastIndex)
            }
            if (lastIndex < item.name.length) parts.push(item.name.slice(lastIndex))
            titleContent = parts
        } else {
            titleContent = item.name
        }

        const dimmed = isSearching && !isMatch && !isAncestorOrSelf

        return (
            <Tooltip title={item.name}>
                <span className={dimmed ? style.treeNodeDimmed : undefined}>
                    {titleContent}
                </span>
            </Tooltip>
        )
    }
    const renderSwitcherIcon = ({ expanded }) => (
        <span className={style.treeExpandIcon}>
            <RightOutlined style={{
                transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
                opacity: expanded ? 0.95 : 0.72,
                transition: 'all 0.22s cubic-bezier(0.4, 0, 0.2, 1)'
            }} />
        </span>
    )
    const handleTreeNodeClick = (node) => {
        const key = node.key
        if (key.slice(0, 4) === 'file') {
            const fileName = node.rawData?.name || ''
            preview(key.slice(4), fileName)
        } else if (key.startsWith('/content/') || key.startsWith('/excel/')) {
            window.open(`${window.location.origin}${window.location.pathname}#${key}`, '_blank')
        } else {
            navigate(key)
        }
    }
    const isDescendant = (tree, folderId, target) => {
        const findNode = (data, id) => {
            for (const item of data) {
                if (item.id === id && item.status === 2) return item
                if (item.children) {
                    const found = findNode(item.children, id)
                    if (found) return found
                }
            }
            return null
        }
        const isInSubtree = (node, t) => {
            if (!node) return false
            if (node.id === t.id && node.status === t.status) return true
            if (node.children) return node.children.some(child => isInSubtree(child, t))
            return false
        }
        const folderNode = findNode(tree, folderId)
        return isInSubtree(folderNode, target)
    }
    const canDragNode = (nodeData) => {
        if (userInfo.isAdministrator) return true
        const item = nodeData.rawData
        return item && item.permissionType === 'EDIT'
    }
    const handleAllowDrop = ({ dragNode, dropNode, dropPosition }) => {
        const dragItem = dragNode.rawData
        const dropItem = dropNode.rawData

        // 搜索模式下禁止放置
        if (searchText.trim()) return false

        // 权限检查：非管理员需 EDIT 权限
        if (!userInfo.isAdministrator) {
            if (dragItem.permissionType !== 'EDIT') return false
            if (dropItem.permissionType !== 'EDIT') return false
        }

        // 放在节点上：仅允许目标是文件夹（移入该文件夹）
        if (dropPosition === 0) {
            return dropItem.status === 2
        }

        // 防循环：拖拽文件夹时，禁止拖入自身子树
        if (dragItem.status === 2 && isDescendant(folderTree, dragItem.id, dropItem)) {
            return false
        }

        return true
    }
    const handleDrop = async (info) => {
        const dragNode = info.dragNode
        const dropNode = info.node
        const dragItem = dragNode.rawData
        const dropItem = dropNode.rawData

        // 第三层防线：权限和搜索状态检查
        if (searchText.trim()) return
        if (!userInfo.isAdministrator) {
            if (dragItem.permissionType !== 'EDIT') return
            if (dropItem.permissionType !== 'EDIT') return
        }

        const dragFolderId = dragItem.folderId ?? null
        const dropFolderId = dropItem.folderId ?? null

        const findFolderName = (tree, targetFolderId) => {
            if (targetFolderId === null || targetFolderId === undefined) return '根目录'
            for (const item of tree) {
                if (String(item.id) === String(targetFolderId) && item.status === 2) return item.name
                if (item.children) {
                    const found = findFolderName(item.children, targetFolderId)
                    if (found) return found
                }
            }
            return null
        }

        const doMove = async (targetFolderId) => {
            const newTreeData = reorderTreeData(folderTree, dragNode, dropNode, info.dropToGap, info.dropPosition, targetFolderId)
            SetFolderTree(newTreeData)
            try {
                await moveTreeItem(dragItem.id, dragItem.status, targetFolderId)
            } catch (e) {
                error({ content: e.response?.status === 403 ? '权限不足，无法移动该文件' : '移动失败，请重试' })
                getTree()
            }
        }

        if (!info.dropToGap && dropItem.status === 2) {
            // 情况 A：拖入文件夹（移入目标文件夹）
            Modal.confirm({
                title: '确认移动',
                content: `确定将「${dragItem.name}」移动到「${dropItem.name}」吗？`,
                okText: '确认',
                cancelText: '取消',
                onOk: () => doMove(dropItem.id)
            })
        } else if (String(dragFolderId) === String(dropFolderId)) {
            // 情况 B：同层排序（无需确认）
            const newTreeData = reorderTreeData(folderTree, dragNode, dropNode, info.dropToGap, info.dropPosition, dropFolderId)
            SetFolderTree(newTreeData)
            const siblings = findSiblingsByParentId(newTreeData, dropFolderId)
            const orderedIds = siblings.map(item => ({ id: item.id, status: item.status }))
            try {
                await sortTreeItems(dropFolderId, orderedIds)
            } catch (e) {
                error({ content: e.response?.status === 403 ? '权限不足，无法执行排序操作' : '排序保存失败，请重试' })
                getTree()
            }
        } else {
            // 情况 C：跨层 gap drop（移到目标节点所在层级）
            const targetFolderName = findFolderName(folderTree, dropFolderId) ?? '未知文件夹'
            Modal.confirm({
                title: '确认移动',
                content: `确定将「${dragItem.name}」移动到「${targetFolderName}」吗？`,
                okText: '确认',
                cancelText: '取消',
                onOk: () => doMove(dropFolderId)
            })
        }
    }
    const reorderTreeData = (treeData, dragNode, dropNode, dropToGap, dropPosition, newParentFolderId) => {
        const newTreeData = JSON.parse(JSON.stringify(treeData))

        // 通过 key 查找并操作节点
        const dragKey = dragNode.key
        const dropKey = dropNode.key

        const loop = (data, key, callback) => {
            for (let i = 0; i < data.length; i++) {
                if (getMenuKeyByItem(data[i]) === key) {
                    return callback(data[i], i, data)
                }
                if (data[i].children) {
                    loop(data[i].children, key, callback)
                }
            }
        }

        // 移除拖拽节点
        let dragObj
        loop(newTreeData, dragKey, (item, index, arr) => {
            arr.splice(index, 1)
            dragObj = item
        })

        if (!dropToGap) {
            // 放在节点内部（不应发生，allowDrop 已阻止）
            loop(newTreeData, dropKey, (item) => {
                item.children = item.children || []
                item.children.unshift(dragObj)
            })
        } else {
            // 放在节点之间的间隙
            // dropPosition 是绝对位置，需要减去节点在父数组中的索引得到相对位置
            const dropPosArr = dropNode.pos.split('-')
            const dropIndex = Number(dropPosArr[dropPosArr.length - 1])
            const relativePosition = dropPosition - dropIndex

            let ar
            let i
            loop(newTreeData, dropKey, (_item, index, arr) => {
                ar = arr
                i = index
            })

            if (relativePosition === -1) {
                // 放在目标节点前面
                ar.splice(i, 0, dragObj)
            } else {
                // 放在目标节点后面
                ar.splice(i + 1, 0, dragObj)
            }
        }

        // 更新移动节点的 folderId，确保后续拖拽时 case 判断正确
        dragObj.folderId = newParentFolderId

        return newTreeData
    }
    const findSiblingsByParentId = (treeData, parentFolderId) => {
        if (parentFolderId === null || parentFolderId === undefined) return treeData
        for (const item of treeData) {
            if (String(item.id) === String(parentFolderId)) return item.children || []
            if (item.children) {
                const found = findSiblingsByParentId(item.children, parentFolderId)
                if (found.length > 0) return found
            }
        }
        return []
    }
    useEffect(() => {
        if (visible && message === '登录成功') {
            success({
                content: message,
                callBack: () => dispatch(showMessage({ message: '' }))
            })
        }
        if (param.id === undefined) {
            setFolderLayer([
                {
                    title: '云盘',
                }
            ])
        } else if (param.id) {
            getLayerList(param.id)
        }
    }, [visible, message, type, param.id])
    useEffect(() => {
        getTree()
        getUserInfomation()
    }, [])

    useEffect(() => {
        if (userInfo.username && !sessionStorage.getItem('welcome_dismissed')) {
            api.open({
                message: `欢迎您，${userInfo.username}！`,
                description: `您的角色：${userInfo.roleName?.join('、')}`,
                duration: false,
                onClose: () => sessionStorage.setItem('welcome_dismissed', 'true')
            });
        }
    }, [userInfo.username])
    useEffect(() => {
        if (location.state?.refresh) getTree()
    }, [location.state])
    useEffect(() => {
        const currentKey = getRouteMenuKey(location.pathname)
        setSelectedKeys(currentKey ? [currentKey] : [])

        if (!currentKey) return
        const parentKeys = findParentKeysByTargetKey(folderTree, currentKey)
        if (parentKeys.length === 0) return
        setOpenKeys(prev => Array.from(new Set([...prev, ...parentKeys])))
    }, [location.pathname, folderTree])
    return (
        <Fragment>
        <style>{`
            .ant-tree .ant-tree-draggable-icon { width: 24px; flex-shrink: 0; }
            .ant-tree .ant-tree-node-content-wrapper { min-width: 0 !important; overflow: hidden !important; text-overflow: ellipsis !important; white-space: nowrap !important; }
        `}</style>
        <Layout style={{
            height: '100vh',
        }} className={style.layoutRoot}>
            {contextHolder}
            {contextHolderNotification}
            <Modal
                open={exitModalOpen}
                onCancel={() => setExitModalOpen(false)}
                onOk={handleExitConfirm}
                okText="确认退出"
                cancelText="取消"
                okButtonProps={{
                    style: {
                        background: 'var(--gradient-accent)',
                        border: 'none',
                        borderRadius: 8,
                        fontWeight: 500,
                    }
                }}
                cancelButtonProps={{
                    style: { borderRadius: 8 }
                }}
                width={400}
                centered
                className={style.exitModal}
            >
                <div className={style.exitModalBody}>
                    <div className={style.exitModalIcon}>
                        <LogoutOutlined />
                    </div>
                    <div className={style.exitModalTitle}>确认退出登录</div>
                    <div className={style.exitModalDesc}>
                        退出后您将跳转至登录页面，<br />需要重新输入账号密码才能访问系统。
                    </div>
                </div>
            </Modal>
            <Modal
                title="修改个人信息"
                open={isModalOpen}
                onCancel={handleCloseModal}
                onOk={() => form.submit()}
                okText="确认"
                cancelText="取消"
            >
                <Form
                    form={form}
                    layout="vertical"
                    onFinish={handleUpdateProfile}
                    autoComplete="off"
                >
                    <Form.Item
                        label="用户名"
                        name="username"
                        rules={[
                            { required: true, message: '请输入用户名' }
                        ]}
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
                </Form>
            </Modal>
            <ConfigProvider
                theme={themeConfig.antdTheme}
            >
            <Sider
                width={siderWidth}
                breakpoint="lg"
                collapsed={collapsed}
                onCollapse={setCollapsed}
                collapsedWidth={80}
                style={{
                    background: '#ffffff',
                    overflowY: 'scroll',
                    position: 'relative',
                    borderRight: '1px solid #eaecf0',
                }}
                className={style.sider}
            >
                <div className={style.logo}>
                    {collapsed ? <CloudOutlined style={{
                        fontSize: '25px',
                        color: 'var(--color-accent)'
                    }} /> : (
                        <div className={style.logoInner}>
                            <div className={style.logoTitle}>{themeConfig.brand.name}</div>
                            <div className={style.logoDivider} />
                            <div className={style.logoSub}>{themeConfig.brand.subtitle}</div>
                        </div>
                    )}
                </div>
                {!collapsed && (
                    <div className={style.treeSearchBox}>
                        <Input
                            placeholder="搜索文件/文件夹"
                            allowClear
                            suffix={<SearchOutlined />}
                            size="small"
                            value={searchText}
                            onChange={(e) => setSearchText(e.target.value)}
                            className={style.treeSearchInput}
                        />
                        <Tooltip title="展开全部">
                            <Button type="text" size="small" onClick={handleExpandAll}
                                icon={<FolderOpenOutlined />} />
                        </Tooltip>
                        <Tooltip title="折叠全部">
                            <Button type="text" size="small" onClick={handleCollapseAll}
                                icon={<FolderOutlined />} />
                        </Tooltip>
                    </div>
                )}
                <Tree
                    showIcon
                    blockNode
                    showLine={{ showLeafIcon: false }}
                    treeData={transformToTreeData(folderTree)}
                    expandedKeys={searchExpandedKeys ? [...new Set([...openKeys, ...searchExpandedKeys])] : openKeys}
                    selectedKeys={selectedKeys}
                    onExpand={handleOpenChange}
                    onSelect={(keys, info) => {
                        if (info.node) handleTreeNodeClick(info.node)
                    }}
                    titleRender={renderTitle}
                    switcherIcon={renderSwitcherIcon}
                    draggable={{
                        nodeDraggable: (node) => {
                            if (searchText.trim()) return false
                            return canDragNode(node)
                        }
                    }}
                    allowDrop={handleAllowDrop}
                    onDrop={handleDrop}
                />
                {!collapsed && (
                    <div
                        className={style.resizeHandle}
                        onMouseDown={handleResizeMouseDown}
                    />
                )}
            </Sider>
            </ConfigProvider>
            <Layout
                style={{
                    padding: '0 var(--layout-padding) 0',
                    background: 'var(--color-page-bg)',
                }}
            >
                <Content
                    style={{
                        padding: 'var(--layout-padding)',
                        margin: 0,
                        minHeight: 280,
                        background: '#ffffff',
                        borderRadius: '12px',
                    }}
                >
                    <div className={style.topBar}>
                        <nav className={style.breadcrumb}>
                            {folderLayer.map((item, i) => (
                                <Fragment key={i}>
                                    {i > 0 && (
                                        <span className={style.breadcrumbSep}>
                                            <RightOutlined />
                                        </span>
                                    )}
                                    <span
                                        className={`${style.crumb} ${i === folderLayer.length - 1 ? style.crumbActive : ''}`}
                                        onClick={item.onClick}
                                    >
                                        {i === 0 && <CloudOutlined className={style.crumbIcon} />}
                                        {i > 0 && <FolderOutlined className={style.crumbIcon} />}
                                        {item.title}
                                    </span>
                                </Fragment>
                            ))}
                        </nav>
                        <div className={style.topBarUser}>
                            <Avatar
                                size={36}
                                style={{
                                    backgroundColor: 'var(--color-avatar-bg)',
                                    flexShrink: 0,
                                    fontSize: 16,
                                    fontWeight: 600,
                                }}
                            >
                                {userInfo.username?.charAt(0)?.toUpperCase() || 'U'}
                            </Avatar>
                            <div className={style.topBarMeta}>
                                <span className={style.topBarName}>{userInfo.username || '用户'}</span>
                                <span className={style.topBarRole}>{userInfo.roleName?.join('、') || '—'}</span>
                            </div>
                            <Tooltip title="退出登录">
                                <Button
                                    type="text"
                                    icon={<LogoutOutlined />}
                                    onClick={exit}
                                    className={style.topBarLogout}
                                />
                            </Tooltip>
                        </div>
                    </div>
                    <ConfigProvider
                        wave={{
                            disabled: true,
                        }}
                        theme={themeConfig.antdTheme}
                    >
                        <div data-impeccable-variants="59ef42c8" data-impeccable-variant-count="3" style={{ display: "contents" }}>
                          {/* impeccable-variants-start 59ef42c8 */}
                          {/* Original */}
                          <div data-impeccable-variant="original">
                            <div className={style.actionButtons}>
                                <MemoAddNewFile className={style.authority}></MemoAddNewFile>
                                <UploadFile className={style.authority}></UploadFile>
                                <Button
                                    className={style.authority}
                                    onClick={handleOpenModal}>
                                    <IdcardOutlined />
                                    <span style={{
                                        fontSize: 'var(--action-btn-font-size)'
                                    }}>用户信息修改</span>
                                </Button>
                                <Button
                                    className={style.authority}
                                    onClick={() => setBatchTrigger('batch')}>
                                    <DownloadOutlined />
                                    <span style={{
                                        fontSize: 'var(--action-btn-font-size)'
                                    }}>批量操作</span>
                                </Button>
                                {
                                    userInfo.isAdministrator ?
                                        <Button
                                            className={style.authority}
                                            onClick={() => navigate('/management')}>
                                            <SettingOutlined />
                                            <span style={{
                                                fontSize: 'var(--action-btn-font-size)'
                                            }}>管理系统入口</span>
                                        </Button>
                                        : null
                                }
                                <div className={style.fileSearchBox}>
                                    <Input
                                        placeholder="搜索当前目录文件"
                                        allowClear
                                        prefix={<SearchOutlined className={style.searchPrefix} />}
                                        value={fileSearchKeyword}
                                        onChange={(e) => {
                                            setFileSearchKeyword(e.target.value)
                                            setFileSearchIndex(0)
                                        }}
                                        className={style.searchInput}
                                    />
                                    {matchedCount > 0 && (
                                        <div className={style.searchNav}>
                                            <span className={style.searchCount}>{fileSearchIndex + 1}<em> / {matchedCount}</em></span>
                                            <div className={style.searchNavBtns}>
                                                <Button size="small" type="text" icon={<UpOutlined />} disabled={matchedCount <= 1}
                                                    onClick={() => setFileSearchIndex(i => Math.max(0, i - 1))} />
                                                <Button size="small" type="text" icon={<DownOutlined />} disabled={matchedCount <= 1}
                                                    onClick={() => setFileSearchIndex(i => Math.min(matchedCount - 1, i + 1))} />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                          </div>
                          {/* Variants: insert below this line */}
                          {/* impeccable-variants-end 59ef42c8 */}
                        </div>
                    </ConfigProvider>
                    <div
                        style={{
                            background: '#ffffff',
                            borderRadius: '12px',
                        }}
                        className={style.fileList}
                    >
                        <Outlet context={{ batchTrigger, clearBatchTrigger: () => setBatchTrigger(null), searchKeyword: fileSearchKeyword.trim().toLowerCase(), searchIndex: fileSearchIndex, onMatchedCountChange: setMatchedCount }}></Outlet>
                    </div>
                </Content>
            </Layout>
        </Layout >
        </Fragment>
    );
}

export const MemoHome = memo(Home)