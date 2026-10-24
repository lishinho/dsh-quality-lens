# 模型质量雷达 v0.1.1

安全与隐私补丁：**报告不再回显用户粘贴的 token**。

## 修复

- 新增凭证样式字符串识别与打码：`npm_`、`ghp_`/`gho_`、`github_pat_`、`sk-`、`AKIA`、`xox*`、`Bearer …`。报告、话题标签、证据引用、提示词建议、问题预览都会显示 `[REDACTED]`。
- 纯 token / “token: xxx” 这类消息不再被当作问题评分（不会出现 Chip）。
- 旧版本写入的 `$DSH_HOME/quality-lens/reports.jsonl` 在加载时自动清洗并重写，避免历史 token 再次显示。
- 反馈写入同样经过打码。

## 升级

```sh
dsh plugin --profile web add dsh-quality-lens@0.1.1
# 本地目录安装则重启 DSH 即可
```

重启后建议删除旧文件（可选，插件已会自动清洗）：

```sh
rm ~/.dsh/quality-lens/reports.jsonl
```

## 验证

- 32 条测试通过（新增凭证打码用例）
- 本地安装/评分/报告链路不变
