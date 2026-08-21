# OT（Operational Transformation）深度讲解
## —— 从手推 transform 到产品级实现的完整剖析

> 本文是 [多人在线协同编辑表格调研报告](./collaborative-spreadsheet-research.md) 的 OT 单独深入篇。
> 覆盖两条线：**算法原理（手推级）**——transform 函数怎么写、CCI 一致性模型、TP1/TP2、dOPT 反例、Jupiter/Wave 算法逐步推演；**工程实现（代码级）**——客户端状态机、服务端主线、undo 的 OT 化、幂等去重、fuzz 测试。
> 主要一手来源：Jupiter (UIST'95)、Cormack 1995 反例论文、Google Wave OT 白皮书、ot.js/ShareJS 源码、Univer 官方 OT 博客。

## 目录

- [0. 一分钟理解 OT](#0-一分钟理解-ot)
- [1. 问题定义：为什么需要 transform](#1-问题定义为什么需要-transform)
- [2. transform 函数：手推三大基本情形](#2-transform-函数手推三大基本情形)
- [3. 一致性理论：CCI、TP1/TP2 与 dOPT 反例](#3-一致性理论ccitp1tp2-与-dopt-反例)
- [4. 控制算法演进：dOPT → Jupiter → Wave](#4-控制算法演进dopt--jupiter--wave)
- [5. 工程实现 Ⅰ：ot.js 源码剖析](#5-工程实现-ⅰotjs-源码剖析)
- [6. 工程实现 Ⅱ：产品级的补充机制](#6-工程实现-ⅱ产品级的补充机制)
- [7. 表格场景的 OT：Univer 的实践](#7-表格场景的-otuniver-的实践)
- [8. 如何测试 OT 正确性](#8-如何测试-ot-正确性)
- [9. 总结：OT 的本质与代价](#9-总结ot-的本质与代价)
- [附录 A：术语速查](#附录-a术语速查)
- [附录 B：算法谱系对照表](#附录-b算法谱系对照表)
- [附录 C：参考来源](#附录-c参考来源)

---

## 0. 一分钟理解 OT

多个客户端各自持有文档副本，编辑被建模为**原子操作（Operation）**发往服务器，服务器排序后广播。因为**操作不满足交换律**（先插后删 ≠ 先删后插），不同客户端收到并发操作的顺序不同，直接应用必然分叉。

OT 的解法：**不改变操作的应用顺序，而是改写操作本身**——让每个操作在"别人已经改过"的文档上执行时，仍能达到作者**原本的意图**。

一句话：**OT 不排队，OT 改坐标。**

```
没有 OT：                          有 OT：
A: 在位置0插"X" → "Xabc"           A: 在位置0插"X" → "Xabc"
B: 删位置2的'c' → "ab"             B: 删位置2的'c' → "ab"
                                    ↑ 两者各自执行，互不知情，文档分叉

                                    B 的删除到达 A 时，先被改写：
                                    delete(2,'c') → delete(3,'c')
                                    （因为 A 插入了 1 个字符在前）
                                    A 应用后 → "xab"  ← 删掉的仍是那个 'c'
```

---

## 1. 问题定义：为什么需要 transform

### 1.1 经典入门例（Wikipedia）

文档 `"abc"` 复制于两个站点：

- 站点 1：`O1 = Insert(0, "x")` → 本地得 `"xabc"`
- 站点 2：`O2 = Delete(2, "c")` → 本地得 `"ab"`

消息交换后：
- 站点 1 直接应用 O2：`"xabc"` 删位置 2 → 删掉的是 `'a'` → `"xbc"` ❌
- 正确做法：O2 针对 O1 **变换**得 `O2' = Delete(3, "c")` → `"xab"` ✓ 删掉的仍是作者想删的 `'c'`

**意图保持（intention preservation）**：O2 的作者意图是"删掉那个 c"，不管别人怎么改文档，变换后的 O2' 都应该删掉"那个 c"。

### 1.2 CCI 一致性模型（Sun et al. 1998）

OT 系统的正确性由三条性质共同定义：

| 性质 | 含义 |
|---|---|
| **C**ausality preservation | 因果相关的操作必须按 happened-before 顺序执行（用 Lamport 时钟/状态向量判定） |
| **C**onvergence | 所有站点静默（不再产生新操作）后，副本内容完全一致 |
| **I**ntention preservation | 每个操作在任何副本上执行的效果都与作者生成时的意图一致 |

关键洞察：**收敛可以靠串行化协议获得（如加锁），但意图保持不可能靠串行化获得**——你把两个人都排队了，第二个的坐标就错了。这正是 OT 存在的理由，也是它区别于悲观锁的本质。

### 1.3 操作建模

一个操作由三元组构成（Univer 表格语义）：

```js
{ type: 'insertCol', coord: { col: 1 }, params: { count: 1 } }
//  ↑ 做什么        ↑ 在哪里（坐标）     ↑ 附带参数
```

- **type + params 决定"做什么"**（写值、插行、删列、改样式…）
- **coord 是 transform 的主要改写对象**——别人的结构变化（插行/删列）会让你的坐标失效
- 特殊情况下 transform 还会**改变 type**（如对方删了整个 sheet，你对该 sheet 的写操作可能变成 nop 或触发冲突流程）

---

## 2. transform 函数：手推三大基本情形

transform 的输入是**两个基于同一状态（相同 baseRevision）的并发操作**，输出是两个改写后的操作，满足菱形合同：

```
           S (共同基态)
        op1 /        \ op2
           /          \
     S+op1              S+op2
        op2' \        / op1'
              \      /
               S+op1+op2' == S+op2+op1'    ← 两条路径必须到达同一结果（TP1）
```

`transform(op1, op2) → [op1', op2']`，其中 op1' 作用在"op2 已应用"的文档上、op2' 作用在"op1 已应用"的文档上。

### 2.1 情形一：insert 遇 insert（同位置，平局怎么办）

S = `"abc"`，两人同时在**位置 0** 插入：

- op1 = `Insert(0, "X")`
- op2 = `Insert(0, "Y")`

问题：`"Xabc"` 和 `"Yabc"` 合并后，X 和 Y 谁在左？没有客观答案，必须**全局一致的平局规则（tie-break）**：

- 学术 IT 公式用站点 ID：`sid1 < sid2` 者保持在左
- ot.js 用参数顺序：`transform(op1, op2)` 中 **op1 永远优先**（源码注释："If both op1 and op2 are insert ops, prefer op1"）
- ShareJS 用显式参数 `side: 'left' | 'right'`

取 op1 优先（X 在左）：

```
op1' = Insert(0, "X")     // X 在 Y 左边世界中的等价形式：位置不变
op2' = Insert(1, "Y")     // Y 要排到 X 后面：位置 0 → 1

验证：S+op1 = "Xabc"，应用 op2' → "XYabc"
      S+op2 = "Yabc"，应用 op1' → "XYabc"  ✓ 收敛
```

**规则总结**：`pos1 < pos2 → pos1' = pos1`；`pos1 > pos2 → pos1' = pos1 + len2`；`pos1 == pos2 → 按 tie-break，败方 +len2`。

### 2.2 情形二：insert 遇 delete

S = `"abc"`：

- op1 = `Insert(2, "XY")`（在 'c' 前插入）
- op2 = `Delete(2, 1)`（删掉 'c'）

```
op1 的意图："在 c 前面插 XY"。c 被删了，意图仍成立（在 c 原来的位置插）
op2 的意图："删掉 c"。X/Y 插进来后，c 还在原地（位置后移）

op1' = Insert(2, "XY")    // 作用于 "ab"：位置 2 即末尾 → "abXY"
op2' = Delete(4, 1)       // 作用于 "abXYc"：c 现在在位置 4 → "abXY"

验证：S+op1 = "abXYc"，应用 op2'（删位置4）→ "abXY"
      S+op2 = "ab"，    应用 op1'（位置2插）→ "abXY"  ✓ 收敛
```

（这就是 ot.js 源码手推验证过的结果：`op1' = [2, "XY"]`，`op2' = [4, -1]`。）

**规则总结**：
- insert(pos1) 遇 delete(pos2, len2)：`pos1 > pos2 → pos1 -= min(pos1 - pos2, len2)`；`pos1 <= pos2 → 不变`
- delete(pos2, len2) 遇 insert(pos1, len1)：`pos2 >= pos1 → pos2 += len1`；删除区间若被插入点劈开，需**分裂为两个 delete**

### 2.3 情形三：delete 遇 delete（重叠区间）——最容易出错的一种

S = `"abcde"`，两人删除**重叠**区间：

- op1 = `Delete(2, 2)`（删 `"cd"`）
- op2 = `Delete(1, 2)`（删 `"bc"`）
- 重叠部分：`"c"`

```
S+op1 = "abe"（cd 没了），S+op2 = "ade"（bc 没了）

op1' 作用于 "ade"：op1 想删 cd；c 已被对方删掉，只剩 d（现在位置 2）
  → op1' = Delete(2, 1)
op2' 作用于 "abe"：op2 想删 bc；c 已被对方删掉，只剩 b（位置 1）
  → op2' = Delete(1, 1)

验证：S+op2 = "ade"，应用 op1'（删位置2的 'd'）→ "ae"
      S+op1 = "abe"，应用 op2'（删位置1的 'b'）→ "ae"  ✓ 收敛
      （'b''c''d' 全没了：b 被 op2' 删，c 被两人共同删，d 被 op1' 删）
```

**规则总结**：delete 遇 delete 时对区间做**集合运算**——交集部分双方都不再产出操作（对方已经删了），各自只删"自己想删但对方没删"的剩余部分，剩余部分的坐标按对方删除造成的前移量平移。

### 2.4 通用心智模型

所有一维位置变换都可归结为一句话：

```
pos' = pos + (delta if pos >= anchor else 0)
```

- `anchor`：对方操作发生的位置
- `delta`：对方操作造成的净长度变化（insert 为 +len，delete 为 -len 或部分重叠时的分量）

表格是它的**多维推广**：`(row, col)` 二维坐标，插行使 `row >= anchorRow` 的操作 row+1，插列使 `col >= anchorCol` 的操作 col+1——每个维度独立套用同一个模型（详见第 7 节）。

---

## 3. 一致性理论：CCI、TP1/TP2 与 dOPT 反例

### 3.1 TP1（Transformation Property 1）——两操作的收敛条件

对任意基于同一状态的并发操作 Oa、Ob：

```
apply(apply(S, Oa), IT(Ob, Oa)) ≡ apply(apply(S, Ob), IT(Oa, Ob))
```

即第 2 节的菱形合同。**TP1 保证"两个"并发操作沿两条路径收敛**。ot.js `TextOperation.transform` 的 doc 注释写的正是这个合同。

### 3.2 TP2（Transformation Property 2）——三操作的谜题

当**三个**操作 O1、O2、O3 并发，O3 需要沿两条不同路径变换时：

```
T( T(O3, O1), T(O2, O1) )  ≡  T( T(O3, O2), T(O1, O2) )
```

含义：O3 先对 O1 变换再对"O2 对 O1 的变换"变换，与先 O2 后 O1，**必须得到同一个 O3'**。这叫 **TP2 puzzle**。

**为什么 TP2 难满足**：它要求变换函数在"变换路径分叉后重新汇合"时保持一致。Oster/Molli/Urso/Imine 2006（Tombstone Transformation Functions）系统检查了已发表的变换函数，**发现一大批（包括 adOPTed、Sun 的函数）存在 TP2 违例反例，甚至有些论文的证明有错**。WOOT/Logoot 等 CRDT 前身正是为绕开 TP2 而生。

### 3.3 dOPT 反例（Cormack 1995）——逐步推演

Ellis & Gibbs 1989 的 dOPT 是第一个 OT 算法：按站点优先级查一张 2×2 变换表。Cormack 1995 给出著名反例证明其收敛定理不成立。**逐步推演**：

初始文档 `abcdefg`。三个操作：

- 站点 1：先 `D1 = delete(1)`（删 'a'），再 `D2 = delete(4)`（在删过 'a' 的文档上，位置 4 = 'e'）
- 站点 2（并发）：`D3 = delete(1)`（删 'a'）

dOPT 的 delete-delete 变换表：

| 条件 | 变换结果 |
|---|---|
| `i < i'` | `delete(i)` 不变 |
| `i > i'` | `delete(i±1)` 平移 |
| `i == i'` | **nop**（同位置删除，后到者变空操作） |

推演站点 2 收到站点 1 的消息：

1. 站点 2 先收到 D1（删 'a'）：与本地 D3 同位置 → 按表 D3 对 D1 变换为 **nop** ✓（'a' 只删一次，合理）
2. 站点 2 再收到 D2（删 'e'，携带坐标 4——注意这是**站点 1 删过 'a' 之后**的坐标系）：站点 2 自己也删过 'a'，'e' 在站点 2 的坐标系里位置应是 3。dOPT 按 D2 的原始坐标 4 查表平移……但由于 D3 已被变换成 nop，**变换链断了**——后续变换不再知道"本地删过 'a'"这件事
3. 结果：站点 2 删错字符

最终：站点 1 得 `"bcdfg"`（a、e 被删），站点 2 得 `"bcefg"`（a、d 位置判断错位被删）——**两副本永久发散** ❌

**反例的根源**：dOPT 的变换只看"单个操作对"，不考虑**操作所处的上下文（context）**——D2 的坐标定义在"删过 a"的文档上，变换时必须显式知道双方各删了什么。Cormack 的修正：把变换扩展到操作**序列**的逐项变换。这个问题在后续文献中演化为 TP2 的精确定义。

### 3.4 工程界怎么绕过 TP2：靠拓扑，不靠数学

**这是理解工业 OT 的钥匙**——学术上 TP2 极难满足，但 Jupiter 和 Wave 用**架构约束**让 TP2 场景根本不出现：

- **Jupiter**：任意客户端之间的冲突被分解为 N 个独立的（client, server）双进程会话。服务器串行化所有操作形成唯一主线，每个会话内永远是"双方问题"——TP2 需要的"三条路径汇合"永远不会发生。Wikipedia 算法对比表明确标注：Jupiter 的**控制算法保证 TP2**，变换函数只需保证 TP1，约束是"因果序 + 中央服务器"。
- **Google Wave**：在 Jupiter 之上再加 **stop-and-wait**——客户端 ACK 前不发新 op，服务器永远只需对单一历史做变换。

这正是 Joseph Gentle（Wave 协议开发者）名言的技术实质："Unfortunately, implementing OT sucks… Wave took 2 years to write"，以及他后来的修正：**中心化纯文本 OT 其实不难（他写了 400 行 JS 的实现），真正难的是分布式 OT + 富文本，最难的不是代码而是正确性证明/测试**。

---

## 4. 控制算法演进：dOPT → Jupiter → Wave

### 4.1 Jupiter（Nichols et al. UIST'95）

**架构**：客户端-服务器 + 乐观并发。目标是高延迟低带宽网络（每个（客户端, 服务器）对之间维护一个状态空间窗口）。

**double-state / 2×2 模型**：把消息时序画成二维格（lattice）——横轴是服务器进程时间、纵轴是客户端进程时间：

```
服务器时间 →
客 ▲
户 │  ...
端 │   ...
时 │    ●───● ← 服务器已确认的格点
间 │     \  \
↓ │      ●───● ← 客户端当前状态（本地已应用、对端未知）
```

- 每次本地 op 或收到远程 op，在格上走一步
- 收到对方消息时，若本地有对方不知道的并发操作：**先把收到的 op 与这些并发 op 变换**再应用；同时把自己的 pending op 变换到新坐标系
- 收敛性：双方沿格中不同路径爬行，但每条消息携带所在版本号，接收方把消息变换到自己的当前状态——由于任意 2×2 变换满足 TP1，两条路径到达同一格点时文档必然一致

**为什么只需单服务器**：服务器串行化所有操作（全局历史），N 个客户端的冲突被分解为 N 个独立双进程问题。TP2 永不触发。超过窗口（ACK 前又发消息）时服务器可 nack，客户端 resync。

Jupiter 是 Wave OT 的直接起点（Wave 白皮书原话："The starting point for Wave OT was the paper … Jupiter"）。

### 4.2 Google Wave OT（白皮书 2010）

Wave 在 Jupiter 之上做了三个关键工程化扩展：

**① 客户端 stop-and-wait**
客户端必须等服务器 ACK 上一个操作后才能发下一个；等待期间本地操作被缓存并可 compose 成块。收益：客户端可以推断服务器的 OT 路径，**服务器只需维护单一状态空间**（它的操作历史）——收到客户端 op 时只需对该历史做 transform、应用、广播。代价：另一客户端的操作以约一个 RTT 的粒度成块到达。

**② 流式文档操作（streaming document operations）**
操作不是离散的"单点命令"，而是**线性遍历文档的 mutation 序列**，组件包括：`retain` / `insert characters` / `insert element start/end` / `delete characters` / `delete element start/end` / `replace attributes` / `annotation boundary`。示例：

```
retain 3
insert element start with tag "p"
insert characters "Hi there!"
insert element end
retain 5
delete characters 4
retain 2
```

妙处：**整个文档本身可表示为"作用于空文档"的一个操作**；流式设计使 transform/compose 都能线性扫描，高效处理巨大操作对。ot.js 的 `TextOperation`（数组：正数=retain、字符串=insert、负数=delete）就是这个设计的直系简化。

**③ 可组合性（composition）**
任意两个可接续的操作 compose 后仍是单个操作，`(B∘A)(d) = B(A(d))`。客户端等待 ACK 期间把 pending 操作全部 compose，减少需要 transform 与发送的操作数。

### 4.3 transform 的两个变体：IT 与 ET

学术文献把变换细分为：

| 变体 | 含义 | 用途 |
|---|---|---|
| **IT**（Inclusion Transformation） | 变换结果**包含**对方操作的影响 | 主流算法（Jupiter/Wave/ot.js 的 transform 都是 IT） |
| **ET**（Exclusion Transformation） | 从变换结果中**剔除**对方的影响（T⁻¹） | GOTO（REDUCE/CoWord 系）需要 IT+ET 混合 |

以插入遇插入为例（sid 平局）：

```
IT:  T(ins(p1,c1,sid1), ins(p2,c2,sid2)):
       p1 < p2              -> ins(p1)
       p1 = p2 and sid1<sid2 -> ins(p1)
       else                 -> ins(p1+1)
ET:  同条件，else 分支为 ins(p1-1)
```

---

## 5. 工程实现 Ⅰ：ot.js 源码剖析

ot.js（github.com/Operational-Transformation/ot.js）是 Wave 模型最经典的开源实现，约 2000 行，`client.js` 头部注明它是 djspiewak/cccp Scala 版的直译。以下按模块剖析。

### 5.1 TextOperation：操作的表示与三个核心算法

**表示**：组件数组 + 两个长度约束。

```js
// 正数 = retain(n)，字符串 = insert(s)，负数 = delete(-n)
["Hello", 5, -3, 2]
// baseLength  = 输入文档长度 = Σ(retain + delete) = 5+3+2 = 10
// targetLength = 输出文档长度 = Σ(retain + insert) = 5+5+2 = 12
```

**apply**：线性扫描执行。结束时校验 `strIndex === str.length`——操作必须覆盖全文档（不能只处理一半）。

**invert**：求逆，需要原文（delete 的逆需要知道删了什么）：

```js
retain(n)  → retain(n)
insert(s)  → delete(s.length)
delete(n)  → insert(原文被删的那段)
```

**compose**（串行合并）：前提 `A.targetLength === B.baseLength`（B 接在 A 后面）。双指针归并，核心 case 是 `insert(A) 遇 delete(B)` 字符串互相抵消——"插入后又删掉"直接消失。合同：`apply(apply(S,A),B) ≡ apply(S, compose(A,B))`。

**transform**（并发变换）：双指针遍历两个操作的组件流，按 6 种组合分派（源码顺序）：

```
1. isInsert(op1)   → op1'.insert(s);  op2'.retain(len)   // insert 优先于一切
2. isInsert(op2)   → op1'.retain(len); op2'.insert(s)
3. retain/retain   → 取 min 步进，双方 retain(min)
4. delete/delete   → 交叠部分双双无声跳过（"Both operations delete the same string … just skip over"）
5. delete/retain   → op1'.delete(min)
6. retain/delete   → op2'.delete(min)
```

第 2 节的三个手推例子就是按这个分派表精确走出来的。

### 5.2 Client 三态状态机（lib/client.js）

```
                    applyClient(用户编辑)          serverAck()
  ┌──────────┐ ─────────────────────────▶ ┌──────────────────┐
  │Synchronized│                           │ AwaitingConfirm   │
  │          │ ◀───────────────────────── │  (outstanding)    │
  └──────────┘        serverAck()         └──────────────────┘
       ▲                                       ▲      │ applyClient()
       │              serverAck()              │      ▼
       │            ┌──────────────────────────────────────┐
       └─────────── │      AwaitingWithBuffer              │
                    │      (outstanding, buffer)           │
                    └──────────────────────────────────────┘
```

三个状态对应"在途/缓冲"两个队列的组合：

| 状态 | 含义 |
|---|---|
| **Synchronized** | 无未确认操作。用户编辑 → 立即发送 → 转 AwaitingConfirm |
| **AwaitingConfirm(outstanding)** | 有 1 个在途操作。远程 op 到达 → **transform(outstanding, op)** 得 `[outstanding', op']`，本地应用 op'，outstanding 更新为 outstanding' |
| **AwaitingWithBuffer(outstanding, buffer)** | 在途 + 本地又编辑了。新编辑 **compose 进 buffer**；远程 op 到达做**双重变换**（见下） |

**AwaitingWithBuffer.applyServer 的双重变换**（源码注释中的双菱形图）：

```js
// pair1 = transform(outstanding, op)      // 先处理在途的
// pair2 = transform(buffer, pair1[1])     // 再处理缓冲的
// 本地应用 pair2[1]
// 新状态 = AwaitingWithBuffer(pair1[0], pair2[0])
const pair1 = TextOperation.transform(outstanding, op);
const pair2 = TextOperation.transform(buffer, pair1[1]);
applyOperation(pair2[1]);
return new AwaitingWithBuffer(pair1[0], pair2[0]);
```

为什么是这个顺序：远程 op 是基于服务器主线（不含我的 outstanding/buffer）的坐标；我的 buffer 叠在 outstanding 之上。所以 op 要先翻过 outstanding 这座山，再翻过 buffer 这座山，才能落到我本地的当前状态。

**serverAck 时 buffer 晋升**：`sendOperation(revision, buffer)` → 转 `AwaitingConfirm(buffer)`。

**transformSelection**（远程光标坐标变换）：

```js
// 服务器说某用户光标在位置 3；本地有未确认的位置 0 插入 5 字符
// 则该光标应显示在 3 + 5 = 8
selection.transform(outstanding).transform(buffer)
```

### 5.3 Server：服务器只需 45 行（lib/server.js）

```js
Server.prototype.receiveOperation = function (revision, operation) {
  if (revision < 0 || this.operations.length < revision)
    throw new Error("operation revision not in history");
  // 把迟到的 op 对 [revision..最新] 的每个历史 op 依次变换
  var concurrentOperations = this.operations.slice(revision);
  for (var i = 0; i < concurrentOperations.length; i++)
    operation = transform(operation, concurrentOperations[i])[0];
  this.document = operation.apply(this.document);
  this.operations.push(operation);
  return operation;  // 调用方负责广播（广播的是 transform 后的 op）
};
```

这就是 Wave 服务器模型的全部：**单一操作历史主线**，收到 `(baseRevision, op)` 后对区间内每个历史 op 依次 `op = transform(op, hist_i)[0]`，再应用、入史、广播**变换后的 op**。所有客户端的 op 都被拉到同一条主线上——TP2 场景被拓扑消灭。

（demo 与产品的差距：ot.js 遇到 revision 超出历史直接抛错；ShareJS 服务器允许旧版本 op 迟到并恢复，见 6.1。）

### 5.4 Selection.transform：光标变换（lib/selection.js）

```js
function transformIndex(index) {
  var newIndex = index;
  for (var i = 0; i < ops.length; i++) {
    if (isRetain(ops[i]))        index -= ops[i];        // 游标未到该区域则停
    else if (isInsert(ops[i]))   newIndex += ops[i].length;  // 前方插入 → 右移
    else { newIndex -= Math.min(index, -ops[i]); index += ops[i]; } // 前方删除 → 左移至多被删长度
    if (index < 0) break;
  }
  return newIndex;
}
```

要点：**光标只受其左侧的操作影响**（`if (index < 0) break`——游标推进到操作区域左侧就停）。这是"pos' = pos + shift"模型在光标上的直接体现。

### 5.5 UndoManager：undo 栈也要 transform（lib/undo-manager.js）

单机编辑器的 undo 是简单栈，OT 下不行——Alice 按下 Ctrl+Z 时，栈里记录的操作坐标可能已经被 Bob 的远程操作改写了。解法：**每次远程 op 到达时，对整个 undo 栈做变换**：

```js
function transformStack(stack, operation) {
  var newStack = [];
  // 从栈顶（最新）往下逐个变换
  for (var i = stack.length - 1; i >= 0; i--) {
    var pair = Operation.transform(stack[i], operation);
    if (!pair[0].isNoop()) newStack.push(pair[0]);  // 被远程 op 完全抵消的项直接剔除
    operation = pair[1];  // 滚动传递：后续栈项要面对的是变换后的远程 op
  }
  return newStack.reverse();
}
```

两个精妙点：
1. **`operation = pair[1]` 滚动传递**：栈里第 k 项变换时面对的远程 op 已经被上面 k-1 项"消耗"过一轮
2. undo 动作本身 = 弹栈顶 → `applyClient(op.inverse())`——**逆操作作为普通并发操作走正常 OT 通道**（Sun 2002 "undo as concurrent inverse" 理论的工程化）

### 5.6 编辑器适配层：diff → operation（codemirror-adapter.js）

OT 接入任何编辑器的通用模式：**把编辑器的 change 事件转成 operation**。CodeMirror 适配器从最新 change 往前回放，每个 change 生成 `retain(from).delete(removed).insert(text).retain(rest)`，与累积操作 compose；逆操作反向 compose。返回 `[operation, inverse]` 给客户端状态机与 undo 栈使用。

---

## 6. 工程实现 Ⅱ：产品级的补充机制

ot.js 是教学级实现，到产品级还差以下几块（以 ShareJS/Univer 为参照）。

### 6.1 幂等去重、重试与 ACK 丢失

| 故障 | 机制 |
|---|---|
| 提交超时 | 客户端重发；重发时 baseRevision 可能已被本地 transform 提升，可减少服务器 transform 次数 |
| ACK 丢失 | **每个操作全局唯一 opId，服务器去重**——收到已执行过的 op 直接回 ACK 不再执行（幂等） |
| 服务器消息重复 | ShareJS client：`if (msg.v < @version) return` 静默丢弃旧版本消息 |
| 旧版本 op 迟到 | ShareJS 服务器允许 `opVersion < version`：从 db 取历史区间逐个 transform 后再应用（ot.js 直接抛错——这就是 demo 与产品的差距） |

### 6.2 compose 与 transform：何时用哪个

| | compose | transform |
|---|---|---|
| 前提 | 两个操作**串行**作用（A 的 target = B 的 base） | 两个操作**并发**（相同 base） |
| 语义 | 合并为一个等价操作 | 产生两个操作使菱形收敛 |
| 用途 | **减少**操作数量与 transform 次数（网络 + CPU） | **保证**一致性 |

经验法则：自己的操作与自己的操作 compose（buffer 累积）；自己的操作与别人的操作 transform（并发处理）。

### 6.3 服务器拒绝时的回滚（ShareJS 的工程细节）

服务器拒绝编辑（如权限/校验失败）时，客户端不能简单丢弃——本地 UI 已经显示了该编辑。ShareJS 的做法：

```js
// 用 invert 生成逆操作，本地回滚
const undo = type.invert(inflightOp);
// 但 pendingOp 叠在 inflightOp 之上，也要一并变换
const [pending', _] = transform(pendingOp, undo);
// 本地应用 undo、更新 pending、通知上层
```

invert + transform 组合拳——这是"invert 需要原文"的实际用途之一。

### 6.4 串行化保证：per-doc SyncQueue

ShareJS 服务器为每个文档维护 SyncQueue，保证同一文档的 op **串行处理**——这就是上一份报告中"单文档单写者 Actor"在代码层的雏形。

---

## 7. 表格场景的 OT：Univer 的实践

### 7.1 表格 op 的 transform 手推（Univer 官方博客例子）

Alice 在 C2 插入文本，Bob 同时在 B 列前插一列，两者 baseRevision 均为 12：

```
a = { type: 'insertCell', coord: { row: 1, col: 2 } }     // C2
b = { type: 'insertCol',   coord: { col: 1 }, params: { count: 1 } }
```

服务器先处理 a：revision=13，ACK 给 A，广播给 B、C。

**B 端（已本地应用 b）收到 a 时做 transform**：

```
a' = { type: 'insertCell', coord: { row: 1, col: 3 } }
// Bob 插了一列在 col=1 之前 → 所有 col >= 1 的列号 +1
// Alice 的 col: 2 → 3，即 C2 变 D2 ← 意图保持：还是原来那个格子
```

**服务器处理迟到的 b 时**（b.baseRevision=12 < 服务器版本 13）：

```
b' = transform(b, a)      // a 不影响行列结构，b 的坐标不变（或按约定 +0/+1）
b'.revision = 14          // 分配新版本号
b'.baseRevision = 13      // 关键：baseRevision 推进——b' 现在定义在"a 已应用"的状态上
广播 b'（而非 b）          // A、C 直接应用，无需各自重算 transform
```

**核心规则**：服务器广播的是 transform 后的 op，且 op 的 baseRevision 随变换推进——收到方无需对齐旧坐标系，这是 Univer 协议效率的关键设计。

### 7.2 表格 op 的两个特殊点（相对文本）

1. **坐标是多维的**：`(row, col)` 两个维度独立套用 `pos' = pos + shift` 模型；插行使 row >= anchor 的操作 row+1，插列使 col >= anchor 的操作 col+1。Univer 中行列插入要对**所有**含坐标的操作（单元格写、样式、区域、光标）做偏移
2. **transform 可改变操作类型**：对方删了整个 sheet，你对该 sheet 的写操作变 nop 或触发 Conflict 流程；delete/delete 的"交叠变 nop"在表格里扩展为"引用的结构不存在 → 降级/冲突"

### 7.3 changeset：操作打包与节流

- **mutation**：最小操作单元（Univer 的一等公民，同时支撑 undo/redo 与协同——一套体系两个用途）
- **merge**：同类型操作合并（连续输入 → 一个插入；多单元格写 → 一个操作）
- **changeset**：多个 mutation + baseRevision + 全局唯一 opId 打包成的**提交单位**（对应 ot.js 里 buffer 被 compose 后的整体）

### 7.4 Univer 的 7 态客户端状态机

ot.js 三态是核心骨架，Univer 增加到 7 态，多出的正是"生产环境意外情况"：

```
Synced → Pending → Awaiting → AwaitingWithPending → FetchMiss → Offline → Conflict
```

| 状态 | 含义 | 对应 ot.js |
|---|---|---|
| Synced | 与服务器一致，无未发送操作 | Synchronized |
| Pending | 有未发送操作 | （发出前的瞬间） |
| Awaiting | 全部已发送等确认 | AwaitingConfirm |
| AwaitingWithPending | 部分已发送 + 还有未发送的 | AwaitingWithBuffer |
| **FetchMiss** | 发现漏 op 正在补拉 | 无（demo 假设网络可靠） |
| **Offline** | 离线；未 ACK 与未发送的 changeset **分开缓存** | 无 |
| **Conflict** | 不可解冲突（A 删 sheet vs B 编辑该 sheet），断开协同保留现场人工处理 | 无 |

**漏 op 感知的两条途径**：收远程 op 时 `revision > 本地版本+1`；或 ACK 里的 revision 超前。补拉期间本地新 op 与补拉 op 也要互相 transform。

**Conflict 的哲学**：不能静默丢弃 Bob 的编辑（数据丢失），也不能自动二选一——切断协同、保留双方现场、人工裁决。这在小概率但必须处理的场景上与"算法万能"的想象划清界限。

---

## 8. 如何测试 OT 正确性

Joseph Gentle 的结论：**OT 最难的不是写代码，而是证明/测试正确性**。业界答案是 **property-based fuzz 测试**（ottypes/fuzzer）。

### 8.1 测试的性质清单

随机生成操作序列，分派到 3 个副本（client、client2、server），校验：

| 性质 | 断言 |
|---|---|
| apply 正确 | 逐个 apply == 记录的 result |
| shatter | 把操作拆成原子逐个 apply 仍收敛（防止实现依赖操作的粒度） |
| invert | 逆序全部 invert 后回到 initialDoc |
| compose | 整组合成一个操作后 apply == result |
| **TP1（菱形）** | `transformX(server.composed, client.composed)` 后 `apply(server.result, client') == apply(client.result, server')` |
| n² transform | transformLists 对逐个操作的交叉变换后同样收敛（模拟逐消息 OT 而非组合后 OT） |
| TP2（可选） | 仅 `type.tp2 === true` 的类型额外断言路径无关性 |

### 8.2 工程细节

- 用 seedrandom 固定种子——崩溃时保存 seed 到 fuzzercrash.data 供复现（默认每 6 小时换种子，兼顾稳定与覆盖）
- ot.js 自带的测试是表驱动单元测试（"should transform si by si" 等逐 case），但工业级正确性靠随机化 property test
- 单元测试抓已知边界，fuzz 抓未知边界——两者缺一不可

---

## 9. 总结：OT 的本质与代价

### 9.1 一张图串起全文

```
问题：操作不满足交换律，不同顺序应用会分叉
  │
  ├─ 解法核心：transform(op1, op2) → [op1', op2']   （第2节，手推）
  │    菱形合同 = TP1（两操作收敛）
  │
  ├─ 理论深水区：TP2（三操作路径无关性）            （第3节）
  │    dOPT 反例证明天真方案必翻车
  │    学术界 20 年艰难攻关（GOTO/COT/tombstone）
  │
  ├─ 工业界钥匙：用架构绕过 TP2                     （第4节）
  │    Jupiter：中央服务器 + 双进程会话分解
  │    Wave：+ stop-and-wait + 流式操作 + compose
  │
  ├─ 工程骨架：三态客户端状态机 + 45行服务器主线     （第5节）
  │    ot.js = Wave 模型的最小完整实现
  │
  ├─ 产品级补丁：opId 幂等 / SyncQueue / invert 回滚 / undo栈transform （第6节）
  │
  ├─ 表格特化：多维坐标变换 / transform改类型 / 7态状态机 / Conflict态 （第7节）
  │
  └─ 质量底线：property-based fuzz                   （第8节）
```

### 9.2 OT 的本质

1. **OT 不排队，OT 改坐标**——不变的是应用顺序（服务器全序），变的是操作本身
2. **收敛靠拓扑，意图靠 transform**——工业系统用中央服务器架构让 TP2 消失，用精心手写的 transform 函数保住用户意图
3. **transform 矩阵 O(n²) 是产品化成本的主要来源**——n 种原子操作需要 n² 对变换函数，每对都要手推、单测、fuzz
4. **一套 op 体系两个用途**——undo/redo 与协同共用 mutation 流（Univer 的架构选择）

### 9.3 什么时候不该用 OT

- 没有中央服务器（P2P/离线优先）→ 用 CRDT
- 不需要字符级合并、编辑频率低 → 单元格锁 + presence 更便宜
- 团队无法承受 transform 矩阵的测试成本 → 买方案（Univer Pro / OnlyOffice）而不是自研

---

## 附录 A：术语速查

| 术语 | 含义 |
|---|---|
| Operation / op | 原子操作 `{type, coord, params}` |
| transform / IT | 并发操作互相改写，使菱形收敛 |
| compose | 串行操作合并为一个等价操作 |
| invert | 操作求逆（需要原文） |
| baseRevision | 操作生成时基于的版本号（客户端填） |
| revision | 服务器分配的全局序号（形成全序） |
| changeset | 多个 op + baseRevision + opId 的提交单位 |
| TP1/CP1 | 两操作变换后沿两条路径收敛 |
| TP2/CP2 | 三操作变换路径无关性（TP2 puzzle） |
| CCI | 因果保持 / 收敛 / 意图保持 |
| IT/ET | 包含变换 / 排除变换 |
| tombstone | 删除标记（CRDT 概念，OT 的 delete/delete 交叠处理与之神似） |
| outstanding / buffer | 在途操作 / 本地缓冲（ot.js 术语） |
| fetch miss | 发现版本跳跃后向服务器补拉区间操作 |

## 附录 B：算法谱系对照表（Wikipedia 整理）

| 算法(系统) | 变换函数 | Undo | 控制算法保证 | 变换函数保证 | 约束 |
|---|---|---|---|---|---|
| dOPT (GROVE) | IT | ✗ | 无 | TP1,TP2 | 因果序（**有反例**） |
| adOPTed (JOINT EMACS) | L-transform | 时序undo | IP2,IP3 | TP1,TP2,IP1 | 因果序 |
| **Jupiter** | IT | ✗ | **TP2** | TP1 | 因果序+**中央服务器** |
| **Google Wave** | IT+compose | ✗ | **TP2** | TP1 | +stop'n'wait |
| GOTO (REDUCE/CoWord) | IT+ET | ✗ | 无 | TP1,TP2,RP | 因果序 |
| AnyUndo (REDUCE) | IT+ET | 任意op undo | IP2,IP3,RP | IP1,TP1,TP2 | 因果序 |
| COT (REDUCE系) | IT | 任意op undo | TP2,IP2,IP3 | TP1 | 因果序+间断全序 |

## 附录 C：参考来源

**论文**
- Nichols, Curtis, Dixon, Lamping. *High-latency, low-bandwidth windowing in the Jupiter collaboration system*. UIST'95
- Ellis & Gibbs. *Concurrency control in groupware systems*. CSCW'89（dOPT）
- Cormack 1995. *A counterexample to dOPT* — https://cs.uwaterloo.ca/research/tr/1995/08/dopt.pdf
- Sun et al. 1998. CCI 模型；Sun 2000/2002. *Undo any operation at any time* / *Undo as concurrent inverse in group editors*
- Oster, Molli, Urso, Imine 2006. *Tombstone Transformation Functions*（TP2 反例系统检查）
- Rui Li & Du Li 2010. *An Admissibility-Based Operational Transformation Framework*（CSCW）

**白皮书与博客**
- Google Wave OT 白皮书 — https://svn.apache.org/repos/asf/incubator/wave/whitepapers/operational-transform/operational-transform.html
- Univer 官方 OT 博客（中文）— https://zhuanlan.zhihu.com/p/678454714 / 英文 https://docs.univer.ai/blog/ot
- *Is implementing OT hard?*（含 Joseph Gentle 引言）— https://digitalfreepen.com/2018/01/04/operational-transform-hard.html
- Wikipedia: Operational transformation — https://en.wikipedia.org/wiki/Operational_transformation

**源码（本文直接引用分析）**
- ot.js — https://github.com/Operational-Transformation/ot.js（text-operation.js / client.js / server.js / selection.js / undo-manager.js / codemirror-adapter.js）
- ShareJS v0.4.1 — https://github.com/josephg/ShareJS（client.coffee / model.coffee / syncqueue.coffee）
- ottypes/fuzzer — https://github.com/ottypes/fuzzer（property-based 测试框架）
