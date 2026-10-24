# 标签评分与 Jev 接入方案

> 目标：把「给回答打一个模糊的分」变成「先分类成一组可审计的标签，再由标签映射成分数」。
> 好处是：规则可以换、模型可以换（Jev / 小分类模型 / LLM），但**分数口径和 UI 不变**。

---

## 1. 为什么用标签，而不是让 LLM 直接打分

| | 生成式 LLM 打分 | 标签分类（本方案） | Jev（TypeSafe System One） |
|---|---|---|---|
| 输出 | 一段 JSON/散文，可能解析失败 | 固定标签 + 置信度 | 类型化 `score`/`noul` 答案 + 概率 |
| 成本 | 一次完整 LLM 请求 | 本地 0 成本 | 一次约 ~$0.00002（约 500 input tokens） |
| 延迟 | 秒级 | <30ms | ~100ms provider p50（境内端到端约 1s） |
| 可解释 | 靠模型自述 | 每个标签可单独展示/测试 | 每个问题独立概率分布 |
| 稳定性 | 温度、措辞、版本都会漂 | 确定性 | 低置信度可回落，不猜 |

结论：**标签是契约，分类器是可替换实现**。本地规则先跑通，Jev 作为精评增强而不是地基。

---

## 2. 标签体系（v1）

### 2.1 问题意图（多标签）

`intent.compare` / `intent.howto` / `intent.why` / `intent.define` / `intent.write` / `intent.code` / `intent.advice` / `intent.fact` / `intent.other`

### 2.2 回答形态（多标签）

| 标签 | 含义 | 用于 |
|---|---|---|
| `shape.structured` | 有标题/列表/表格/代码 | 清晰度 |
| `shape.heading` / `shape.list` / `shape.table` / `shape.code` | 具体结构 | 清晰度 |
| `shape.stepwise` | 编号步骤或 ≥3 个动作词 | 可执行性 |
| `shape.evidence` | 引用/链接/工具证据 | 可信度 |
| `shape.hedged` | 不确定性说明（可能/取决于/建议验证） | 可信度 |
| `shape.absolute` | 绝对化断言（一定/必然/永远/所有） | 可信度扣分 |
| `shape.unsourced-numbers` | 大量精确数字但无来源 | 可信度扣分 |
| `shape.vague` | 回答过短（<60 字） | 相关性/完整性扣分 |
| `shape.refusal` | 拒答/推脱/只要求补充信息 | 硬上限 |
| `shape.offtopic` | 覆盖率 <15% 且 ≥60 字 | 硬上限 45 分 |
| `shape.repetition` / `shape.filler` / `shape.longParagraphs` | 重复/口头禅/长段 | 清晰度扣分 |
| `shape.example` / `shape.conditional` / `shape.prioritise` / `shape.concrete` / `shape.conclusion` | 举例/条件/优先级/具体承诺/结论 | 可执行性加分 |

### 2.3 话题覆盖（每个子意图一个）

`topic.covered` / `topic.partial` / `topic.missing`，同时记录覆盖比例与偏离段落。

### 2.4 维度等级（Jev 用）

每个维度 4 个有序等级（`score` 问题），映射到分数锚点：

| 维度 | 等级（差→好） | 锚点分 |
|---|---|---|
| 相关性 | 答非所问 / 只沾到边 / 基本对题 / 紧扣问题 | 35 / 60 / 80 / 95 |
| 完整性 | 漏掉主要内容 / 缺边角 / 基本完整 / 完整含边界 | 35 / 62 / 82 / 95 |
| 可信度 | 大量无依据 / 部分有依据 / 基本有依据 / 有来源或不确定性 | 35 / 62 / 82 / 95 |
| 清晰度 | 结构混乱 / 比较散 / 清晰可读 / 结构清楚重点突出 | 40 / 65 / 82 / 94 |
| 可执行性 | 不知道做什么 / 只有原则 / 有步骤 / 可直接照做 | 40 / 65 / 82 / 94 |

