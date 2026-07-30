import { fetchMigrateList, migrateBatch } from '@/apis/migration'
import { convertMarkdownToJSON } from './migrationEngine'

const BATCH_SIZE = 10

/**
 * 批量迁移 —— 将旧 Markdown 文档转换为 ProseMirror JSON
 *
 * 触发时机：由 MigrationTestPanel 手动触发
 * 调度策略：requestIdleCallback（降级 setTimeout 50ms）
 * 容错：单文档失败跳过，批次写回失败重试 1 次，整体异常不标记完成
 *
 * @param {Object} callbacks - 可选回调
 * @param {Function} callbacks.onStart - 迁移开始，传入 { total }
 * @param {Function} callbacks.onDocumentSuccess - 单文档成功，传入 { id, title, mdLen, jsonLen, ratio }
 * @param {Function} callbacks.onDocumentFailed - 单文档失败，传入 { id, title, reason, mdSnippet }
 * @param {Function} callbacks.onBatchComplete - 批次完成，传入 { done, remaining }
 * @param {Function} callbacks.onComplete - 全部完成，传入 { total, aborted?, error? }
 * @returns {Object} { abort } — 调用 abort() 可中断迁移
 */
export function runSilentMigration(callbacks = {}) {
    const { onStart, onDocumentSuccess, onDocumentFailed, onBatchComplete, onComplete } = callbacks

    let aborted = false

    const run = async () => {
        try {
            const res = await fetchMigrateList()
            const items = res?.data || res || []

            if (!Array.isArray(items) || items.length === 0) {
                onComplete?.({ total: 0 })
                return
            }

            const total = items.length
            let doneCount = 0
            onStart?.({ total })

            const schedule = window.requestIdleCallback
                ? (cb) => requestIdleCallback(cb, { timeout: 2000 })
                : (cb) => setTimeout(cb, 50)

            const processNextBatch = () => {
                if (aborted || items.length === 0) {
                    onComplete?.({ total: doneCount, aborted })
                    return
                }

                const batch = items.splice(0, BATCH_SIZE)
                const documents = []

                for (const item of batch) {
                    try {
                        const mdLen = (item.content || '').length
                        const json = convertMarkdownToJSON(item.content)
                        documents.push({
                            id: item.id,
                            content: json,
                            contentType: 'prosemirror',
                        })
                        doneCount++
                        onDocumentSuccess?.({
                            id: item.id,
                            title: item.title || `文档#${item.id}`,
                            mdLen,
                            jsonLen: json.length,
                            ratio: mdLen > 0 ? (json.length / mdLen).toFixed(1) : 0,
                        })
                    } catch (e) {
                        const reason = e?.message || '未知错误'
                        const md = item.content || ''
                        onDocumentFailed?.({
                            id: item.id,
                            title: item.title || `文档#${item.id}`,
                            reason,
                            mdSnippet: md.length > 200 ? md.substring(0, 200) + '...' : md,
                        })
                    }
                }

                if (documents.length > 0) {
                    migrateBatch(documents)
                        .catch(() => migrateBatch(documents))
                        .catch(e => console.warn('[Migration] 批量写回失败，跳过该批次:', e))
                }

                onBatchComplete?.({ done: doneCount, remaining: items.length })

                if (items.length > 0 && !aborted) {
                    schedule(processNextBatch)
                } else {
                    onComplete?.({ total: doneCount, aborted })
                }
            }

            schedule(processNextBatch)
        } catch (e) {
            console.warn('[Migration] 迁移流程异常:', e)
            onComplete?.({ total: 0, error: e?.message })
        }
    }

    run()

    return {
        abort: () => { aborted = true },
    }
}
