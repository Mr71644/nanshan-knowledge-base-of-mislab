import { memo, useState, useRef } from 'react'
import { Dropdown, Button, Modal, Form, Input } from 'antd';
import { useNavigate, useParams } from 'react-router-dom';
import { DownOutlined, FileAddOutlined, FileExcelOutlined, FileMarkdownOutlined, FolderOpenOutlined } from '@ant-design/icons';
import { addFolder } from '@/apis/folder';
import { useMessage } from '@/hooks/useMessage';
import style from './index.module.css'

const AddNewFile = () => {
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const [dropdownOpen, setDropdownOpen] = useState(false)
    const navigate = useNavigate()
    const param = useParams()
    // useMessage 提供统一的交互提示（基于 antd message）
    const { error, contextHolder } = useMessage()
    // 当前实现通过 ref 临时保存表单输入（较简单但不可控）
    // 更推荐使用 Ant Design Form 的实例：const [form] = Form.useForm()
    // 然后通过 form.getFieldValue('name') / form.resetFields() 管理表单
    const folderName = useRef('')
    const showModal = () => {
        setIsModalOpen(true);
    };
    // 点击模态框确认后的处理逻辑：调用新增文件夹 API，并在成功后跳转到新文件夹列表
    const handleOk = async () => {
        try {
            let parentId = ''
            if (param.id !== undefined) parentId = param.id
            setLoading(true)
            // addFolder 返回形如 { message, data }，data 为新文件夹 id
            const res = await addFolder({
                name: folderName.current,
                parentId
            })
            folderName.current = ''
            setIsModalOpen(false);
            setLoading(false)
            console.log(res);
            // 后端使用 message 字段返回错误提示，前端展示并不阻断逻辑
            if (res.message === '同一父文件夹下已存在相同名称的文件夹') {
                error({
                    content: res.message
                })
            } else {
                // 跳转到新建的文件夹，并通过 state 通知目标页面刷新列表
                navigate(`/home/list/${res.data}`, { state: { refresh: Date.now() } })
            }
        } catch (e) {
            error({
                content: e.response?.data?.message || '创建文件夹失败',
                callBack: () => {
                    folderName.current = ''
                    setIsModalOpen(false);
                    setLoading(false)
                }
            })
        }
    };
    // 取消时重置临时值并关闭弹窗
    const handleCancel = () => {
        folderName.current = ''
        setIsModalOpen(false);
    };
    const handleMenuClick = (e) => {
        // 菜单分发：根据选择跳转到创建富文本 / Excel / 文件夹 的页面
        if (e.key === '1') {
            window.open(`${window.location.origin}${window.location.pathname}#/addContent/${param.id || 'main'}`, '_blank')
        }
        if (e.key === '2') {
            window.open(`${window.location.origin}${window.location.pathname}#/addExcel/${param.id || 'main'}`, '_blank')
        }
        if (e.key === "3") showModal()
    };
    const items = [
        {
            label: '在线文档',
            key: '1',
            icon: <FileMarkdownOutlined />
        },
        {
            label: '在线Excel',
            key: '2',
            icon: <FileExcelOutlined />
        },
        {
            label: '文件夹',
            key: '3',
            icon: <FolderOpenOutlined />
        }
    ]

    const menuProps = {
        items,
        onClick: handleMenuClick,
    };
    return (
        <>
            {contextHolder}
            <Dropdown
                menu={menuProps}
                className={style.box}
                open={dropdownOpen}
                onOpenChange={setDropdownOpen}
            >
                <Button>
                    <FileAddOutlined className={style.firIcon} />
                    新建
                    <DownOutlined
                        className={style.secIcon}
                        style={{
                            transform: dropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                            transition: 'transform 0.3s ease'
                        }}
                    />
                </Button>
            </Dropdown>
            <Modal title={'创建文件夹'}
                open={isModalOpen}
                onOk={handleOk}
                onCancel={handleCancel}
                okText={'创建'}
                cancelText={'取消'}
                destroyOnClose={true}
                confirmLoading={loading}
            >
                <Form validateTrigger='onChange' colon={false}>
                    <Form.Item name='name' label={'名称'}
                        // 当前通过 validator 将输入同步到 ref，注意这不是受控表单的标准做法
                        rules={[() => ({
                            validator(_, value) {
                                folderName.current = value
                                return Promise.resolve()
                            }
                        })]}
                    >
                        <Input placeholder="请输入文件夹名称" />
                    </Form.Item>
                </Form>
            </Modal>
        </>
    )
}

export const MemoAddNewFile = memo(AddNewFile)