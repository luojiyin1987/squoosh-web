import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

type Locale = 'en' | 'zh'

interface Translations {
  [key: string]: string
}

const en: Translations = {
  // Hero
  'hero.eyebrow': 'Cloudflare Pages + Browser WASM',
  'hero.title': 'Squoosh codecs, entirely in the browser',
  'hero.lede': 'Compress JPEG, WebP, AVIF and PNG locally in your browser. No server upload, instant results.',

  // Source panel
  'source.label': '1. Source image',
  'source.heading': 'Drop or select an image',
  'source.clear': 'Clear',
  'source.dropzonePill': 'Local processing only',
  'source.dropzoneHint': 'Drop an image here',
  'source.dropzoneFormats': 'PNG, JPEG, WebP, AVIF and other browser-readable image types',
  'source.dropzoneReady': 'ready to compress',
  'source.selectFolder': 'Select a folder',
  'source.folderSelected': '{count} images selected from a folder',
  'source.folderReady': 'The folder structure will be kept in the ZIP file',
  'source.previewAlt': 'Selected source',

  // Codec panel
  'codec.label': '2. Output codec',
  'codec.heading': 'Select codec and parameters',
  'codec.jpegBlurb': 'Classic photo format, fast compression, great for compatibility-first output.',
  'codec.jpegLabel': 'MozJPEG quality',
  'codec.webpBlurb': 'Balanced web format, usually smaller than JPEG with controllable encoding speed.',
  'codec.webpLabel': 'WebP quality',
  'codec.avifBlurb': 'Best compression ratio, but significantly slower encoding, suitable for size-critical publishing.',
  'codec.avifLabel': 'AVIF quality',
  'codec.pngBlurb': 'Lossless optimization, suitable for icons, UI screenshots, and transparent assets.',
  'codec.pngLabel': 'OxiPNG level',

  // Controls
  'controls.webpLossless': 'Use WebP lossless mode',
  'controls.avifSpeed': 'AVIF speed',
  'controls.avifLossless': 'Use AVIF lossless mode',

  // Actions
  'compress.run': 'Run compression',
  'compress.running': 'Compressing in browser...',
  'folder.compress': 'Compress {count} images to ZIP',
  'folder.running': 'Compressing folder in browser...',
  'folder.files': 'Images',
  'folder.skipped': 'Skipped',
  'folder.resultNote': 'The ZIP file keeps the selected folder structure. Files that fail to decode are skipped.',
  'folder.download': 'Download compressed ZIP',
  'folder.noCompressibleImages': 'No image in this folder could be compressed.',

  // Notes
  'panel.note': 'Re-encoded images will not retain original EXIF / ICC metadata, which is the default for pure front-end compression tools.',
  'error.compressionFailed': 'Compression failed in the browser.',

  // Result panel
  'result.label': '3. Result',
  'result.heading': 'Compression result and download',
  'result.input': 'Input',
  'result.output': 'Output',
  'result.delta': 'Delta',
  'result.time': 'Time',
  'result.sourceLabel': 'Source',
  'result.outputLabel': 'output',
  'result.formatOutput': 'Output format',
  'result.dimensions': 'Dimensions',
  'result.mime': 'MIME',
  'result.sizeReduced': 'Size reduced by',
  'result.sizeIncreased': 'Output larger by',
  'result.sizeIncreasedNote': 'this is normal for lossless PNG or high-quality AVIF/WebP',
  'result.download': 'Download compressed image',
  'result.emptyState': 'Select an image and run compression; preview, size change, and download link will appear here.',

  // Language switch
  'lang.en': 'EN',
  'lang.zh': '中',
}

