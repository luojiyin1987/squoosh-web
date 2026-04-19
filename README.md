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
npm install
npm run dev
```

## 生产构建

```bash
npm run build
```

Vite 会输出到 `dist/`。

## Cloudflare Pages

- Framework preset：`React (Vite)`
- Build command：`npm run build`
- Build output directory：`dist`

这个项目不依赖 Pages Functions，Cloudflare 只负责静态托管、域名和 CDN。

## 当前实现

- 浏览器本地读取图片并转成 `ImageData`
- 懒加载 WASM codec，避免首屏把所有编码器一次性打进来
- 支持 `MozJPEG / WebP / AVIF / OxiPNG`
- 输出压缩前后体积、节省比例、处理耗时和下载结果

## 注意

- 重新编码会丢失原图中的 EXIF / ICC 等元数据
- AVIF 编码明显慢于 JPEG / WebP，属于预期表现
