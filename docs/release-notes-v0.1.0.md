# 模型质量雷达 v0.1.0

首个公开版本：给每条 DSH 回答做一次可解释的质量体检，并把短板翻译成可复制的提示词改进。

## 亮点

- **动作行 Chip**：`质量 xx · 关联 xx%`，无分不渲染、不占位；点击打开报告。
- **五维报告**：相关性 / 完整性 / 可信度 / 清晰度 / 可执行性 + 话题关联度、证据引文、置信度。
- **提示词调优**：每条建议带可直接复制的改写提问；对比/排错/建议题有专属建议。
- **上下文感知**：短追问参考上一轮问题与回答，显示「含上下文 xx%」；新短问题不会被旧上下文误判。
- **只观测不改写**：不 steer、不重写、不打断流式输出。
- **默认本地**：本地标签引擎，0 token、不联网；无遥测。
- **可选 Jev**：类型化 `score`/`noul` 判定，带置信度，失败自动回退本地分。
- **可校准**：附带抽取、离线标注、MAE/Spearman 校准脚本。

## 安装

```sh
# npm
dsh plugin --profile web add dsh-quality-lens

# GitHub
dsh plugin --profile web add github:lishinho/dsh-quality-lens

# 预构建 tarball（无需构建）
dsh plugin --profile web add https://github.com/lishinho/dsh-quality-lens/releases/latest/download/dsh-quality-lens.tgz

# 桌面端：插件页 → 添加插件 → 安装第三方插件 → 本地目录
```

## 验证

- 31 条测试通过（规则 / 标签 / Jev 假请求 / 宿主 / 客户端 bundle）
- GitHub Actions 绿
- 本地真实 DSH profile 验证：插件加载、health 路由、客户端 bundle 注入

## 已知限制

- 分享卡、历史/趋势、Jev 影子模式仍在规划中；
- 截图来自交互原型，实际安装后的 Chip/报告与之一致；
- 评分是启发式/分类判断，不是事实核查；目标 MAE ≤ 8（需用真实样本校准）。
