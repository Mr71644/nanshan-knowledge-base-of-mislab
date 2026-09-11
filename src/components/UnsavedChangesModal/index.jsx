import { Modal, Button } from 'antd'
// 项目未安装 prop-types 依赖，组件 props 不做运行时校验（与其他组件一致）
/* eslint-disable react/prop-types */

/**
 * UnsavedChangesModal - 有未保存修改时的三选项确认弹窗
 *
 * 复用于：EditorExitGuard（路由/浏览器返回拦截）、Content/Excel 页内「退出编辑」确认，
 * 保证三处 UX 完全一致。
 *
 * @param {boolean} open 是否显示
 * @param {boolean} saving 「保存并退出」进行中（按钮 loading，其余禁用）
 * @param {string} description 正文文案（离页/退出编辑两种措辞）
 * @param {() => void} onCancel 取消（留在编辑页）
 * @param {() => void} onDiscard 不保存退出
 * @param {() => void} onSave 保存并退出
 */
const UnsavedChangesModal = ({ open, saving, description, onCancel, onDiscard, onSave }) => (
    <Modal
        open={open}
        title="有未保存的修改"
        closable={false}
        maskClosable={false}
        onCancel={onCancel}
        footer={[
            <Button key="cancel" onClick={onCancel} disabled={saving}>取消</Button>,
            <Button key="discard" danger onClick={onDiscard} disabled={saving}>不保存退出</Button>,
            <Button key="save" type="primary" onClick={onSave} loading={saving}>保存并退出</Button>,
        ]}
    >
        <div>{description}</div>
    </Modal>
)

export default UnsavedChangesModal
