# CRDT（Conflict-free Replicated Data Type）深度讲解
## —— 从半格数学到 Yjs 内部的完整剖析

> 本文是 [多人在线协同编辑表格调研报告](./collaborative-spreadsheet-research.md) 的 CRDT 单独深入篇，与 [OT 深度讲解](./ot-deep-dive.md) 配对。
> 覆盖两条线：**算法原理（手推级）**——SEC 与半格数学、文本 CRDT 算法族（WOOT→Logoot/LSEQ→RGA→YATA→Fugue）逐步推演、表格建模手推；**工程实现（代码级）**——Yjs 源码级内部（Item/struct store/update 编码）、同步协议、新一代库对比。
> 主要一手来源：Shapiro et al. 2011 原始论文、Yjs INTERNALS.md、y-protocols PROTOCOL.md、Weidner Fugue 博客/论文、josephg "CRDTs go brrr"、Sypytkowski crdt-table、Eg-walker 论文（EuroSys 2025）。

## 目录

- [0. 一分钟理解 CRDT](#0-一分钟理解-crdt)
- [1. 数学基础：为什么"只增不减"就自动收敛](#1-数学基础为什么只增不减就自动收敛)
- [2. 时钟系统：Lamport / Vector / State Vector](#2-时钟系统lamport--vector--state-vector)
- [3. 文本/序列 CRDT 算法族（手推）](#3-文本序列-crdt-算法族手推)
- [4. Yjs 内部机制（源码级）](#4-yjs-内部机制源码级)
- [5. 同步协议与工程生态](#5-同步协议与工程生态)
- [6. 表格场景的 CRDT 建模（手推）](#6-表格场景的-crdt-建模手推)
- [7. 新一代库：Loro / Automerge 3 / Diamond / Eg-walker](#7-新一代库loro--automerge-3--diamond--eg-walker)
- [8. CRDT vs OT 终极对照](#8-crdt-vs-ot-终极对照)
- [附录：术语速查与参考来源](#附录术语速查与参考来源)

---

## 0. 一分钟理解 CRDT

OT 的思路是"**不改顺序，改操作**"——用 transform 函数把并发操作改写得能收敛，代价是需要中央服务器维持全序。

CRDT 反其道而行："**不改操作，选数据结构**"——把数据结构设计得**无论操作以什么顺序到达、无论重复多少次，合并结果都相同**。并发冲突在代数层面被消解（交换律/幂等/结合律），不需要任何协调方。

一句话：**OT 改坐标，CRDT 选结构。**

```
OT：   服务器排序 → transform 改写操作 → 各端应用同一全序
CRDT： 各端随意应用 → merge(幂等+交换+结合) → 无论顺序如何都收敛
```

这个差异的直接后果：CRDT 可以没有服务器（P2P）、可以离线编辑一周回来再合并、后端可以退化成纯字节中继——这些都是 OT 做不到或很难做到的。

---

## 1. 数学基础：为什么"只增不减"就自动收敛

### 1.1 Strong Eventual Consistency（SEC，Shapiro et al. 2011）

一个复制对象满足强最终一致性，当且仅当：

1. **最终交付**：健康副本的更新最终送达所有其他健康副本；
2. **收敛**：收到相同更新的副本处于等价状态；
3. **强收敛**：收到相同更新**集合**的副本状态等价——**与到达顺序无关**（这是比 2 强的关键）。

重要限制：**SEC 不保证意图保持**——它保证所有人收敛到同一个结果，但不保证这个结果符合任何人的直觉（可能是两个并发输入交错的"乱码"）。这与 OT 精调 transform 保意图形成对照。

**与 CAP 的关系**：CRDT 是 coordination-free 的（收敛只依赖"最终送达"），在 CAP 下即弃 C（线性一致）保 AP。这是它能离线、能 P2P 的理论根源。

### 1.2 两种形态：CvRDT 与 CmRDT

| | State-based（CvRDT，Convergent） | Operation-based（CmRDT，Commutative） |
|---|---|---|
| 传播什么 | **整个状态**，收到后 `merge` | **操作**，收到后应用 |
| 数学要求 | 状态集构成 **join-semilattice**（join ⊔ 满足幂等/交换/结合），且状态只能"向上爬" | 并发操作两两**可交换** |
| 信道要求 | **最弱**：可丢包、乱序、重复（merge 幂等天然去重） | **因果广播**（不丢、不重复、因果有序） |
| 典型 | G-Counter、PN-Counter、Yjs 的删除、Awareness | Yjs 的插入、大部分实时协同 |

论文证明了两者在因果广播信道下的等价性。工程含义：不可靠 P2P（WebRTC mesh）→ 偏 state-based；有可靠中枢 → op-based 带宽小得多。**Yjs 是混合体**：插入是 op-based（update 消息），删除是 state-based（只在 item 上打标志）。

### 1.3 半格手推：G-Counter

G-Counter（只增计数器）：副本 i 维护本地计数 `c[i]`，`merge = 逐分量取 max`。

```
副本A: {a:3, b:1}        副本B: {a:2, b:4}
         \                  /
          ⊔ = {a:3, b:4}        ← 唯一的最小上界（join）
         /                  \
（无论谁 merge 谁、merge 几次、什么顺序，结果都是 {a:3, b:4}）
```

为什么自动收敛——三条代数性质：

- **幂等**：`A ⊔ A = A` → 重复收到同一状态无害
- **交换**：`A ⊔ B = B ⊔ A` → 到达顺序无关
- **结合**：`(A⊔B)⊔C = A⊔(B⊔C)` → 分批合并路径无关

加上**单调性**（本地 update 只能让状态在格中向上走，永不向下），两个副本各自爬升后各做一次 join，都到达"两条路径终点的公共上确界"——**收敛是代数结构的推论，不是算法的结果**。这就是 CRDT 与 OT 的本质区别：OT 的收敛靠 transform 函数写得对（可以写错），CRDT 的收敛靠数据结构本身（用错了结构才不收敛）。

格图视角（lattice diagram）：

```
        {a:3, b:4}          ← 顶（两者共同上确界）
        /        \
  {a:3,b:1}   {a:2,b:4}    ← 两个副本各自的状态
        \        /
        {a:2, b:1}          ← 底（初始状态）
```

每个副本只能沿格向上爬；join 把两个副本拉到共同祖先之上的汇合点。整个 CRDT 设计的学问就是：**为你的业务数据找到一个合适的半格**。

---

## 2. 时钟系统：Lamport / Vector / State Vector

CRDT 需要回答"两个操作是否并发"——这靠时钟系统：

| 时钟 | 结构 | 能判定并发？ | 用途 |
|---|---|---|---|
| **Lamport clock** | 单计数器，`L = max(L, L_msg)+1` | ❌（只给全序） | ID 生成、tie-break |
| **Vector clock** | `V[j]` = 我见过 j 的第几个操作 | ✅（不可比 ⇔ 并发） | 学术算法（WOOT/GOTO） |
| **State vector** | `SV[i]` = 副本 i 已产生到第几号 | ✅（同上，方向相反） | **Yjs 等现代 CRDT 实际用的** |

Yjs 的 state vector 精确定义：`Map<clientID, clock>`，其中 **clock 只随插入递增、删除不递增**（删除不产生新 ID）。它是 `Y.encodeStateVector(doc)` 的输出、也是同步协议第一步的载荷——大小只 ∝ 参与者数（每人几个字节），与文档大小无关。

---

## 3. 文本/序列 CRDT 算法族（手推）

所有 List CRDT 都在实现同一个抽象接口（Weidner 的表述）：

```
compare(a, b)                 —— 全局唯一的稠密全序
createBetween(a, b) → c       —— a < c < b 且全局唯一
```

**"唯一稠密"是与普通 fractional indexing 的分水岭**：两个人并发在 a、b 之间插入，普通分数索引可能生成相同位置（此后无法再在两者间插入），CRDT 的位置全局唯一故永远可继续插入。

### 3.1 WOOT（2006）——开山之作，以及它的教训

每个字符（W-char）= `(id, 可见性标志, 字符内容, 左邻居id, 右邻居id)`。

**致命约束**：插入的前置条件是左右邻居都已可见——**必须等待因果依赖**。乱序/离线到达的操作要排队等邻居，工程上是灾难。后续所有算法（Logoot/RGA/YATA/Fugue）的核心动力就是**去掉"等邻居"限制**。

### 3.2 Logoot / LSEQ——位置标识符路线

- **Logoot**：元素位置 = 一列 `(int, siteId, clock)` 三元组，字典序比较。在 p、q 间插入即生成 `p < r < q` 的新标识符。问题：朴素策略下标识符长度随编辑密度增长，元数据膨胀。
- **LSEQ 的分配策略**（解决膨胀）：
  - **指数树**：深度 d 的分配空间 ∝ 2^d，标识符长度期望 O(log n)；
  - **boundary+/−**：新区间内靠左端取位（适合从头打字）/ 靠右端（从尾打字）；
  - **每深度随机选 +/−**：固定策略在"一人从头、一人从尾"时会把区间挤爆，随机化让膨胀受控。
- **固有缺陷 ①——interleaving（交错）**：两人并发在相邻位置插入整段文字时字符可能交错：

```
A 输入 "hello"，B 并发输入 "world"（同一位置起）
LSEQ 可能收敛到:  hweorllldo   ← 数学上收敛了，但意图全毁
```

**固有缺陷 ②**：标识符变长最坏 O(n)。这就是现代库全部转向"ID + 邻居引用"家族（RGA/YATA/Fugue）的原因。

### 3.3 RGA（2009）——现代 CRDT 的基线

机制：

- 每个元素 = `(id, content, parent)`，插入时记录挂在谁后面；
- 每个元素带 **timestamp**（≈ 插入者见过的最大序号+1，本质 Lamport clock）；
- 并发插入同一 parent 时：**timestamp 大者排前**，平局比 id；
- 删除 = tombstone（后来者可能还要挂在其后，不能物理删）。

**手推**：文档 `abc`（seph 的 item：id 0,1,2）。Mike 在 a、b 之间插 `X`：

```
X = (id: mike/0, parent: seph/0, seq: 3)   ← Mike 见过 seq 0..2，所以他的 seq=3

现在 seph/0 有两个孩子：b(seq=1) 和 X(seq=3)
RGA 按 seq 降序排孩子 → a X b c  ✓
```

RGA 的直觉：新插入（seq 更大）"挤到 parent 身后第一位"，符合"我刚在这里打字"的感觉。代价：prepend（在文档头部连续插入）场景有 interleaving 异常。

josephg 的重要观察：**RGA/YATA/Fugue 可以共享同一个"扁平列表 + 插入函数"实现，只差一个比较函数**——算法（行为语义）与实现（数据结构）是两个正交轴。

### 3.4 YATA / Yjs——左右双 origin

来源：YATA 论文（2016）+ Yjs 实现。每个 Item 带双指针：

- `origin`（左 origin）：创建时左邻居的 ID
- `originRight`（右 origin）：创建时右邻居的 ID（Yjs 对论文的增强，缓解"同一锚点大量并发插入"的扫描性能）

**并发整合规则（integrate 核心循环）**：

```
integrate(item):                        # item 有 origin(左) originRight(右)
  left = 按 origin 定位起点
  while (存在右邻居 o，且 o 在 originRight 之前 或 应排在 item 前):
      if o 与 item 并发:
          if o.origin 不在 item 的左锚祖先链上:
              break                     # item 插在 o 前面
          left = o; 继续扫
      else:
          left = o; 继续扫              # 因果在前的跳过
  把 item 插到 left 之后
```

**两个并发插入同位置手推**（文档 `ab`，均为 alice 的 item：`(alice,0)` 和 `(alice,1)`）：

```
1. alice 在 a 后插 x：x = (id: alice/2, origin: alice/0, originRight: alice/1)
2. bob（已同步到 ab）并发在 a 后插 y：
   y = (id: bob/0, origin: alice/0, originRight: alice/1)
3. alice 收到 y：从 origin(alice/0) 右侧开始扫，遇到邻居 x。
   x 与 y 并发（无因果序）。x.origin == y.origin == (alice,0) → 挂同一锚点，平局。
   Yjs 决胜规则：origin/originRight 都相同时比 clientID，数值大者排前。
   设 alice=1, bob=2 → bob 大 → y 在 x 前 → 收敛为 a y x b
4. bob 收到 x：同样的扫描 + 同样的规则 → a y x b   ✓ 两边一致
5. 若第三方再在 x、y 之间插 z：z.origin = x 的 id（按其视角）
   → 位置被 origin 锚死，永不漂移
```

**收敛的根源**：两边执行**对称的输入**（各自的 update），应用**同一套确定性规则**（clientID 比较），扫描**同一个全序结构**——结果必然相同。没有 transform 函数，没有服务器，冲突在 integrate 的比较分支里就地消解。

与 RGA 的差异：RGA 用单个 timestamp 排并发（简单但 prepend 异常）；YATA 用双 origin + 局部扫描，意图保持更好（连续插入不交错），代价是 integrate 要扫并发邻居（实践中罕见，均摊 O(1)）。

### 3.5 Fugue / Yjs² / Peritext（2023+）——当前学术前沿

**Fugue**（Weidner & Kleppmann）：位置 = 树节点，`(parent, side左/右, causal dot(replicaID,counter))`，顺序 = 树的中序遍历，同 side 兄弟按 dot 排。

```
createBetween(a, b):
  a 不是 b 的祖先 → 新节点作 a 的右孩子
  a 是 b 的祖先   → 新节点作 b 的左孩子

手推：文本 ab。并发在 a 后插 c、d → 都是 a 的右孩子，按 dot 排序
再在 c、d 之间插 e → e 作 c 的右孩子（树结构保证 a c e d b，整段 run 永不拆散）
```

**核心卖点：non-interleaving 有形式保证**——并发插入的整段文字不会被交错（RGA prepend、LSEQ 都有交错异常）。字符串编码版位置固定 ~15B、消息 ~30B。

- **Yjs²**：Fugue 论文给出的 Yjs 兼容形态（保持 Yjs 扁平列表实现但换 Fugue 语义）
- **Peritext**：富文本格式的 CRDT——格式标记锚定到**字符 ID 区间**而非索引，插进已格式化区间中间的文本自动继承周围格式（Loro 富文本采用）
- **Eg-walker**（EuroSys 2025，josephg & Kleppmann）：范式革命——"**记录简单索引，合并时重放**"。本地只记 `(索引位置, 内容)` + 版本 DAG；合并并发时找 LCA 从分叉点重放两侧操作做 OT 式变换（**只在合并时算**）。效果：稳态内存低一个数量级、GC 可物理删除已同步操作（文档大小 ∝ 活跃内容而非历史）。它证明了 OT 与 CRDT 可以杂交——OT 的变换思想回来了，但只在合并瞬间局部使用。

### 3.6 算法族对比表

| 算法 | 位置表示 | 元数据/字符 | 需等因果依赖 | interleaving |
|---|---|---|---|---|
| WOOT | 裸左右邻居 id | 大 | **是**（等邻居可见） | 良好 |
| Logoot | 位置 id 链 | 可膨胀 | 否 | 严重 |
| LSEQ | 位置 id + 策略 | O(log n) 期望 | 否 | 有 |
| RGA | parent + timestamp | 小 | 否 | prepend 异常 |
| YATA/Yjs | origin + originRight | 小（run 合并后） | 否 | 较好 |
| Fugue | parent + side + dot | 小（~15-30B） | 否 | **最小（形式保证）** |
| Eg-walker | 索引 + 版本 DAG | 最小（可真 GC） | 否 | 同 Fugue |

---

## 4. Yjs 内部机制（源码级）

来源：[yjs INTERNALS.md](https://github.com/yjs/yjs/blob/main/INTERNALS.md)（官方一手文档）。

### 4.1 Item 结构与 run 合并

```
Item:
  id: (clientID, clock)      ← 本质 Lamport 对；clock 只随插入递增
  left / right               ← 双链表（文档序）
  origin / originRight       ← YATA 双锚点
  parent                     ← 所属容器
  content                    ← 内容（可以是字符串 run / 嵌套容器 / 类型引用）
```

**run 合并（compound representation）**：插入 `"abc"` 只建**一个** Item，clock 内部 +3（同 client、顺序插入、删除状态一致时合并）。中间删一个字符会**分裂** Item。josephg 实测该优化把 18 万条目压到 1.2 万（**14 倍压缩**）——这就是"元数据膨胀"批评在工程上的主要缓解手段。

### 4.2 双重存储结构

- **双链表**：按文档序连接所有 item（渲染/遍历用）；
- **struct store**：按 client 分组的数组，支持按 `(client, clock)` **二分查找**——这是同步时快速收集"对方缺哪些 ops"的基础；
- **位置缓存**：80 个最近查找位置的 marker，利用编辑局部性把 O(n) 扫描摊平（类似跳表效果）。

### 4.3 删除是 state-based 的

删除**只在 item 上打 deleted 标志**（info 位域），不记录删除时间/删除者、不消耗 clock：

- GC 条件满足时把内容替换为 `GC` 结构（只存长度）；
- delete set（tombstone 集合）用 ID 区间压缩表示——实测很小（B4 基准：18 万插入 7 万删除，快照中 delete set 仅 4.5KB）；
- **代价**（josephg 指出）：无法做逐 keystroke 的历史回放；快照必须编入 delete set（Yjs 式 ~4KB 且随文档增长，diamond-types 式几十字节）。

### 4.4 update 编码

```
update      = 新插入的 struct 序列 + 本事务的 delete set（Uint8Array）
stateVector = Map<client, clock> 的紧凑变长编码（lib0：7bit/字节+续位）

encodeStateAsUpdate(doc)           ← 全量
encodeStateAsUpdate(doc, sv)       ← diff：只含 sv 缺失的部分（同步的核心）
snapshot   = state vector + delete set
```

### 4.5 容器语义：一切皆 List CRDT

| 容器 | 语义 |
|---|---|
| `Y.Array` | 元素列表（YATA 序） |
| `Y.Text` | 字符列表（run 合并 + 格式属性/embed） |
| `Y.Map` | entry 列表；**同 key 后插入者胜**（等价 LWW，tie-break 确定性） |
| `Y.XmlText` | 带格式属性的 Text |

`Y.Map` 不是显式的 LWW 寄存器，而是"插入序 + 旧值打删除标记"——语义上等价，实现上复用了同一套 list 机制。**这个"Map 的每个 key 天然是 LWW"的性质，正是表格单元格建模的基石**（见第 6 节）。

### 4.6 Transaction

所有修改发生在 transaction 内：批量收集事件、提交后生成压缩 update 播给已同步的 peer、保证远端原子应用；observe 有深度传播（嵌套容器的事件冒泡）。

---

## 5. 同步协议与工程生态

### 5.1 y-protocols 的 sync 流程（消息规范）

```
syncStep1(sv)       := varUint(0) • varByteArray(stateVector)
syncStep2(docState) := varUint(1) • varByteArray(update)
documentUpdate(u)   := varUint(2) • varByteArray(update)
```

**两步握手流程**：

```
A 连接 → 发 SYN_step1（自己的 state vector，几十字节）
       ← B 收到，计算 Y.encodeStateAsUpdate(doc, sv) —— 只含 A 缺的
       ← B 回 SYN_step2（A 缺失的最小增量）
之后 A、B 互发增量 documentUpdate
```

**为什么两步而不是直接发全量**：state vector 大小只 ∝ 参与者数（每人几字节），全量文档可能 MB 级。step1 让对端只回"你缺的那部分"——**离线一周后重连不传全量**的关键。这是 CRDT 相对 OT 的又一工程优势：补拉增量不需要服务器保存全序历史，双方交换 state vector 即可算出差异。

### 5.2 Awareness（presence）协议

- 纯 state-based CRDT：`Map<clientID, {clock, state}>`，每 client 只写自己那条；clock 单调递增，收到更小 clock 的更新丢弃；
- **30 秒**无刷新本地移除该 client（协议规范强制）；`setLocalState(null)` 主动下线；
- 编码：整包交换所有已知 client 状态（state 很小，可接受）。

### 5.3 Provider 生态（后端可以多蠢）

| Provider | 职责 |
|---|---|
| y-websocket | 最小 relay：对 update 做扇出，**不解析内容** |
| Hocuspocus | 生产级 Node 服务端：权限、hook、持久化、扩展（MIT） |
| y-indexeddb | 浏览器本地持久化（离线恢复） |
| y-webrtc | mesh + 信令，完全去中心 |

所有 provider 都只搬运字节——CRDT 一致性完全由端上的 doc 保证。**后端无知觉**是 CRDT 架构的最大卖点：运维、扩容、宕机恢复都简单到"随便重启"。

### 5.4 离线合并手推

```
A、B 从 sv {A:10, B:10} 分叉。
A 离线打到 {A:20}（本地 10 个插入），B 在线打到 {B:15}。
重连：
  A 发 step1(sv={A:20, B:10})
  B 回 step2 = A 的 clock 11..20 的 struct（B 缺的）
  A 对 B 缺 {B:11..15} 回对称 step2 或后续 update 补
  两边各自 integrate 对方的 item：
  位置只由 origin 锚定（不依赖到达顺序）→ 按 §3.4 规则落位
```

离线一周 = 一次大规模并发插入。CRDT 天然处理，无需任何特殊代码——这在 OT 下需要专门的 Offline 态和复杂重放逻辑。

---

## 6. 表格场景的 CRDT 建模（手推）

来源：[Sypytkowski《Conflict-free Replicated Spread Sheets》](https://www.bartoszsypytkowski.com/crdt-tables/) + [Horusiath/crdt-table PoC](https://github.com/Horusiath/crdt-table)。这是把 CRDT 用于表格的**最小完整设计**。

### 6.1 设计骨架

```
userData[r][c]     ← 二维数组：纯数据，无 CRDT 元数据，可直供 UI 渲染
versions[r][c]     ← 版本矩阵：每 cell 一个版本时间戳 → 每 cell = LWW 寄存器
rowKeys[]          ← 行的 fractional index 序列（LSeq）
colKeys[]          ← 列的 fractional index 序列
```

分工：**结构（行列）用分数索引 CRDT，数据（单元格）用 LWW**。绝不用整数 index 当行号——并发插行下整数 index 语义不稳定。

### 6.2 并发插行手推

行 key：row5 = `[5000]`，row6 = `[6000]`。两人同时在 5/6 之间插行：

```
A：generateKey(idA, left=5000, right=6000) → [5000, a₁, a₂…]（区间取位 + 混入 site id）
B：generateKey(idB, left=5000, right=6000) → [5000, b₁, b₂…]

两个 key：字典序可比（顺序稳定）且全局唯一（site id 打破平局）
→ A 的行和 B 的行在所有副本上以同一顺序出现，无需 tombstone、无需协调
连续插多行：新 key 链式成为下一个 left，保持 run 顺序
```

**关键论断**（原文）：*邻居 key 只在生成时需要，冲突决议时不需要*——所以如果有因果保序+去重的传播协议，行列可以完全不留 tombstone（他们的 PoC 因直接转发 update 不保因果而保留了 tombstone）。

Figma 的 multiplayer 就是同款组合（fractional indexing + 属性 LWW），只是 key 由中央服务器分配——工业界早有先例。

### 6.3 单元格 LWW 语义与时间戳选择

```
isHigher(newVersion, cellVersion) ? 覆盖 : 丢弃
```

时间戳用 **Hybrid Logical Clock（HLC）** 而非纯 wall-clock：

- 纯 wall-clock：NTP 跳变/时钟回拨可以让旧写永久获胜；
- 纯 Lamport：无真实时间语义（无法显示"最后修改于"）；
- HLC = 物理时间 + 逻辑计数混合，两者兼得；
- tie-break 用 clientID 字节序，保证确定性。

### 6.4 元数据膨胀量化（表格场景的核心痛点）

| 方案 | 每 cell 元数据 |
|---|---|
| Yjs 式（每 cell 一个 item：client+clock+parent+content 头） | ~20–40 B/cell |
| crdt-table 压缩版：`(timestamp_delta << 16) \| clientIndex` | **8 B/cell** |

100 万 cell 估算：版本矩阵 ~8MB（压缩后）+ 行列 key 数组（每行 key 十字节级）。crdt-table 的设计智慧：**把结构元数据从 O(cells) 降到 O(rows+cols) + 8B×cells**——单元格数据本身零元数据（就是普通二维数组）。

### 6.5 公式重算——表格 CRDT 最疼的点

CRDT 无权威服务器 → **谁重算都不唯一**：`=SUM(A1:A3)` 的依赖 cell 并发变更时，各端在各自收敛时刻求值会得到瞬时不同值（最终收敛后一致）。可选策略：

1. 每端本地即时重算（最终一致，UI 可能闪动）；
2. 公式引用范围用 fractional key 锚定（`=SUM(A1:B3)` 的范围随插行自动扩展/收缩——crdt-table 的 Selection 设计：corner 用保留 key 空间生成永不冲突的边界 key）；
3. 指定重算权威（公式提交走服务器——退回中心化）。

这是 Univer 等表格产品选 OT 的深层原因之一：公式引擎需要确定性求值顺序。

### 6.6 移动行/列：testament 方案

`delete + insert ≠ move`（并发双 move 会产生两份）。crdt-table 的解法：

```
删除行时在字典登记 testament: {源key → (继承者key, 时间戳)}
所有按 key 取行的路径都要追 testament 链到最终后代
并发 move 用 LWW 决胜，输家的 testament 指向赢家
```

（对照：Loro 的 MovableList/MovableTree 已把 move 做成原生 CRDT 操作，语义更干净。）

---

## 7. 新一代库：Loro / Automerge 3 / Diamond / Eg-walker

### 7.1 性能演进的故事线（josephg "CRDTs go brrr" 2021 → 现在）

2021 年 josephg 用同一 trace（26 万编辑）测出：automerge 1.x **291s / 880MB**（峰值 2.6GB）→ Yjs **0.97s / 3.3MB** → 他的 diamond-types native **0.056s / 1.1MB**（约 5000 倍差距）。

这个故事的教训（写进任何 CRDT 讨论都值得）：**算法（行为语义）与实现（数据结构）是两个正交轴**——automerge 1.x 慢不是因为 CRDT 慢，是因为 Immutablejs + 树结构 + 逐字符 item 的实现选择。此后所有库都在实现轴上狂奔：

| | Yjs/Yrs | Automerge 3 | Loro | Diamond |
|---|---|---|---|---|
| 算法 | YATA | RGA+Peritext | Fugue + eg-walker 思想 | RGA/YATA 可切换 |
| 实现 | JS / Rust | Rust | Rust（WASM） | Rust |
| 内存 | 低（GC 后不存删史） | 3.0 大幅改善 | 保留全史仍领先 | 极低 |
| 特色 | 生态最全 | 列式编码（文本 op ~1.1 字节） | movable tree/list、shallow snapshot | 纯文本极致（range tree） |

### 7.2 各库亮点

- **Automerge 3（2025）**：把磁盘列式压缩格式直接用作**内存**表示——粘贴 Moby Dick 场景内存从 700MB 降到 1.3MB（~10 倍）；文本 op 压到约 1.1 字节。
- **Loro（1.0 2024-11）**：容器最丰富（List/Map/Text/**MovableList**/**MovableTree**/Counter 可嵌套）；富文本 Fugue 语义基准领先（注意 Yjs 社区对基准公平性的异议：Yjs 开 GC 后不保留逐 keystroke 历史，Loro 保留完整 DAG）；**Shallow Snapshot** 可按 state vector 裁剪历史控制同步载荷。
- **Diamond types**：range tree（改版 B-tree，节点存字符计数）取代 Yjs 双链表 → 任意位置插入 O(log n)（Yjs 链表 + 位置缓存在"跳转编辑"时退化线性）；叶子 32 项定长块紧排布。
- **Eg-walker（EuroSys 2025）**：见 §3.5——"记录索引、合并时重放"，GC 可物理删除已同步操作，稳态内存低一个数量级。代表 CRDT 与 OT 思想的融合方向。

---

## 8. CRDT vs OT 终极对照

| 维度 | OT | CRDT |
|---|---|---|
| 核心思想 | 改操作（transform 坐标） | 选结构（代数性质消解冲突） |
| 通信前提 | 通常需中央服务器提供**全序** | CmRDT 需因果有序；CvRDT 只需最终送达 |
| 收敛保证 | transform 函数正确性（可写错） | 数据结构代数性质（结构性保证） |
| 意图保持 | **可精调**（transform 即策略） | 只保证收敛；interleaving 分算法族分级（Fugue 最优） |
| 每操作元数据 | 小（几~十几字节），历史可丢 | 每字符/item 带 ID+锚点（run 合并后很小；删史是负担） |
| 服务器 | 必须有（Jupiter/Wave 拓扑） | **可以没有**（P2P/relay 即可） |
| 离线编辑 | 专门 Offline 态 + 重放逻辑 | **天然支持**（离线=大规模并发） |
| 中途加入 | 服务器补全序历史 | state vector 两步握手 |
| undo | 栈 transform + 逆操作走 OT 流 | 基于 origin ID 的逆操作模拟（实现细节多） |
| 权限/审计 | 服务器天然把关 | 需额外机制（服务器想"管"反而费力） |
| 正确性验证 | fuzz TP1/TP2（可以很深） | 类型系统/代数论证 + fuzz |
| 表格适配 | 公式重算确定、行列 transform 精确 | 公式重算无权威；膨胀需专门设计（crdt-table） |
| 典型选型 | Google/腾讯/飞书/Univer/OnlyOffice | Figma/Linear/Notion 实验/Yjs 生态 |

**两个经典选型案例的启示**：

- **Figma**：有中央服务器、对象属性天然 LWW、忌惮 tombstone 无限增长 → 拒绝完整 CRDT，用"fractional indexing + 属性 LWW"的简化变体——恰好就是 crdt-table 的同款组合。说明：**工程上可以只取 CRDT 的思想而不取 CRDT 库**。
- **Univer/表格界偏 OT**：公式重算需要确定性、行列权限需要权威方、与后端存储紧耦合——CRDT 的"无权威"在这些需求前是劣势而非优势。

**一句话总结两者的哲学差异**：OT 用** централизованный 智慧**（服务器协调 + 人工精调 transform）换意图保真；CRDT 用**数学结构**（半格/交换律）换免协调的自由。前者买的是"合并结果符合直觉"，后者买的是"架构自由度"。

---

## 附录：术语速查与参考来源

### 术语速查

| 术语 | 含义 |
|---|---|
| SEC | Strong Eventual Consistency，强最终一致（顺序无关收敛） |
| CvRDT / CmRDT | 状态型（merge 半格）/ 操作型（并发可交换） |
| join-semilattice | join 半格：⊔ 幂等+交换+结合 |
| tombstone | 删除标记（物理不删） |
| state vector | `Map<client, clock>`，同步差异计算的核心 |
| origin / originRight | YATA 双锚点（创建时左右邻居的 ID） |
| run 合并 | 连续同源插入合并为一个 item（Yjs 的 14x 压缩） |
| fractional indexing | 分数索引（在两 key 间取中点生成新 key） |
| interleaving | 并发插入的字符交错异常 |
| LWW | last-write-wins，每 key/cell 独立决胜 |
| HLC | Hybrid Logical Clock，物理+逻辑混合时钟 |
| testament | 移动操作的"遗嘱"链（crdt-table 的 move 方案） |
| eg-walker | 记录索引、合并时重放的范式（EuroSys 2025） |

### 参考来源

**论文**
- Shapiro, Preguiça, Baquero, Zawirski. *Conflict-free Replicated Data Types*. SSS 2011 — https://inria.hal.science/hal-932836
- Roh et al. *Replicated Abstract Data Types* (RGA). 2009
- Nurseitov & Jahns. *YATA*. 2016
- Weidner & Kleppmann. *The Art of the Fugue*. arXiv:2305.00583
- josephg & Kleppmann. *Eg-walker*. EuroSys 2025, arXiv:2409.14252
- Kleppmann et al. *Interleaving anomalies in collaborative text editors*. PaPoC 2019
- 综述：arXiv:2310.18220

**一手文档与源码**
- Yjs INTERNALS.md — https://github.com/yjs/yjs/blob/main/INTERNALS.md
- y-protocols PROTOCOL.md — https://github.com/yjs/y-protocols/blob/master/PROTOCOL.md
- Horusiath/crdt-table — https://github.com/Horusiath/crdt-table

**经典博客**
- josephg. *5000x faster CRDTs* — https://josephg.com/blog/crdts-go-brrr/
- Weidner. *Fugue: A Basic List CRDT* — https://mattweidner.com/2022/10/21/basic-list-crdt.html
- Sypytkowski. *Conflict-free Replicated Spread Sheets* — https://www.bartoszsypytkowski.com/crdt-tables/
- Sypytkowski. *LSEQ interleaving* / *Scaling Fractional Indexes*
- Evan Wallace. *How Figma's multiplayer technology works* — https://www.figma.com/blog/how-figmas-multiplayer-technology-works/
- Evan Wallace. *Fractional indexing* — https://madebyevan.com/algos/crdt-fractional-indexing/

**新一代库**
- Loro — https://loro.dev（eg-walker 文档 / crdt-richtext 基准博客）
- Automerge 3.0 — https://automerge.org/blog/automerge-3/
- diamond-types — https://github.com/josephg/diamond-types
- Yjs vs Loro 讨论 — https://discuss.yjs.dev/t/yjs-vs-loro-new-crdt-lib/2567
