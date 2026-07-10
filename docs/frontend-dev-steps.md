# 前端开发步骤

**分支：** `test/migration-feasibility`  
**目标：** Markdown → ProseMirror JSON 存储格式迁移 + 字体/颜色/高亮功能  
**预计总文件：** 6 个新文件 + 9 个修改文件

---

## 前置条件

- [ ] 后端已完成数据库 `content_type` 列添加
- [ ] 后端 `GET /text/get/{id}` 响应已包含 `contentType` 字段（缺失时默认 markdown，不阻塞）
- [ ] 当前分支已基于最新 main 分支创建

---

## Step 1：安装依赖

**操作：**
```bash
pnpm add @tiptap/extension-font-family@3.23.4
pnpm add @tiptap/extension-text-style@3.23.4
pnpm add @tiptap/extension-color@3.23.4
pnpm add @tiptap/extension-highlight@3.23.4
```

**验证：** `package.json` 中新增 4 个依赖，版本均为 3.23.4，与现有 @tiptap/core 3.23.4 一致。

**回滚：** `pnpm remove` 上述 4 个包。

---

## Step 2：删除 MinioImage 的 renderMarkdown 方法

**文件：** `src/components/TiptapEditor/extensions/MinioImage.js`

**操作：** 删除第 82-91 行的 `renderMarkdown()` 方法及其前置的 `escapeAttr()` 辅助函数（如仅此处使用）。

**为什么：** 这是 Markdown 序列化专用的代码。迁移到 JSON 后编辑器通过 `getJSON()` 序列化，不再调用 `renderMarkdown`。全局搜索已确认无其他代码引用。

**注意：** 删除方法体即可，让父类 Image 的默认 `renderMarkdown()` 提供兜底行为。不要删除 `escapeAttr` 如果它在其他地方被引用。

**验证：** `pnpm dev` 启动后打开一个含图片的文档，确认图片正常显示、可编辑。

**回滚：** git revert 此改动。

---

## Step 3：修改 TiptapEditor 核心编辑器

**文件：** `src/components/TiptapEditor/index.jsx`

**操作：**

1. **新增 import：** 引入 FontFamily、TextStyle、Color、Highlight 四个扩展

2. **注册扩展：** 在 `extensions` 数组中添加：
   - `FontFamily.configure({ types: ['textStyle'] })`
   - `TextStyle`
   - `Color.configure({ types: ['textStyle'] })`
   - `Highlight.configure({ multicolor: true })`
   - 保留 `Markdown` 扩展（用于加载旧文档）

3. **新增 prop：** `contentType`（可选字符串，默认 `"markdown"`）

4. **修改初始化逻辑：** 根据 `contentType` 选择内容加载方式：
   - `"prosemirror"` → `content: JSON.parse(content || '{}'), contentType: 'json'`
   - `"markdown"` → `content: content || '', contentType: 'markdown'`

5. **修改 onUpdate 回调：** 
   - 从 `editor.getMarkdown()` 改为 `JSON.stringify(editor.getJSON())`
   - 回调签名从 `onChange(mdString)` 改为 `onChange(jsonString, 'prosemirror')`

6. **修改外部内容同步 Effect：** 根据 `contentType` 选择 `setContent(json)` 或 `setContent(md, { contentType: 'markdown' })`

7. **data-minio-src 图片处理：** 保持不变

**验证：**
- 新建文档 → 编辑 → 保存 → 刷新 → 内容完整保留
- 打开旧文档 → 预览模式 → 正常显示
- 打开旧文档 → 编辑 → 保存 → 正常打开

**回滚：** git revert 此改动。

---

## Step 4：添加工具栏字体/颜色控件

**文件：** `src/components/TiptapEditor/EditorToolbar.jsx`

**操作：**

1. **新增 import：** Ant Design 的 `Select` 和 `ColorPicker` 组件

