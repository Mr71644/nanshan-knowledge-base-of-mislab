import { memo, useState } from 'react'
import { Layout, Menu } from 'antd'
import { UserOutlined, SafetyOutlined, DeleteOutlined, LeftOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { MemoAdministrator } from '@/views/Administrator'
import { RecycleBin } from '@/components/RecycleBin'
import style from './index.module.less'

const { Sider, Content } = Layout

const menuItems = [
    { key: 'users', icon: <UserOutlined />, label: '用户管理' },
    { key: 'roles', icon: <SafetyOutlined />, label: '角色管理' },
    { key: 'recycleBin', icon: <DeleteOutlined />, label: '回收站' },
]

const Management = () => {
    const navigate = useNavigate()
    const [selectedKey, setSelectedKey] = useState('users')

    return (
        <Layout className={style.managementLayout}>
            <Sider width={220} className={style.sider}>
                <div className={style.brand}>
                    <SafetyOutlined className={style.brandIcon} />
                    <span className={style.brandText}>管理系统</span>
                </div>
                <Menu
                    mode="inline"
                    selectedKeys={[selectedKey]}
                    onClick={({ key }) => setSelectedKey(key)}
                    items={menuItems}
                />
            </Sider>
            <Content className={style.content}>
                <div className={style.backBar}>
                    <span
                        className={style.backLink}
                        onClick={() => navigate('/home')}
                    >
                        <LeftOutlined />
                        返回主页
                    </span>
                </div>
                {selectedKey === 'users' && (
                    <MemoAdministrator key="users" embedded activeTab="users" />
                )}
                {selectedKey === 'roles' && (
                    <MemoAdministrator key="roles" embedded activeTab="roles" />
                )}
                {selectedKey === 'recycleBin' && (
                    <RecycleBin key="recycleBin" embedded />
                )}
            </Content>
        </Layout>
    )
}

export const MemoManagement = memo(Management)
