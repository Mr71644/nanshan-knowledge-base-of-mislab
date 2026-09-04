import { request } from "@/utils"

// 独占编辑锁 API 封装
// - acquireEditorLock: 申请锁（幂等，同一 clientSessionId 重试返回原 lockToken）
// - heartbeatEditorLock: 续租心跳（编辑态每 20s 一次 + 页面显隐/focus 时立即一次）
// - releaseEditorLock: 释放锁（best-effort）
// - getEditorLockStatus: 查询锁状态（仅用于显示，不可替代 acquire 的原子抢锁）
// 说明：resourceType 取值为 'TEXT' 或 'EXCEL'

const acquireEditorLock = ({ resourceType, resourceId, clientSessionId }) => {
    return request({
        url: '/editor-locks/acquire',
        method: 'POST',
        data: { resourceType, resourceId, clientSessionId }
    })
}

const heartbeatEditorLock = ({ resourceType, resourceId, lockToken }) => {
    return request({
        url: '/editor-locks/heartbeat',
        method: 'POST',
        data: { resourceType, resourceId, lockToken }
    })
}

const releaseEditorLock = ({ resourceType, resourceId, lockToken }) => {
    return request({
        url: '/editor-locks/release',
        method: 'POST',
        data: { resourceType, resourceId, lockToken }
    })
}

const getEditorLockStatus = (resourceType, resourceId) => {
    return request({
        url: `/editor-locks/${resourceType}/${resourceId}`,
        method: 'GET'
    })
}

export {
    acquireEditorLock,
    heartbeatEditorLock,
    releaseEditorLock,
    getEditorLockStatus
}
