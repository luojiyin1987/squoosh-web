import { type DragEvent, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import './App.css'
import {
  buildDownloadName,
  encodeImage,
  fileToImageData,
  FORMAT_LABELS,
  type CompressionFormat,
  type CompressionSettings,
} from './lib/codecs'
import {
  compressionReducer,
  INITIAL_COMPRESSION_STATE,
  isCurrentRequestPhase,
} from './lib/compression-state'

const FORMAT_NOTES: Record<
  CompressionFormat,
  {
    blurb: string
    controlsLabel: string
  }
> = {
  jpeg: {
    blurb: 'Classic photo format, fast compression, great for compatibility-first output / 经典照片格式，压缩速度快，适合兼容性优先的输出。',
    controlsLabel: 'MozJPEG quality / 质量',
  },
  webp: {
    blurb: 'Balanced web format, usually smaller than JPEG with controllable encoding speed / 网页通用平衡型方案，通常比 JPEG 更小，编码速度也比较可控。',
    controlsLabel: 'WebP quality / 质量',
  },
  avif: {
    blurb: 'Best compression ratio, but significantly slower encoding, suitable for size-critical publishing / 压缩率通常最好，但编码明显更慢，适合追求更小体积的发布场景。',
    controlsLabel: 'AVIF quality / 质量',
  },
  png: {
    blurb: 'Lossless optimization, suitable for icons, UI screenshots, and transparent assets / 无损优化，适合图标、UI 截图和需要透明通道的素材。',
    controlsLabel: 'OxiPNG level / 级别',
  },
}

const FORMAT_ORDER: CompressionFormat[] = ['webp', 'avif', 'jpeg', 'png']

function App() {
  const [state, dispatch] = useReducer(
    compressionReducer,
    INITIAL_COMPRESSION_STATE,
  )
  const [isDragActive, setIsDragActive] = useState(false)
  const [sourcePreviewUrl, setSourcePreviewUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const stateRef = useRef(state)

  const selectedFile = state.file
  const result = state.phase.tag === 'success' ? state.phase.result : null
  const error = state.phase.tag === 'error' ? state.phase.message : null
  const isCompressing =
    state.phase.tag === 'decoding' || state.phase.tag === 'encoding'

  const fileName = selectedFile?.name ?? 'source-image'
  const activeFormatMeta = FORMAT_NOTES[state.settings.format]
  const resultPreviewUrl = result?.previewUrl ?? null
  const decodeRequestId =
    state.phase.tag === 'decoding' ? state.phase.requestId : null
  const encodeRequestId =
    state.phase.tag === 'encoding' ? state.phase.requestId : null
  const decodingPhase = state.phase.tag === 'decoding' ? state.phase : null
  const encodingPhase = state.phase.tag === 'encoding' ? state.phase : null

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

  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    if (!sourcePreviewUrl) {
      return
    }

    return () => {
      URL.revokeObjectURL(sourcePreviewUrl)
    }
  }, [sourcePreviewUrl])

  useEffect(() => {
    if (!resultPreviewUrl) {
      return
    }

    return () => {
      URL.revokeObjectURL(resultPreviewUrl)
    }
  }, [resultPreviewUrl])

  useEffect(() => {
    if (!decodingPhase) {
      return
    }

    const { file, requestId } = decodingPhase
    let cancelled = false

    fileToImageData(file)
      .then((decoded) => {
        const currentPhase = stateRef.current.phase

        if (cancelled || !isCurrentRequestPhase(currentPhase, 'decoding', requestId)) {
          return
        }

        dispatch({ type: 'decodeSuccess', decoded })
      })
      .catch((caughtError) => {
        const currentPhase = stateRef.current.phase

        if (cancelled || !isCurrentRequestPhase(currentPhase, 'decoding', requestId)) {
          return
        }

        const message =
          caughtError instanceof Error
            ? caughtError.message
            : 'Compression failed in the browser / 浏览器内压缩失败。'

        dispatch({ type: 'decodeError', message })
      })

    return () => {
      cancelled = true
    }
  }, [decodeRequestId, decodingPhase])

  useEffect(() => {
    if (!encodingPhase) {
      return
    }

    const { decoded, file, requestId, settings, startedAt } = encodingPhase
    let cancelled = false

    encodeImage(decoded.imageData, settings)
      .then((encoded) => {
        const currentPhase = stateRef.current.phase

        if (cancelled || !isCurrentRequestPhase(currentPhase, 'encoding', requestId)) {
          return
        }

        const outputBlob = new Blob([encoded.bytes], { type: encoded.mimeType })
        const previewUrl = URL.createObjectURL(outputBlob)

        dispatch({
          type: 'encodeSuccess',
          result: {
            elapsedMs: performance.now() - startedAt,
            extension: encoded.extension,
            format: encoded.format,
            inputBytes: file.size,
            mimeType: encoded.mimeType,
            outputBytes: outputBlob.size,
            previewUrl,
            width: decoded.width,
            height: decoded.height,
          },
        })
      })
      .catch((caughtError) => {
        const currentPhase = stateRef.current.phase

        if (cancelled || !isCurrentRequestPhase(currentPhase, 'encoding', requestId)) {
          return
        }

        const message =
          caughtError instanceof Error
            ? caughtError.message
            : 'Compression failed in the browser / 浏览器内压缩失败。'

        dispatch({ type: 'encodeError', message })
      })

    return () => {
      cancelled = true
    }
  }, [encodeRequestId, encodingPhase])

  function handleFileSelection(file: File | null) {
    if (sourcePreviewUrl) {
      URL.revokeObjectURL(sourcePreviewUrl)
    }

    const nextSourcePreviewUrl = file ? URL.createObjectURL(file) : null
    setSourcePreviewUrl(nextSourcePreviewUrl)
    dispatch({ type: 'selectFile', file })

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  function updateSettings(partial: Partial<CompressionSettings>) {
    dispatch({ type: 'updateSettings', partial })
  }

  function handleCompress() {
    dispatch({
      type: 'startCompression',
      startedAt: performance.now(),
    })
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
        <h1>Squoosh codecs, entirely in the browser / 完全在浏览器中运行</h1>
        <p className="lede">
          Vite + React frontend deployed to Cloudflare Pages. Image compression happens locally in the user's browser; Cloudflare only handles static hosting, domain, and CDN / 前端用 Vite + React 部署到 Cloudflare Pages，图片压缩在用户浏览器本地完成，Cloudflare 只负责静态托管、域名和 CDN。
        </p>

        <div className="hero-grid">
          <article className="stat-card">
            <span className="stat-kicker">Runtime / 运行环境</span>
            <strong>Local only / 纯本地</strong>
            <p>Original images are never uploaded; decode, encode, and download happen in the browser / 原图不上传服务器，浏览器内完成解码、编码和下载。</p>
          </article>
          <article className="stat-card">
            <span className="stat-kicker">Deploy / 部署</span>
            <strong>Static Pages / 静态页面</strong>
            <p>Build output is pure static dist/, ready for Cloudflare Pages / 构建产物是纯静态 dist/，适合直接接入 Cloudflare Pages。</p>
          </article>
          <article className="stat-card">
            <span className="stat-kicker">Codecs / 编码器</span>
            <strong>MozJPEG / WebP / AVIF / OxiPNG</strong>
            <p>Lazy-load Squoosh-derived WASM encoders on demand to avoid a heavy first paint / 按需懒加载 Squoosh 衍生的 WASM 编码器，避免首屏一次性拉满。</p>
          </article>
        </div>
      </section>

      <section className="workspace">
        <div className="panel">
          <div className="panel-heading">
            <div>
              <p className="section-label">1. Source image / 源图片</p>
              <h2>Drop or select an image / 拖入图片或手动选择</h2>
            </div>
            {selectedFile ? (
              <button
                className="ghost-button"
                type="button"
                onClick={() => handleFileSelection(null)}
              >
                Clear / 清除
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
              ref={fileInputRef}
              type="file"
              onChange={(event) =>
                handleFileSelection(event.target.files?.item(0) ?? null)
              }
            />
            <span className="dropzone-pill">Local processing only / 仅本地处理</span>
            <strong>{selectedFile ? selectedFile.name : 'Drop an image here / 拖入图片'}</strong>
            <span>
              {selectedFile
                ? `${formatBytes(selectedFile.size)} · ready to compress / 准备压缩`
                : 'PNG, JPEG, WebP, AVIF and other browser-readable image types / PNG、JPEG、WebP、AVIF 等浏览器可读取的图片格式'}
            </span>
          </label>

          {sourcePreviewUrl ? (
            <div className="preview-stack">
              <img
                alt="Selected source / 已选源图"
                className="preview-image"
                src={sourcePreviewUrl}
              />
            </div>
          ) : null}
        </div>

        <div className="panel">
          <div className="panel-heading">
            <div>
              <p className="section-label">2. Output codec / 输出编码器</p>
              <h2>Select codec and parameters / 选择编码器和参数</h2>
            </div>
          </div>

          <div className="format-grid">
            {FORMAT_ORDER.map((format) => (
              <button
                key={format}
                className={`format-card${
                  state.settings.format === format ? ' format-card-active' : ''
                }`}
                type="button"
                onClick={() => updateSettings({ format })}
              >
                <span>{FORMAT_LABELS[format]}</span>
                <small>{FORMAT_NOTES[format].blurb}</small>
              </button>
            ))}
          </div>

          <div className="control-group">
            <p className="control-caption">{activeFormatMeta.blurb}</p>

            {state.settings.format !== 'png' ? (
              <label className="field">
                <span>{activeFormatMeta.controlsLabel}</span>
                <div className="field-row">
                  <input
                    max={100}
                    min={35}
                    step={1}
                    type="range"
                    value={state.settings.quality}
                    onChange={(event) =>
                      updateSettings({ quality: Number(event.target.value) })
                    }
                  />
                  <code>{state.settings.quality}</code>
                </div>
              </label>
            ) : (
              <label className="field">
                <span>OxiPNG level / 级别</span>
                <div className="field-row">
                  <input
                    max={6}
                    min={0}
                    step={1}
                    type="range"
                    value={state.settings.pngLevel}
                    onChange={(event) =>
                      updateSettings({ pngLevel: Number(event.target.value) })
                    }
                  />
                  <code>{state.settings.pngLevel}</code>
                </div>
              </label>
            )}

            {state.settings.format === 'webp' ? (
              <label className="toggle">
                <input
                  checked={state.settings.webpLossless}
                  type="checkbox"
                  onChange={(event) =>
                    updateSettings({ webpLossless: event.target.checked })
                  }
                />
                <span>Use WebP lossless mode / WebP 无损模式</span>
              </label>
            ) : null}

            {state.settings.format === 'avif' ? (
              <>
                <label className="field">
                  <span>AVIF speed / 速度</span>
                  <div className="field-row">
                    <input
                      max={10}
                      min={0}
                      step={1}
                      type="range"
                      value={state.settings.avifSpeed}
                      onChange={(event) =>
                        updateSettings({ avifSpeed: Number(event.target.value) })
                      }
                    />
                    <code>{state.settings.avifSpeed}</code>
                  </div>
                </label>

                <label className="toggle">
                  <input
                    checked={state.settings.avifLossless}
                    type="checkbox"
                    onChange={(event) =>
                      updateSettings({ avifLossless: event.target.checked })
                    }
                  />
                  <span>Use AVIF lossless mode / AVIF 无损模式</span>
                </label>
              </>
            ) : null}
          </div>

          <button
            className="primary-button"
            disabled={!selectedFile || isCompressing}
            type="button"
            onClick={handleCompress}
          >
            {isCompressing ? 'Compressing in browser... / 正在浏览器中压缩...' : 'Run compression / 运行压缩'}
          </button>

          <p className="panel-note">
            Re-encoded images will not retain original EXIF / ICC metadata, which is the default for pure front-end compression tools / 重新编码后的图片不会保留原始 EXIF / ICC 元数据，这通常是纯前端压缩工具的默认结果。
          </p>

          {error ? <p className="error-banner">{error}</p> : null}
        </div>
      </section>

      <section className="panel result-panel">
        <div className="panel-heading">
          <div>
            <p className="section-label">3. Result / 结果</p>
            <h2>Compression result and download / 压缩结果和下载</h2>
          </div>
        </div>

        {result ? (
          <>
            <div className="result-stats">
              <article>
                <span>Input / 输入</span>
                <strong>{formatBytes(result.inputBytes)}</strong>
              </article>
              <article>
                <span>Output / 输出</span>
                <strong>{formatBytes(result.outputBytes)}</strong>
              </article>
              <article>
                <span>Delta / 差值</span>
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
                <span>Time / 耗时</span>
                <strong>{formatDuration(result.elapsedMs)}</strong>
              </article>
            </div>

            <div className="preview-grid">
              <div className="preview-card">
                <span className="preview-label">Source / 原图</span>
                {sourcePreviewUrl ? (
                  <img
                    alt="Source preview / 原图预览"
                    className="preview-image"
                    src={sourcePreviewUrl}
                  />
                ) : null}
              </div>

              <div className="preview-card">
                <span className="preview-label">
                  {FORMAT_LABELS[result.format]} output / 输出
                </span>
                <img
                  alt={`${FORMAT_LABELS[result.format]} preview / 预览`}
                  className="preview-image"
                  src={result.previewUrl}
                />
              </div>
            </div>

            <div className="result-meta">
              <p>
                Output format / 输出格式：<strong>{FORMAT_LABELS[result.format]}</strong> · Dimensions / 尺寸：
                <strong>
                  {' '}
                  {result.width} × {result.height}
                </strong>{' '}
                · MIME：<code>{result.mimeType}</code>
              </p>
              <p>
                {resultSummary && resultSummary.delta >= 0
                  ? `Size reduced by / 体积缩小 ${(resultSummary.ratio * 100).toFixed(1)}%`
                  : `Output larger by / 输出比原图大 ${((resultSummary?.ratio ?? 0) * 100).toFixed(1)}% — this is normal for lossless PNG or high-quality AVIF/WebP / 这在无损 PNG 或高质量 AVIF/WebP 下是正常现象`}
              </p>
            </div>

            <a
              className="primary-button download-link"
              download={buildDownloadName(fileName, result.extension)}
              href={result.previewUrl}
            >
              Download compressed image / 下载压缩图片
            </a>
          </>
        ) : (
          <div className="empty-state">
            <p>Select an image and run compression; preview, size change, and download link will appear here / 选择图片并运行压缩后，这里会显示预览、体积变化和下载链接。</p>
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
