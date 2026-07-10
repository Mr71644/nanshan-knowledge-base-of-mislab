# 测试 3：字体/颜色/高亮扩展端到端验证

**日期：** 2026-07-10 | **分支：** `test/migration-feasibility` | **结果：** ✅ 全部通过

---

## 测试目标

验证 `Editor.create`（离屏 DOM）结合 FontFamily/TextStyle/Color/Highlight 扩展能否：
1. 正确设置字体、文字颜色、高亮样式
2. JSON 重载后样式完整保留（往返无损）
3. JSON 保留了 Markdown 无法表示的样式信息

## 方法

- 创建 `Editor.create` 实例 → 通过 `chain().setFontFamily()/setColor()/toggleHighlight()` 设置样式 → `getJSON()` → 检查 marks
- 取上一步的 JSON → 创建第二个 `Editor.create` 实例加载 → `getJSON()` → 对比两次 JSON 是否一致
- 对比 Editor 和 Markdown 两种序列化方式：JSON 是否保留了 Markdown 丢失的样式

## 阶段 A：样式设置 → JSON marks

| # | 场景 | 核心检查 | 结果 |
|---|------|----------|------|
| 1 | 字体=宋体 | textStyle mark → fontFamily: "SimSun" | ✅ |
| 2 | 颜色=红色 | textStyle mark → color: "#FF0000" | ✅ |
| 3 | 高亮=黄色 | highlight mark → color: "#FFFF00" | ✅ |
| 4 | 宋体+红色+高亮叠加 | textStyle(fontFamily+color) + highlight 共存 | ✅ |
| 5 | 前3字红后3字蓝 | 文本被拆为2个节点，各带不同 color | ✅ |
| 6 | 设字体后取消 | marks 数组为空 | ✅ |

**阶段 A：6/6 通过。**

## 阶段 B：JSON 重载 → 样式保留

每个场景的 JSON 被第二个 Editor 实例加载后，`getJSON()` 输出与原 JSON **逐字符完全一致**，长度完全相等。

| # | 场景 | JSON1 | JSON2 | 结果 |
|---|------|-------|-------|------|
| 1 | 字体=宋体 | 165 | 165 | ✅ 完全一致 |
| 2 | 颜色=红色 | 166 | 166 | ✅ 完全一致 |
| 3 | 高亮=黄色 | 148 | 148 | ✅ 完全一致 |
| 4 | 叠加样式 | 221 | 221 | ✅ 完全一致 |
| 5 | 部分文字样式 | 269 | 269 | ✅ 完全一致 |
| 6 | 取消样式 | 90 | 90 | ✅ 完全一致 |

**阶段 B：6/6 JSON 重载后样式完整保留。**

## 阶段 C：与 Markdown 对比

| # | 场景 | JSON 保留 | Markdown 保留 | 结论 |
|---|------|-----------|---------------|------|
| 1 | 字体=宋体 | ✅ textStyle(fontFamily:SimSun) | ❌ 丢失 | ✅ |
| 2 | 颜色=红色 | ✅ textStyle(color:#FF0000) | ❌ 丢失 | ✅ |
| 3 | 高亮=黄色 | ✅ highlight(color:#FFFF00) | ❌ 丢失 | ✅ |
| 4 | 宋体+红色+高亮 | ✅ textStyle + highlight | ❌ 丢失 | ✅ |

**阶段 C：4/4 JSON 保留、Markdown 丢失 — 这就是迁移到 JSON 的核心理由。**

## 观察

1. **textStyle mark 同时包含 fontFamily 和 color 两个属性** — 即使只设置了一个，另一个为 null。这是 TextStyle 扩展的标准行为，解析和重载都正确处理。

2. **highlight 是独立 mark 类型**，不与 textStyle 合并。同一段文字可以同时拥有 textStyle 和 highlight 两个 marks，叠加工作正常。

3. **部分文字样式**导致 ProseMirror 将一个 paragraph 的 content 拆分为多个 text 节点，每个携带自己的 marks。Editor.create 的 JSON 重载完全保持了这种拆分。

## 结论

✅ 字体、颜色、高亮三种样式在 Editor.create（离屏 DOM）中均可正确设置、序列化为 JSON、重载后恢复。这与迁移引擎的工作方式完全一致。迁移到 JSON 后这些样式获得原生支持，而 Markdown 无法保留——验证了格式切换的根本动机。
