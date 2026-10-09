import { Modal, Button } from 'antd'
// 项目未安装 prop-types 依赖，组件 props 不做运行时校验（与其他组件一致）
/* eslint-disable react/prop-types */

/**
 * IdleTimeoutModal - 编辑态空闲超时确认弹窗
 *
 * 长时间无编辑活动时弹出，倒计时结束自动退出编辑：
 * - 有未保存修改 → 自动保存成功后释放锁回预览态
 * - 无修改 → 直接释放锁回预览态
 * 复用于 Content / Excel 两个编辑页，保证 UX 一致。
 *
 * @param {boolean} open 是否显示
 * @param {number} seconds 倒计时剩余秒数
 * @param {boolean} saving 自动保存/退出进行中（按钮 loading，继续编辑禁用）
 * @param {boolean} hasUnsavedChanges 是否有未保存修改（影响倒计时到期文案）
 * @param {() => void} onContinue 继续编辑（重置空闲计时）
 * @param {() => void} onExit 立即退出编辑（按修改状态保存后释放）
 */
const IdleTimeoutModal = ({ open, seconds, saving, hasUnsavedChanges, onContinue, onExit }) => (
    <Modal
        open={open}
        title="长时间未编辑"
        closable={false}
        maskClosable={false}
        onCancel={onContinue}
        footer={[
            <Button key="exit" danger onClick={onExit} loading={saving}>退出编辑</Button>,
            <Button key="continue" type="primary" onClick={onContinue} disabled={saving}>继续编辑</Button>,
        ]}
    >
        <div>检测到您已有一段时间未进行编辑操作。</div>
        <div style={{ marginTop: 8 }}>
            {hasUnsavedChanges
                ? <span>{Math.max(0, seconds)} 秒后将自动保存修改并退出编辑</span>
                : <span>{Math.max(0, seconds)} 秒后将自动退出编辑并释放编辑锁</span>}
        </div>
    </Modal>
)

export default IdleTimeoutModal
