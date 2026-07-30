import { useState, useRef, useCallback, useEffect } from 'react'
import { Button, Progress } from 'antd'
import {
    CheckCircleFilled,
    CloseCircleFilled,
    UpOutlined,
    DownOutlined,
    ReloadOutlined,
} from '@ant-design/icons'
import { runSilentMigration } from '@/utils/migrationScheduler'
import style from './index.module.css'

/**
 * 迁移测试面板 — 仅开发/测试阶段使用
 *
 * 通过 VITE_MIGRATION_TEST 环境变量控制显示：
 *   .env.development → VITE_MIGRATION_TEST=true  → 显示
 *   .env.production  → VITE_MIGRATION_TEST=false → 完全静默
 */
const MigrationTestPanel = () => {
    const [collapsed, setCollapsed] = useState(false)
    const [fading, setFading] = useState(false)
    const [status, setStatus] = useState('idle') // idle | running | done | error
    const [progress, setProgress] = useState({ done: 0, total: 0 })
    const [logs, setLogs] = useState([]) // { type, id, title, mdLen, jsonLen, ratio, reason, mdSnippet }
    const [expandedLog, setExpandedLog] = useState(null)
    const abortRef = useRef(null)
    const fadeTimerRef = useRef(null)

    // 清理定时器
    useEffect(() => {
        return () => {
            if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current)
        }
    }, [])

    const startMigration = useCallback(() => {
        setStatus('running')
        setLogs([])
        setProgress({ done: 0, total: 0 })
        setExpandedLog(null)
        if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current)
        setFading(false)

        const { abort } = runSilentMigration({
            onStart: ({ total }) => {
                setProgress({ done: 0, total })
            },
            onDocumentSuccess: (doc) => {
                setLogs(prev => [{ type: 'success', ...doc }, ...prev].slice(0, 50))
                setProgress(p => ({ ...p, done: p.done + 1 }))
            },
            onDocumentFailed: (doc) => {
                setLogs(prev => [{ type: 'failed', ...doc }, ...prev].slice(0, 50))
            },
            onBatchComplete: ({ done, remaining }) => {
                setProgress({ done, total: done + remaining })
            },
            onComplete: ({ total, aborted, error }) => {
                if (error) {
                    setStatus('error')
                } else if (aborted) {
                    setStatus('idle')
                } else {
                    setStatus('done')
                    setProgress(p => ({ ...p, total: total || p.total }))
                    // 5 秒后自动淡出
                    fadeTimerRef.current = setTimeout(() => setFading(true), 5000)
                }
            },
        })
        abortRef.current = abort
    }, [])

    const handleAbort = () => {
        abortRef.current?.()
        setStatus('idle')
    }

    const handleReset = () => {
        setStatus('idle')
        setLogs([])
        setProgress({ done: 0, total: 0 })
        setExpandedLog(null)
        setFading(false)
    }

    const successCount = logs.filter(l => l.type === 'success').length
    const failedCount = logs.filter(l => l.type === 'failed').length
    const percent = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0

    if (import.meta.env.VITE_MIGRATION_TEST !== 'true') return null

    return (
        <div className={`${style.panel} ${collapsed ? style.panelCollapsed : ''} ${fading ? style.panelFading : ''}`}>
            {/* 头部 */}
            <div className={style.header}>
                <div className={style.headerLeft}>
                    <span
                        className={`${style.statusDot} ${
                            status === 'running' ? style.statusRunning :
                            status === 'done' ? style.statusDone :
                            status === 'error' ? style.statusError : ''
                        }`}
                    />
                    <span>迁移测试面板</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {status === 'idle' && (
                        <span className={style.collapseBtn} onClick={handleReset}>
                            <ReloadOutlined /> 重置
                        </span>
                    )}
                    <span className={style.collapseBtn} onClick={() => setCollapsed(c => !c)}>
                        {collapsed ? <UpOutlined /> : <DownOutlined />}
                        {collapsed ? '展开' : '收起'}
                    </span>
                </div>
            </div>

            {!collapsed && (
                <>
                    {/* 进度条 */}
                    <div style={{ padding: '8px 16px 0' }}>
                        <Progress
                            percent={percent}
                            size="small"
                            status={status === 'error' ? 'exception' : status === 'done' ? 'success' : 'active'}
                            format={() => `${progress.done}/${progress.total}`}
                        />
                    </div>

                    {/* 统计行 */}
                    <div className={style.statsRow} style={{ paddingLeft: 16, paddingRight: 16 }}>
                        <span>成功 <span className={style.statSuccess}>{successCount}</span></span>
                        <span>失败 <span className={style.statFailed}>{failedCount}</span></span>
                        <span>状态：{status === 'running' ? '运行中' : status === 'done' ? '已完成' : status === 'error' ? '异常' : '待启动'}</span>
                    </div>

                    {/* 日志列表 */}
                    <div className={style.body}>
                        {logs.length === 0 && status === 'idle' && (
                            <div className={style.emptyState}>
                                点击下方按钮开始迁移测试
                            </div>
                        )}
                        {logs.length === 0 && status !== 'idle' && (
                            <div className={style.emptyState}>
                                {status === 'running' ? '迁移中...' : '无日志'}
                            </div>
                        )}
                        {logs.map((log, i) => (
                            <div key={i} className={`${style.logItem} ${log.type === 'success' ? style.logSuccess : style.logFailed}`}>
                                <span className={style.logIcon}>
                                    {log.type === 'success'
                                        ? <CheckCircleFilled />
                                        : <CloseCircleFilled />
                                    }
                                </span>
                                <div className={style.logContent}>
                                    <div className={style.logTitle}>
                                        {log.title || `文档#${log.id}`}
                                    </div>
                                    <div className={style.logMeta}>
                                        {log.type === 'success'
                                            ? `ID: ${log.id}  |  体积比: ${log.ratio}x  (${log.mdLen} → ${log.jsonLen})`
                                            : `ID: ${log.id}  |  错误: ${log.reason}`
                                        }
                                    </div>
                                    {log.type === 'failed' && (
                                        <>
                                            <div
                                                className={style.logFailedDetail}
                                                onClick={() => setExpandedLog(expandedLog === i ? null : i)}
                                            >
                                                {expandedLog === i ? '收起详情 ▲' : '展开原始内容 ▼'}
                                            </div>
                                            {expandedLog === i && (
                                                <div className={style.logExpanded}>
                                                    {log.mdSnippet || '(空内容)'}
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* 完成/异常横幅 */}
                    {status === 'done' && (
                        <div className={style.completeBanner}>
                            ✅ 迁移完成！共处理 {progress.done} 个文档（5 秒后自动消失）
                        </div>
                    )}
                    {status === 'error' && (
                        <div className={style.errorBanner}>
                            ❌ 迁移异常，请检查控制台
                        </div>
                    )}

                    {/* 操作按钮 */}
                    <div style={{ padding: '8px 16px 12px' }}>
                        {status === 'running' ? (
                            <Button block size="small" onClick={handleAbort}>
                                中止迁移
                            </Button>
                        ) : (
                            <Button
                                block
                                type="primary"
                                size="small"
                                onClick={startMigration}
                                loading={status === 'running'}
                                className={style.manualBtn}
                            >
                                开始迁移
                            </Button>
                        )}
                    </div>
                </>
            )}
        </div>
    )
}

export default MigrationTestPanel
