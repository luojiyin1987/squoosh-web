import JSZip from 'jszip'
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
import {
  createUniquePath,
  getDroppedFolderImages,
  getFolderImages,
  type DroppedFileSystemEntry,
  type FolderImage,
} from './lib/folder-compression'
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
  const [folderFiles, setFolderFiles] = useState<FolderImage[]>([])
  const [isFolderCompressing, setIsFolderCompressing] = useState(false)
  const [folderProgress, setFolderProgress] = useState({ completed: 0, total: 0 })
  const [folderError, setFolderError] = useState<string | null>(null)
  const [folderResult, setFolderResult] = useState<{
    inputBytes: number
    outputBytes: number
    totalCount: number
    compressedCount: number
    skippedCount: number
    zipUrl: string
  } | null>(null)
  const [sourcePreviewUrl, setSourcePreviewUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const folderInputRef = useRef<HTMLInputElement | null>(null)
  const folderRequestIdRef = useRef(0)
  const stateRef = useRef(state)

  const selectedFile = state.file
  const result = state.phase.tag === 'success' ? state.phase.result : null
  const error = state.phase.tag === 'error' ? state.phase.message : null
  const isCompressing =
    state.phase.tag === 'decoding' || state.phase.tag === 'encoding'
  const hasFolder = folderFiles.length > 0

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
    if (!folderResult) {
      return
    }

    return () => {
      URL.revokeObjectURL(folderResult.zipUrl)
    }
  }, [folderResult])

  useEffect(() => {
    const input = folderInputRef.current
    if (!input) {
      return
    }

    input.setAttribute('webkitdirectory', '')
    input.setAttribute('directory', '')
  }, [])

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

  function resetFolderResult() {
    setFolderError(null)
    setFolderResult(null)
  }

  function invalidateFolderCompression() {
    folderRequestIdRef.current += 1
    setIsFolderCompressing(false)
    setFolderProgress({ completed: 0, total: 0 })
    resetFolderResult()
  }

  function handleFileSelection(file: File | null) {
    if (sourcePreviewUrl) {
      URL.revokeObjectURL(sourcePreviewUrl)
    }

    const nextSourcePreviewUrl = file ? URL.createObjectURL(file) : null
    setSourcePreviewUrl(nextSourcePreviewUrl)
    invalidateFolderCompression()
    setFolderFiles([])
    dispatch({ type: 'selectFile', file })

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  function handleFolderSelection(files: FileList | null) {
    handleFolderImages(getFolderImages(Array.from(files ?? [])))

    if (folderInputRef.current) {
      folderInputRef.current.value = ''
    }
  }

  function handleFolderImages(images: FolderImage[]) {

    if (sourcePreviewUrl) {
      URL.revokeObjectURL(sourcePreviewUrl)
    }

    const firstFile = images[0]?.file ?? null
    setSourcePreviewUrl(firstFile ? URL.createObjectURL(firstFile) : null)
    invalidateFolderCompression()
    setFolderFiles(images)
    if (images.length === 0) {
      setFolderError(t('folder.noSupportedImages'))
    }
    dispatch({ type: 'selectFile', file: firstFile })
  }

  function updateSettings(partial: Partial<CompressionSettings>) {
    dispatch({ type: 'updateSettings', partial })
  }

  function handleCompress() {
    invalidateFolderCompression()
    dispatch({
      type: 'startCompression',
      startedAt: performance.now(),
    })
  }

  async function handleFolderCompress() {
    if (!hasFolder) {
      return
    }

    const requestId = ++folderRequestIdRef.current
    const files = [...folderFiles]
    const settings = { ...state.settings }

    setIsFolderCompressing(true)
    setFolderProgress({ completed: 0, total: files.length })
    resetFolderResult()

    try {
      const zip = new JSZip()
      const usedPaths = new Set<string>()
      let inputBytes = 0
      let compressedCount = 0

      for (const [index, folderFile] of files.entries()) {
        try {
          const { file, relativePath } = folderFile
          const decoded = await fileToImageData(file)
          const encoded = await encodeImage(decoded.imageData, settings)
          const outputPath = createUniquePath(
            buildCompressedPath(relativePath, encoded.extension),
            usedPaths,
          )

          if (requestId !== folderRequestIdRef.current) {
            return
          }

          zip.file(outputPath, encoded.bytes)
          inputBytes += file.size
          compressedCount += 1
        } catch {
          console.warn('[squoosh-web] Folder file skipped:', folderFile.file.name)
        }

        if (requestId !== folderRequestIdRef.current) {
          return
        }

        setFolderProgress({ completed: index + 1, total: files.length })
      }

      if (compressedCount === 0) {
        throw new Error(t('folder.noCompressibleImages'))
      }

      const zipBlob = await zip.generateAsync({
        type: 'blob',
        compression: 'STORE',
      })

      if (requestId !== folderRequestIdRef.current) {
        return
      }

      setFolderResult({
        inputBytes,
        outputBytes: zipBlob.size,
        totalCount: files.length,
        compressedCount,
        skippedCount: files.length - compressedCount,
        zipUrl: URL.createObjectURL(zipBlob),
      })
    } catch (caughtError) {
      setFolderError(
        caughtError instanceof Error ? caughtError.message : t('error.compressionFailed'),
      )
    } finally {
      if (requestId === folderRequestIdRef.current) {
        setIsFolderCompressing(false)
      }
    }
  }

  async function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault()
    setIsDragActive(false)

    const entries = Array.from(event.dataTransfer.items)
      .map((item) => (item as unknown as {
        webkitGetAsEntry?: () => DroppedFileSystemEntry | null
      }).webkitGetAsEntry?.())
      .filter(
        (entry): entry is DroppedFileSystemEntry =>
          entry !== null && entry !== undefined,
      )

    if (entries.some((entry) => entry.isDirectory)) {
      handleFolderImages(await getDroppedFolderImages(entries))
      return
    }

    handleFileSelection(event.dataTransfer.files.item(0))
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

          <input
            accept="image/*"
            className="sr-only"
            id="single-image-input"
            ref={fileInputRef}
            type="file"
            onChange={(event) =>
              handleFileSelection(event.target.files?.item(0) ?? null)
            }
          />
          <label
            htmlFor="single-image-input"
            className={`dropzone${isDragActive ? ' dropzone-active' : ''}`}
            onDragEnter={() => setIsDragActive(true)}
            onDragLeave={() => setIsDragActive(false)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleDrop}
          >
            <span className="dropzone-pill">{t('source.dropzonePill')}</span>
            <strong>
              {hasFolder
                ? t('source.folderSelected').replace('{count}', String(folderFiles.length))
                : selectedFile?.name ?? t('source.dropzoneHint')}
            </strong>
            <span>
              {hasFolder
                ? t('source.folderReady')
                : selectedFile
                ? `${formatBytes(selectedFile.size)} · ${t('source.dropzoneReady')}`
                : t('source.dropzoneFormats')}
            </span>
          </label>
          <input
            accept="image/*"
            className="sr-only"
            id="folder-input"
            ref={folderInputRef}
            type="file"
            onChange={(event) => handleFolderSelection(event.target.files)}
          />
          <button
            className="folder-button"
            type="button"
            onClick={() => folderInputRef.current?.click()}
          >
            {t('source.selectFolder')}
          </button>

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

          {hasFolder ? (
            <button
              className="primary-button"
              disabled={isCompressing || isFolderCompressing}
              type="button"
              onClick={handleFolderCompress}
            >
              {isFolderCompressing
                ? t('folder.running')
                : t('folder.compress').replace('{count}', String(folderFiles.length))}
            </button>
          ) : (
            <button
              className="primary-button"
              disabled={!selectedFile || isCompressing}
              type="button"
              onClick={handleCompress}
            >
              {isCompressing ? t('compress.running') : t('compress.run')}
            </button>
          )}

          {isFolderCompressing ? (
            <p className="panel-note">
              {t('folder.progress')
                .replace('{completed}', String(folderProgress.completed))
                .replace('{total}', String(folderProgress.total))}
            </p>
          ) : null}

          <p className="panel-note">{t('panel.note')}</p>

          {error || folderError ? <p className="error-banner">{error ?? folderError}</p> : null}
        </div>
      </section>

      <section className="panel result-panel">
        <div className="panel-heading">
          <div>
            <p className="section-label">{t('result.label')}</p>
            <h2>{t('result.heading')}</h2>
          </div>
        </div>

        {folderResult ? (
          <>
            <div className="result-stats">
              <article><span>{t('result.input')}</span><strong>{formatBytes(folderResult.inputBytes)}</strong></article>
              <article><span>{t('result.output')}</span><strong>{formatBytes(folderResult.outputBytes)}</strong></article>
              <article><span>{t('folder.files')}</span><strong>{folderResult.totalCount}</strong></article>
              <article><span>{t('folder.skipped')}</span><strong>{folderResult.skippedCount}</strong></article>
            </div>
            <p className="result-meta">{t('folder.resultNote')}</p>
            <a className="primary-button download-link" download="compressed-images.zip" href={folderResult.zipUrl}>
              {t('folder.download')}
            </a>
          </>
        ) : result ? (
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

function buildCompressedPath(filePath: string, extension: string): string {
  const slashIndex = filePath.lastIndexOf('/')
  const directory = slashIndex >= 0 ? filePath.slice(0, slashIndex + 1) : ''
  const fileName = slashIndex >= 0 ? filePath.slice(slashIndex + 1) : filePath
  return `${directory}${buildDownloadName(fileName, extension)}`
}

export default App
