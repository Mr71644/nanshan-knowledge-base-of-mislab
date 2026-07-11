import '@univerjs/preset-sheets-core/lib/index.css';
import '@univerjs/preset-sheets-hyper-link/lib/index.css';
import '@univerjs/find-replace/lib/index.css';
import '@univerjs/preset-sheets-filter/lib/index.css';
import style from './index.module.less';

import { createUniver, LocaleType, mergeLocales } from '@univerjs/presets';
import { UniverSheetsCorePreset } from '@univerjs/preset-sheets-core';
import { UniverSheetsHyperLinkPreset } from '@univerjs/preset-sheets-hyper-link';
import { UniverSheetsFindReplacePreset } from '@univerjs/preset-sheets-find-replace';
import { UniverSheetsFilterPreset } from '@univerjs/preset-sheets-filter';
import UniverPresetSheetsCoreZhCN from '@univerjs/preset-sheets-core/locales/zh-CN';
import UniverPresetSheetsHyperLinkZhCN from '@univerjs/preset-sheets-hyper-link/locales/zh-CN';
import UniverPresetSheetsFindReplaceZhCN from '@univerjs/preset-sheets-find-replace/locales/zh-CN';
import UniverPresetSheetsFilterZhCN from '@univerjs/preset-sheets-filter/locales/zh-CN';
import { OpenFindDialogOperation } from '@univerjs/find-replace';
import { SmartToggleSheetsFilterCommand } from '@univerjs/sheets-filter';
import { forwardRef, useEffect, useImperativeHandle, useRef, memo } from 'react';

/**
 * UniverSheet - 基于最新 Univer API 的编辑器组件
 * 
 * 使用 Univer 0.15.x 的预设模式（Presets）进行初始化，这是官方推荐的方式。
 * 
 * 核心概念：
 * - createUniver(): 创建 Univer 实例，返回 { univer, univerAPI }
 * - univerAPI: Facade API，提供简化的操作接口
 * - univerAPI.createWorkbook(data): 创建工作簿
 * - univerAPI.getActiveWorkbook().save(): 获取完整快照数据（包括超链接）
 * 
 * 预设包说明：
 * - UniverSheetsCorePreset: 核心功能（编辑、公式、数字格式等）
 * - UniverSheetsHyperLinkPreset: 超链接功能（右键菜单、链接跳转等）
 * 
 * @param {Object} props
 * @param {IWorkbookData} props.data - 工作簿数据，符合 Univer IWorkbookData 格式
 * @param {Function} props.onChange - 编辑内容变化时的回调函数（可选）
 * @param {React.Ref} ref - 暴露 getData() 方法给父组件
 */
