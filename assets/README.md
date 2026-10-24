# 二维码与渠道归因

| 文件 | 用途 | 归因 |
|---|---|---|
| `qr-mp.png` | 公众号主码（README / 分享卡默认） | 静态码，无法区分渠道 |
| `qr-donate-wechat.png` | 微信赞赏 | 静态码，无法归因 |
| `qr-donate-alipay.png` | 支付宝 | 静态码，无法归因 |
| `qr-mp-<channel>.png` | **待生成**：公众号后台「带参数二维码」 | 可归因 |

## 生成 8 个渠道带参码

公众号后台 → 内容与互动 → 二维码 → 创建：

| 建议 scene | 渠道 |
|---|---|
| `readme` | GitHub README |
| `market` | dshmarket |
| `awesome` | awesome-dsh-plugin |
| `bilibili` | B站 |
| `xhs` | 小红书 |
| `zhihu` | 知乎 |
| `card` | 分享卡 |
| `kol` | KOL 内测 |

把导出的图片命名为 `qr-mp-<scene>.png` 放在本目录，然后在 README/分享卡按渠道替换引用。
公众号后台可直接看到每个 scene 的扫码/关注数，这就是最可靠的低成本归因。
