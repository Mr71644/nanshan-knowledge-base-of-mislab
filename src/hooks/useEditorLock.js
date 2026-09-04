import { useEffect, useRef, useState } from 'react'
import { acquireEditorLock, heartbeatEditorLock, releaseEditorLock } from '@/apis/editorLock'

/**
 * useEditorLock - 独占编辑锁状态机
 *
 * 状态流转：
 *   idle → acquiring → editing → reconnecting → editing / lockLost
 *   idle → editing（acquire 成功）
 *   任意 → released（release 调用后）
 *
 * 职责：
 * - clientSessionId 与 lockToken 按资源写入当前标签页 sessionStorage（不跨标签页共享）
 * - acquire：申请锁，网络错误按 1s/2s/4s 有限退避重试（期间保持 acquiring，不重新生成 session ID）
 * - restore：Content 挂载恢复 —— 先 heartbeat 再决定是否恢复编辑态，不能先 acquire
 * - heartbeat：每 20s 续租 + 页面显隐/focus 时立即续租；423/401/403 视为锁失效
 * - release：best-effort 释放，网络失败不阻塞页面离开
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const HEARTBEAT_INTERVAL = 20 * 1000 // 默认租约 120s，每 20s 续租一次
const RECONNECT_DELAYS = [1000, 2000, 4000] // 网络错误退避：1s、2s、4s
const LEASE_SAFE_MARGIN = 4000 // 本地租约安全余量（预留 3~5s，取 4s）

const makeUUID = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID()
    }
    return `sid-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function useEditorLock({ resourceType, resourceId }) {
    const rid = Number(resourceId)
    const key = `${resourceType}:${rid}`
    const sessionKey = `editor-lock-session:${key}`
    const lockKey = `editor-lock:${key}`

    // idle | acquiring | editing | reconnecting | lockLost | released
    const [status, setStatus] = useState('idle')
    const [lockToken, setLockToken] = useState(null)
    const [owner, setOwner] = useState('')
    const [ownedByCurrentUser, setOwnedByCurrentUser] = useState(false)

    const statusRef = useRef(status)
    statusRef.current = status
    const tokenRef = useRef(lockToken)
    tokenRef.current = lockToken
    const leaseDeadlineRef = useRef(0)
    const acquireInFlightRef = useRef(null)
    const heartbeatInFlightRef = useRef(null)
    const heartbeatTimerRef = useRef(null)
    const reconnectTimerRef = useRef(null)
    const reconnectRetryRef = useRef(0)
    const heartbeatRef = useRef(null)

    // 资源切换时重置全部本地状态
    useEffect(() => {
        clearInterval(heartbeatTimerRef.current)
        clearTimeout(reconnectTimerRef.current)
        heartbeatTimerRef.current = null
        reconnectTimerRef.current = null
        reconnectRetryRef.current = 0
        acquireInFlightRef.current = null
        heartbeatInFlightRef.current = null
        tokenRef.current = null
        leaseDeadlineRef.current = 0
        setStatus('idle')
        setLockToken(null)
        setOwner('')
        setOwnedByCurrentUser(false)
    }, [key])

    const getClientSessionId = () => {
        let sid = sessionStorage.getItem(sessionKey)
        if (!sid) {
            sid = makeUUID()
            sessionStorage.setItem(sessionKey, sid)
        }
        return sid
    }

    const clearStored = () => {
        sessionStorage.removeItem(lockKey)
        sessionStorage.removeItem(sessionKey)
    }

    const enterEditing = (token, remainingMs) => {
        sessionStorage.setItem(lockKey, token)
        setLockToken(token)
        tokenRef.current = token
        // 使用单调时钟记录本地租约截止时间，不直接与 Date.now() 比较（防时钟偏差）
        leaseDeadlineRef.current = performance.now() + Math.max(0, remainingMs || 0)
        setStatus('editing')
    }

    const stopHeartbeat = () => {
        clearInterval(heartbeatTimerRef.current)
        clearTimeout(reconnectTimerRef.current)
        heartbeatTimerRef.current = null
        reconnectTimerRef.current = null
        reconnectRetryRef.current = 0
    }

    function scheduleReconnect() {
        clearTimeout(reconnectTimerRef.current)
        const delay = RECONNECT_DELAYS[Math.min(reconnectRetryRef.current, RECONNECT_DELAYS.length - 1)]
        reconnectRetryRef.current += 1
        reconnectTimerRef.current = setTimeout(async () => {
            if (statusRef.current !== 'reconnecting') {
                reconnectRetryRef.current = 0
                return
            }
            // 即使未收到 423，已超过本地推算的租约截止时间也不能继续安全修改
            if (performance.now() > leaseDeadlineRef.current - LEASE_SAFE_MARGIN) {
                markLockLost()
                return
            }
            await heartbeatRef.current?.()
        }, delay)
    }

    function startHeartbeat() {
        clearInterval(heartbeatTimerRef.current)
        heartbeatTimerRef.current = setInterval(() => {
            heartbeatRef.current?.()
        }, HEARTBEAT_INTERVAL)
    }

    async function heartbeat() {
        const token = tokenRef.current
        if (!token) return { ok: false, reason: 'no-token' }
        // 合并并发心跳：focus / visibilitychange / 定时器 可能同时触发
        if (heartbeatInFlightRef.current) return heartbeatInFlightRef.current
        heartbeatInFlightRef.current = (async () => {
            try {
                const res = await heartbeatEditorLock({ resourceType, resourceId: rid, lockToken: token })
                leaseDeadlineRef.current = performance.now() + (res.data?.remainingMs || 0)
                reconnectRetryRef.current = 0
                if (statusRef.current === 'reconnecting') setStatus('editing')
                return { ok: true }
            } catch (e) {
                const s = e.httpStatus
                if (s === 423) {
                    // 原 lockToken 已明确失效（如后台标签页被冻结后租约过期）：立即尝试一次 acquire
                    // - acquire 成功（相同 clientSessionId 幂等）→ 替换为新 lockToken，恢复编辑
                    // - acquire 返回 423 → 其他会话已占用，进入“锁已丢失”状态
                    const re = await tryReacquireAfterLost()
                    return re.ok
                        ? { ok: true, reason: 'reacquired' }
                        : { ok: false, reason: 'lost' }
                }
                if (s === 401 || s === 403) {
                    // 登录失效 / 编辑权限失效
                    stopHeartbeat()
                    markLockLost()
                    return { ok: false, reason: s === 401 ? 'unauthorized' : 'forbidden' }
                }
                // 网络错误 / 超时 / 5xx：进入“重连中”，有限退避重试，不丢弃本地内容
                if (statusRef.current !== 'reconnecting') {
                    setStatus('reconnecting')
                }
                scheduleReconnect()
                return { ok: false, reason: 'network' }
            } finally {
                heartbeatInFlightRef.current = null
            }
        })()
        return heartbeatInFlightRef.current
    }
    heartbeatRef.current = heartbeat

    async function acquire() {
        // in-flight Promise 锁：防止快速连点产生并发 acquire
        if (acquireInFlightRef.current) return acquireInFlightRef.current
        acquireInFlightRef.current = (async () => {
            setStatus('acquiring')
            const clientSessionId = getClientSessionId()
            let attempt = 0
            for (;;) {
                try {
                    const res = await acquireEditorLock({ resourceType, resourceId: rid, clientSessionId })
                    const d = res.data
                    if (d && d.acquired) {
                        enterEditing(d.lockToken, d.remainingMs)
                        startHeartbeat()
                        return { ok: true, data: d }
                    }
                    // HTTP 200 但未 acquired：资源被占用
                    setOwner(d?.owner || '')
                    setOwnedByCurrentUser(!!d?.ownedByCurrentUser)
                    setStatus('idle')
                    return { ok: false, reason: 'occupied', owner: d?.owner, ownedByCurrentUser: !!d?.ownedByCurrentUser }
                } catch (e) {
                    if (e.httpStatus === 423) {
                        setOwner(e.lockOwner || '')
                        setOwnedByCurrentUser(!!e.lockOwnedByCurrentUser)
                        setStatus('idle')
                        return { ok: false, reason: 'occupied', owner: e.lockOwner, ownedByCurrentUser: !!e.lockOwnedByCurrentUser }
                    }
                    if (e.httpStatus === 401) {
                        setStatus('idle')
                        return { ok: false, reason: 'unauthorized' }
                    }
                    if (e.httpStatus === 403) {
                        setStatus('idle')
                        return { ok: false, reason: 'forbidden' }
                    }
                    // 网络错误 / 超时 / 5xx：1s、2s、4s 有限退避重试
                    // 重试期间保持相同 clientSessionId，避免被自己的旧会话挡住
                    if (attempt < RECONNECT_DELAYS.length) {
                        await sleep(RECONNECT_DELAYS[attempt])
                        attempt += 1
                        continue
                    }
                    setStatus('idle')
                    return { ok: false, reason: 'network' }
                }
            }
        })()
        try {
            return await acquireInFlightRef.current
        } finally {
            acquireInFlightRef.current = null
        }
    }

    /**
     * Content 挂载恢复：先 heartbeat，成功后自动恢复编辑态
     * heartbeat 返回 423 → 删除残留 token 回预览；网络错误有限重试后回预览
     */
    async function restore(token) {
        tokenRef.current = token
        setStatus('acquiring') // 结果确定前保持预览且禁用编辑按钮
        let attempt = 0
        for (;;) {
            try {
                const res = await heartbeatEditorLock({ resourceType, resourceId: rid, lockToken: token })
                enterEditing(token, res.data?.remainingMs)
                startHeartbeat()
                return { ok: true }
            } catch (e) {
                if (e.httpStatus === 423 || e.httpStatus === 401 || e.httpStatus === 403) {
                    clearStored()
                    setLockToken(null)
                    tokenRef.current = null
                    leaseDeadlineRef.current = 0
                    setStatus('idle')
                    return { ok: false, reason: e.httpStatus === 423 ? 'lost' : (e.httpStatus === 401 ? 'unauthorized' : 'forbidden') }
                }
                if (attempt < RECONNECT_DELAYS.length) {
                    await sleep(RECONNECT_DELAYS[attempt])
                    attempt += 1
                    continue
                }
                // 网络重试耗尽：清除残留 token 回预览，用户可自行点击“编辑文档”重新 acquire
                clearStored()
                setLockToken(null)
                tokenRef.current = null
                leaseDeadlineRef.current = 0
                setStatus('idle')
                return { ok: false, reason: 'network' }
            }
        }
    }

    function markLockLost() {
        stopHeartbeat()
        clearStored()
        setLockToken(null)
        tokenRef.current = null
        leaseDeadlineRef.current = 0
        setStatus('lockLost')
    }

    /**
     * heartbeat 返回 423 后的单次重新 acquire（§5.2）
     * 相同 clientSessionId 幂等：若服务端仍为该会话保留锁则返回原 lockToken，否则视为抢占失败进入 lockLost。
     */
    async function tryReacquireAfterLost() {
        const clientSessionId = getClientSessionId()
        try {
            const res = await acquireEditorLock({ resourceType, resourceId: rid, clientSessionId })
            const d = res.data
            if (d && d.acquired) {
                enterEditing(d.lockToken, d.remainingMs)
                startHeartbeat()
                return { ok: true }
            }
            setOwner(d?.owner || '')
            setOwnedByCurrentUser(!!d?.ownedByCurrentUser)
            markLockLost()
            return { ok: false }
        } catch (err) {
            if (err.httpStatus === 423) {
                setOwner(err.lockOwner || '')
                setOwnedByCurrentUser(!!err.lockOwnedByCurrentUser)
            }
            markLockLost()
            return { ok: false }
        }
    }

    async function release() {
        stopHeartbeat()
        const token = tokenRef.current
        clearStored()
        setLockToken(null)
        tokenRef.current = null
        leaseDeadlineRef.current = 0
        setStatus('released')
        if (token) {
            // best-effort：显式离开等待其完成，但网络失败不能永久阻塞页面离开（由租约超时兜底）
            try {
                await Promise.race([
                    releaseEditorLock({ resourceType, resourceId: rid, lockToken: token }),
                    sleep(3000)
                ])
            } catch {
                /* 忽略，由服务端租约超时兜底 */
            }
        }
    }

    // 页面隐藏前与重新可见、窗口聚焦时立即尝试一次心跳（定时器可能被后台标签页节流/冻结）
    useEffect(() => {
        const run = () => {
            const s = statusRef.current
            if (s === 'editing' || s === 'reconnecting') {
                heartbeatRef.current?.()
            }
        }
        const onVisibility = () => {
            run()
        }
        window.addEventListener('focus', run)
        document.addEventListener('visibilitychange', onVisibility)
        return () => {
            window.removeEventListener('focus', run)
            document.removeEventListener('visibilitychange', onVisibility)
        }
    }, [])

    // 组件卸载（应用内离开）时停止心跳定时器，避免锁被无限续租。
    // 不清除 sessionStorage、不主动 release：刷新场景下挂载时需按 §2.1 恢复流程先 heartbeat 再恢复编辑态，
    // 直接离开标签页由服务端租约超时兜底。
    useEffect(() => {
        return () => {
            clearInterval(heartbeatTimerRef.current)
            clearTimeout(reconnectTimerRef.current)
            heartbeatTimerRef.current = null
            reconnectTimerRef.current = null
            reconnectRetryRef.current = 0
        }
    }, [])

    return {
        status,
        lockToken,
        owner,
        ownedByCurrentUser,
        acquire,
        restore,
        heartbeat,
        release,
        markLockLost,
    }
}
