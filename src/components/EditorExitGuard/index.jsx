import { useEffect, useState } from 'react'
import { Modal, Button } from 'antd'
import { useBlocker } from 'react-router-dom'
// 项目未安装 prop-types 依赖，组件 props 不做运行时校验（与其他组件一致）
/* eslint-disable react/prop-types */

/**
 * EditorExitGuard - 编辑页离页守卫（useBlocker + 三选项 Modal）
 *
 * 拦截 SPA 路由跳转与浏览器返回（createHashRouter 下 useBlocker 两者都覆盖）；
 * 刷新/关闭标签页由页面内的 beforeunload 负责，两条通道都必须实现。
 *
 * 行为：
 * - blocker 触发且 enabled → 弹出「保存并退出 / 不保存退出 / 取消」
 * - 保存并退出：等待 onSaveAndExit() 成功后才 proceed；失败（如保存返回 423 锁失效）则 reset 留在页面
 * - 不保存退出：onDiscard() 后 proceed
 * - 取消：reset 停留在编辑页并继续心跳
 *
 * @param {boolean} enabled 是否启用拦截（编辑中且有未保存内容时）
 * @param {() => Promise<boolean>} onSaveAndExit 保存并退出，返回是否成功
 * @param {() => Promise<any>} onDiscard 不保存退出（通常为 release）
 */
const EditorExitGuard = ({ enabled, onSaveAndExit, onDiscard }) => {    const [visible, setVisible] = useState(false)
    const [saving, setSaving] = useState(false)

    const blocker = useBlocker(({ currentLocation, nextLocation }) => {
        if (!enabled) return false
        if (currentLocation.pathname === nextLocation.pathname && currentLocation.search === nextLocation.search) return false
        return true
    })

    useEffect(() => {
        if (blocker.state === 'blocked') {
            setVisible(true)
        }
    }, [blocker.state])

    const handleCancel = () => {
        setSaving(false)
        setVisible(false)
        blocker.reset()
    }

    const handleDiscard = async () => {
        setVisible(false)
        if (onDiscard) {
            // best-effort：release 网络失败不阻塞页面离开
            await Promise.race([
                Promise.resolve(onDiscard()),
                new Promise((resolve) => setTimeout(resolve, 3000))
            ])
        }
        blocker.proceed()
    }

    const handleSaveExit = async () => {
        setSaving(true)
        let ok = false
        try {
            ok = await onSaveAndExit()
        } catch {
            ok = false
        }
        setSaving(false)
        setVisible(false)
        if (ok) {
            blocker.proceed()
        } else {
            // 保存失败（如锁已失效）→ 不自动重试覆盖，留在页面抢救内容
            blocker.reset()
        }
    }

    return (
        <Modal
            open={visible}
            title="有未保存的修改"
            closable={false}
            maskClosable={false}
            onCancel={handleCancel}
            footer={[
                <Button key="cancel" onClick={handleCancel} disabled={saving}>取消</Button>,
                <Button key="discard" danger onClick={handleDiscard} disabled={saving}>不保存退出</Button>,
                <Button key="save" type="primary" onClick={handleSaveExit} loading={saving}>保存并退出</Button>,
            ]}
        >
            <div>离开当前页面将丢失未保存的修改，是否保存并退出？</div>
        </Modal>
    )
}

export default EditorExitGuard
