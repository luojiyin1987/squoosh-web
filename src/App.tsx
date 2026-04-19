import { type DragEvent, useEffect, useMemo, useState } from 'react'
import './App.css'
import {
  buildDownloadName,
  DEFAULT_SETTINGS,
  encodeImage,
  fileToImageData,
  FORMAT_LABELS,
  type CompressionFormat,
  type CompressionSettings,
} from './lib/codecs'

interface CompressionResult {
  elapsedMs: number
  extension: string
  format: CompressionFormat
  inputBytes: number
  mimeType: string
  outputBytes: number
  previewUrl: string
  width: number
  height: number
}

const FORMAT_NOTES: Record<
  CompressionFormat,
  {
    blurb: string
    controlsLabel: string
  }
> = {
  jpeg: {
    blurb: '经典照片格式，压缩速度快，适合兼容性优先的输出。',
    controlsLabel: 'MozJPEG quality',
  },
  webp: {
    blurb: '网页通用平衡型方案，通常比 JPEG 更小，编码速度也比较可控。',
    controlsLabel: 'WebP quality',
  },
  avif: {
    blurb: '压缩率通常最好，但编码明显更慢，适合追求更小体积的发布场景。',
    controlsLabel: 'AVIF quality',
  },
  png: {
    blurb: '无损优化，适合图标、UI 截图和需要透明通道的素材。',
    controlsLabel: 'OxiPNG level',
  },
}

const FORMAT_ORDER: CompressionFormat[] = ['webp', 'avif', 'jpeg', 'png']

