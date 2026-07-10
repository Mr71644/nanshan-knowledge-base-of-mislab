# 后端变更说明 — 文档存储格式迁移

**日期：** 2026-07-10  
**目标读者：** 后端开发  
**前端分支：** 测试 `test/migration-feasibility` / 开发 `feat/storage-json-migration`

---

## 背景

前端富文本编辑器将新增字体选择、文字颜色、高亮标记等功能。当前 Markdown 存储格式无法保留这些样式信息，需要将 `status=1`（在线文档 / 富文本）的存储格式从 Markdown 迁移到 ProseMirror JSON。

涉及的 API 范围：`/text/` 路径下的三个接口。

---

## 一、数据库变更（必须）

```sql
ALTER TABLE text_table ADD COLUMN content_type VARCHAR(20) DEFAULT NULL;
-- NULL 或空 = Markdown（兼容全部现有数据）
-- 'prosemirror' = ProseMirror JSON
```

**说明：** `content` 字段依旧是 `TEXT/LONGTEXT` 字符串类型，无需改列类型。Markdown 和 JSON 都是字符串，只是内容不同。`content_type` 列仅标识格式。

---

## 二、接口变更（必须）

### 2.1 `GET /text/get/{id}` — 响应增加字段

```diff
{
  "data": {
    "title": "...",
    "author": "...",
    "content": "...",
+   "contentType": "markdown",
    "createTime": "...",
    "updateTime": "..."
  }
}
```

- 从 `content_type` 列读取
- 如果列的值为 NULL 或空，**不返回此字段**（前端遇缺失时默认按 `"markdown"` 处理）

### 2.2 `PUT /text/update` — 请求增加字段

```diff
{
  "title": "...",
  "author": "...",
  "content": "...",
+ "contentType": "prosemirror",
  "id": 123
}
```

- **仅当请求中包含 `contentType` 字段时**，才更新数据库 `content_type` 列
- 请求中不含此字段时，数据库列保持不变

### 2.3 `POST /text/add` — 请求增加字段

```diff
{
  "title": "...",
  "author": "...",
  "content": "...",
+ "contentType": "prosemirror",
  "folderId": 456
}
```

- 同上，请求含此字段时才写入

---

## 三、建议新增接口（加速迁移，非必须）

### 3.1 `GET /text/migrate-list`

**用途：** 前端静默迁移时一次性获取所有待迁移文档，避免逐文件夹递归遍历。

**SQL：**
```sql
SELECT id, content FROM text_table
WHERE status = 1 AND (content_type IS NULL OR content_type = '' OR content_type = 'markdown')
```

**响应：**
```json
{
  "data": [
    { "id": 1, "content": "# 标题\n\n正文内容..." },
    { "id": 2, "content": "## 另一篇文档\n\n..." }
  ]
}
```

只返回 `id` 和 `content` 两个字段，不需要 title、author、时间等字段，以最小化传输量。

### 3.2 `POST /text/migrate-batch`

**用途：** 前端转换完成后批量写回，减少网络请求次数。

**请求：**
```json
{
  "documents": [
    { "id": 1, "content": "{\"type\":\"doc\",\"content\":[...]}", "contentType": "prosemirror" },
    { "id": 2, "content": "{\"type\":\"doc\",\"content\":[...]}", "contentType": "prosemirror" }
  ]
}
```

**后端处理逻辑（关键）：**
```sql
-- 逐条处理，带乐观锁防并发冲突
UPDATE text_table
SET content = ?, content_type = 'prosemirror'
WHERE id = ? AND (content_type IS NULL OR content_type = '' OR content_type = 'markdown')
```

- 如果某文档在迁移过程中被用户编辑并保存为新格式，WHERE 条件不命中，该文档不更新
- 统计成功/失败数量

**响应：**
```json
{
  "data": { "success": 9, "failed": 1 }
}
```

### 3.3 降级方案

如果 3.1 和 3.2 不实现，前端会用现有接口逐文档处理：
1. 调 `POST /home/get` 递归遍历所有文件夹收集 `status=1` 的文档 ID
2. 逐文档调 `GET /text/get/{id}` 获取 Markdown
3. 前端转换
4. 逐文档调 `PUT /text/update` 写回

约 N×2 次 HTTP 请求，慢但可用。建议至少实现 3.1（合并列表）以减少请求次数。

---

## 四、不需变更的部分

| API | 原因 |
|-----|------|
| `POST /minio/upload/markdown` | 图片引用 `minio:文件ID` 格式不变 |
| `GET /minio/preview/markdown/{id}` | 同上 |
| `DELETE /text/delete/{id}` | 删除操作与 content 格式无关 |
| `POST /home/get` | 文件列表不返回 content 字段 |
| `/excel/` 全部接口 | Excel 存储不变，本次不涉及 |
| `/user/` `/role/` `/folder/` 全部接口 | 本次不涉及 |

---

## 五、兼容性保证

| 场景 | 行为 |
|------|------|
| 旧前端 + 旧文档 | 正常（无 contentType 字段） |
| 旧前端 + 新文档 | 旧前端无法解析 JSON 内容 → 需避免此场景 |
| 新前端 + 旧文档 | 正常（默认按 Markdown 处理） |
| 新前端 + 新文档 | 正常 |

**避免旧前端遇到新文档的措施：** 数据库 `content_type` 列默认为 NULL，只有新前端保存时才写入值。在确认所有用户都使用新版前端之前，不要批量修改已有数据的 `content_type`。

---

## 六、全文搜索影响（如有）

如果对 `content` 字段做了 MySQL 全文索引：JSON 格式的 content 中仍包含所有文本（在 `"text"` 键值中），关键词搜索基本不受影响。但 JSON 转义字符（如 `\"`）可能会被索引，建议验证一下搜索结果的准确性。

---

## 七、总结

| 优先级 | 工作内容 | 工作量 |
|--------|----------|--------|
| **必须** | 数据库加 `content_type` 列 | 一条 DDL |
| **必须** | 3 个 `/text/` 接口加 `contentType` 字段 | 字段透传 + 条件写入 |
| **建议** | `GET /text/migrate-list` | 一个新查询接口 |
| **建议** | `POST /text/migrate-batch` | 一个批量更新接口 |

如果只做必须项，前端可以正常工作（通过现有接口逐文档迁移）。两个建议接口可以显著减少网络开销。
