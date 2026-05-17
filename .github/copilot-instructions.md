# MISlab Excel - Copilot Instructions

## 项目概览
这是一个基于 React + Vite 的云盘管理系统，核心功能包括文件/文件夹管理、富文本内容编辑和 Excel 在线编辑。使用 Univer 作为 Excel 编辑引擎。

## 架构模式

### 路由结构
- 使用 **Hash Router** (`createHashRouter`)，所有路由以 `#/` 开头
- 主要路由模式：
  - `/home` - 主页面，包含文件列表
  - `/home/list/:id` - 文件夹内容
  - `/content/:folder/:id` - 富文本内容查看/编辑
  - `/excel/:folder/:id` - Excel 查看/编辑
  - `/addContent/:folder` 和 `/addExcel/:folder` - 新建内容
- 所有视图组件使用 `memo()` 包裹并导出为 `Memo[ComponentName]`（如 `MemoFileList`）

### 状态管理 (Redux Toolkit)
- **user module**: 管理 token，使用 `localStorage` 持久化
- **message module**: 全局消息提示状态（配合 Ant Design Message 使用）
- Store 初始化：必须在 `<Provider>` 前 import `@/utils/request.js` 以确保拦截器正确访问 store

### API 请求流程
- 统一使用 `src/utils/request.js` 中的 axios 实例
- **Base URL**: `http://119.27.181.240:4529`
- **认证**: 请求头自动添加 `Authorization: Bearer ${token}`
- **401 处理**: 自动清除 token、显示警告消息并重定向到 `/login`
- API 模块按功能拆分在 `src/apis/` 目录（如 `excel.js`, `folder.js`, `content.js`）

### 组件结构规范
每个组件/视图遵循三文件结构：
```
ComponentName/
  ├── index.jsx          # 组件逻辑
  ├── index.module.css   # 编译后的 CSS
  └── index.module.less  # 源样式文件（LESS）
```
- 样式导入：`import style from './index.module.css'`
- 使用 CSS Modules，通过 `style.className` 引用

### Univer Excel 集成（v0.15.x 预设模式）

#### 架构说明
- **组件**: `src/components/UniverSheet/index.jsx`
- **初始化方式**: 使用 **预设模式（Presets）**，这是官方推荐的最新方式
- **核心 API**: 
  - `createUniver()`: 创建 Univer 实例，返回 `{ univer, univerAPI }`
  - `univerAPI.createWorkbook(data)`: 创建工作簿
  - `univerAPI.getActiveWorkbook().save()`: 获取完整快照数据

#### 预设包
- **@univerjs/preset-sheets-core** (0.15.0): 核心功能（编辑、公式、格式）
- **@univerjs/preset-sheets-advanced** (0.15.0): 高级功能（超链接、图片、评论、数据验证）
- 自动包含所有必需的插件和 Facade API，无需手动注册

#### 关键方法
- **init(data)**: 
  - 使用 `createUniver({ presets, locales })` 初始化
  - 调用 `univerAPI.createWorkbook(data)` 创建工作簿
  - 数据格式：[IWorkbookData](https://docs.univer.ai/guides/sheets/model/workbook-data)
  
- **getData()**: 
  - 通过 ref 暴露给父组件
  - 返回 `univerAPI.getActiveWorkbook().save()` 的快照数据
  - 包含所有单元格数据、样式、公式和超链接

#### 超链接支持
- 由 `UniverSheetsAdvancedPreset` 自动提供
- 数据存储在 `cellData[row][col].p.body.customRanges` 中
- `save()` 方法自动序列化超链接数据，无需手动处理

#### 样式导入
```javascript
import '@univerjs/preset-sheets-core/lib/index.css';
import '@univerjs/preset-sheets-advanced/lib/index.css';
```

#### 数据流
```
后端 JSON → 解析为 IWorkbookData → createWorkbook() → 编辑 → 
getActiveWorkbook().save() → 序列化为 JSON → 后端存储
```

#### 调试
- `getData()` 包含详细的 console.log 输出
- 检查 `cellData` 结构和 `customRanges` 数组
- 使用浏览器控制台查看完整快照数据

### 自定义 Hooks
- **useMessage** (`src/hooks/useMessage.jsx`):
  - 提供 `success()`, `error()`, `warn()` 方法
  - 支持配置：`content`（提示文本）、`callBack`（回调）、`delayTime`（延迟时间）、`show`（是否显示）
  - 返回 `contextHolder` 用于渲染 Ant Design Message 组件

### 文件状态标识
FileList 组件中的 `record.status` 表示文件类型：
- `1` - 富文本内容（EditOutlined）
- `2` - 文件夹（FolderOutlined）
- `3` - Excel 文件（TableOutlined）
- `4` - 普通文件（FileOutlined）

## 开发工作流

### 常用命令
```bash
pnpm dev      # 启动开发服务器
pnpm build    # 生产构建
pnpm lint     # ESLint 检查
```

### 路径别名
- `@` 映射到 `./src`，已在 `vite.config.js` 配置

### 依赖关键点
- **Ant Design**: UI 组件库（v5.20+）
- **React Router**: v6 (使用 Hash Router)
- **Redux Toolkit**: 状态管理
- **Univer**: Excel 编辑器核心
  - **@univerjs/presets**: 0.15.0（预设模式）
  - **@univerjs/preset-sheets-core**: 0.15.0（核心功能）
  - **@univerjs/preset-sheets-advanced**: 0.15.0（高级功能）
  - 核心包版本：0.5.5（作为 peerDependencies）
- **React Quill**: 富文本编辑器
- **XLSX**: Excel 文件导入/导出

## 注意事项
- 在添加新视图时，确保在 `src/router/index.jsx` 中导入组件时使用 `Memo` 前缀
- 新增 API 时按功能模块创建独立文件（参考 `src/apis/` 现有结构）
- 修改全局样式时，注意 `normalize.css` 已引入作为样式重置
- Excel 数据格式必须符合 Univer 的 [IWorkbookData](https://docs.univer.ai/guides/sheets/model/workbook-data) 接口规范
- Univer 使用**预设模式**初始化，不要混用插件模式的代码
- 所有 Univer 相关依赖版本必须保持一致

## 重要升级说明
- **2026年1月9日**: 升级到 Univer 0.15.x 预设模式
- 详细升级文档：查看 `UNIVER_0.15_UPGRADE.md`
- 官方文档：[Univer Docs](https://docs.univer.ai/)
- API 参考：[API Reference](https://reference.univer.ai/)
