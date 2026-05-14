import { memo, useEffect, useRef, useState } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { Layout, Menu, theme, Breadcrumb, Space, ConfigProvider, FloatButton, Tooltip, Button, notification, Modal, Form, Input } from 'antd';
import { CloudOutlined, IdcardOutlined, LogoutOutlined, FolderOutlined, EditOutlined, TableOutlined, FileOutlined, UserOutlined, RightOutlined } from '@ant-design/icons';
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
import style from './index.module.css'
import { useSelector, useDispatch } from 'react-redux';
import { request } from '@/utils';  // 页面开始前初始化store，不可删，需要在引入store前引入
import { showMessage } from '@/store/modules/message';
import { clearUserInfo } from '@/store/modules/user';
import { clearToken } from '@/utils';
import { useParams } from 'react-router-dom';
import { getLayer, getFolderTree } from '@/apis/folder'
import { previewFile } from '@/apis/file';
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

const Home = () => {
    const {
        token: { colorBgContainer, borderRadiusLG },
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
    const [animatingExpandKey, setAnimatingExpandKey] = useState('')
    const [expandAnimationType, setExpandAnimationType] = useState('')
    const expandAnimationTimerRef = useRef(null)
    const [collapsed, setCollapsed] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [form] = Form.useForm();
    const { message, type, visible } = useSelector(state => state.message)
    const { success, error, contextHolder } = useMessage()
    const [api, contextHolderNotification] = notification.useNotification({
        maxCount: 1
    })
    const exit = () => {
        dispatch(showMessage({ message: '退出成功', type: 'success' }))
        dispatch(clearUserInfo())
        clearToken()
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
            setUserInfo(res.data)
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
    const preview = async (id) => {
        try {
            const res = await previewFile(id)
            window.open(res.data, '_blank')
        } catch (e) {
            error({
                content: e.response?.data?.message || '文件预览失败，请检查网络'
            })
        }
    }
    const toggleOpenKey = (key) => {
        setOpenKeys((prev) => {
            if (prev.includes(key)) return prev.filter(item => item !== key)
            return [...prev, key]
        })
    }
    const handleOpenChange = (nextOpenKeys) => {
        const openedKey = nextOpenKeys.find((key) => !openKeys.includes(key))
        const closedKey = openKeys.find((key) => !nextOpenKeys.includes(key))

        if (openedKey) {
            playExpandAnimation(openedKey, false)
        } else if (closedKey) {
            playExpandAnimation(closedKey, true)
        }

        setOpenKeys(nextOpenKeys)
    }
    const playExpandAnimation = (key, isOpen) => {
        if (expandAnimationTimerRef.current) {
            clearTimeout(expandAnimationTimerRef.current)
        }
        setAnimatingExpandKey(key)
        setExpandAnimationType(isOpen ? 'close' : 'open')
        expandAnimationTimerRef.current = setTimeout(() => {
            setAnimatingExpandKey('')
            setExpandAnimationType('')
        }, 220)
    }
    const transformToMenuItems = (data) => {
        return data.map(item => {
            const returnIcon = () => {
                if (item.status === 1) return <EditOutlined />
                if (item.status === 2) return <FolderOutlined />
                if (item.status === 3) return <TableOutlined />
                if (item.status === 4) return <FileOutlined />
            }
            const key = getMenuKeyByItem(item)
            const children = item.children && item.children.length > 0
                ? transformToMenuItems(item.children)
                : undefined

            return {
                key,
                icon: returnIcon(),
                label: (
                    <Tooltip title={item.name}>
                        {item.name}
                    </Tooltip>
                )
                ,
                children,
                onTitleClick: item.status === 2 && children?.length
                    ? () => navigate(key)
                    : undefined,
            }
        });
    };
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
        if (userInfo.username) {
            api.open({
                message: `欢迎您，${userInfo.username}！`,
                description: `您的角色：${userInfo.roleName?.join('、')}`,
                duration: false,
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
    useEffect(() => {
        return () => {
            if (expandAnimationTimerRef.current) {
                clearTimeout(expandAnimationTimerRef.current)
            }
        }
    }, [])
    return (
        <Layout style={{
            height: '100vh',
        }}>
            {contextHolder}
            {contextHolderNotification}
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
            <Tooltip title="退出登录" placement="left">
                <FloatButton
                    icon={<LogoutOutlined />}
                    type='primary'
                    onClick={exit}
                    danger
                    style={{
                        insetInlineEnd: 24,
                        bottom: 24,
                    }}
                />
            </Tooltip>
            <Sider
                width={250}
                breakpoint="lg"
                collapsed={collapsed}
                onCollapse={setCollapsed}
                collapsedWidth={80}
                style={{
                    background: colorBgContainer,
                    overflowY: 'scroll',
                }}
                className={style.sider}
            >
                <div className={style.logo}>{collapsed ? <CloudOutlined style={{
                    fontSize: '25px',
                    color: '#1677ff'
                }} /> : '知邮南山 - MISLab'}</div>
                <Menu
                    mode="inline"
                    inlineIndent={8}
                    openKeys={openKeys}
                    selectedKeys={selectedKeys}
                    onOpenChange={handleOpenChange}
                    expandIcon={({ isOpen, eventKey }) => {
                        const animationClass = animatingExpandKey === eventKey
                            ? (expandAnimationType === 'open' ? style.menuExpandIconAnimateOpen : style.menuExpandIconAnimateClose)
                            : ''

                        return (
                            <span
                                className={`${style.menuExpandIcon} ${isOpen ? style.menuExpandIconOpenState : style.menuExpandIconCloseState} ${animationClass}`}
                                onClick={(e) => {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    playExpandAnimation(eventKey, isOpen)
                                    toggleOpenKey(eventKey)
                                }}
                            >
                                <RightOutlined />
                            </span>
                        )
                    }}
                    items={
                        transformToMenuItems(folderTree)
                    }
                    onClick={(e) => {
                        if (e.key.slice(0, 4) === 'file') {
                            preview(e.key.slice(4));
                        } else if (e.key.startsWith('/content/') || e.key.startsWith('/excel/')) {
                            window.open(`${window.location.origin}${window.location.pathname}#${e.key}`, '_blank');
                        } else {
                            navigate(e.key);
                        }
                    }}
                />
            </Sider>
            <Layout
                style={{
                    padding: '0 24px 0',
                }}
            >
                <Content
                    style={{
                        padding: 24,
                        margin: 0,
                        minHeight: 280,
                        background: colorBgContainer,
                        borderRadius: borderRadiusLG,
                    }}
                >
                    <Breadcrumb separator=">" items={folderLayer}
                        style={{
                            fontSize: '24px',
                        }}
                        className={style.breadcrumb}
                    />
                    <ConfigProvider
                        wave={{
                            disabled: true, // 全局禁用波纹效果
                        }}
                    >
                        <Space size={50} style={{
                            marginTop: 20
                        }}>
                            <MemoAddNewFile></MemoAddNewFile>
                            <UploadFile></UploadFile>
                            <Button
                                className={style.authority}
                                onClick={handleOpenModal}>
                                <IdcardOutlined />
                                <span style={{
                                    fontSize: '16px'
                                }}>用户信息修改</span>
                            </Button>
                            {
                                userInfo.isAdministrator ?
                                    <Button
                                        className={style.authority}
                                        onClick={() => navigate('/administrator')}>
                                        <UserOutlined />
                                        <span style={{
                                            fontSize: '16px'
                                        }}>权限管理入口</span>
                                    </Button>
                                    : null
                            }
                        </Space>
                    </ConfigProvider>
                    <div
                        style={{
                            background: colorBgContainer,
                            borderRadius: borderRadiusLG,
                        }}
                        className={style.fileList}
                    >
                        <Outlet></Outlet>
                    </div>
                </Content>
            </Layout>
        </Layout >
    );
}

export const MemoHome = memo(Home)