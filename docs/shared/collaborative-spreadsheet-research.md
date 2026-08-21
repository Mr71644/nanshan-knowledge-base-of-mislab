# 多人在线协同编辑表格：行业主流实现方案调研报告

> 调研时间：2026-08。资料来源为 2024–2026 公开技术博客、官方文档、开源仓库。各厂商公开程度差异大，凡无法确证处均已标注。
>
> 背景：本项目（MISLab 知识库）当前 Excel 编辑为纯单机模式——`getExcelDetail` 拉全量 workbook JSON 加载、手动保存时 `workbook.save()` 整份 PUT 回后端，无任何并发控制（后保存者覆盖先保存者）。本报告为行业知识梳理，供后续技术选型参考。

## 目录

- [一、总览：三大技术流派](#一总览三大技术流派)
- [二、OT（Operational Transformation）—— 行业主流](#二otoperational-transformation--行业主流)
- [三、CRDT —— 天然去中心化，但表格领域尚不成熟](#三crdt--天然去中心化但表格领域尚不成熟)
- [四、悲观锁 —— 最简方案，MVP 首选](#四悲观锁--最简方案mvp-首选)
- [五、消息通道与服务端架构（跨方案通用）](#五消息通道与服务端架构跨方案通用)
- [六、Presence（在线状态与协同光标）](#六presence在线状态与协同光标)
- [七、断线重连与离线编辑](#七断线重连与离线编辑)
- [八、鉴权与安全](#八鉴权与安全)
- [九、各产品实现对照](#九各产品实现对照)
- [十、一个典型全栈实现长什么样（OT 方案的完整拼图）](#十一个典型全栈实现长什么样ot-方案的完整拼图)
- [十一、结论](#十一结论)
- [附录：主要参考来源](#附录主要参考来源)

## 一、总览：三大技术流派

| 维度 | **OT**（操作变换） | **CRDT**（无冲突复制数据类型） | **悲观锁**（单元格/区域锁） |
|---|---|---|---|
| 一致性保证 | 服务器全序 + transform，收敛可证 | 强最终一致（数学保证，任意顺序合并收敛） | 互斥一致（根本不允许并发写） |
| 冲突解决 | 服务端/客户端 transform 函数 | 数据结构自带合并语义 | 不解决，直接阻止 |
| 离线支持 | 弱（必须回服务器重放） | 天然支持（local-first 卖点） | 无 |
| 前端复杂度 | 高（状态机、补拉、重发） | 中（库封装好，需建模） | 低（presence + 只读态） |
| 服务端复杂度 | 高（参与 transform、存全量 op） | 极低（可退化为纯中继） | 低（Redis 锁表 + 心跳） |
| 元数据开销 | 小 | 大（每元素 ID/tombstone） | 小 |
| 表格领域验证 | 充分（Google/腾讯/飞书/WPS/Univer/AITable） | 少（Figma/Linear 是图形/清单，非表格） | 腾讯文档早期、大量自研项目 |
| 代表 | Google Docs、腾讯文档、飞书、Univer、OnlyOffice、AITable | Figma、Linear、Notion（实验）、Yjs 生态 | 腾讯文档早期、Excel Online 保护范围（静态）、自研 Luckysheet 项目 |

**行业格局**：在线表格领域可确证的主流方案是 **OT**（Google/腾讯/飞书/Univer/AITable/OnlyOffice 全部是或高度疑似 OT）；CRDT 在文本/图形编辑器（Figma、TipTap）领域成功但在表格领域缺乏大规模生产验证；悲观锁是实现成本最低的 MVP 路线，常见于自研项目和"软锁 + presence"的辅助形态。

## 二、OT（Operational Transformation）—— 行业主流

### 2.1 核心原理

把编辑建模为**原子操作（Operation）**，以 Univer 的 op 为例：

```js
// 在 B 列前插一列
{ type: 'insertCol', coord: { col: 1 }, params: { count: 1 }, baseRevision: 12, revision: 10086 }
// 往单元格写内容
{ type: 'insertCell', coord: { row: 1, col: 2 }, params: { content: 'text' } }
```

- `baseRevision`：客户端基于的版本号（**只能客户端填**）
- `revision`：全局唯一单调递增序号（**只能服务器分配**），形成全序
- 同一组 op 以不同顺序应用结果不同（不满足交换律），所以需要 **transform 函数**：对基于同一版本的两个并发 op `a`、`b`，求出 `a'`、`b'` 使 `a·b'` 与 `b·a'` 结果完全一致（收敛）且保留用户意图。经典例子：Alice 在 C2 输入文字、Bob 同时在 B 列前插一列 → transform 把 Alice 的 op 坐标改写为 D2。
- n 种原子 op 需要 O(n²) 量级的 transform 方法对——这是 OT 的主要工程成本。
- 理论基础：Google Wave/Jupiter 系 client/server OT、ShareJS/ot.js 开源实现；CKEditor 5 的生产实现也用 OT。

### 2.2 前端实现（乐观 UI + 状态机）

1. **本地立即应用**：用户改单元格后本地立刻生效，同时把 op（带 `baseRevision`）发往服务器，进入等待 ACK 状态——乐观并发控制。
2. **收到远端 op**：
   - 若远端 `revision` > 本地 revision + 1 → 漏包，先向服务器 **fetch miss**（拉取中间区间的 op 补齐）；
   - 若本地有未 ACK 的 pending op → 远端 op 必须先对 pending op 做 transform 再应用。
3. **收到 ACK** → 本地 revision 对齐服务器分配的 revision。
4. **状态机**：Univer 客户端是 7 态状态机——`Synced / Pending / Awaiting / AwaitingWithPending / FetchMiss / Offline / Conflict`。
5. **工程配套**（这部分是产品级与 demo 的差距所在）：
   - **op 合并为 changeset**：连续输入合并、批量写入打包，多个 op 封装成一个 changeset 作为 revision 单位（Univer 的 `sendChangesetTimeout: 200` 即发送节流）；
   - **每个 op 全局唯一 ID**：超时未 ACK 重发，服务器按 ID 去重（幂等）；
   - **离线缓存**：区分"已发出未 ACK"与"未发出"两种 changeset，断网本地缓存、恢复后重发；
   - **Undo/Redo 栈也要 transform**：远端 op 到达时对本地的 undo 栈做变换（Alice undo 时应清空 D2 而非 C2），Univer 通过 DI 把 `LocalUndoRedoService` 替换为 `CollaborationUndoRedoService`；
   - **协同光标随结构变换**：B 列被删则 C1 光标本地移到 B1，不额外广播；上报做节流。

### 2.3 后端实现（中心化协调服务器）

以 Univer 官方博客的三副本（A/B/C）流程为例：

1. A 的 op `a` 到达，`baseRevision` == 服务器最新 revision → 直接 apply，分配 `a.revision = 13`，向 A 回 ACK，把 `a` 广播给 B、C；
2. B 的 op `b` 到达时服务器 revision 已是 13（b 的 baseRevision 落后）→ **服务器先在服务端做 transform 得 `b'`**，apply 后分配 `revision = 14`，向 B 回 ACK，**广播的是 `b'` 而非 `b`**——其他客户端无需关心 b 的旧 baseRevision，直接应用即可。

其他要点：

- 服务器保存**全部历史 op** 用于版本回放，定期打快照加速；
- **不可解冲突兜底**（A 删 sheet、B 同时编辑该 sheet）：直接丢弃会丢数据，进入 `Conflict` 态、断开协同、保留上下文让用户手动处理；
- Univer 后端把 OT 算法做成**同构 JS**（`@univerjs-pro/collaboration` 服务端也跑同一套 transform 代码），文档类型通过 `TransformService` 注册各自的 transform 方法。

### 2.4 为什么表格产品选 OT

1. 服务端中心化协调天然利于**权限控制、审计、全局唯一修订历史**（企业刚需）；
2. 表格的意图保留可**逐案精调** transform（行列插入的坐标变换精确可控）；
3. 无 CRDT 的 tombstone/ID 膨胀问题——大表格（百万单元格）下这点很关键；
4. 学术界 20+ 年验证 + Google Wave/Jupiter 工程先例。

缺点：transform 矩阵 O(n²) 实现与测试成本高；必须有中心服务器；通用 OT 存在 TP2 不收敛问题（产品靠限制 op 类型绕过）。

### 2.5 代表产品

Google Docs（经典案例）、腾讯文档、飞书文档、WPS 365、Univer、OnlyOffice、AITable/APITable、CKEditor 5、ShareJS/ot.js（开源鼻祖）。

## 三、CRDT —— 天然去中心化，但表格领域尚不成熟

### 3.1 核心原理（以 Yjs/YATA 为例）

- 每个插入元素带全局唯一 ID `(clientID, clock)`（clock 是 Lamport 计数器）；
- 文本是链表，每个节点记录插入时的 left/right origin，并发插入同位置时按 `(clientID, clock)` 确定性排序——所有副本得到同一顺序；
- **删除即 tombstone**（墓碑）：物理不删只标记，等所有 peer 都见到后可 GC；
- **state vector**：记录"每个 client 的下一个期望 clock"，同步时只传对方缺失的增量二进制 update。

**表格建模惯例**（社区实践 + Sypytkowski 的 crdt-table PoC）：

- 行/列是**有序列表**，用 **LSeq/RGA 分数索引**定位（在两个相邻 key 之间取中点生成新 key，任意副本并发插入也得到稳定全序）——**绝不能用整数 index**，index 在并发插入/删除下语义不稳定；
- 单元格用 `Y.Map<rowKey, Y.Map<colKey, value>>`，每个 cell 独立 LWW（last-write-wins）寄存器，天然规避单元格内冲突。

### 3.2 前后端职责划分

- **前端承担几乎全部合并逻辑**：本地改 `Y.Map`/`Y.Array` → 产生二进制 update → 经 provider 发出；收到远端 update `Y.applyUpdate` 自动整合；`Y.observe` 驱动渲染。
- **后端可以只是中继**：y-websocket / Hocuspocus / Liveblocks / PartyKit 只做"转发给房间内其他人 + 持久化快照 + 鉴权"，**不理解、不 transform 任何内容**。甚至可以无服务器（y-webrtc P2P）。
- 同步协议：双方互发 state vector → 各自只回对方缺失的 update（增量合并，离线 2 小时 500 条编辑也能增量同步）。

### 3.3 为什么表格领域少见 CRDT

Univer 官方放弃 CRDT 的两个理由代表了行业判断：

1. **元数据膨胀**：每个字符/单元格/行列都带 ID 和链表指针，删除留 tombstone，大网格下存储与内存开销大；
2. **意图保留不可控**：行列插入用分数键后"意图"退化为"键序"，无法像 OT 逐案精调；表格领域 CRDT 尚无大规模生产验证。

### 3.4 代表产品

Figma（自有变体，其官方分享是 OT vs CRDT 权衡的经典材料）、Linear（local-first）、Liveblocks/TinyBase/Convergence、luckysheet-crdt（社区项目）、y-prosemirror / y-codemirror / TipTap Collab（编辑器侧生态）。

## 四、悲观锁 —— 最简方案，MVP 首选

### 4.1 原理

编辑前先锁：进入单元格/区域编辑态前向服务器申请锁，拿到才能写，其他人看到"XX 正在编辑"。一致性靠互斥而非算法。

**行业真相**：主流表格产品对外暴露的多是**权限型静态锁**（工作表保护/允许编辑区域——Excel Online 沿用桌面端 Protect Sheet 机制，飞书有"设置保护范围"），而实时编辑层已普遍转向 OT/CRDT。真正运行时"编辑锁 + 正在编辑提示"多见于表单/数据库类产品和自研项目。常见折中是**软锁（advisory lock）+ presence**：锁只做提示与前端拦截，底层由 LWW 兜底。

### 4.2 前端实现

1. 双击/聚焦单元格 → 发 `lock.acquire`；
2. 成功进编辑态；失败显示占用者头像气泡、单元格只读；
3. 编辑期间每 ~3s 心跳续租；
4. 提交/离开 → `lock.release`；浏览器关闭用 `beforeunload` beacon 兜底；
5. 监听服务器广播的 `lock.changed/released` 实时更新 UI；锁被抢后处理"编辑到一半"边界。

### 4.3 后端实现

- **Redis 锁表**：`lock:{docId}:{sheetId}:{cellKey}` → `{userId, lockTs, ttl}`；
- **TTL + 心跳续租**：TTL ≈ 2–3 个心跳周期（如 10s），崩溃客户端的锁自动过期；续租校验持有者 ID 防误续；
- **区域锁（range lock）**：合并相邻被锁单元格，新申请与已锁区域相交即冲突，减少锁数量；
- **多节点部署**：锁变更与 presence 经 Redis Pub/Sub 广播。

协议消息示例：

```
C→S:  {type:"lock.acquire", docId, range:{r1,c1,r2,c2}, reqId}
S→C:  {type:"lock.granted"|"lock.denied", owner}
广播:  {type:"lock.changed", range, owner, ttl} / {type:"lock.released", range}
心跳:  {type:"lock.renew"} → {type:"lock.renewed", ttl}
```

## 五、消息通道与服务端架构（跨方案通用）

### 5.1 通道选型

**WebSocket 是协同编辑的事实标准**，理由：

| 通道 | 方向 | 二进制支持 | 协同场景适配度 |
|---|---|---|---|
| Long-polling | 伪双向 | 差 | 遗留降级方案，基本淘汰 |
| SSE | 单向（服务端→客户端） | 无原生二进制 | 只能做下行变更流，上行需另开 HTTP 通道 |
| **WebSocket** | 全双工 | 原生支持 | **事实标准** |
| WebTransport (HTTP/3) | 多向多流 | 好 | 前瞻选项，支持仍在成熟中 |

1. 协同是对称高频双向流（客户端持续上行 op、服务端持续下行广播），SSE 单向模型需要双通道反而复杂；
2. op 载荷常为二进制（CRDT update / protobuf），WebSocket 原生二进制帧；
3. 单条长连接复用承载 op 同步、presence、光标、心跳；
4. 延迟低且稳定，适合 P99 敏感的键入级交互。

Univer 用**混合通道**：HTTP POST `/universer-api/comb` 提交 changeset（可靠、易鉴权）+ WebSocket `/comb/connect` 接收广播——值得注意的工程细节，上行走 HTTP 可天然复用现有鉴权中间件和重试语义。OnlyOffice 则全走 socket.io WebSocket。

### 5.2 服务端架构：单文档单写者（Actor 模型）

这是所有 OT/协调型方案的**铁律**：同一 docId 的所有 op 必须路由到**同一个服务端 actor**串行处理，否则文档分叉。

```
Client A ──┐
Client B ──┼──▶ LB（一致性哈希 hash(docId) 粘性路由）──▶ Node-1 [DocActor(docId=42)]
Client C ──┘                                            │ 串行 apply + 分配 seq
                                                        ▼
                                              Redis pub/sub "doc:42"
                                                        │
                              Node-2 / Node-3（订阅者，转发给自己持有的连接）
```

- **粘性路由**：负载均衡按 `hash(docId)` 一致性哈希，或注册表（docId→node 映射存 Redis）；
- **单写者串行**：actor 串行 apply 每条 op、分配全局递增 seq、再广播——服务端天然成为单一事实源与排序器；
- **水平扩展前提是状态外置**：actor 内存态只是缓存，权威数据 = 最新 snapshot + op log（持久化在 DB）。节点宕机 → 一致性哈希把文档重新分给新节点 → 新节点从存储加载 snapshot + 回放 log 重建内存态 → 客户端断线重连补拉增量；
- 云原生等价物：Cloudflare Durable Objects / Orleans grains 提供框架级"每文档单实例 + 自动激活/迁移"；
- **Redis pub/sub 的坑**：Redis Cluster 的 pub/sub 会广播到集群所有节点，大集群下是瓶颈 → 需要可靠投递/回放时改用 **Redis Streams**。

Univer 的服务端组件划分（商业 Pro，Go + JS 双语言）：

| 服务 | 职责 |
|---|---|
| `collaboration-server` | 协同编辑引擎（JS 同构 OT），**有状态**，universer 做一致性哈希路由 |
| `collaboration-helper` | CPU 密集异步任务（快照生成） |
| `universer` | 文档操作入口、协同消息广播 |
| `exchange worker` | 导入/导出计算 |

基础设施：RDS（PostgreSQL/MySQL，元数据+权限）+ S3 兼容对象存储（快照/数据块）+ Redis（协作者缓存、限流）+ **RabbitMQ（跨实例协同消息广播总线）** + Temporal（导入导出工作流）。v0.15.0 引入**分级协同调度**——按表格规模把 op 路由到不同 collaboration-server 集群，避免大表拖垮普通表。

### 5.3 存储：Snapshot + Operation Log 双存储

与 Raft log compaction / Kafka log compaction 同构的模式：

- **op log**：append-only，每条 `(docId, seq, clientId, op)`，是权威历史；
- **compaction**：每累计 N 条 op（或时间阈值）把当前状态序列化为新 snapshot，打上 `lastAppliedSeq` 标签，truncate 之前日志；
- **加载/重连**：最新 snapshot + `seq > snapshotSeq` 的增量 op，冷启动时间由 log 长度封顶；
- **保留策略**：常见保留最近 500–1000 条用于增量补拉与撤销，历史版本另走版本快照链；需审计则全量归档（event sourcing）。

工程选型：中小规模常用关系库——快照存 JSONB 列（或对象存储），op log 一张 append-only 表、seq 建索引。Notion 的公开数据证明了上限：分片 PostgreSQL（480 逻辑分片 × 32 物理库，shard key = workspace ID）撑到 200 亿 block。开源界 Teable/APITable（Airtable 替代）核心概念就是 **Changeset/Operation/Action/Snapshot** 四件套，数据原生存 PostgreSQL。

OnlyOffice 特殊：变更以二进制 patch 归档为 `changes.zip` 存在 Document Server 的 App_Data 目录，保存时由 C++ 转换器 **x2t** 把 changes 合并编译进内部格式。

## 六、Presence（在线状态与协同光标）

代表协议是 **Yjs Awareness**，也是行业事实标准（OT 产品用等价物）：

- 每个客户端维护临时状态 map（光标位置、选区、用户名/颜色），变化时**立即全量广播本地状态**；
- **不持久化**：presence 是 ephemeral 数据，只在内存/连接级传播，不进 op log；
- **~3 秒心跳**重播本地 state 作为存活信号；**~30 秒**无更新即过期并广播 remove，远端光标消失；
- 断线重连 presence **不补拉**——重连后重发一份当前 state 即可；需要补拉的是**文档数据**（OT 用 last-seq，CRDT 用 state vector diff）。

## 七、断线重连与离线编辑

**重连补拉（catch-up）两条路线**：

- OT/线性日志：客户端带 `lastSeenSeq`，服务端回放之后的 op（"log catch-up"）；
- CRDT：双方交换 state vector，各自只发对方缺失的 causal updates。

**离线编辑的两种哲学**（这是 OT 与 CRDT 的根本分野）：

1. **离线也能编辑 = CRDT**：合并语义内建于数据结构，无中心也收敛；
2. **在线才能编辑 = OT/锁**：依赖中心服务器变换排序——Google Docs、飞书、腾讯文档、Airtable（官方明确不支持离线编辑）都在此列。

客户端本地队列：断线期间编辑进本地队列（内存或 IndexedDB——Yjs 生态常用 IndexedDB 持久化离线状态），重连后统一上送。

## 八、鉴权与安全

**WebSocket 握手鉴权**三方式（浏览器 WS API 不能自定义 header，这是根本约束）：

| 方式 | 评价 |
|---|---|
| URL query 带 token | 最简单，升级前即可拒绝；但 token 泄漏进访问/代理日志 |
| 连接后首条消息鉴权 | websockets.py 官方称"完全可靠且最安全"；需超时踢出未认证连接 |
| Cookie/session | 复用标准 HTTP 头；跨域受限、浏览器专用 |

**每个 op 的细粒度校验**：握手鉴权只解决"你是谁"；通行做法是服务端对**每条上行 op 做授权检查**——表格类需细到**单元格范围/工作表/视图级**（owner 节点 apply 前校验 op 修改的行列区间是否落在该用户权限区间内，越权拒绝）。Univer 有对应的权限 Facade：`fWorkbook.getWorkbookPermission().setCollaborators()`、`fRange.getRangePermission().protect({allowedUsers})`。

## 九、各产品实现对照

| 产品 | 协同算法 | 粒度 | 服务端形态 | 存储 | 公开程度 |
|---|---|---|---|---|---|
| **Google Sheets** | OT（Wave 血统，公认） | 单元格/区域 op（抓包推测） | 中央 sequencer | 未公开 | 推测为主 |
| **腾讯文档** | OT（多方佐证） | 未公开 | WebSocket + Protobuf | 未公开 | 二手 |
| **飞书 Sheet** | OT（第三方分析） | 未公开 | 未公开 | snapshot+oplog 传闻 | 二手 |
| **Excel Online** | **merge-based**（官方确认 2017 年从文件锁模型迁移） | transition/merge 单元 | SharePoint/OneDrive + Office Online Server | 未公开 | 演进可证、细节未公开 |
| **WPS 365** | 宣称"OT 与 CRDT 融合"（营销口径） | 未公开 | 未公开 | 未公开 | 宣传口径 |
| **Airtable** | 私有（推测服务端权威+LWW） | 未公开 | WebSocket（可观察） | 未公开 | 少量一手 |
| **AITable/vika** | **OT (json0)，源码开源** | 记录/字段级 JSON op | `room-server`（房间管理、socket、op 全序化广播） | op log + snapshot | ★★★ 源码可查 |
| **Univer** | **OT（mutation+changeset）**，官方博客详解 | mutation | universer + collaboration-server（Go/JS 同构、一致性哈希）+ RabbitMQ 广播 | RDS + S3 快照 + Redis | 客户端开源、服务端商业 |
| **OnlyOffice** | 自研 OT（x2t 二进制 changes） | 二进制 patch | DocService + spellchecker + x2t converter + broker | changes.zip + 集成方存储 | 服务端 AGPL 开源，回调 API 文档完备 |
| **EtherCalc** | **非 OT**：append-only 编辑日志 + 实时广播 | 单元格 | Node.js；新版 Cloudflare Workers + Durable Objects | Redis 协议子集（可重放全历史） | 全开源 |
| **Luckysheet** | **无**（操作转发） | op 如 `ctlSaveCellData` | 无官方，社区自建 | 自定 | 已停维护 |
| **AG Grid / Handsontable** | 无内置协同 | — | 需自叠 Yjs/ShareDB/Ably | — | 社区模式 |

值得注意的两个"非主流但真实"的方案：

- **EtherCalc** 证明"编辑日志广播（无冲突处理）"也能做协同表格——本质是把并发冲突交给 LWW，适合低冲突场景；
- **OnlyOffice 的 Fast/Strict 双模式**是独特设计：Fast 模式实时字符级合并，Strict 模式段落锁定、保存后他人可见——把选择权交给用户。

### 性能指标基线（公开口径）

| 产品/系统 | 公开指标 |
|---|---|
| Univer | 压测 200 人并发编辑同一表格，协同延迟约 1.3s；官方案例称支持 200 人编辑 + 1000 人查看 |
| OnlyOffice | 社区版曾硬上限 20 连接（9.4 版取消）；单服务器实测约 200–400 活跃用户，400+ 建议 K8s |
| 腾讯文档 | 官方口径"数百人"在线协同单文档 |
| Notion | 分片 PostgreSQL 撑到 200 亿 block（分片后峰值 CPU/IOPS 从 90% 降到 20%） |
| APITable/Teable | 10 万+ 行数据下保持实时协同 |

**行业共识**：单文档并发编辑上限普遍在 **100–500 人**量级，超过后转只读直播模式；单服务器房间容量受 CPU（transform/序列化）而非内存主导。

### 补充：OnlyOffice 集成回调机制（集成方视角）

OnlyOffice 作为独立 Document Server 部署时，通过 **HTTP 回调（callbackUrl）** 与集成方存储交互，这是它与 Univer（全家桶）最大的架构差异：

- `status=1`：编辑中（每次用户连/断触发）；`status=2`：最后一个编辑者关闭后约 10 秒触发保存（回调带 `url` 供下载已编辑文档、`changesurl` 供历史版本）；`status=4`：关闭无更改；`status=6`：编辑中被强存；
- 集成方必须响应 `{"error": 0}`，否则编辑器报错；
- 强制保存：编辑器 config `forcesave: true`（保存按钮）或 REST 命令服务 `{"c":"forcesave","key":...}`。

## 十、一个典型全栈实现长什么样（OT 方案的完整拼图）

以自建一套类腾讯文档的协同表格为例，把所有部件串起来：

### 前端

1. 编辑器内核产生原子 mutation（Univer 天然如此：所有编辑都是 mutation，一套体系同时支撑 undo/redo 与协同）；
2. 协同客户端模块：mutation → 打包 changeset（节流 ~200ms）→ HTTP POST 提交（带 baseRevision + 全局唯一 opId）；
3. WebSocket 常连接接收广播：远端 op 先对本地 pending op transform 再应用；revision 跳跃则 fetch miss 补拉；
4. 7 态状态机管理 Synced/Pending/Awaiting/Offline/Conflict；
5. undo/redo 栈随远端 op transform；光标/选区本地 transform + 节流上报。

### 后端

1. WS 网关：握手鉴权（query token 或首条消息）→ 按 docId 一致性哈希粘性路由到持有该文档 actor 的节点；
2. DocActor（单写者）：串行处理 op——校验权限（单元格范围级）→ 若 baseRevision 落后先服务端 transform → apply → 分配全局 seq → ACK 提交方 → publish 到 Redis/RabbitMQ 频道 `doc:{docId}`；
3. 各节点订阅频道，转发给自己持有的连接；
4. 存储：op log append-only 写入 DB；每 N 条 op 触发异步 compaction 生成 snapshot（存对象存储）；
5. 重连恢复：客户端带 last-seq → 返回 snapshot + 增量 op；
6. presence：内存态 + 3s 心跳 + 30s 过期，不落盘。

## 十一、结论

1. **OT 是在线表格的行业主流**，Google/腾讯/飞书/WPS/Univer/OnlyOffice/AITable 全部在此阵营；服务端中心化协调换来权限/审计/意图保留，代价是 transform 矩阵的实现成本和有状态服务端。
2. **CRDT 在表格领域尚未被大规模验证**，元数据膨胀与行列意图保留是硬伤；它是 local-first/离线优先产品的选择。
3. **悲观锁是成本最低的路线**（WebSocket 广播 + Redis TTL 锁 + presence），适合快速 MVP 和低频编辑场景；行业实践常把它作为 OT 之上的"软锁"辅助。
4. **架构上殊途同归**：WebSocket 通道 + 单文档单写者 actor + snapshot/op-log 双存储 + presence 内存态——这四件套无论哪个流派都成立，差异只在"冲突怎么解"。
5. **公开可查证的完整实现**只有 AITable（OT/json0 全开源）、Univer（客户端开源+官方博客详解协议设计）、OnlyOffice（服务端 AGPL+回调 API 文档完备）、EtherCalc（全开源但无冲突处理）——网上流传的 Google "Syncpoint"、微软 "SODA/Graphite" 等名词查无一手出处，引用需谨慎。

## 附录：主要参考来源

**OT / 协同算法**

- [Univer 官方博客：The OT algorithm and Univer's Collaborative Editing Design](https://docs.univer.ai/blog/ot)（最核心一手资料，含完整协议字段、状态机、三副本 transform 时序）
- [Operational transformation — Wikipedia](https://en.wikipedia.org/wiki/Operational_transformation)
- [How Google Docs Works Behind the Scenes](https://singhajit.com/how-google-docs-works/) / [System Design Newsletter](https://newsletter.systemdesign.one/p/how-does-google-docs-work)
- [CKEditor 5 协同架构复盘](https://ckeditor.com/blog/lessons-learned-from-creating-a-rich-text-editor-with-real-time-collaboration/)
- [腾讯云：如何实现多人协作的在线文档](https://cloud.tencent.com/developer/article/1865770)

**CRDT**

- [yjs/INTERNALS.md](https://github.com/yjs/yjs/blob/main/INTERNALS.md) / [Bartosz Sypytkowski: YATA](https://www.bartoszsypytkowski.com/yata/)
- [Conflict-free Replicated Spread Sheets（LSeq 行列建模）](https://www.bartoszsypytkowski.com/crdt-tables/) + [Horusiath/crdt-table](https://github.com/Horusiath/crdt-table)
- [josephg: CRDTs go brrr](https://josephg.com/blog/crdts-go-brrr/) / [Automerge 2.0](https://automerge.org/blog/automerge-2/)

**悲观锁**

- [Pessimistic Locking for Collaboration (Cameron Bothner)](https://cameronbothner.com)
- [Safe Lease Heartbeats — Cycles](https://runcycles.io/blog/safe-agent-lease-heartbeats-remaining-ttl)

**后端架构与基础设施**

- [Ably: WebSocket Architecture Best Practices](https://ably.com/topic/websocket-architecture-best-practices)
- [Leapcell: Scaling WebSocket Services with Redis Pub/Sub](https://leapcell.io/blog/scaling-websocket-services-with-redis-pub-sub-in-node-js)
- [Notion: Sharding Postgres（Herding Elephants）](https://www.notion.com/blog/sharding-postgres-at-notion)
- [RxDB: WebSockets vs SSE vs Long-Polling vs WebRTC vs WebTransport](https://rxdb.info/articles/websockets-sse-polling-webrtc-webtransport.html)
- [ProseMirror 论坛：协同服务端指南](https://discuss.prosemirror.net/t/guide-docs-for-writing-server-code-that-enables-collaborative-editing/64)
- [crackingwalnuts: Real-Time Collaborative Editor 系统设计](https://crackingwalnuts.com/post/collaborative-editor-system-design)

**开源方案**

- [Univer Sheets Collaboration 文档](https://docs.univer.ai/guides/sheets/features/collaboration) / [Univer 生产部署](https://docs.univer.ai/guides/pro/deploy)
- [ONLYOFFICE Callback Handler API](https://api.onlyoffice.com/docs/docs-api/usage-api/callback-handler/) / [Server Configuration](https://api.onlyoffice.com/docs/docs-api/get-started/configuration/server-config/)
- [apitable/apitable](https://github.com/apitable/apitable) / [teableio/teable](https://github.com/teableio/teable)
- [AOSA: From SocialCalc to EtherCalc](https://aosabook.org/en/posa/from-socialcalc-to-ethercalc.html)
- [Luckysheet 表格操作文档](https://dream-num.github.io/LuckysheetDocs/zh/guide/operate.html)
- [Ably: AG Grid 协作示例](https://ably.com/blog/how-to-enhance-ag-grid-with-avatars-building-a-collaborative-grid-with-react-and-ably)

**性能数据**

- [Univer 协同引擎性能测试（掘金）](https://juejin.cn/post/7355439624100855843)
- [ONLYOFFICE 9.4 取消 20 连接限制（IT-Connect）](https://www.it-connect.tech/onlyoffice-docs-9-4-drops-the-20-connection-limit-and-updates-its-open-source-license/)