const zh: Translations = {
  // Hero
  'hero.eyebrow': 'Cloudflare Pages + 浏览器 WASM',
  'hero.title': 'Squoosh 编解码器，完全在浏览器中运行',
  'hero.lede': '在浏览器本地压缩 JPEG、WebP、AVIF 和 PNG 图片。无需上传服务器，即时出结果。',

  // Source panel
  'source.label': '1. 源图片',
  'source.heading': '拖入图片或手动选择',
  'source.clear': '清除',
  'source.dropzonePill': '仅本地处理',
  'source.dropzoneHint': '拖入图片',
  'source.dropzoneFormats': 'PNG、JPEG、WebP、AVIF 等浏览器可读取的图片格式',
  'source.dropzoneReady': '准备压缩',
  'source.selectFolder': '选择文件夹',
  'source.folderSelected': '已从文件夹选择 {count} 张图片',
  'source.folderReady': '压缩后的目录结构会保留在 ZIP 文件中',
  'source.previewAlt': '已选源图',

  // Codec panel
  'codec.label': '2. 输出编码器',
  'codec.heading': '选择编码器和参数',
  'codec.jpegBlurb': '经典照片格式，压缩速度快，适合兼容性优先的输出。',
  'codec.jpegLabel': 'MozJPEG 质量',
  'codec.webpBlurb': '网页通用平衡型方案，通常比 JPEG 更小，编码速度也比较可控。',
  'codec.webpLabel': 'WebP 质量',
  'codec.avifBlurb': '压缩率通常最好，但编码明显更慢，适合追求更小体积的发布场景。',
  'codec.avifLabel': 'AVIF 质量',
  'codec.pngBlurb': '无损优化，适合图标、UI 截图和需要透明通道的素材。',
  'codec.pngLabel': 'OxiPNG 级别',

  // Controls
  'controls.webpLossless': 'WebP 无损模式',
  'controls.avifSpeed': 'AVIF 速度',
  'controls.avifLossless': 'AVIF 无损模式',

  // Actions
  'compress.run': '运行压缩',
  'compress.running': '正在浏览器中压缩...',
  'folder.compress': '压缩 {count} 张图片并导出 ZIP',
  'folder.running': '正在浏览器中压缩文件夹...',
  'folder.files': '图片数',
  'folder.skipped': '跳过',
  'folder.resultNote': 'ZIP 文件会保留所选文件夹的目录结构。无法解码的文件会被跳过。',
  'folder.download': '下载压缩后的 ZIP',
  'folder.noCompressibleImages': '文件夹中没有可压缩的图片。',

  // Notes
  'panel.note': '重新编码后的图片不会保留原始 EXIF / ICC 元数据，这通常是纯前端压缩工具的默认结果。',
  'error.compressionFailed': '浏览器内压缩失败。',

  // Result panel
  'result.label': '3. 结果',
  'result.heading': '压缩结果和下载',
  'result.input': '输入',
  'result.output': '输出',
  'result.delta': '差值',
  'result.time': '耗时',
  'result.sourceLabel': '原图',
  'result.outputLabel': '输出',
  'result.formatOutput': '输出格式',
  'result.dimensions': '尺寸',
  'result.mime': 'MIME',
  'result.sizeReduced': '体积缩小',
  'result.sizeIncreased': '输出比原图大',
  'result.sizeIncreasedNote': '这在无损 PNG 或高质量 AVIF/WebP 下是正常现象',
  'result.download': '下载压缩图片',
  'result.emptyState': '选择图片并运行压缩后，这里会显示预览、体积变化和下载链接。',

  // Language switch
  'lang.en': 'EN',
  'lang.zh': '中',
}

const dictionaries: Record<Locale, Translations> = { en, zh }

const STORAGE_KEY = 'squoosh-locale'

function getInitialLocale(): Locale {
  if (typeof window === 'undefined') return 'en'
  const stored = localStorage.getItem(STORAGE_KEY) as Locale | null
  if (stored && (stored === 'en' || stored === 'zh')) return stored
  // 根据浏览器语言自动检测
  const browserLang = navigator.language.toLowerCase()
  if (browserLang.startsWith('zh')) return 'zh'
  return 'en'
}

interface LocaleContextValue {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: string) => string
}

const LocaleContext = createContext<LocaleContextValue | null>(null)

// eslint-disable-next-line react-refresh/only-export-components
export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext)
  if (!ctx) {
    throw new Error('useLocale must be used within a LocaleProvider')
  }
  return ctx
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(getInitialLocale)

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next)
    localStorage.setItem(STORAGE_KEY, next)
    // 更新 html lang 属性
    document.documentElement.lang = next === 'zh' ? 'zh-CN' : 'en'
  }, [])

  const t = useCallback(
    (key: string): string => {
      return dictionaries[locale][key] ?? key
    },
    [locale],
  )

  // 初始化时同步 html lang
  useEffect(() => {
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en'
  }, [locale])

  return (
    <LocaleContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </LocaleContext.Provider>
  )
}
