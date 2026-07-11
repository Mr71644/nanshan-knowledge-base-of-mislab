import { memo, useState, useRef } from 'react'
import { Dropdown, Button, Modal, Form, Input } from 'antd';
import { useNavigate, useParams } from 'react-router-dom';
import { FileAddOutlined, FileExcelOutlined, FileMarkdownOutlined, FolderOpenOutlined } from '@ant-design/icons';
import { addFolder } from '@/apis/folder';
import { useMessage } from '@/hooks/useMessage';
import style from './index.module.css'

const AddNewFile = ({ className }) => {
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const [dropdownOpen, setDropdownOpen] = useState(false)
    const navigate = useNavigate()
    const param = useParams()
    const { error, contextHolder } = useMessage()
    const folderName = useRef('')
    const showModal = () => {
        setIsModalOpen(true);
    };
    const handleOk = async () => {
        try {
            let parentId = ''
            if (param.id !== undefined) parentId = param.id
            setLoading(true)
            const res = await addFolder({
                name: folderName.current,
                parentId
            })
            folderName.current = ''
            setIsModalOpen(false);
            setLoading(false)
            console.log(res);
            if (res.message === '同一父文件夹下已存在相同名称的文件夹') {
                error({
                    content: res.message
                })
            } else {
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
    const handleCancel = () => {
        folderName.current = ''
        setIsModalOpen(false);
    };
    const handleMenuClick = (e) => {
        if (e.key === '1') {
            window.open(`${window.location.origin}${window.location.pathname}#/addContent/${param.id || 'main'}`, '_blank')
        }
        if (e.key === '2') {
            window.open(`${window.location.origin}${window.location.pathname}#/addExcel/${param.id || 'main'}`, '_blank')
        }
        if (e.key === "3") showModal()
    };
    const items = [
        ...(param.id !== undefined ? [
            {
                label: '新建文档',
                key: '1',
                icon: <FileMarkdownOutlined />
            },
            {
                label: '新建Excel',
                key: '2',
                icon: <FileExcelOutlined />
            },
        ] : []),
        {
            label: '新建文件夹',
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
                <Button className={className}>
                    <FileAddOutlined className={style.firIcon} />
                    新建
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