2. **在工具栏按钮数组中插入三个控件**（建议放在"行内代码"和"链接"按钮之后，标题按钮之前，使用新的 divider 分隔）：

   **字体选择器：**
   - `<Select>` 下拉框，选项包含：默认字体、宋体、黑体、楷体、微软雅黑、Arial、Times New Roman、Courier New
   - 通过 `editor.chain().focus().setFontFamily(font).run()` 设置
   - 通过 `editor.isActive('textStyle', { fontFamily })` 高亮当前选项

   **文字颜色：**
   - `<ColorPicker>` 组件
   - 通过 `editor.chain().focus().setColor(hex).run()` 设置
   - 显示当前选区颜色

   **高亮颜色：**
   - `<ColorPicker>` 组件，预设常用高亮色（黄、绿、青、粉、橙、红）
   - 通过 `editor.chain().focus().toggleHighlight({ color: hex }).run()` 切换
   - 通过 `editor.isActive('highlight')` 高亮按钮状态

**验证：**
- 编辑模式选中文字 → 设置字体 → 文字字体变化
- 设置颜色 → 文字颜色变化
- 设置高亮 → 文字背景色变化
- 叠加字体+颜色+高亮 → 三个样式同时生效
- 取消样式 → 恢复默认

**回滚：** git revert 此改动。

---

## Step 5：添加工具栏控件样式

**文件：** `src/components/TiptapEditor/index.module.css`

**操作：** 为 Step 4 新增的 `<Select>` 和 `<ColorPicker>` 添加样式：

- 字体下拉框宽度：约 120px
- 颜色选择器触发按钮：与现有 toolbarButton 尺寸一致（small）
- 控件间距：与现有按钮一致
- 确保在 `<Space wrap>` 中正确换行

**验证：** 工具栏布局正常，不溢出不挤压，不同窗口尺寸下正确换行。

---

## Step 6：修改 Content 查看/编辑页

**文件：** `src/views/Content/index.jsx`

**操作：**

1. **新增状态：** `const [contentType, setContentType] = useState('markdown')`

2. **修改 `getDetail()`：** 从 API 响应读取 `contentType` 字段：
   - `setContentType(detail.contentType || 'markdown')`

3. **修改 `onChange` 回调：** 适配新签名：
   - `onChange={(content, ct) => { setValue(content); if (ct) setContentType(ct) }}`

4. **修改 `edit()` 和自动保存：** 发送 `contentType` 参数：
   - `editContent({ title, author, content, id, contentType })`

5. **修改 `processMarkdown()` 调用：** 添加条件判断：
   - `if (contentType === 'markdown') { processMarkdown(value) }`

6. **传递 prop：** 给 TiptapEditor 传入：
   - `contentType={contentType}`

**验证：**
- 打开旧 Markdown 文档 → contentType 为 markdown → 预览正常
- 编辑旧文档 → 保存 → contentType 变为 prosemirror → 重新加载正常
- 打开新 JSON 文档 → contentType 为 prosemirror → 正常显示和编辑
- 自动保存 2 秒后触发 → 接口请求中带 contentType 字段
- 手动保存 → 接口请求中带 contentType 字段

**回滚：** git revert 此改动。

---

## Step 7：修改 AddContent 新建文档页

**文件：** `src/views/AddContent/index.jsx`

**操作：**

1. **新增状态：** `const [contentType, setContentType] = useState('prosemirror')`

2. **修改 `onChange` 回调：** 适配新签名，与 Step 6 一致

3. **修改 `add()` 函数：** 发送 `contentType`：
   - `addContent({ title, author, content, folderId, contentType: 'prosemirror' })`

4. **移除 `processMarkdown()` 调用：** 新建文档始终用 JSON，不需要 Markdown bug 修复

**验证：**
- 新建文档 → 输入内容 → 保存 → 跳转到文件列表
- 从文件列表打开刚创建的文档 → 正常显示

**回滚：** git revert 此改动。

---

## Step 8：修改 API 层

**文件：** `src/apis/content.js`

**操作：**

1. **`editContent`：** 增加 `contentType` 参数（默认 `'prosemirror'`），透传到请求 body

