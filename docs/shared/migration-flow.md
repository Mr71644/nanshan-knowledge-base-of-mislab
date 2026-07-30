# 文档存储格式迁移流程

当前迁移采用 **"静默批量迁移（主路径）+ 懒迁移（兜底）"** 双层保障机制：

```mermaid
flowchart TD
    subgraph 入口["👤 用户登录触发"]
        A["用户登录成功<br/>Home 页 mount"] --> B["runSilentMigration()<br/>（非阻塞，不 await）"]
    end

    subgraph 防重["🛡️ 防重复检查"]
        B --> C{"sessionStorage<br/>migration_completed<br/>已标记？"}
        C -->|"✅ 是（本次会话已完成）"| END["跳过，静默结束"]
        C -->|"❌ 否"| D["GET /text/migrate-list"]
    end

    subgraph 查询["📋 查询待迁移文档"]
        D --> E{"后端返回<br/>待迁移列表"}
        E -->|"空列表 | 请求失败"| F["标记 migration_completed ✅<br/>静默结束"]
        E -->|"有文档 [{id, content}, ...]"| G["进入分批处理循环<br/>BATCH_SIZE = 10"]
    end

    subgraph 转换批次["🔄 按批次转换"]
        G --> H["requestIdleCallback<br/>每批 10 个文档"]
        H --> I["convertMarkdownToJSON()"]
        I --> J{"单文档转换"}
        J -->|"✅ 成功"| K["加入 documents 数组<br/>{id, content, contentType:'prosemirror'}"]
        J -->|"❌ 失败"| L["console.error 记录<br/>跳过该文档（懒迁移兜底）"]
        K --> M{"本批转换完毕"}
        L --> M
    end

    subgraph 写回["💾 批量写回"]
        M --> N{"documents 数组<br/>有数据？"}
        N -->|"✅ 有"| O["POST /text/migrate-batch<br/>{ documents: [...] }"]
        N -->|"空（本批全部失败）"| P["跳过写回"]
        O --> Q{"写回结果"}
        Q -->|"成功"| P
        Q -->|"失败"| R["重试 1 次"]
        R -->|"仍失败"| S["console.warn<br/>跳过该批次"]
        R -->|"成功"| P
        S --> P
        P --> T{"还有未处理的文档？"}
        T -->|"✅ 有"| H
        T -->|"❌ 无（全部完成）"| U["标记 migration_completed ✅"]
    end

    subgraph 懒迁移["🦥 懒迁移兜底机制"]
        V["用户打开旧文档"] --> W["预览模式：Markdown 扩展<br/>正常渲染，不转换格式"]
        V --> X["用户点击「编辑文档」"]
        X --> Y["编辑器以 Markdown 加载"]
        Y --> Z["用户修改 → 保存"]
        Z --> AA["onChange 触发<br/>contentType 自动变为 'prosemirror'"]
        AA --> AB["PUT /text/update<br/>content: JSON, contentType: 'prosemirror'"]
        AB --> AC["文档格式已升级 ✅<br/>下次打开直接以 JSON 加载"]
    end

    subgraph 后端保护["🔒 后端乐观锁保护"]
        AD["POST /text/migrate-batch<br/>逐条执行："] --> AE["UPDATE text_table<br/>SET content=?, content_type='prosemirror'<br/>WHERE id=? AND content_type IS NULL"]
        AE --> AF{"content_type 已经是<br/>'prosemirror'？"}
        AF -->|"是（已被其他人迁移）"| AG["affected rows = 0<br/>自动跳过，不计入 success"]
        AF -->|"否（首次迁移）"| AH["更新成功<br/>计入 success 计数"]
    end

    U -.-> V
    L -.-> V

    style A fill:#d4a84c,color:#fff
    style END fill:#52c41a,color:#fff
    style F fill:#52c41a,color:#fff
    style U fill:#52c41a,color:#fff
    style AC fill:#52c41a,color:#fff
    style L fill:#fa8c16,color:#fff
    style S fill:#fa8c16,color:#fff
    style AG fill:#1677ff,color:#fff
    style AB fill:#722ed1,color:#fff
```

## 两条路径对比

```mermaid
flowchart LR
    subgraph 路径1["路径 1：静默批量迁移（主路径）"]
        direction TB
        P1_1["🕐 触发时机"] --> P1_2["用户登录后自动触发<br/>不阻塞页面操作"]
        P1_2 --> P1_3["requestIdleCallback<br/>浏览器空闲时分批执行"]
        P1_3 --> P1_4["BATCH_SIZE=10<br/>每批 ~130ms 转换"]
        P1_4 --> P1_5["批量 POST 写回<br/>后端乐观锁防并发"]
        P1_5 --> P1_6["sessionStorage 标记完成<br/>同会话不再触发"]
    end

    subgraph 路径2["路径 2：懒迁移（兜底）"]
        direction TB
        P2_1["🕐 触发时机"] --> P2_2["用户手动编辑旧文档"]
        P2_2 --> P2_3["编辑器以 Markdown 加载"]
        P2_3 --> P2_4["用户修改 + 保存"]
        P2_4 --> P2_5["onChange 输出 JSON<br/>contentType → 'prosemirror'"]
        P2_5 --> P2_6["单个文档即时升级<br/>下次自动以 JSON 加载"]
    end

    style P1_1 fill:#d4a84c,color:#fff
    style P2_1 fill:#d4a84c,color:#fff
```

## 关键时间节点

| 节点 | 行为 | 用户感知 |
|------|------|----------|
| 登录瞬间 | `runSilentMigration()` 启动 | **无感知** |
| 空闲时段 | 批次转换 + 写回 | **无感知** |
| 迁移中编辑同一文档 | 后端乐观锁跳过迁移 | **无感知**（懒迁移兜底） |
| 编辑任意旧文档 | 保存时自动升级为 JSON | **正常操作** |
| 新建文档 | 直接以 JSON 存储 | **正常操作** |
| 全部迁移完成 | `migration_completed` 标记 | **无感知** |
