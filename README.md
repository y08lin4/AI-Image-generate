# AI Image Generate

<p align="center">
  <a href="https://deploy.workers.cloudflare.com/?url=https://github.com/y08lin4/AI-Image-generate">
    <img src="https://deploy.workers.cloudflare.com/button" alt="Deploy to Cloudflare" />
  </a>
</p>

轻量级 AI 生图工作台：前端配置自定义 API URL / Key，Cloudflare Worker 负责代理请求，支持文生图、图生图、多图生成、多任务队列、超时、比例、分辨率档位、放大预览和本地历史。

## 功能

- API URL / API Key 保存在浏览器本地，不保存在 Worker。
- Worker 访问密码由 `wrangler.jsonc` 的 `ACCESS_PASSWORD` 控制。
- 支持两种请求方式：`Worker 流式代理` 和 `浏览器直连`。
- 支持文生图与图生图，图生图可上传多张参考图。
- 支持一次生成多张：按并发数拆成多个单图请求，完成一张展示一张。
- 支持多任务队列：任务提交后会在后台生成，页面可以继续提交新任务。
- 支持比例：`自动`、`1:1`、`2:3`、`3:2`、`3:4`、`4:3`、`9:16`、`16:9`。
- 支持分辨率档位：`自动`、`标准`、`2K`、`4K`。
- 支持生成结果操作：下载、复制到剪贴板、作为图生图参考图、放大预览。
- 支持超时时间：默认 420 秒，最大 900 秒。
- 历史记录保存在浏览器 IndexedDB。

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

比例和分辨率是两个独立选项：

- 比例控制宽高关系，例如 `1:1`、`16:9`、`9:16`。
- 分辨率档位控制输出像素大小，例如 `标准`、`2K`、`4K`。
- 比例或分辨率任意一项选择 `自动` 时，前端和 Worker 都不会向上游传 `size` 参数，由模型或上游接口自行决定图片尺寸。

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

### 浏览器直连

```text
浏览器 -> 上游 /images/generations 或 /images/edits
```

- 链路最短，API Key 完全不经过 Worker。
- 上游必须支持浏览器 CORS。
- HTTPS 页面无法直连 HTTP API；这种情况请使用 Worker 代理。
- 如果出现 `Failed to fetch`，通常是 CORS 或网络策略问题。

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

1. 修改 `wrangler.jsonc`：

```jsonc
"vars": {
  "ACCESS_PASSWORD": "改成你自己的访问密码",
  "ALLOW_HTTP_API": "true",
  "ALLOW_PRIVATE_HOSTS": "false"
}
```

2. 部署：

```bash
npm run worker:deploy
```

3. 打开站点后，在「设置」里填写：

- Worker 访问密码：和 `ACCESS_PASSWORD` 一致
- API URL：例如 `https://api.openai.com/v1`
- API Key：你的上游 API Key
- 模型：例如 `gpt-image-2`
- 请求方式：默认选 `Worker 流式代理`；如果上游支持 CORS，可以改成 `浏览器直连`

## 安全说明

- Worker 不保存 API Key，也不打印请求体。
- `ACCESS_PASSWORD` 只用于防止你的 Worker 被别人直接滥用。
- 默认值 `change-me` 会被视为未配置，部署后必须修改。
- 默认阻止代理 localhost、内网 IP 和 metadata 地址。
- 如果不想允许 HTTP API，把 `ALLOW_HTTP_API` 改成 `false`。
