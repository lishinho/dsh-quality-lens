# 上架与推荐文案

> 所有文案以“可核验”为准：不写“最准/100%/官方”，Jev 标为可选，原型截图标注“原型”。

## 1. GitHub About（仓库简介）

**中文**

> 为每条 DSH 回答做质量与话题关联体检，给出证据与可复制的提示词改进；只观测不改写，默认本地，可选 Jev 精评。

**English**

> Quality and topic-coverage radar for every DeepSeek Harness answer: evidence-backed reports plus copy-ready prompt fixes. Observational, local-first, optional Jev review.

## 2. awesome-dsh-plugin 条目

文件：`data/plugins/lishinho__dsh-quality-lens.yml`（本仓库 [`docs/awesome-entry.yml`](awesome-entry.yml) 有一份可直接复制的版本）

```yaml
url: https://github.com/lishinho/dsh-quality-lens
name: lishinho/dsh-quality-lens
category: tools
description:
  en: 'Scores each assistant answer on five dimensions plus topic coverage, shows evidence, and turns the weakest dimension into copy-ready prompt advice. Observational only; local by default, with optional Jev review.'
  zh: '为每条回答给出五维质量分与话题覆盖度，附证据，并把最弱的一项转成可直接复制的提示词改写。只观测不改写；默认本地评分，可选 Jev 精评。'
icon: https://raw.githubusercontent.com/lishinho/dsh-quality-lens/main/assets/icon-180.png
# 发布 npm 后再补 tarball（可选）：
# tarball: https://github.com/lishinho/dsh-quality-lens/releases/latest/download/dsh-quality-lens.tgz
```

分类理由：核心是“分析/度量能力”，放 `tools`；如果审核认为更偏界面增强，可改 `ui`，但不要放 `usage`（那是用量/计费）。

## 3. 市场/插件页长描述（中文）

**模型质量雷达**给每条回答做三件事：

1. **打分**：五维质量 + 话题关联度，动作行内嵌 Chip，点开有证据、置信度与评分口径；
2. **给提示词建议**：报告底部把回答的短板翻译成“下次怎么问”，每条都能一键复制成改写后的提问；
3. **可校准**：默认本地标签引擎，零成本、离线；需要更强语义判断时可开 Jev 精评，失败自动回退。

它**不自动改写答案**，也不做公开模型排行榜；分数用于比较表达与任务达成，不裁决事实。

## 4. English long copy

**Model Quality Radar** adds a small chip to every assistant answer and opens an evidence-backed report:

- five quality dimensions plus topic coverage;
- copy-ready prompt fixes derived from the weakest dimension;
- local label engine by default, with an optional Jev review that falls back silently.

It observes; it never rewrites the answer. Scores compare expression and task completion, not factual truth.

## 5. 社交/公众号短文案

**一句话**

> 你的 AI 回答到底几分？模型质量雷达给每条回答做体检，还告诉你下次怎么问。

**小红书/朋友圈**

> 装了个 DSH 插件：每条回答下面直接显示质量和话题关联度，点开能看到证据。最实用的是它会把“哪里没答好”翻译成“下次怎么问”，改写的 prompt 一键复制。只观测不改写，默认本地评分，不传对话。

**B 站/视频口播**

> 这个插件不帮你改答案，它帮你判断这次回答值不值得信；点开报告，五维、关联度、证据都在；底部还有“提示词调优”，直接把下次该怎么问写好，复制就能用。

## 6. 截图顺序与配文

| 顺序 | 文件 | 配文 |
|---|---|---|
| 1 | `assets/screenshots/panel.png` | 动作行 Chip + 五维、话题关联、证据、提示词调优 |
| 2 | `assets/screenshots/followup.png` | 追问场景：关联度参考上下文，显示「含上下文 82%」 |
| 3 | `assets/screenshots/chat.png` | Chip 内嵌动作行，无分不渲染、不占位 |

商店截图（`screenshots.json`）只放当前插件已实现的三张；分享卡是规划中设计，不放进商店截图。

## 7. 可核验声明（给审核/用户）

| 文案 | 对应实现 |
|---|---|
| 五维 + 话题覆盖 | `lib/scoring.js` `classifyLabels` / `labelsToReport` |
| 提示词调优 + 复制改写 | `buildPromptTips`；`lib/client.js` `PromptTip` 复制按钮 |
| 上下文感知 / 含上下文 | `isFollowUp` / `continuationScore`；`lib/host.js` 历史上下文 |
| 只观测不改写 | Host 只监听 `session/event`，无 steer / 重写 / 二次调用 |
| 本地默认、无遥测 | 默认 `engine: labels`；无上报代码 |
| 可选 Jev | `lib/jev.js`，默认关、无 key 不调用、失败回退 |
| 校准工具 | `scripts/extract-samples.mjs` / `make-labeling-page.mjs` / `calibrate.mjs` |

## 8. 不要写的话

- “最准 / 100% 准确 / 官方认证”——没有依据；
- “自动帮你改好答案”——产品明确不改写；
- “支持所有模型的事实核查”——只评表达与任务达成；
- 截图不要标成“真实安装截图”，原型就写原型。
