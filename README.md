# AI Image Generate

<p align="center">
  <a href="https://deploy.workers.cloudflare.com/?url=https://github.com/y08lin4/AI-Image-generate">
    <img src="https://deploy.workers.cloudflare.com/button" alt="Deploy to Cloudflare" />
  </a>
</p>

轻量级 AI 生图工作台：前端配置自定义 API URL / Key，Cloudflare Worker 负责代理请求，支持文生图、图生图、多图生成、多任务队列、超时、比例、分辨率档位、放大预览、本地历史、PiXhost 图床上传和友好错误提示。

## 功能

- API URL / API Key 保存在浏览器本地，不保存在 Worker。
- Worker 访问密码由 `wrangler.jsonc` 的 `ACCESS_PASSWORD` 控制。
- 支持三种请求方式：`Worker 流式代理`、`Worker 后台任务` 和 `浏览器直连`。
- 支持文生图与图生图，图生图可上传多张参考图。
- 支持一次生成多张：按并发数拆成多个单图请求，完成一张展示一张。
- 支持多任务队列：任务提交后页面可以继续提交新任务。
- 支持 Worker 后台任务模式：任务由 Cloudflare Workflows 执行，D1 保存任务状态和 PiXhost 图片直链；App/WebView 切后台后，回到前台会自动恢复任务。
- 支持比例：`自动`、`1:1`、`2:3`、`3:2`、`3:4`、`4:3`、`9:16`、`16:9`。
- 支持分辨率档位：`自动`、`标准`、`2K`、`4K`。
- 支持生成结果操作：下载、复制到剪贴板、作为图生图参考图、全屏放大预览。
- App / WebView 下的图床图片展示、下载、复制会走 Worker 图片代理，避免 PiXhost 直链跳转和 CORS 导致的复制失败。
- 全屏预览已抽离为独立组件，会读取图片真实尺寸，显示实际像素尺寸、实际宽高比和图片文件大小，并支持在预览里复制图片 / URL。
- 支持自动上传或单张手动上传生成图到 PiXhost 图床；自动上传可关闭，手动上传可在图片悬浮时点击「上传图床」。
- 上传失败后图片悬浮按钮会显示「重试上传」；上传成功后可复制 PiXhost 图片直链 URL。
- 后台任务支持失败后重试、云端任务列表同步，并显示「今日已生成」与「累计已生成」统计。
- 支持超时时间：默认 420 秒，最大 900 秒。
- 历史记录保存在浏览器 IndexedDB，本地历史栏支持一键收起/展开，历史缩略图支持放大预览、复制、作为参考图，也可以一键「放到结果」在中间区域完整查看多张历史图；已上传图床的图片会同步保存图床 URL，后续可继续复制。
- 针对常见错误提供明确提示：401 Key 错误或额度问题、403 无权限 / 模型不可用、413 图片太大、429 限流、524 Cloudflare 100 秒熔断、CORS 建议切换 Worker 模式。

## 接口约定

本项目只针对 `gpt-image-2` 的两个图片接口：

| 模式 | 上游接口 |
| --- | --- |
| 文生图 | `POST /v1/images/generations` |
| 图生图 | `POST /v1/images/edits` |

设置里的 API URL 请填写根地址，例如：

```text
https://api.example.com/v1
```

如果误填完整接口地址，例如 `https://api.example.com/v1/images/generations`，Worker 会自动规整为 `https://api.example.com/v1` 后再拼接正确接口。

图生图支持最多 8 张参考图，前端会以 `image[]` 字段追加到 `multipart/form-data`：

```text
image[]
image[]
...
```

单张参考图限制 12MB，总大小限制 50MB。

## 比例和分辨率

界面会先选择分辨率，再根据分辨率给出可选比例：

- 比例控制宽高关系，例如 `1:1`、`16:9`、`9:16`。
- 分辨率档位控制输出像素大小，例如 `标准`、`2K`、`4K`。
- 分辨率和比例都选择 `自动` 时，前端和 Worker 不会向上游传 `size` 参数，由模型或上游接口自行决定图片尺寸。
- 分辨率选择 `自动`、比例选择具体值时，会按 `标准` 档尺寸传给接口，确保 `16:9`、`9:16` 等比例不会被上游改成其它方向。
- 分辨率选择 `标准 / 2K / 4K` 时，比例必须选择具体值，避免出现「选了 4K 但比例还是自动，实际没有传 size」的情况。