Jev 的 `score` 答案是分布加权后的连续值（可能落在等级之间），按相邻锚点线性插值。

---

## 3. 映射规则

1. **本地引擎**：标签 → 维度分（见 `lib/scoring.js` 的 `dimsFromLabels`）→ 加权总分。
2. **Jev 引擎**：5 个 `score` 答案直接作为维度分；3 个 `noul`（绝对化/拒答/跑题）覆盖对应标签；每个子意图一个 `noul` 覆盖概率 → `covered/partial/missing`；再走**同一个** `labelsToReport()`。
3. **硬门**：`shape.offtopic` → 总分 ≤45；`shape.refusal` → 总分 ≤50（避免"文笔很好但答非所问"拿高分）。
4. **置信度**：本地为 `low/medium`；Jev 取 5 个维度 confidence 的均值 → `high/medium/low`。
5. **证据/建议**：沿用本地引文选择 + 标签驱动建议；Jev 不负责编造引文（避免幻觉）。

---

## 4. Jev 接入（已实现 `lib/jev.js`）

### 4.1 端点与鉴权

| provider | endpoint | model | key 环境变量 |
|---|---|---|---|
| `typesafe` | `https://api.typesafe.ai/v1/systemone` | `jev-latest` | `TYPESAFE_API_KEY` |
| `openrouter` | `https://openrouter.ai/api/alpha/decisions` | `~typesafe/jev-latest` | `OPENROUTER_API_KEY` |
| `custom` | 自填 | 自填 | 自填 |

请求：`POST`，`authorization: Bearer <key>`，body：

```json
{
  "model": "~typesafe/jev-latest",
  "state": { "question": "…", "answer": "…" },
  "questions": {
    "relevance":     { "type": "score", "instructions": "…", "criteria": ["…","…","…","…"] },
    "completeness":  { "type": "score", "instructions": "…", "criteria": ["…","…","…","…"] },
    "credibility":   { "type": "score", "instructions": "…", "criteria": ["…","…","…","…"] },
    "clarity":       { "type": "score", "instructions": "…", "criteria": ["…","…","…","…"] },
    "actionability": { "type": "score", "instructions": "…", "criteria": ["…","…","…","…"] },
    "absolute": { "type": "noul", "instructions": "是否含绝对化断言？" },
    "refusal":  { "type": "noul", "instructions": "是否拒答/推脱？" },
    "offtopic": { "type": "noul", "instructions": "是否有明显无关段落？" },
    "topic_0":  { "type": "noul", "instructions": "是否实质覆盖子意图「…」？" }
  }
}
```

响应（每个问题独立）：

```json
{
  "answers": {
    "relevance": { "type": "score", "score": 2.7, "confidence": 0.88 },
    "absolute":  { "type": "noul", "noul": 0.07 },
    "topic_0":   { "type": "noul", "noul": 0.92 }
  },
  "usage": { "input_tokens": 512, "output_tokens": 0, "cost": 0.00002 }
}
```

### 4.2 校验与降级

- `score` 必须有限且 0–3；`noul` 必须 [0,1]；`choice` 必须含合法选项与置信度。
- 超时 4s（可配 0.5–15s）；非 2xx / 解析失败 / 网络错误 → **返回 `null`，宿主保留本地标签报告**，不弹错。
- 单次请求携带全部问题（speculative fan-out），不逐题往返。
- 无 key 时 `jevConfigured()` 为 false，`engine: jev` 直接按本地评分运行。
- 不缓存（M1 可加按 `question+answer+model` 的 LRU）；不做多轮重试（避免拖慢）。

### 4.3 宿主集成

```
assistant/message
  → 本地 label 报告（立即写盘，Chip 立刻可见，pendingJev: true）
  → 若 engine=jev 且已配置 key：异步 classifyWithJev()
      ├─ 成功：labelsToReport(engine:'jev') 覆盖记录，pendingJev: false
      └─ 失败：pendingJev: false，保留本地分
  → 客户端发现 pendingJev 时轮询 800ms，最多 8s，自动更新 Chip/面板
```

