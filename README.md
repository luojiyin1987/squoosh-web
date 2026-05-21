# Squoosh Web

一个部署到 Cloudflare Pages 的静态前端，图片压缩全部在浏览器本地完成。

A static frontend deployed to Cloudflare Pages where image compression happens entirely in the browser.

---

## 技术选型 / Tech Stack

- 前端 / Frontend：`Vite + React + TypeScript`
- 编码器 / Codecs：`@jsquash/jpeg`、`@jsquash/webp`、`@jsquash/avif`、`@jsquash/oxipng`
- 部署 / Deploy：`Cloudflare Pages`
- 处理位置 / Processing location：浏览器本地，不上传原图 / Browser-local, original images are never uploaded

`jSquash` 的 codec 来自 Squoosh App 的 WASM 封装，适合这种纯前端静态站点。

`jSquash` codecs are WASM wrappers derived from the Squoosh App, suitable for pure front-end static sites like this one.

---

## 本地开发 / Local Development

```bash
pnpm install
pnpm dev
```

---

## 生产构建 / Production Build

```bash
pnpm build
```

Vite 会输出到 `dist/`。

Vite outputs to `dist/`.

---

## Cloudflare Pages

- Framework preset / 框架预设：`React (Vite)`
- Build command / 构建命令：`pnpm build`
- Build output directory / 构建输出目录：`dist`

这个项目不依赖 Pages Functions，Cloudflare 只负责静态托管、域名和 CDN。

This project does not rely on Pages Functions; Cloudflare only handles static hosting, domain, and CDN.

---

## 自定义域名 / Custom Domain

Pages 项目的自定义域名建议直接在 Cloudflare Dashboard 配置：

For custom domains on Pages projects, configure directly in the Cloudflare Dashboard:

1. 打开 / Open `Workers & Pages`
2. 进入 / Enter Pages project `squoosh-web`
3. 在 `Custom domains` 里添加域名 / Add your domain under `Custom domains`
4. 按提示添加或确认 DNS 记录 / Follow the prompts to add or confirm DNS records

- `Pages` 方案下，不需要在 `wrangler.toml` 里配置 `[[routes]]`
- Under the `Pages` plan, there is no need to configure `[[routes]]` in `wrangler.toml`
- 如果域名已接入 Cloudflare，通常使用 `CNAME -> <project>.pages.dev` 即可
- If the domain is already on Cloudflare, a `CNAME -> <project>.pages.dev` usually suffices
- 建议开启 `SSL/TLS -> Edge Certificates -> Always Use HTTPS`
- Recommended: enable `SSL/TLS -> Edge Certificates -> Always Use HTTPS`

### 生效延迟 / Propagation Delay

自定义域名刚接入时，可能需要等待一段时间才完全稳定，常见影响因素包括：

When a custom domain is first connected, it may take some time to fully stabilize. Common factors include:

- DNS 记录全球传播 / Global DNS propagation
- Cloudflare Pages 自定义域名绑定状态同步 / Cloudflare Pages custom domain binding status sync
- Edge certificate 签发和下发 / Edge certificate issuance and distribution
- 边缘缓存刷新 / Edge cache refresh

在这段时间里，可能会短暂出现：

During this period, you may briefly encounter:

- 域名访问异常 / Domain access anomalies
- `http` / `https` 跳转不稳定 / Unstable `http` / `https` redirects
- 部分地区已生效、部分地区未生效 / Some regions active while others are not

如果刚完成配置，建议先等待几分钟到几十分钟，再重新检查 `Custom domains` 状态是否为 `Active`。

If you just finished configuration, wait a few minutes to tens of minutes, then recheck whether the `Custom domains` status is `Active`.

---

## Wrangler 部署 / Wrangler Deployment

项目已经集成了 `wrangler` 和 Pages 配置文件 [wrangler.toml](./wrangler.toml)。

The project already integrates `wrangler` and the Pages config file [wrangler.toml](./wrangler.toml).

首次使用前，需要先登录并创建 Pages 项目：

Before first use, log in and create the Pages project:

```bash
npx wrangler login
pnpm cf:project:create  # 后面还需要运行 pnpm cf:deploy 进行部署 / Then run pnpm cf:deploy to deploy
```

如果你在 Cloudflare 上创建的项目名不是 `squoosh-web`，请同步修改 `wrangler.toml` 里的 `name`。

If your Cloudflare project name is not `squoosh-web`, update the `name` in `wrangler.toml` accordingly.

默认脚本会创建名为 `squoosh-web`、生产分支为 `main` 的 Pages 项目。

The default script creates a Pages project named `squoosh-web` with production branch `main`.

本地可用命令 / Available local commands:

```bash
pnpm cf:dev
pnpm cf:deploy
```

- `cf:dev` 会先构建 `dist/`，再用 `wrangler pages dev` 以 Pages 方式本地预览
- `cf:dev` builds `dist/` first, then previews locally with `wrangler pages dev`
- `cf:deploy` 会构建后直接发布到 Cloudflare Pages
- `cf:deploy` builds and then deploys directly to Cloudflare Pages

---

## GitHub Actions 自动化部署 / GitHub Actions Automated Deployment

仓库包含工作流 / The repository includes the workflow [pages-deployment.yml](./.github/workflows/pages-deployment.yml):

- push 到 `main`：自动发布到生产环境 / push to `main`: auto-deploy to production
- Pull Request：自动创建 Pages 预览部署 / Pull Request: auto-create Pages preview deployment
- `workflow_dispatch`：支持手动触发，并按 `main` 分支发布 / `workflow_dispatch`: manual trigger, publishes from `main`

需要在 GitHub 仓库里配置两个 Secrets / Two Secrets must be configured in the GitHub repository:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

`CLOUDFLARE_API_TOKEN` 需要具备 `Account / Cloudflare Pages / Edit` 权限。

`CLOUDFLARE_API_TOKEN` requires the `Account / Cloudflare Pages / Edit` permission.

---

## 当前实现 / Current Implementation

- 浏览器本地读取图片并转成 `ImageData`
- Read images locally in the browser and convert to `ImageData`
- 懒加载 WASM codec，避免首屏把所有编码器一次性打进来
- Lazy-load WASM codecs to avoid bundling all encoders on first paint
- 支持 `MozJPEG / WebP / AVIF / OxiPNG`
- Supports `MozJPEG / WebP / AVIF / OxiPNG`
- 输出压缩前后体积、节省比例、处理耗时和下载结果
- Output before/after size, savings ratio, processing time, and download result

---

## 注意 / Notes

- 重新编码会丢失原图中的 EXIF / ICC 等元数据
- Re-encoding will lose metadata such as EXIF / ICC from the original image
- AVIF 编码明显慢于 JPEG / WebP，属于预期表现
- AVIF encoding is noticeably slower than JPEG / WebP, which is expected behavior