2. **`addContent`：** 增加 `contentType` 参数（默认 `'prosemirror'`），透传到请求 body

**注意：** `getContentDetail` 不需要修改，直接透传 API 返回的 `contentType`。

**验证：** 查看浏览器 Network 面板，确认 `/text/update` 和 `/text/add` 请求中携带 `contentType` 字段。

**回滚：** git revert 此改动。

---

## Step 9：创建 Headless 转换引擎

**文件（新建）：** `src/utils/migrationEngine.js`

**操作：**

1. 从 TiptapEditor 完整复制 `extensions` 配置（确保 100% 一致）

2. 导出 `convertMarkdownToJSON(markdownContent)` 函数：
   - `document.createElement('div')` 创建离屏 DOM
   - `new Editor({ element, extensions, content, contentType: 'markdown' })`
   - `editor.getJSON()` → `JSON.stringify()`
   - `editor.destroy()`
   - 返回 JSON 字符串

3. 添加错误处理：转换失败时抛出包含文档信息的错误

**关键约束：** 扩展配置必须与 TiptapEditor 完全一致，包括 MinioImage、CodeBlockWithToolbar 等自定义扩展。

**验证：** 在 Home 页 console 中手动调用 `convertMarkdownToJSON('# 测试')`，确认返回正确的 JSON 字符串。

---

## Step 10：创建静默迁移调度器

**文件（新建）：** `src/utils/migrationScheduler.js`

**操作：**

1. 导出 `runSilentMigration(documents, onProgress, onComplete)` 函数

2. 实现分批处理逻辑：
   - 每批 10 个文档
   - 调用 `convertMarkdownToJSON()` 批量转换
   - 调用 `migrateBatch()` 批量写回
   - 使用 `requestIdleCallback` 调度下一批
   - 降级方案：`setTimeout(fn, 50)`

3. 容错处理：
   - 单文档转换失败 → 跳过，记录 console.error
   - 批量写回失败 → 重试 1 次，仍失败跳过该批次
   - 未捕获异常 → 不设置完成标记，下次重新触发

4. 触发 `onProgress`（可选）和 `onComplete` 回调

---

## Step 11：创建迁移 API 模块

**文件（新建）：** `src/apis/migration.js`

**操作：**

1. `fetchMigrateList()` — `GET /text/migrate-list`，返回 `[{id, content}]`

2. `migrateBatch(documents)` — `POST /text/migrate-batch`，body: `{ documents: [{id, content, contentType}] }`

**注意：** 如后端未实现 3.1/3.2 接口，此处改为降级实现（递归调 `POST /home/get` + 逐文档 `GET /text/get/{id}` + `PUT /text/update`）。

---

## Step 12：在 Home 页触发静默迁移

**文件：** `src/views/Home/index.jsx`

**操作：**

1. 引入 `runSilentMigration` 和 `fetchMigrateList`

2. 在现有的 `useEffect(() => { getTree(); getUserInfomation() }, [])` 中增加调用：
   ```js
   triggerSilentMigration()  // 不 await，完全异步
   ```

3. 实现 `triggerSilentMigration()`：
   - 检查 `sessionStorage.getItem('migration_completed')` → 如果已标记，跳过
   - 调用 `fetchMigrateList()` 获取待迁移文档
   - 如果列表为空 → 标记完成 → 结束
   - 调用 `runSilentMigration(docs, null, () => sessionStorage.setItem('migration_completed', '1'))`
   - 整个过程包裹 try/catch，失败时静默处理（不弹错误提示）

**验证：**
- 登录后打开 Network 面板 → 看到迁移 API 请求
- 有旧文档时 → 迁移请求执行
- 无旧文档时 → 仅触发列表检查，不执行写回
- 迁移过程不阻塞页面操作

---

## Step 13：创建迁移测试面板（测试阶段专用）

**文件（新建）：** `src/components/MigrationTestPanel/index.jsx` + `index.module.css`

