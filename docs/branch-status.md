# 分支现状与开发前准备

**当前分支：** `test/migration-feasibility`  
**状态：** 可行性测试已完成，尚未开始正式开发

---

## 一、当前分支上的变更

### 已修改的文件（需保留）

| 文件 | 变更内容 | 说明 |
|------|----------|------|
| `package.json` | 新增 4 个 @tiptap 扩展依赖 | Step 1 已完成，正式开发直接用 |
| `pnpm-lock.yaml` | 随 package.json 更新 | 同上 |
| `.gitignore` | 移除了 `docs/` 排除项 | 需要确认是否要提交 docs 目录 |

### 测试设施（开发前应删除）

| 文件 | 作用 |
|------|------|
| `src/pages/MigrationTest.jsx` | 测试 1 页面 |
| `src/pages/ImageMigrationTest.jsx` | 测试 2b 页面 |
| `src/pages/FullExtensionTest.jsx` | 补测页面 |
| `src/pages/RenderMarkdownTest.jsx` | 测试 6 页面 |
| `src/router/index.jsx` | 添加了 4 个测试路由 |
| `test-migration.html` | 测试 1 独立页面 |
| `test-migration-2.html` | 测试 2 独立页面 |
| `test-migration-3.html` | 测试 3 独立页面 |
| `test-migration-4.html` | 测试 4 独立页面 |
| `test-migration-5.html` | 测试 5 独立页面 |
| `test-migration-5.js` | 测试 5 脚本 |
| `screenshot.cjs` | Playwright 驱动脚本 |
| `fetch-docs.cjs` | API 测试脚本 |
| `migration-test-result.png` | 截图 |
| `migration-test-viewport.png` | 截图 |
| `migration-test-3-result.png` | 截图 |
| `migration-test-4-result.png` | 截图 |
| `migration-test-5-result.png` | 截图 |
| `migration-test-6-result.png` | 截图 |
| `migration-test-image-result.png` | 截图 |
| `migration-test-image-final.png` | 截图 |
| `migration-test-retest-result.png` | 截图 |

### 文档（建议保留提交）

| 目录/文件 | 说明 |
|-----------|------|
| `docs/` | 全部方案和测试文档 |

---

## 二、开发前清理步骤

### 2.1 还原路由器

`src/router/index.jsx` 中删除 4 个测试路由的 import 和路由定义，恢复到原始状态。

### 2.2 删除测试文件

```bash
# 测试页面
rm -rf src/pages/

# 独立测试 HTML
rm test-migration*.html
rm test-migration*.js

# 脚本和截图
rm screenshot.cjs
rm fetch-docs.cjs
rm migration-test-*.png
```

### 2.3 确认 .gitignore

决定是否将 `docs/` 重新加入 `.gitignore`。如果文档需要入库，就保持当前状态（不排除 docs）。

### 2.4 验证干净状态

```bash
git status
# 应仅显示：
#   M package.json
#   M pnpm-lock.yaml
#   M .gitignore (或已还原)
#   ?? docs/
```

---

## 三、正式开发分支策略

**建议：** 基于清理后的 `test/migration-feasibility` 分支直接开始开发，或新建一个干净的 `feat/migration-json` 分支。

方案 A：直接在当前分支开发
```bash
# 清理测试文件（见 2.1-2.2）
# 提交清理结果
git add -A
git commit -m "chore: 清理可行性测试文件，保留文档"
# 开始正式开发
```

方案 B：新建干净分支（推荐）
```bash
# 回到 main，新建分支
git checkout main
git checkout -b feat/storage-json-migration

# 从测试分支 cherry-pick 依赖变更
git checkout test/migration-feasibility -- package.json pnpm-lock.yaml

# 手动复制文档
cp -r ../test/migration-feasibility/docs .

# 开始正式开发
```

推荐方案 B，原因：
- 提交历史干净，不含测试迭代
- `package.json` 已包含正确的依赖版本，直接 cherry-pick 即可
- 测试代码保留在 `test/migration-feasibility` 分支，需要时可回溯

---

## 四、正式开发所需环境确认

开始正式开发前，确认以下条件：

- [ ] 后端 `content_type` 列已添加（或确认不影响开发——前端默认 markdown）
- [ ] 当前分支基于最新 main
- [ ] `pnpm install` 无报错
- [ ] `pnpm dev` 正常启动
- [ ] 已阅读 `docs/frontend-dev-steps.md`（17 步开发流程）
- [ ] 已阅读 `docs/final-implementation-plan.md`（技术细节）
