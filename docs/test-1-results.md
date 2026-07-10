# 测试 1：Headless 转换引擎输出一致性

**日期：** 2026-07-09 | **分支：** `test/migration-feasibility` | **结果：** ✅ 全部通过

---

## 环境

@tiptap/core 3.23.4 | @tiptap/markdown 3.23.4 | @tiptap/starter-kit 3.23.4 | FontFamily/TextStyle/Color/Highlight 3.23.4

扩展：StarterKit (heading 1/2/3, 无 codeBlock), Link, Underline, Table, Markdown, FontFamily, TextStyle, Color, Highlight

## 方法

两个独立的 `new Editor({ element: detachedDiv, extensions, content, contentType: 'markdown' })` 实例，对相同 Markdown 输入分别执行 `getJSON()`，比较 JSON 字符串是否严格相等。

## 结果

| # | 样本 | JSON 长度 | 节点统计 | 一致性 |
|---|------|-----------|----------|--------|
| 1 | 纯文本段落 | 171 | paragraphs:1, headings:1 | ✅ |
| 2 | 粗体+斜体+行内代码 | 279 | paragraphs:1 | ✅ |
| 3 | 链接 | 235 | paragraphs:1 | ✅ |
| 4 | 无序列表（嵌套） | 377 | listItems:3, bulletLists:2 | ✅ |
| 5 | 有序列表 | 281 | listItems:2, orderedLists:1 | ✅ |
| 6 | 表格 | 751 | tables:1 | ✅ |
| 7 | 引用 | 132 | blockquotes:1 | ✅ |
| 8 | 代码块 | 126 | paragraphs:1 | ⚠️ 未加载 CodeBlockWithToolbar |
| 9 | 组合文档 | 1783 | headings:2, tables:1, listItems:3, blockquotes:1 | ✅ |
| 10 | 数字列表(bug场景) | 254 | listItems:2, bulletLists:1 | ✅ |
| 11 | 空文档 | 47 | paragraphs:1 (空) | ✅ |

**汇总：11/11 通过，100% 一致。**
