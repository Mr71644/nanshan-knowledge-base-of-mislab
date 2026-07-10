# 测试 6：移除 renderMarkdown 影响验证

**日期：** 2026-07-10 | **分支：** `test/migration-feasibility` | **结果：** ✅ 零崩溃，JSON 解析不受影响

---

## 测试目标

验证从 MinioImage 移除 `renderMarkdown()` 方法后：
1. JSON 解析（`getJSON()`）不受影响 — 图片 src/width/alt 完整保留
2. 无崩溃 — 加载、解析、序列化均不抛异常
3. `getMarkdown()` 退化行为 — 确认哪些功能受影响

## 方法

用 `MinioImage.extend({ renderMarkdown() { return null } })` 模拟移除后的行为，以"原始实现"为对照组，分别对 7 个场景进行对比测试。

## 结果

### renderMarkdown 已移除（return null）

| # | 场景 | JSON | getMarkdown | 状态 |
|---|------|------|-------------|------|
| 1 | MD语法图片 `![alt](minio:x)` | ✅ src+alt 保留 | `(无)` | ✅ |
| 2 | HTML标签+width `<img width="800">` | ✅ src+width 保留 | `(无)` | ✅ |
| 3 | 调整大小后图片 width=600 | ✅ src+width 保留 | `(无)` | ✅ |
| 4 | MD输出: 正常输出 | ✅ | `(无)` | ⚠️ 退化(预期) |
| 5 | HTML+width: width丢失 | ✅ | `(无)` | ⚠️ 退化(预期) |
| 6 | 多图混合 | ✅ 3张正确 | 正文(无图片) | ✅ 不崩溃 |
| 7 | 无图片文档 | ✅ | 完整输出 | ✅ 不崩溃 |

### renderMarkdown 原始实现（对照组）

| # | 场景 | JSON | getMarkdown | 状态 |
|---|------|------|-------------|------|
| 1 | MD语法图片 | ✅ | `![图片](minio:x)` | ✅ |
| 2 | HTML+width | ✅ | `<img src="minio:x" width="800">` | ✅ |
| 3 | 调整大小 | ✅ | `<img src="minio:resized" width="600">` | ✅ |
| 6 | 多图混合 | ✅ | MD+HTML 混合输出 | ✅ |
| 7 | 无图片 | ✅ | 完整输出 | ✅ |

## 核心发现

### JSON 解析 — 零影响

移除前后 JSON 输出**完全一致**（图片数量、src、width、alt 全部相同）。`renderMarkdown` 仅在 Markdown 序列化路径被调用，与 JSON 无关。

### getMarkdown 退化

`return null` 导致整个图片在 Markdown 输出中消失（显示为 `(无)`）。**正确的移除方式是完全不覆盖 `renderMarkdown` 方法**，让父类 `Image.renderMarkdown()` 的默认行为接管——输出标准 `![alt](src)` 格式。

但既然迁移后不再使用 `getMarkdown()`，两种方式都安全。

### 零崩溃

即使最极端的 `return null`，7 个场景无一崩溃。图片加载、解析、多图混合、无图片文档全部正常。

## 结论

✅ `renderMarkdown()` 移除安全。JSON 路径完全不依赖该方法。建议实现方式：删除 `renderMarkdown()` 方法体（不覆盖），让父类 Image 提供默认 Markdown 输出，保持向后兼容。