const UniverSheet = forwardRef(({ data, onChange }, ref) => {
    const univerRef = useRef(null);
    const univerAPIRef = useRef(null);
    const containerRef = useRef(null);
    const workbookIdRef = useRef(null);

    useImperativeHandle(ref, () => ({
        getData,
        getActiveWorkbook: () => univerAPIRef.current?.getActiveWorkbook(),
    }));

    /**
     * 初始化 Univer 实例
     * 使用最新的 createUniver() API 和预设模式
     */
    const init = (workbookData = {}) => {
        if (!containerRef.current) {
            throw Error('Container not initialized');
        }

        // 使用 createUniver 创建实例（0.15.x 推荐方式）
        const { univer, univerAPI } = createUniver({
            locale: LocaleType.ZH_CN,
            locales: {
                [LocaleType.ZH_CN]: mergeLocales(
                    UniverPresetSheetsCoreZhCN,
                    UniverPresetSheetsHyperLinkZhCN,
                    UniverPresetSheetsFindReplaceZhCN,
                    UniverPresetSheetsFilterZhCN
                ),
            },
            presets: [
                // 核心功能预设
                UniverSheetsCorePreset({
                    container: containerRef.current,
                }),
                // 超链接预设（包含右键菜单）
                UniverSheetsHyperLinkPreset(),
                // 查找替换预设
                UniverSheetsFindReplacePreset(),
                // 筛选预设
                UniverSheetsFilterPreset(),
            ],
        });

        univerRef.current = univer;
        univerAPIRef.current = univerAPI;

        // 创建工作簿
        const workbook = univerAPI.createWorkbook(workbookData);
        workbookIdRef.current = workbook.getId();
        
        univerAPI.createMenu({
            id: 'custom-find-replace-btn',
            title: '查找替换',
            tooltip: '查找替换',
            icon: 'SearchIcon',
            action: () => {
                univerAPI.executeCommand(OpenFindDialogOperation.id);
            }
        }).appendTo('ribbon.start.others');

        univerAPI.createMenu({
            id: 'custom-filter-btn',
            title: '筛选',
            tooltip: '筛选',
            icon: 'FilterIcon',
            action: () => {
                univerAPI.executeCommand(SmartToggleSheetsFilterCommand.id);
            }
        }).appendTo('ribbon.start.others');

        // 监听编辑事件 - 使用 Facade API
        if (onChange) {
            setupFacadeListener(workbook);
        }
    };

    /**
     * 使用 Facade API 监听工作簿变化
     * 在用户完成编辑（按回车/Tab）时立即触发，而不需要等待切换单元格
     */
    const setupFacadeListener = (workbook) => {
        if (!onChange) return;
        
        try {
            // 监听单元格值变化事件
            const disposable = workbook.onCellChange((params) => {
                onChange();
            });
            
            // 保存 disposable 以便清理
            univerRef.current._facadeDisposable = disposable;
        } catch (error) {
            setupDOMListener();
        }
    };

    /**
     * 降级方案：使用 DOM 事件监听
     */
    const setupDOMListener = () => {
        if (!onChange || !containerRef.current) return;
        
        // 监听编辑完成相关的事件
        const events = [
            'blur',       // 失去焦点
            'focusout',   // 焦点移出
            'paste',      // 粘贴
            'cut',        // 剪切
        ];
        
        const handleChange = (e) => {
            // 忽略工具栏和菜单的事件
            const target = e.target;
            if (target && (
                target.classList?.contains('univer-toolbar') ||
                target.closest('.univer-toolbar') ||
                target.classList?.contains('univer-menu')
            )) {
                return;
            }
            
            onChange();
        };
        
        // 添加事件监听器
        events.forEach(event => {
            containerRef.current.addEventListener(event, handleChange, true);
        });
        
        // 保存清理函数
        univerRef.current._cleanupListeners = () => {
            events.forEach(event => {
                containerRef.current?.removeEventListener(event, handleChange, true);
            });
        };
    };

    /**
     * 销毁 Univer 实例
     */
    const destroyUniver = () => {
        // 清理 Facade API 监听器
        if (univerRef.current?._facadeDisposable) {
            univerRef.current._facadeDisposable.dispose();
        }
        // 清理 DOM 事件监听器
        if (univerRef.current?._cleanupListeners) {
            univerRef.current._cleanupListeners();
        }
        univerRef.current?.dispose();
        univerRef.current = null;
        univerAPIRef.current = null;
        workbookIdRef.current = null;
    };

    /**
     * 获取工作簿完整数据
     * 使用 Facade API 的 save() 方法获取包含超链接的完整快照
     * 
     * @returns {IWorkbookData} 工作簿快照数据
     */
    const getData = () => {
        if (!univerAPIRef.current) {
            throw new Error('Univer API is not initialized');
        }

        const activeWorkbook = univerAPIRef.current.getActiveWorkbook();
        
        if (!activeWorkbook) {
            throw new Error('No active workbook found');
        }

        // 使用 Facade API 的 save() 方法获取完整快照
        const snapshot = activeWorkbook.save();
        
        return snapshot;
    };

    useEffect(() => {
        init(data);
        
        return () => {
            destroyUniver();
        };
    }, [data]);

    return <div ref={containerRef} className={style.univerContainer} />;
});

export const MemoSheet = memo(UniverSheet);