function App() {
  const [settings, setSettings] = useState<CompressionSettings>(DEFAULT_SETTINGS)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [sourcePreviewUrl, setSourcePreviewUrl] = useState<string | null>(null)
  const [result, setResult] = useState<CompressionResult | null>(null)
  const [isCompressing, setIsCompressing] = useState(false)
  const [isDragActive, setIsDragActive] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    return () => {
      if (sourcePreviewUrl) {
        URL.revokeObjectURL(sourcePreviewUrl)
      }
    }
  }, [sourcePreviewUrl])

  useEffect(() => {
    return () => {
      if (result) {
        URL.revokeObjectURL(result.previewUrl)
      }
    }
  }, [result])

  const fileName = selectedFile?.name ?? 'source-image'
  const activeFormatMeta = FORMAT_NOTES[settings.format]

  const resultSummary = useMemo(() => {
    if (!result) {
      return null
    }

    const delta = result.inputBytes - result.outputBytes
    const ratio = Math.abs(delta) / result.inputBytes

    return {
      delta,
      ratio,
    }
  }, [result])

  function clearResult() {
    setResult((previous) => {
      if (previous) {
        URL.revokeObjectURL(previous.previewUrl)
      }

      return null
    })
  }

  function handleFileSelection(file: File | null) {
    setError(null)
    clearResult()
    setSelectedFile(file)
    setSourcePreviewUrl((previous) => {
      if (previous) {
        URL.revokeObjectURL(previous)
      }

      return file ? URL.createObjectURL(file) : null
    })
  }

  async function handleCompress() {
    if (!selectedFile) {
      return
    }

    setError(null)
    clearResult()
    setIsCompressing(true)

    const startedAt = performance.now()

    try {
      const decoded = await fileToImageData(selectedFile)
      const encoded = await encodeImage(decoded.imageData, settings)
      const outputBlob = new Blob([encoded.bytes], { type: encoded.mimeType })

      setResult({
        elapsedMs: performance.now() - startedAt,
        extension: encoded.extension,
        format: encoded.format,
        inputBytes: selectedFile.size,
        mimeType: encoded.mimeType,
        outputBytes: outputBlob.size,
        previewUrl: URL.createObjectURL(outputBlob),
        width: decoded.width,
        height: decoded.height,
      })
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : 'Compression failed in the browser.'

      setError(message)
    } finally {
      setIsCompressing(false)
    }
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault()
    setIsDragActive(false)

    const file = event.dataTransfer.files.item(0)
    if (file) {
      handleFileSelection(file)
    }
  }

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <p className="eyebrow">Cloudflare Pages + Browser WASM</p>
        <h1>Squoosh codecs, entirely in the browser.</h1>
        <p className="lede">
          前端用 Vite + React 部署到 Cloudflare Pages，图片压缩在用户浏览器本地完成，
          Cloudflare 只负责静态托管、域名和 CDN。
        </p>

        <div className="hero-grid">
          <article className="stat-card">
            <span className="stat-kicker">Runtime</span>
            <strong>Local only</strong>
            <p>原图不上传服务器，浏览器内完成解码、编码和下载。</p>
          </article>
          <article className="stat-card">
            <span className="stat-kicker">Deploy</span>
            <strong>Static Pages</strong>
            <p>构建产物是纯静态 dist/，适合直接接入 Cloudflare Pages。</p>
          </article>
          <article className="stat-card">
            <span className="stat-kicker">Codecs</span>
            <strong>MozJPEG / WebP / AVIF / OxiPNG</strong>
            <p>按需懒加载 Squoosh 衍生的 WASM 编码器，避免首屏一次性拉满。</p>
          </article>
        </div>
      </section>

      <section className="workspace">
        <div className="panel">
          <div className="panel-heading">
            <div>
              <p className="section-label">1. Source image</p>
              <h2>拖入图片或手动选择</h2>
            </div>
            {selectedFile ? (
              <button
                className="ghost-button"
                type="button"
                onClick={() => handleFileSelection(null)}
              >
                Clear
              </button>
            ) : null}
          </div>

          <label
            className={`dropzone${isDragActive ? ' dropzone-active' : ''}`}
            onDragEnter={() => setIsDragActive(true)}
            onDragLeave={() => setIsDragActive(false)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleDrop}
          >
            <input
              accept="image/*"
              className="sr-only"
              type="file"
              onChange={(event) =>
                handleFileSelection(event.target.files?.item(0) ?? null)
              }
            />
            <span className="dropzone-pill">Local processing only</span>
            <strong>{selectedFile ? selectedFile.name : 'Drop an image here'}</strong>
            <span>
              {selectedFile
                ? `${formatBytes(selectedFile.size)} · ready to compress`
                : 'PNG, JPEG, WebP, AVIF and other browser-readable image types'}
            </span>
          </label>

          {sourcePreviewUrl ? (
            <div className="preview-stack">
              <img
                alt="Selected source"
                className="preview-image"
                src={sourcePreviewUrl}
              />
            </div>
          ) : null}
        </div>

        <div className="panel">
          <div className="panel-heading">
            <div>
              <p className="section-label">2. Output codec</p>
              <h2>选择编码器和参数</h2>
            </div>
          </div>

          <div className="format-grid">
            {FORMAT_ORDER.map((format) => (
              <button
                key={format}
                className={`format-card${
                  settings.format === format ? ' format-card-active' : ''
                }`}
                type="button"
                onClick={() => setSettings((previous) => ({ ...previous, format }))}
              >
                <span>{FORMAT_LABELS[format]}</span>
                <small>{FORMAT_NOTES[format].blurb}</small>
              </button>
            ))}
          </div>

          <div className="control-group">
            <p className="control-caption">{activeFormatMeta.blurb}</p>

            {settings.format !== 'png' ? (
              <label className="field">
                <span>{activeFormatMeta.controlsLabel}</span>
                <div className="field-row">
                  <input
                    max={100}
                    min={35}
                    step={1}
                    type="range"
                    value={settings.quality}
                    onChange={(event) =>
                      setSettings((previous) => ({
                        ...previous,
                        quality: Number(event.target.value),
                      }))
                    }
                  />
                  <code>{settings.quality}</code>
                </div>
              </label>
            ) : (
              <label className="field">
                <span>OxiPNG level</span>
                <div className="field-row">
                  <input
                    max={6}
                    min={0}
                    step={1}
                    type="range"
                    value={settings.pngLevel}
                    onChange={(event) =>
                      setSettings((previous) => ({
                        ...previous,
                        pngLevel: Number(event.target.value),
                      }))
                    }
                  />
                  <code>{settings.pngLevel}</code>
                </div>
              </label>
            )}

            {settings.format === 'webp' ? (
              <label className="toggle">
                <input
                  checked={settings.webpLossless}
                  type="checkbox"
                  onChange={(event) =>
                    setSettings((previous) => ({
                      ...previous,
                      webpLossless: event.target.checked,
                    }))
                  }
                />
                <span>Use WebP lossless mode</span>
              </label>
            ) : null}

            {settings.format === 'avif' ? (
              <>
                <label className="field">
                  <span>AVIF speed</span>
                  <div className="field-row">
                    <input
                      max={10}
                      min={0}
                      step={1}
                      type="range"
                      value={settings.avifSpeed}
                      onChange={(event) =>
                        setSettings((previous) => ({
                          ...previous,
                          avifSpeed: Number(event.target.value),
                        }))
                      }
                    />
                    <code>{settings.avifSpeed}</code>
                  </div>
                </label>

                <label className="toggle">
                  <input
                    checked={settings.avifLossless}
                    type="checkbox"
                    onChange={(event) =>
                      setSettings((previous) => ({
                        ...previous,
                        avifLossless: event.target.checked,
                      }))
                    }
                  />
                  <span>Use AVIF lossless mode</span>
                </label>
              </>
            ) : null}
          </div>

          <button
            className="primary-button"
            disabled={!selectedFile || isCompressing}
            type="button"
            onClick={() => void handleCompress()}
          >
            {isCompressing ? 'Compressing in browser...' : 'Run compression'}
          </button>

          <p className="panel-note">
            重新编码后的图片不会保留原始 EXIF / ICC 元数据，这通常是纯前端压缩工具的默认结果。
          </p>

          {error ? <p className="error-banner">{error}</p> : null}
        </div>
      </section>

      <section className="panel result-panel">
        <div className="panel-heading">
          <div>
            <p className="section-label">3. Result</p>
            <h2>压缩结果和下载</h2>
          </div>
        </div>

        {result ? (
          <>
            <div className="result-stats">
              <article>
                <span>Input</span>
                <strong>{formatBytes(result.inputBytes)}</strong>
              </article>
              <article>
                <span>Output</span>
                <strong>{formatBytes(result.outputBytes)}</strong>
              </article>
              <article>
                <span>Delta</span>
                <strong
                  className={
                    resultSummary && resultSummary.delta >= 0 ? 'good' : 'warn'
                  }
                >
                  {resultSummary && resultSummary.delta >= 0 ? '−' : '+'}
                  {formatBytes(Math.abs(resultSummary?.delta ?? 0))}
                </strong>
              </article>
              <article>
                <span>Time</span>
                <strong>{formatDuration(result.elapsedMs)}</strong>
              </article>
            </div>

            <div className="preview-grid">
              <div className="preview-card">
                <span className="preview-label">Source</span>
                {sourcePreviewUrl ? (
                  <img
                    alt="Source preview"
                    className="preview-image"
                    src={sourcePreviewUrl}
                  />
                ) : null}
              </div>

              <div className="preview-card">
                <span className="preview-label">
                  {FORMAT_LABELS[result.format]} output
                </span>
                <img
                  alt={`${FORMAT_LABELS[result.format]} preview`}
                  className="preview-image"
                  src={result.previewUrl}
                />
              </div>
            </div>

            <div className="result-meta">
              <p>
                输出格式：<strong>{FORMAT_LABELS[result.format]}</strong> · 尺寸：
                <strong>
                  {' '}
                  {result.width} × {result.height}
                </strong>{' '}
                · MIME：<code>{result.mimeType}</code>
              </p>
              <p>
                {resultSummary && resultSummary.delta >= 0
                  ? `体积缩小 ${(resultSummary.ratio * 100).toFixed(1)}%`
                  : `输出比原图大 ${((resultSummary?.ratio ?? 0) * 100).toFixed(1)}%，这在无损 PNG 或高质量 AVIF/WebP 下是正常现象`}
              </p>
            </div>

            <a
              className="primary-button download-link"
              download={buildDownloadName(fileName, result.extension)}
              href={result.previewUrl}
            >
              Download compressed image
            </a>
          </>
        ) : (
          <div className="empty-state">
            <p>选择图片并运行压缩后，这里会显示预览、体积变化和下载链接。</p>
          </div>
        )}
      </section>
    </main>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`
  }

  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unitIndex = 0

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[unitIndex]}`
}

function formatDuration(milliseconds: number): string {
  if (milliseconds < 1000) {
    return `${Math.round(milliseconds)} ms`
  }

  return `${(milliseconds / 1000).toFixed(2)} s`
}

export default App