**用途：** 开发完成后的用户验收测试阶段，在页面右下角显示迁移进度浮窗。正式上线时通过环境变量关闭即为完全静默。

**操作：**

1. 创建浮窗组件，包含：
   - 进度条和计数（X/总数）
   - 实时滚动的文档列表（最新 10 条）：绿色 ✅ 成功、红色 ❌ 失败
   - 成功行显示文档 ID、标题、体积比
   - 失败行可点击展开：显示错误原因和原始 MD 前 200 字符
   - "收起面板"按钮 → 折叠为一行进度条
   - 迁移全部完成后 5 秒自动淡出

2. 通过 `import.meta.env.VITE_MIGRATION_TEST === 'true'` 控制显示。正式上线时删除此变量或设为 false。

3. 在 Home 页中条件渲染：
   ```jsx
   {import.meta.env.VITE_MIGRATION_TEST === 'true' && (
       <MigrationTestPanel scheduler={migrationRef} />
   )}
   ```

4. `migrationScheduler.js` 已有 `onProgress` 回调，补充回调数据即可对接面板：
   - `onDocumentSuccess({ id, title, mdLen, jsonLen, ratio })`
   - `onDocumentFailed({ id, title, reason, mdSnippet })`

**验证：**
- 设置 `VITE_MIGRATION_TEST=true` → 登录后右下角出现面板
- 进度条实时更新
- 成功/失败文档正确显示
- 失败行点击展开详情
- 迁移完成后面板自动消失
- 设置 `VITE_MIGRATION_TEST=false` → 迁移完全静默

**回滚：** 删除组件文件 + Home 页中的条件渲染 + 环境变量。

详见：`docs/migration-test-panel.md`

---

## Step 14：创建文本提取工具

**文件（新建）：** `src/utils/proseMirrorUtils.js`

**操作：**

1. 导出 `extractPlainText(jsonDoc)` — 遍历 JSON 树，递归收集 `text` 字段，块级节点间插入换行，返回纯文本字符串

2. 导出 `jsonToMarkdown(jsonDoc)` — 将 JSON 转回 Markdown（回滚用。如果未安装额外依赖，此函数可先留空，标注 TODO）

---

## Step 15：端到端验证

按以下测试矩阵逐项手动验证，每项通过后打勾。

### 新建文档

- [ ] 新建文档 → 输入内容 → 设置字体(宋体) → 设置颜色(红色) → 设置高亮(黄色) → 保存
- [ ] 刷新页面 → 确认字体/颜色/高亮完整保留
- [ ] 新建文档 → 插入表格 → 插入图片(上传+粘贴+拖放) → 插入代码块 → 保存 → 刷新 → 全部正常

### 旧文档兼容

- [ ] 打开一个从未编辑过的旧 Markdown 文档 → 预览模式 → 内容正常显示
- [ ] 点击编辑 → 内容正常 → 不做任何修改 → 保存 → 文档被转为 JSON 格式
- [ ] 再次打开 → 预览 → 内容与编辑前一致
- [ ] 打开另一个旧文档 → 编辑 → 添加字体/颜色 → 保存 → 样式保留

### 图片兼容

- [ ] 打开含 `![alt](minio:xxx)` 格式图片的旧文档 → 图片正常显示
- [ ] 打开含 `<img src="minio:xxx" width="800">` 格式图片的旧文档 → 图片正常显示且尺寸正确
- [ ] 上传新图片 → 保存 → 刷新 → 图片正常显示
- [ ] 拖拽缩放图片 → 保存 → 刷新 → 尺寸保留
- [ ] 只读模式 → data-minio-src 异步加载 → 图片正常显示

### 代码块

- [ ] 插入 JavaScript/Python/无语言的代码块 → 保存 → 刷新 → 语言标记和高亮正确
- [ ] 代码块主题切换 → 正常

### 表格

- [ ] 插入表格 → 编辑单元格 → 保存 → 刷新 → 结构完整
- [ ] 表格右键菜单 → 增删行列 → 正常