当前内置尺寸映射：

| 比例 | 标准 | 2K | 4K |
| --- | --- | --- | --- |
| `1:1` | `1024x1024` | `2048x2048` | `2880x2880` |
| `2:3` | `1024x1536` | `1344x2016` | `2336x3504` |
| `3:2` | `1536x1024` | `2016x1344` | `3504x2336` |
| `3:4` | `768x1024` | `1536x2048` | `2448x3264` |
| `4:3` | `1024x768` | `2048x1536` | `3264x2448` |
| `9:16` | `1008x1792` | `1152x2048` | `2160x3840` |
| `16:9` | `1792x1008` | `2048x1152` | `3840x2160` |

> 4K 请求通常更慢、费用更高，建议使用 Worker 流式代理并把超时时间设置到 300-600 秒以上。
> 后台任务会优先把结果上传到 PiXhost 保存直链。PiXhost 单张图片最大 10MB；如果原图超过 10MB，Worker 不会压缩，会把原图临时分片存入 D1，前端轮询到结果后再原样拉回本地展示和保存到本地历史。

## 请求方式

### Worker 流式代理（默认）

```text
浏览器 -> /api/generate-stream -> Worker -> 上游图片接口
```

- 推荐使用。
- 可以绕过上游 CORS 限制。
- Worker 使用 SSE 保活，生成期间每 10 秒发送一次 `ping`。
- 多图生成时，哪一张先完成就先返回哪一张。
- 需要填写 Worker 访问密码。
- 自动上传 PiXhost 图床也通过 Worker 代理，并复用同一个 Worker 访问密码。

### Worker 后台任务

```text
浏览器/App -> /api/background-tasks -> Worker -> Cloudflare Workflows -> 上游图片接口 -> PiXhost -> D1
```

- 适合 100-300 秒的长时间生图，尤其适合 App/WebView 切后台场景。
- 文生图和图生图都支持后台任务；图生图会先把参考图上传 PiXhost，再把参考图 URL 交给 Workflow 使用。
- 生成结果会自动上传 PiXhost，D1 只保存任务状态、参数摘要和图片直链，不保存生成图片二进制。
- D1 不保存 API Key；重试失败任务时，需要浏览器当前设置里仍有 API Key。
- 前端会在 `visibilitychange` / `focus` 时自动同步未完成任务，也可以手动点「同步云端任务」。
- 需要 Cloudflare D1 和 Workflows 绑定。

### 浏览器直连

```text
浏览器 -> 上游 /images/generations 或 /images/edits
```

- 链路最短，API Key 完全不经过 Worker。
- 上游必须支持浏览器 CORS。
- HTTPS 页面无法直连 HTTP API；这种情况请使用 Worker 代理。
- 如果出现 `Failed to fetch`，通常是 CORS 或网络策略问题。
- 如果上游返回 `HTTP 524`，通常是 Cloudflare 100 秒自动熔断；可切换其他线路域名或改用非 Cloudflare 中转后重试。

## PiXhost 图床上传

在「设置」里开启 **生成成功后自动上传到 PiXhost 图床** 后，每张成功生成的图片会自动上传到 PiXhost。上传成功后，鼠标悬浮到结果图上会出现 **复制URL** 按钮，点击可复制 PiXhost 图片直链。

如果关闭自动上传，单张生成图仍然可以手动上传：鼠标悬浮到图片上点击 **上传图床**。如果上传失败，悬浮按钮会变成 **重试上传**，再次点击即可重试。上传成功的图床 URL 会写入本地历史记录，刷新页面后仍可在历史缩略图或全屏预览里复制 URL。

实现说明：

- 前端把生成图的 `data URL` 发送到 Worker 的 `POST /api/upload-pixhost`。
- Worker 校验访问密码后，用 `multipart/form-data` 调用 PiXhost `POST https://api.pixhost.to/images`。
- 上传字段：
  - `img`：图片文件。
  - `content_type=0`：按 PiXhost 文档表示 safe 图片。
  - `max_th_size=420`：缩略图最大尺寸。
