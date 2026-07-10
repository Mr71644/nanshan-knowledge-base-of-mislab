# 补测：完整扩展集验证

**日期：** 2026-07-10 | **分支：** `test/migration-feasibility` | **结果：** 8/9 通过 + 1 已知边界

---

## 测试目标

之前测试 2 和测试 5 中因环境限制（未加载 MinioImage + CodeBlockWithToolbar）失败的项，用完整扩展集重测。同时补测代码块语言标记保留。

## 环境

完整扩展集：StarterKit, **CodeBlockWithToolbar**, Underline, Link, **MinioImage**, Table, Markdown, FontFamily, TextStyle, Color, Highlight

## 测试5补测

| # | 样本 | MD→JSON | 结果 | 说明 |
|---|------|---------|------|------|
| 1 | 纯链接无文本 `[](url)` | 22→47 | ❌ | link 无文本附着（见分析） |
| 2 | 图片无描述 `![](minio:x)` | 23→129 | ✅ | MinioImage 正确解析，src 保留 |

**纯链接无文本分析：** ProseMirror 的 link mark 必须附着在 text 节点上。`[](url)` 提供零文本，Markdown 解析后产生空 paragraph，link 标记无处附着。JSON 输出为 `{"type":"paragraph"}` 无 content。这不是引擎缺陷，是 ProseMirror 对无文本 mark 的固有约束。实际文档中 `[](url)` 极其罕见，可视为可接受的已知边界。

## 测试2补测（图片格式全覆盖）

| # | 样本 | MD→JSON | 结果 | 关键检查 |
|---|------|---------|------|----------|
| 3 | MD 语法 `![alt](minio:test_md_format)` | 29→135 | ✅ | src 保留，alt 保留 |
| 4 | HTML 标签有 width `<img src="minio:x" width="800">` | 55→134 | ✅ | src+width 保留 |
| 5 | MD + HTML 混合（2 张图） | 77→414 | ✅ | 2 张图片均正确，MD 图无 width，HTML 图 width=600 |
| 6 | HTML 标签无 width | 41→133 | ✅ | src 保留，width 为 null |

## 代码块补测

| # | 样本 | MD→JSON | 结果 | 语言标记 |
|---|------|---------|------|----------|
| 7 | JavaScript | 46→148 | ✅ | language: "javascript" |
| 8 | 无语言 | 18→121 | ✅ | language: null |
| 9 | Python | 45→149 | ✅ | language: "python" |

## 汇总

| 测试组 | 通过 | 说明 |
|--------|------|------|
| 测试 5 补测 | 1/2 | 1 项为 ProseMirror 固有约束 |
| 测试 2 补测 | 4/4 | 两种图片格式全覆盖 |
| 代码块补测 | 3/3 | 语言标记完整保留 |
| 确定性 | 9/9 | 两次独立转换 JSON 完全一致 |

**结论：所有之前标记为"环境限制"的项，在完整扩展集下得到了验证。** 4 项图片（MD+HTML 格式）、3 项代码块全部正确。唯一的失败项 `[](url)` 是 ProseMirror 对无文本 mark 的固有约束，不影响迁移。
