# Nanshan Knowledge Base of MISLab

基于 React + Vite 构建的在线知识库系统，提供文件管理、Markdown 文档编辑和 Excel 在线编辑功能。

## ✨ 主要功能

- 📁 **文件管理** - 文件/文件夹的创建、查看、删除与组织
- 📝 **Markdown 编辑** - 支持工具栏、粘贴/拖拽图片上传、实时预览的 Markdown 编辑器
- 📊 **Excel 编辑** - 集成 Univer 实现强大的表格在线编辑能力
- 🔗 **文件链接抽屉** - 在 Excel 编辑页支持检索常用文件并快速复制链接
- 🔄 **旧文档兼容** - 自动识别旧版富文本文档，支持预览和一键迁移为 Markdown 格式
- 🔐 **权限管理** - 用户认证与角色权限控制
- 🎨 **现代 UI** - 基于 Ant Design 5.x 的响应式界面

## 🛠️ 技术栈

### 核心框架
- **React 18** - 用户界面构建
- **Vite 5** - 快速开发与构建工具
- **React Router 6** - Hash 路由管理

### 状态管理与数据
- **Redux Toolkit** - 全局状态管理
- **Axios** - HTTP 请求封装

### UI 与编辑器
- **Ant Design 5** - 组件库
- **React Markdown + remark-gfm** - Markdown 渲染与编辑
- **Univer** - Excel 编辑引擎（0.15.x 预设模式）
- **XLSX** - Excel 文件导入/导出

## 📦 快速开始

### 环境要求

- Node.js >= 18
- pnpm >= 8

### 本地开发

```bash
# 安装依赖
pnpm install

# 启动开发服务器（默认 http://localhost:5173）
pnpm dev

# 代码检查
pnpm lint

# 构建生产版本
pnpm build

# 预览构建产物
pnpm preview
```

### 环境配置

项目使用 Vite 环境变量管理 API 地址，根据执行命令自动切换：

| 文件 | 环境 | 命令 | 说明 |
|------|------|------|------|
| `.env.development` | 测试 | `pnpm dev` | 开发时自动使用测试 API |
| `.env.production` | 生产 | `pnpm build` | 构建时自动使用生产 API |

API 地址配置在 `src/utils/request.js` 中通过 `import.meta.env.VITE_API_BASE_URL` 读取。

## 📂 项目结构

```
src/
├── apis/           # API 请求模块
├── assets/         # 静态资源
├── components/     # 可复用组件
│   ├── AddNewFile/
│   ├── HtmlContent/   # 旧版 HTML 文档渲染组件
│   ├── UniverSheet/   # Excel 编辑器组件
│   └── UploadFile/
├── hooks/          # 自定义 Hooks
├── router/         # 路由配置
├── store/          # Redux 状态管理
│   └── modules/
├── utils/          # 工具函数
│   ├── contentType.js     # 内容格式检测（HTML/Markdown）
│   ├── htmlToMarkdown.js  # HTML→Markdown 转换
│   └── migrateImages.js   # base64 图片迁移到 MinIO
└── views/          # 页面组件
    ├── AddContent/    # 新建 Markdown 文档
    ├── AddExcel/      # 添加 Excel
    ├── Content/       # Markdown 文档查看/编辑
    ├── Excel/         # Excel 展示
    ├── FileList/      # 文件列表
    ├── Home/          # 主页面
    ├── Login/         # 登录页面
    ├── Administrator/ # 权限管理页面
    ├── Preview/       # 文件预览页面
    └── NotFound/      # 重定向页面
```

### 组件规范

每个组件/视图遵循三文件结构：

```
ComponentName/
├── index.jsx           # 组件逻辑
├── index.module.css    # 编译后的样式
└── index.module.less   # 源样式文件
```

## 🔧 开发说明

### Git 分支规范

```
main（生产分支，始终保持可发布状态）
  └── develop（开发主分支，所有人代码汇总）
        ├── feature/xxx    新功能开发
        ├── fix/xxx        bug 修复
        └── optimize/xxx   优化改进
```

**工作流程**：

1. 开始新任务：从 develop 拉取最新代码，创建 feature/fix 分支
2. 开发完成后：推送分支，在 GitHub 创建 PR 到 develop
3. 测试通过后：创建 PR 从 develop 到 main，合并后部署生产

### 路由模式

使用 **Hash Router**，所有路由以 `#/` 开头：

- `/home` - 主页文件列表
- `/home/list/:id` - 文件夹详情
- `/content/:folder/:id` - Markdown 文档查看/编辑
- `/addContent/:folder` - 新建 Markdown 文档
- `/excel/:folder/:id` - Excel 查看/编辑
- `/addExcel/:folder` - 新建 Excel
- `/administrator` - 权限管理系统
- `/login` - 登录页

### 认证机制

- Token 存储在 `localStorage`
- 请求拦截器自动添加 `Authorization: Bearer ${token}`
- 401 响应自动清除 Token 并跳转登录

### 权限能力

- 管理员页面支持：用户管理、角色管理、用户角色分配
- 支持角色级别的文件夹权限分配（如 VIEW / EDIT）
- 文件列表支持按权限类型展示（可阅读 / 可编辑）

### Excel 能力

- 使用 `createUniver` 初始化工作簿，数据兼容 `IWorkbookData`
- 支持通过 `save()` 获取完整快照（包含超链接数据）
- AddExcel 与 Excel 页面支持常用文件抽屉检索

### 文件类型标识

`record.status` 字段：

- `1` - 富文本内容
- `2` - 文件夹
- `3` - Excel 文件
- `4` - 普通文件

## 🐳 Docker 部署

项目支持容器化部署，使用多阶段构建优化镜像大小。

### 构建镜像

```bash
docker build -t sytusramlethal/mislab-kb:latest .
```

### 运行容器

```bash
# 基础运行（端口映射到宿主机 8080）
docker run -d --name mislab-kb -p 8080:80 sytusramlethal/mislab-kb:latest

# 查看容器日志
docker logs -f mislab-kb

# 停止容器
docker stop mislab-kb

# 删除容器
docker rm mislab-kb
```

访问 `http://localhost:8080/#/` 验证部署。

## 📝 License

All rights reserved