- 返回后会把 PiXhost 的 `show_url` 从 `https://pixhost.to/show/...` 转成 `https://img2.pixhost.to/images/...` 图片直链再复制。
- 前端展示、下载和复制图床图片时会使用 `GET /api/image-proxy?url=...` 代理读取 PiXhost 图片，解决 App WebView 直接打开 URL 或浏览器 CORS 导致复制失败的问题。
- PiXhost 限制：支持 `JPG / PNG / GIF`，单张最大 `10MB`。4K PNG 可能超过 10MB，超过时会显示上传失败，但不影响原图下载。
- 后台任务模式下，如果 PiXhost 因 10MB 限制拒绝上传，Worker 会把原始图片分片写入 D1，并通过 `GET /api/background-tasks/:id/images/:index` 回传到本地；不压缩、不改格式。

> 自动上传会把图片发送到第三方图床。涉及私密图片时请不要开启。

后台任务模式下，生成结果和图生图参考图都会经过 PiXhost，因为本项目不使用 R2 存图片，只在 D1 保存图片直链。

## 错误提示

前端和 Worker 会尽量把常见 HTTP / 网络错误转换成可操作的中文提示：

| 错误 | 含义与建议 |
| --- | --- |
| `401` | API Key 错误或额度问题，请检查 Key、账户余额和接口权限。 |
| `403` | 无权限访问该接口或模型，模型可能不可用。 |
| `413` | 图片太大，请压缩图片、减少参考图或降低分辨率。 |
| `429` | 请求过多触发限流，请降低并发、减少张数或稍后重试。 |
| `524` | Cloudflare 100 秒自动熔断，可切换其他线路域名或非 Cloudflare 中转。 |
| `CORS` | 浏览器直连被上游拦截，建议切换到 Worker 流式代理模式。 |

## 一键部署

点击上方 **Deploy to Cloudflare** 按钮即可从 GitHub 仓库创建 Cloudflare Worker。部署后请在 Cloudflare 控制台或 `wrangler.jsonc` 中把 `ACCESS_PASSWORD` 改成自己的密码。默认值 `change-me` 不会被 Worker 接受。

> 注意：按钮依赖 GitHub 上的当前仓库内容。第一次使用前，需要先把代码提交并推送到 `https://github.com/y08lin4/AI-Image-generate`。

## 本地开发

```bash
npm install
npm run dev
```

纯 Vite 开发只跑前端，`/api/generate-stream` 不会生效。要完整测试 Worker：

```bash
npm run worker:dev
```

## 部署到 Cloudflare Worker

1. 创建 D1 数据库并应用迁移：

```bash
npx wrangler d1 create ai-image-generate
npx wrangler d1 migrations apply ai-image-generate --remote
```

如果 Wrangler 返回 `database_id`，请按提示把它填进 `wrangler.jsonc` 的 `d1_databases` 配置中。

2. 修改 `wrangler.jsonc`：

```jsonc
"vars": {
  "ACCESS_PASSWORD": "改成你自己的访问密码",
  "ALLOW_HTTP_API": "true",
  "ALLOW_PRIVATE_HOSTS": "false"
}
```

3. 部署：

```bash
npm run worker:deploy
```

4. 打开站点后，在「设置」里填写：

- Worker 访问密码：和 `ACCESS_PASSWORD` 一致
- API URL：例如 `https://api.openai.com/v1`
- API Key：你的上游 API Key
- 模型：例如 `gpt-image-2`
- 请求方式：默认选 `Worker 流式代理`；App 长任务建议选 `Worker 后台任务`；如果上游支持 CORS，可以改成 `浏览器直连`

## 安全说明

- Worker 不保存 API Key，也不打印请求体。
- Worker 后台任务为了断流后继续执行，会把 API Key 传给 Cloudflare Workflow 实例使用；D1 不保存 API Key。
- `ACCESS_PASSWORD` 只用于防止你的 Worker 被别人直接滥用。
- 默认值 `change-me` 会被视为未配置，部署后必须修改。
- 默认阻止代理 localhost、内网 IP 和 metadata 地址。
- 如果不想允许 HTTP API，把 `ALLOW_HTTP_API` 改成 `false`。
