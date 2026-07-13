# 统一重命名接口

## 基本信息

| 项目 | 说明 |
|------|------|
| **接口路径** | `POST /minio/rename` |
| **认证方式** | `Authorization: Bearer <token>` |
| **Content-Type** | `application/json` |

---

## 请求参数

```json
{
  "id": 123,
  "newName": "新名称",
  "type": 4
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|:--:|------|
| `id` | Integer | ✅ | 资源的数据库主键 ID |
| `newName` | String | ✅ | 新名称 |
| `type` | Integer | ❌ | 资源类型，不传则自动检测 |

### type 取值

| 值 | 类型 | 说明 |
|:--:|------|------|
| 1 | 论文 (Text) | 对应论文库中的文档 |
| 2 | 文件夹 (Folder) | 文件夹重命名，会**级联更新**所有子文件的 MinIO 路径 |
| 3 | Excel | 对应 Excel 表格资源 |
| 4 | 文件 (File) | 普通上传文件，会同步重命名 MinIO 中的实际文件 |

> **建议**：前端已知资源类型时传 `type`，避免自动检测的开销。当 `type` 不传时，后端会依次查询 text、folders、excel、file 四张表定位，同一 ID 在多个表中命中会返回错误。

---

## 各类型行为详解

### type=1 — 论文 (Text)

- **操作对象**：`text` 表，只更新 `title` 字段
- **newName 含义**：新标题，完整替换
- **MinIO 操作**：无（论文内容存在数据库，无文件对象）
- **同名校验**：同一 `folderId` 下不能有同名论文
- **权限要求**：对父文件夹有 EDIT 权限

```json
// 把论文 "关于xxx的研究" → "关于yyy的研究"
{ "id": 100, "newName": "关于yyy的研究", "type": 1 }
```

---

### type=2 — 文件夹 (Folder)

- **操作对象**：`folders` 表，更新 `name` 字段
- **newName 含义**：新文件夹名
- **级联影响**：该文件夹下所有子文件的 MinIO 路径和数据库 URL 都会同步更新
- **同名校验**：同一父文件夹下不能有同名文件夹
- **权限要求**：对目标文件夹有 EDIT 权限
- **名称长度**：不超过 500 字符

```json
// 把文件夹 "2024年" → "2025年"
{ "id": 10, "newName": "2025年", "type": 2 }
```

---

### type=3 — Excel

- **操作对象**：`excel` 表，只更新 `title` 字段
- **newName 含义**：新标题，完整替换
- **MinIO 操作**：无（Excel 的 url 字段与 title 独立，仅改显示名称）
- **同名校验**：同一 `folderId` 下不能有同名 Excel
- **权限要求**：对父文件夹有 EDIT 权限

```json
// 把 Excel "Q1报表" → "第一季度报表"
{ "id": 200, "newName": "第一季度报表", "type": 3 }
```

---

### type=4 — 文件 (File)

- **操作对象**：`file` 表 + MinIO 文件对象
- **newName 含义**：文件名（**不含扩展名**），后端自动保留原扩展名
- **MinIO 操作**：copyObject + removeObject（复制到新路径后删除旧文件）
- **同名校验**：同一文件夹下不能有同名文件（URL 级别）
- **Markdown 图片**：自动识别 Markdown 图片路径，保持目录结构不变
- **权限要求**：对父文件夹有 EDIT 权限

```json
// 把文件 "报告.pdf" → "总结报告.pdf"（只需传 "总结报告"，扩展名 .pdf 自动保留）
{ "id": 300, "newName": "总结报告", "type": 4 }
```

> ⚠️ `newName` **不要带扩展名**。原文件 `报告.pdf`，传 `"总结报告"` 结果为 `总结报告.pdf`。如果传 `"总结报告.pdf"`，结果会变成 `总结报告.pdf.pdf`。

---

## 响应格式

### 成功

```json
{
  "code": 200,
  "message": "文件重命名成功",
  "data": null
}
```

### 失败

```json
{
  "code": 500,
  "message": "文件重命名失败",
  "data": null
}
```

失败时 HTTP 状态码统一为 500，具体原因从后端日志获取（前端可配合已有的全局错误提示）。

---

## 错误场景速查

| 场景 | 后端错误信息 |
|------|------|
| `id` 为空 | `文件或文件夹ID不能为空` |
| `newName` 为空/纯空格 | `新名称不能为空` |
| type 不传，ID 在多表中都存在 | `ID在多个资源表中存在，请传入type明确资源类型` |
| type 不传，ID 查不到记录 | `未找到对应的资源` |
| type 不在 1~4 | `不支持的类型，有效类型为：1-论文, 2-文件夹, 3-Excel, 4-文件` |
| 资源不存在或已删除 | `论文不存在` / `文件夹不存在` / `Excel不存在` / `文件不存在` |
| 无 EDIT 权限 | `您没有重命名该xxx的权限` |
| 同目录下有同名（论文） | `同目录下已存在相同标题的论文` |
| 同目录下有同名（Excel） | `同目录下已存在相同标题的Excel` |
| 同目录下有同名（文件） | `文件已存在，请选择其他名称` |
| 同目录下有同名（文件夹） | `同一父文件夹下已存在相同名称的文件夹` |
| 文件夹名称超过 500 字符 | `文件夹名称长度不能超过500个字符` |

---

## 前端调用示例

### axios

```javascript
// 推荐：传入 type，明确资源类型
async function renameResource(id, newName, type) {
  try {
    const res = await axios.post('/minio/rename', {
      id,
      newName: newName.trim(),
      type
    })
    if (res.data.code === 200) {
      // 重命名成功，刷新列表
      return true
    }
  } catch (e) {
    console.error('重命名失败', e)
  }
  return false
}

// 调用
renameResource(300, '总结报告', 4)   // 文件
renameResource(100, '新论文标题', 1)   // 论文
renameResource(200, '第一季度报表', 3) // Excel
renameResource(10, '2025年', 2)       // 文件夹
```

### fetch

```javascript
async function renameResource(id, newName, type) {
  const res = await fetch('/minio/rename', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      id,
      newName: newName.trim(),
      type
    })
  })
  const data = await res.json()
  return data.code === 200
}
```

### 不传 type 的自动检测（不推荐，仅特殊场景）

```javascript
// 后端会查四张表自动判断类型，多表命中时返回错误
await fetch('/minio/rename', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({ id: 123, newName: '新名称' })
})
```

---

## 交互建议

1. **重命名输入框**：前端做 trim 处理后再提交，避免纯空格绕过非空校验
2. **文件类型 (type=4)**：输入框展示已有文件名时去掉扩展名，提交时也不带扩展名
3. **同名提示**：接口返回同名错误时，直接 toast 提示用户换一个名字
4. **权限不足**：返回无权限错误时，可以提示用户联系管理员申请 EDIT 权限
5. **文件夹重命名**：重命名后子文件路径全量变更，列表数据需全量刷新