---

## 5. 隐私与合规

- Jev 模式会把**当前问题 + 回答**发送给服务商；因此：
  - 默认关闭；没有显式配置 key 永不调用。
  - README / 插件关于页明示数据去向；不把 key 写进报告。
  - 报告只落本地；`jev` 元数据仅保存 provider/model/latency/tokens/cost。
- 若面向国内用户，优先 `typesafe` 官方或自建兼容端点；OpenRouter 属境外服务，需在隐私说明中写清。
- 本地引擎路径完全没有网络请求（可用断网验证）。

---

## 6. 成本、延迟与容量

| 项 | 估算 |
|---|---|
| 单次请求 | 5 个 score + 3 个 noul + ≤5 个 topic noul |
| token | ~500–800 input，0 output |
| 成本 | 约 $0.00002–0.00005/次（按 dsh-jev-interceptor 实测口径） |
| 延迟 | provider p50 ~100ms；境内端到端约 1s（超时 4s） |
| 100 次/天 | 约 $0.002–0.005/天，可忽略 |
| 失败影响 | 仅少了"精评"标签，本地分仍可用 |

建议配置 `jev.maxPerDay` 与预算上限（M1 实现），超限自动降级。

---

## 7. 上线节奏（shadow first）

1. **M1.0（当前）**：默认本地标签引擎；`jev` 代码与假请求测试完成，默认关。
2. **M1.1 影子模式**：开启 `jev`，但**只记录不展示**（本地分照旧），采样对比：
   - Jev vs 本地分的 Spearman / MAE；
   - 5 个维度的置信度分布；
   - 人工抽检 30 条，看标签是否合理。
3. **M1.2 展示**：置信度 ≥0.7 的 Jev 结果替换 Chip；低置信度保留本地分。
4. **M2**：按 Jev 标签做"模型对比/趋势"（同一套标签才能横向比）。

判定门槛（建议）：与本地分的 Spearman ≥0.8、人工抽检一致率 ≥80%、失败率 <2%，再展示。

---

## 8. 校准

- 本地校准：`node scripts/extract-samples.mjs` + `node scripts/calibrate.mjs`（MAE ≤8 再发布）。
- Jev 校准：同一批样本跑两套引擎，输出混淆矩阵：
  - 维度等级 vs 人工等级；
  - 标签命中率（绝对化/跑题/拒答）；
  - 按题型（代码/写作/对比/事实）看偏差。
- 校准集只存本机（`calibration/` 已 gitignore）。

---

## 9. 当前实现状态

| 项 | 状态 |
|---|---|
| 标签体系 + 本地分类 | ✅ `lib/scoring.js`（`classifyLabels` / `scoreWithLabels` / `labelsToReport`） |
| 共享映射 | ✅ 本地与 Jev 走同一个 `labelsToReport()` |
| Jev 请求构造 / 校验 / 降级 | ✅ `lib/jev.js`，假 fetch 测试覆盖 |
| 宿主三引擎切换 | ✅ `engine: labels \| heuristic \| jev`，异步升级 + `pendingJev` |
| 客户端轮询升级 | ✅ 800ms × 最多 8s |
| 测试 | ✅ 22 条（含 Jev 成功/失败/非法响应） |
| shadow 模式 | ⏳ M1.1 |
| 预算/限额/缓存 | ⏳ M1.1 |
| Jev 真实 key 联调 | ⏳ 需要你的服务商账号（TypeSafe 或 OpenRouter） |

---

## 10. 需要你确认的三件事

1. **服务商**：TypeSafe 官方（可能要 waitlist）还是 OpenRouter（现在可用，境外）？
2. **默认策略**：`jev` 保持默认关（推荐），还是安装后引导开启？
3. **隐私文案**：是否接受"开启 Jev 会把当前问答发给服务商"的说明，并放到 README / 关于页？