### 自动保存

- [ ] 编辑文档 → 等待 2 秒 → Network 面板显示 PUT 请求带 contentType
- [ ] 自动保存失败 → 显示提示

### 静默迁移

- [ ] 清除 sessionStorage → 登录 → Home 页 → Network 面板显示迁移请求
- [ ] 迁移过程中正常操作页面 → 无卡顿
- [ ] 迁移完成后关闭标签页 → 重新打开 → 不再触发迁移（sessionStorage 标记）
- [ ] 迁移中途关闭标签页 → 下次打开 → 重新触发（未完成的继续）

---

## Step 16：生产构建

```bash
pnpm build
```

- [ ] 构建无报错
- [ ] `pnpm preview` 预览生产版本，基本功能正常

---

## Step 17：清理测试文件

**操作：** 删除开发过程中创建的临时文件：

```bash
# 测试页面
rm src/pages/MigrationTest.jsx
rm src/pages/ImageMigrationTest.jsx
rm src/pages/FullExtensionTest.jsx
rm src/pages/RenderMarkdownTest.jsx

# 独立测试页面
rm test-migration.html
rm test-migration-2.html
rm test-migration-3.html
rm test-migration-4.html
rm test-migration-5.html
rm test-migration-5.js

# Playwright 脚本和截图
rm screenshot.cjs
rm fetch-docs.cjs
rm migration-test-result.png
rm migration-test-viewport.png
rm migration-test-2-result.png
rm migration-test-3-result.png
rm migration-test-4-result.png
rm migration-test-5-result.png
rm migration-test-6-result.png
rm migration-test-image-result.png
rm migration-test-image-final.png
rm migration-test-retest-result.png
```

**恢复路由：** `src/router/index.jsx` 中删除 4 个测试路由（migration-test、migration-test-image、migration-test-full、migration-test-render）。

---

## Step 18：提交

```bash
git add .
git commit -m "feat: 文档存储格式迁移 Markdown→ProseMirror JSON

- 新增字体选择、文字颜色、高亮标记功能
- 新增 contentType 字段标识文档格式
- 新增静默批量迁移引擎（登录后自动转换旧文档）
- 新增 RAG 文本提取工具
- 删除 MinioImage.renderMarkdown（Markdown 序列化代码）
- 向后兼容：旧文档预览不受影响，编辑时自动升级

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## 依赖关系图

```
Step 1 (依赖安装)
  │
  ├── Step 2 (MinioImage)
  ├── Step 3 (TiptapEditor) ── 前置: Step 1
  ├── Step 8 (API 层)
  │
Step 3 完成后 ──→ Step 4 (工具栏) ──→ Step 5 (样式)
                           │
Step 3 + Step 8 ──→ Step 6 (Content) ── 可与 Step 7 并行
              ──→ Step 7 (AddContent)
                           │
Step 3 完成后 ──→ Step 9 (引擎) ──→ Step 10 (调度器) ──→ Step 11 (迁移API) ──→ Step 12 (Home触发)
                                                                    │
Step 10 完成后 ──→ Step 13 (测试面板，测试阶段专用)                │
                           │
任意顺序 ──→ Step 14 (文本工具)
                           │
全部完成 ──→ Step 15 (验证) ──→ Step 16 (构建) ──→ Step 17 (清理) ──→ Step 18 (提交)
```

---

## 工时估算

| 步骤 | 预估时间 |
|------|----------|
| Step 1-2 | 15 分钟 |
| Step 3 | 1 小时 |
| Step 4-5 | 1 小时 |
| Step 6-7 | 45 分钟 |
| Step 8 | 10 分钟 |
| Step 9-11 | 1.5 小时 |
| Step 12 | 30 分钟 |
| Step 13 (测试面板) | 1 小时 |
| Step 14 | 20 分钟 |
| Step 15 | 2 小时 |
| Step 16-18 | 30 分钟 |
| **合计** | **约 8.5 小时** |
