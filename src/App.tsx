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
import { useLocale } from './lib/i18n.tsx'

const FORMAT_ORDER: CompressionFormat[] = ['webp', 'avif', 'jpeg', 'png']

function LangSwitch() {
  const { locale, setLocale, t } = useLocale()

  return (
    <div className="lang-switch" role="group" aria-label="Language switch">
      <button
        type="button"
        className={locale === 'en' ? 'lang-active' : ''}
        onClick={() => setLocale('en')}
        aria-pressed={locale === 'en'}
      >
        {t('lang.en')}
      </button>
      <span className="lang-divider">|</span>
      <button
        type="button"
        className={locale === 'zh' ? 'lang-active' : ''}
        onClick={() => setLocale('zh')}
        aria-pressed={locale === 'zh'}
      >
        {t('lang.zh')}
      </button>
    </div>
  )
}

function App() {
  const { locale, t } = useLocale()
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
  const resultPreviewUrl = result?.previewUrl ?? null
  const decodeRequestId =
    state.phase.tag === 'decoding' ? state.phase.requestId : null
  const encodeRequestId =
    state.phase.tag === 'encoding' ? state.phase.requestId : null
  const decodingPhase = state.phase.tag === 'decoding' ? state.phase : null
  const encodingPhase = state.phase.tag === 'encoding' ? state.phase : null

  const formatNotes = useMemo(() => {
    const notes: Record<
      CompressionFormat,
      { blurb: string; controlsLabel: string }
    > = {
      jpeg: {
        blurb: t('codec.jpegBlurb'),
        controlsLabel: t('codec.jpegLabel'),
      },
      webp: {
        blurb: t('codec.webpBlurb'),
        controlsLabel: t('codec.webpLabel'),
      },
      avif: {
        blurb: t('codec.avifBlurb'),
        controlsLabel: t('codec.avifLabel'),
      },
      png: {
        blurb: t('codec.pngBlurb'),
        controlsLabel: t('codec.pngLabel'),
      },
    }
    return notes
  }, [t])

  const activeFormatMeta = formatNotes[state.settings.format]

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

  // SEO: Update all meta tags when locale changes
  useEffect(() => {
    const isZh = locale === 'zh'
    const title = isZh
      ? 'Squoosh Web | 浏览器本地图片压缩'
      : 'Squoosh Web | Browser-local Image Compression'
    const desc = isZh
      ? 'Squoosh Web — 浏览器本地图片压缩工具。使用 Squoosh 衍生 WASM 编码器压缩 JPEG、WebP、AVIF 和 PNG。'
      : 'Compress JPEG, WebP, AVIF and PNG locally in your browser using Squoosh-derived WASM encoders.'

    document.title = title

    function setMeta(selector: string, attr: string, value: string) {
      const el = document.querySelector(selector)
      if (el) el.setAttribute(attr, value)
    }

    // Standard
    setMeta('meta[name="description"]', 'content', desc)

    // Open Graph
    setMeta('meta[property="og:title"]', 'content', title)
    setMeta('meta[property="og:description"]', 'content', desc)
    setMeta('meta[property="og:locale"]', 'content', isZh ? 'zh_CN' : 'en_US')

    // Twitter Card
    setMeta('meta[name="twitter:title"]', 'content', title)
    setMeta('meta[name="twitter:description"]', 'content', desc)
  }, [locale])

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
            : t('error.compressionFailed')

        dispatch({ type: 'decodeError', message })
      })

    return () => {
      cancelled = true
    }
  }, [decodeRequestId, decodingPhase, t])

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
            : t('error.compressionFailed')

        dispatch({ type: 'encodeError', message })
      })

    return () => {
      cancelled = true
    }
  }, [encodeRequestId, encodingPhase, t])

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
      <LangSwitch />

      <section className="hero-panel">
        <p className="eyebrow">{t('hero.eyebrow')}</p>
        <h1>{t('hero.title')}</h1>
        <p className="lede">{t('hero.lede')}</p>


      </section>

      <section className="workspace">
        <div className="panel">
          <div className="panel-heading">
            <div>
              <p className="section-label">{t('source.label')}</p>
              <h2>{t('source.heading')}</h2>
            </div>
            {selectedFile ? (
              <button
                className="ghost-button"
                type="button"
                onClick={() => handleFileSelection(null)}
              >
                {t('source.clear')}
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
            <span className="dropzone-pill">{t('source.dropzonePill')}</span>
            <strong>{selectedFile ? selectedFile.name : t('source.dropzoneHint')}</strong>
            <span>
              {selectedFile
                ? `${formatBytes(selectedFile.size)} · ${t('source.dropzoneReady')}`
                : t('source.dropzoneFormats')}
            </span>
          </label>

          {sourcePreviewUrl ? (
            <div className="preview-stack">
              <img
                alt={t('source.previewAlt')}
                className="preview-image"
                src={sourcePreviewUrl}
              />
            </div>
          ) : null}
        </div>

        <div className="panel">
          <div className="panel-heading">
            <div>
              <p className="section-label">{t('codec.label')}</p>
              <h2>{t('codec.heading')}</h2>
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
                <small>{formatNotes[format].blurb}</small>
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
                <span>{activeFormatMeta.controlsLabel}</span>
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
                <span>{t('controls.webpLossless')}</span>
              </label>
            ) : null}

            {state.settings.format === 'avif' ? (
              <>
                <label className="field">
                  <span>{t('controls.avifSpeed')}</span>
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
                  <span>{t('controls.avifLossless')}</span>
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
            {isCompressing ? t('compress.running') : t('compress.run')}
          </button>

          <p className="panel-note">{t('panel.note')}</p>

          {error ? <p className="error-banner">{error}</p> : null}
        </div>
      </section>

      <section className="panel result-panel">
        <div className="panel-heading">
          <div>
            <p className="section-label">{t('result.label')}</p>
            <h2>{t('result.heading')}</h2>
          </div>
        </div>

        {result ? (
          <>
            <div className="result-stats">
              <article>
                <span>{t('result.input')}</span>
                <strong>{formatBytes(result.inputBytes)}</strong>
              </article>
              <article>
                <span>{t('result.output')}</span>
                <strong>{formatBytes(result.outputBytes)}</strong>
              </article>
              <article>
                <span>{t('result.delta')}</span>
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
                <span>{t('result.time')}</span>
                <strong>{formatDuration(result.elapsedMs)}</strong>
              </article>
            </div>

            <div className="preview-grid">
              <div className="preview-card">
                <span className="preview-label">{t('result.sourceLabel')}</span>
                {sourcePreviewUrl ? (
                  <img
                    alt={t('result.sourceLabel')}
                    className="preview-image"
                    src={sourcePreviewUrl}
                  />
                ) : null}
              </div>

              <div className="preview-card">
                <span className="preview-label">
                  {FORMAT_LABELS[result.format]} {t('result.outputLabel')}
                </span>
                <img
                  alt={`${FORMAT_LABELS[result.format]} ${t('result.outputLabel')}`}
                  className="preview-image"
                  src={result.previewUrl}
                />
              </div>
            </div>

            <div className="result-meta">
              <p>
                {t('result.formatOutput')}：<strong>{FORMAT_LABELS[result.format]}</strong> · {t('result.dimensions')}：
                <strong>
                  {' '}
                  {result.width} × {result.height}
                </strong>{' '}
                · {t('result.mime')}：<code>{result.mimeType}</code>
              </p>
              <p>
                {resultSummary && resultSummary.delta >= 0
                  ? `${t('result.sizeReduced')} ${(resultSummary.ratio * 100).toFixed(1)}%`
                  : `${t('result.sizeIncreased')} ${((resultSummary?.ratio ?? 0) * 100).toFixed(1)}% — ${t('result.sizeIncreasedNote')}`}
              </p>
            </div>

            <a
              className="primary-button download-link"
              download={buildDownloadName(fileName, result.extension)}
              href={result.previewUrl}
            >
              {t('result.download')}
            </a>
          </>
        ) : (
          <div className="empty-state">
            <p>{t('result.emptyState')}</p>
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
