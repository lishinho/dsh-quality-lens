# 上架清单（v0.1.0）

> 仓库：https://github.com/lishinho/dsh-quality-lens
> 创建时间：2026-10-24 12:47 CST（满足 awesome“满 1 天”要求最早 2026-10-25 12:47 CST）

## 已完成

- [x] 公开仓库 `lishinho/dsh-quality-lens`，默认分支 `main`
- [x] topics：`dsh-plugin`、`deepseek-harness`、`cordis`、`prompt-engineering`、`observability`、`quality`
- [x] GitHub Actions `test` 绿（31 条测试）
- [x] GitHub Release `v0.1.0` / `v0.1.2`，附预构建 `dsh-quality-lens.tgz`
- [x] npm `dsh-quality-lens@0.1.2`（latest）
- [x] `screenshots.json` + 3 张原型截图（README 已说明原型）
- [x] awesome 条目文件 `docs/awesome-entry.yml`
- [x] awesome PR #9289 已合并（2026-10-26 17:01 UTC）
- [x] dsh-plugin-catalog `2026.1027.11136` 已收录 `dsh-quality-lens@0.1.2`

## 1. npm 发布（已完成）

> 2026-10-24 已通过 GitHub Actions `publish-npm` 发布 **dsh-quality-lens@0.1.2**（含凭证打码安全补丁）。
> npm 对新包首次自动化发布会先进入 staged 队列；本次 registry 已完成发布（latest=0.1.0）。

如果以后要换 token，两条路：

**A. 本机登录后发布（需要能跑 pnpm/npm 的终端）**

```sh
export DSH_DESKTOP_NODE_EXECUTABLE="/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness"
NODE="/Applications/DeepSeek Harness.app/Contents/Resources/runtime/bin/node"
PNPM="/Applications/DeepSeek Harness.app/Contents/Resources/runtime/primary-runtime/dependencies/pnpm/bin/pnpm.cjs"
"$NODE" "$PNPM" login
"$NODE" "$PNPM" publish --access public
```

**B. GitHub Actions（推荐，不用本机 npm）**

> 注意：npm 已在 2025-11-05 禁用 classic / automation token，现在只能创建
> **Granular Access Token**；CI 发布还需勾选 **Bypass 2FA**。
> 参考：[npm security update](https://github.blog/changelog/2025-11-05-npm-security-update-classic-token-creation-disabled-and-granular-token-changes/)

1. 打开 https://www.npmjs.com/settings/~/tokens → **Generate New Token** → **Granular Access Token**；
2. Name 填 `dsh-quality-lens-ci`；Expiration 选 90 天（写权限 token 上限 90 天）；
3. Packages and scopes → **Read and write** → 选 **All packages**（首次发布包还不存在，不能只选单包）；
4. 勾选 **Bypass 2FA**（非交互 CI 必须）；
5. 生成后复制一次 token（`npm_...`，只显示一次）；
6. GitHub 仓库 → Settings → Secrets and variables → Actions → **New repository secret**：
   Name `NPM_TOKEN`，Value 粘贴 token；
7. Actions → `publish-npm` → **Run workflow**（或 `gh workflow run publish-npm -R lishinho/dsh-quality-lens`）；
8. 验证：`https://registry.npmjs.org/dsh-quality-lens` 出现 0.1.0。

发布成功后可以：

- 把 granular token 缩到只允许 `dsh-quality-lens`；
- 或改用 npm **Trusted Publishing (OIDC)**，去掉长期 token。

发布后把 README 的“发布后”替换成正式命令（已经是 `dsh plugin add dsh-quality-lens`）。

## 2. awesome-dsh-plugin PR（已提交，等维护者合并）

**为什么等**：列表 CI 检查仓库创建满 1 天；现在提会被拒。

**PR：** https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/9289  
**状态：** 已合并。条目页：https://awesome-dsh-plugin.com/p/lishinho/dsh-quality-lens/

```sh
gh repo fork awesome-dsh-plugin/awesome-dsh-plugin --clone=true
cd awesome-dsh-plugin
git checkout -b add-lishinho-dsh-quality-lens
mkdir -p data/plugins
cp ~/Documents/deepseek-harness/default-workspace/dsh-plugin-guide/dsh-quality-lens/docs/awesome-entry.yml \
   data/plugins/lishinho__dsh-quality-lens.yml
git add data/plugins/lishinho__dsh-quality-lens.yml
git commit -m "Add lishinho/dsh-quality-lens"
git push -u origin add-lishinho-dsh-quality-lens
gh pr create --title "Add lishinho/dsh-quality-lens" --body "Adds 模型质量雷达: five-dimension quality + topic coverage, evidence-backed report, copy-ready prompt advice. Observational only; local by default, optional Jev review."
```

注意：

- 一个 PR 只加 1 个文件；不要手改 README（CI 生成）；
- 描述必须与代码一致（已按 `docs/plugin-listing.md` 的“可核验声明”写）；
- PR 里只动自己的条目。

## 3. dshmarket / 目录收录（自动）

awesome 列表合并后：

1. 列表仓库 nightly build 重新生成站点并发布 `dsh-plugin-catalog` npm 包；
2. dshmarket 的目录从该 catalog 读取（README 里写的是 `dsh-plugin-catalog/index.json`）；
3. 通常在合并后 1 天内出现在 dshmarket，无需单独提交。

验证：dshmarket → Discover 搜索 `模型质量雷达` / `dsh-quality-lens`；或直接看
`https://cdn.jsdelivr.net/npm/dsh-plugin-catalog/index.json` 是否包含该包。

## 4. 可选：官方 Discover 自定义索引

DSH 不内置索引源。如果想在官方 **Plugins → Discover** 里出现，可以自建一个 format-1
`index.json`（title/description/plugins/versions/source），托管到 GitHub Pages，再让用户添加索引源。
标准市场（dshmarket）已覆盖，这一步不是必需。

## 5. 可选：DSHHub 口令市场（付费/私域）

如果以后做付费版，可在 [dshhub.co](https://www.dshhub.co/zh/publish) 上架为口令商品；
免费版不走这条。

## 6. 发布素材与归因

- 公众号 8 个带参二维码（README/dshmarket/awesome/B站/小红书/知乎/分享卡/KOL）→ `assets/qr-mp-<scene>.png`，替换 README/分享卡引用；
- 发布节奏：GitHub/Release → 公众号长文 → 小红书/B站 → awesome PR 合并后再发一轮“已上架”；
- 归因：带参码 + 渠道关键词 + UTM（详见 `dsh-plugin-guide/telemetry-quality-lens.md`）。

## 当前阻塞汇总

| 事项 | 状态 | 需要 |
|---|---|---|
| GitHub 仓库/Release | ✅ | — |
| npm 发布 | ✅ `dsh-quality-lens@0.1.0` | — |
| awesome PR | ✅ #9289 已合并（2026-10-26 17:01 UTC） | — |
| dshmarket | ✅ catalog 已收录（2026.1027.11136） | 刷新 dshmarket 即可看到 |
| 真实报告截图/GIF | ⏳ | 当前 Chip 用真机图，报告/追问用原型并已标注 |
