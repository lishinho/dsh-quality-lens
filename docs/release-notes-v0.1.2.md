# 模型质量雷达 v0.1.2

安全补丁续：**Jev 请求也不会携带用户粘贴的 token**。

- v0.1.1 已修复报告/证据/话题标签中的凭证打码与旧报告清洗；
- v0.1.2 把同一套 `redactSecrets()` 应用到 Jev 的 `state`（question / answer / context / contextAnswer），
  即使开启精评，凭证样式字符串也不会发到第三方；
- 新增“旧报告含 token 时加载即清洗”的回归测试；测试总数 33。

建议升级到 `0.1.2` 并重启 DSH。
