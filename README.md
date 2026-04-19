# Squoosh Web

一个部署到 Cloudflare Pages 的静态前端，图片压缩全部在浏览器本地完成。

## 技术选型

- 前端：`Vite + React + TypeScript`
- 编码器：`@jsquash/jpeg`、`@jsquash/webp`、`@jsquash/avif`、`@jsquash/oxipng`
- 部署：`Cloudflare Pages`
- 处理位置：浏览器本地，不上传原图

`jSquash` 的 codec 来自 Squoosh App 的 WASM 封装，适合这种纯前端静态站点。

## 本地开发

```bash
pnpm install
pnpm dev
```

## 生产构建

```bash
pnpm build
```

Vite 会输出到 `dist/`。

## Cloudflare Pages

- Framework preset：`React (Vite)`
- Build command：`pnpm run build`
- Build output directory：`dist`

这个项目不依赖 Pages Functions，Cloudflare 只负责静态托管、域名和 CDN。

## Wrangler 部署

项目已经集成了 `wrangler` 和 Pages 配置文件 [wrangler.toml](./wrangler.toml)。

首次使用前，需要先登录并创建 Pages 项目：

```bash
npx wrangler login
pnpm cf:project:create
```

如果你在 Cloudflare 上创建的项目名不是 `squoosh-web`，请同步修改 `wrangler.toml` 里的 `name`。
默认脚本会创建名为 `squoosh-web`、生产分支为 `main` 的 Pages 项目。

本地可用命令：

```bash
pnpm cf:dev
pnpm cf:deploy
```

- `cf:dev` 会先构建 `dist/`，再用 `wrangler pages dev` 以 Pages 方式本地预览
- `cf:deploy` 会构建后直接发布到 Cloudflare Pages

## GitHub Actions 自动化部署

仓库包含工作流 [pages-deployment.yml](./.github/workflows/pages-deployment.yml)：

- push 到 `main`：自动发布到生产环境
- Pull Request：自动创建 Pages 预览部署
- `workflow_dispatch`：支持手动触发，并按 `main` 分支发布

需要在 GitHub 仓库里配置两个 Secrets：

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

`CLOUDFLARE_API_TOKEN` 需要具备 `Account / Cloudflare Pages / Edit` 权限。

## 当前实现

- 浏览器本地读取图片并转成 `ImageData`
- 懒加载 WASM codec，避免首屏把所有编码器一次性打进来
- 支持 `MozJPEG / WebP / AVIF / OxiPNG`
- 输出压缩前后体积、节省比例、处理耗时和下载结果

## 注意

- 重新编码会丢失原图中的 EXIF / ICC 等元数据
- AVIF 编码明显慢于 JPEG / WebP，属于预期表现
