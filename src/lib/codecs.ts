export type CompressionFormat = 'jpeg' | 'webp' | 'avif' | 'png'

export interface CompressionSettings {
  format: CompressionFormat
  quality: number
  webpLossless: boolean
  avifLossless: boolean
  avifSpeed: number
  pngLevel: number
}

export interface EncodedImage {
  bytes: ArrayBuffer
  extension: string
  format: CompressionFormat
  label: string
  mimeType: string
}

export interface DecodedImage {
  height: number
  imageData: ImageData
  width: number
}

export const DEFAULT_SETTINGS: CompressionSettings = {
  format: 'webp',
  quality: 74,
  webpLossless: false,
  avifLossless: false,
  avifSpeed: 6,
  pngLevel: 2,
}

export const FORMAT_LABELS: Record<CompressionFormat, string> = {
  jpeg: 'MozJPEG',
  webp: 'WebP',
  avif: 'AVIF',
  png: 'OxiPNG',
}

// 浏览器 Canvas 的像素上限因浏览器而异，但保守估计 16384^2 是安全的上限
const MAX_IMAGE_PIXELS = 16384 * 16384
// WASM 内存通常有限，太大的图片会导致编码器内存分配失败
// 8000 万像素（约 320MB raw data）是一个比较实际的警告线
const WARN_IMAGE_PIXELS = 80_000_000

export class CompressionError extends Error {
  readonly cause?: unknown

  constructor(message: string, cause?: unknown) {
    super(message)
    this.name = 'CompressionError'
    this.cause = cause
  }
}

function classifyError(error: unknown): string {
  if (error instanceof CompressionError) {
    return error.message
  }

  const message = error instanceof Error ? error.message : String(error)
  const lower = message.toLowerCase()

  if (lower.includes('wasm') || lower.includes('webassembly')) {
    if (lower.includes('404') || lower.includes('failed to load')) {
      return 'WASM 编码器加载失败，可能是网络问题或部署配置不完整。'
    }
    return 'WASM 编码器初始化失败，请尝试刷新页面。'
  }

  if (lower.includes('memory') || lower.includes('out of memory') || lower.includes('rangeerror')) {
    return '图片太大，浏览器内存不足。建议缩小图片尺寸后重试。'
  }

  if (lower.includes('aborted') || lower.includes('runtimeerror')) {
    return '编码器运行时错误，通常是内存不足或图片格式不兼容导致。'
  }

  if (lower.includes('invalid') && lower.includes('image')) {
    return '无法解析图片文件，格式可能损坏或不支持。'
  }

  if (lower.includes('canvas') || lower.includes('context')) {
    return '浏览器 Canvas 不可用，可能是隐私模式或内存不足导致。'
  }

  if (lower.includes('createimagebitmap')) {
    return '浏览器无法解码该图片文件，请尝试其他格式。'
  }

  return `压缩失败: ${message}`
}

export async function fileToImageData(file: File): Promise<DecodedImage> {
  if (!file.type.startsWith('image/')) {
    throw new CompressionError(
      `不支持的文件类型: ${file.type || '未知'}。请选择图片文件。`,
    )
  }

  let bitmap: ImageBitmap | undefined

  try {
    bitmap = await createImageBitmap(file)
  } catch (error) {
    throw new CompressionError(
      '浏览器无法解码该图片，文件可能损坏或格式不受支持。',
      error,
    )
  }

  const pixelCount = bitmap.width * bitmap.height

  if (pixelCount > MAX_IMAGE_PIXELS) {
    bitmap.close()
    throw new CompressionError(
      `图片尺寸过大 (${bitmap.width} × ${bitmap.height})。浏览器无法处理超过 ${MAX_IMAGE_PIXELS.toLocaleString()} 像素的图片。`,
    )
  }

  if (pixelCount > WARN_IMAGE_PIXELS) {
    // 不阻断，只是后续可能会慢或内存不足
    console.warn(
      `[squoosh-web] Large image: ${bitmap.width}×${bitmap.height} (${pixelCount.toLocaleString()} pixels). Compression may be slow or fail due to WASM memory limits.`,
    )
  }

  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height

  const context = canvas.getContext('2d', {
    willReadFrequently: true,
  })

  if (!context) {
    bitmap.close()
    throw new CompressionError('浏览器 Canvas 2D 上下文不可用，请检查隐私模式设置或内存状态。')
  }

  context.drawImage(bitmap, 0, 0)
  bitmap.close()

  let imageData: ImageData
  try {
    imageData = context.getImageData(0, 0, canvas.width, canvas.height)
  } catch (error) {
    throw new CompressionError('无法读取图片像素数据。', error)
  } finally {
    // 立即释放 canvas 占用的显存
    canvas.width = 0
    canvas.height = 0
  }

  return {
    width: canvas.width,
    height: canvas.height,
    imageData,
  }
}

// 缓存浏览器 Canvas 导出格式支持检测结果
const canvasSupportCache = new Map<string, boolean>()

function isCanvasMimeTypeSupported(mimeType: string): boolean {
  const cached = canvasSupportCache.get(mimeType)
  if (cached !== undefined) return cached

  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  const supported = canvas.toDataURL(mimeType).startsWith(`data:${mimeType}`)
  canvasSupportCache.set(mimeType, supported)
  return supported
}

async function encodeWithCanvas(
  imageData: ImageData,
  mimeType: string,
  quality?: number,
): Promise<ArrayBuffer> {
  const canvas = document.createElement('canvas')
  canvas.width = imageData.width
  canvas.height = imageData.height
  const ctx = canvas.getContext('2d')

  if (!ctx) {
    throw new CompressionError('浏览器 Canvas 2D 上下文不可用，无法降级处理。')
  }

  ctx.putImageData(imageData, 0, 0)

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, mimeType, quality)
  })

  if (!blob) {
    throw new CompressionError(`浏览器不支持通过 Canvas 导出 ${mimeType} 格式`)
  }

  return await blob.arrayBuffer()
}

async function encodeImageWasm(
  imageData: ImageData,
  settings: CompressionSettings,
): Promise<EncodedImage> {
  switch (settings.format) {
    case 'jpeg': {
      const { encode } = await import('@jsquash/jpeg')
      const bytes = await encode(imageData, {
        quality: settings.quality,
        progressive: true,
        optimize_coding: true,
        trellis_multipass: true,
      })

      return {
        bytes,
        extension: 'jpg',
        format: 'jpeg',
        label: FORMAT_LABELS.jpeg,
        mimeType: 'image/jpeg',
      }
    }

    case 'webp': {
      const { encode } = await import('@jsquash/webp')
      const bytes = await encode(imageData, {
        quality: settings.quality,
        method: 4,
        alpha_quality: 100,
        lossless: settings.webpLossless ? 1 : 0,
        use_sharp_yuv: 1,
      })

      return {
        bytes,
        extension: 'webp',
        format: 'webp',
        label: FORMAT_LABELS.webp,
        mimeType: 'image/webp',
      }
    }

    case 'avif': {
      const { encode } = await import('@jsquash/avif')
      const bytes = await encode(imageData, {
        quality: settings.quality,
        speed: settings.avifSpeed,
        lossless: settings.avifLossless,
        enableSharpYUV: true,
      })

      return {
        bytes,
        extension: 'avif',
        format: 'avif',
        label: FORMAT_LABELS.avif,
        mimeType: 'image/avif',
      }
    }

    case 'png': {
      const { optimise } = await import('@jsquash/oxipng')
      const bytes = await optimise(imageData, {
        level: settings.pngLevel,
        interlace: false,
        optimiseAlpha: true,
      })

      return {
        bytes,
        extension: 'png',
        format: 'png',
        label: FORMAT_LABELS.png,
        mimeType: 'image/png',
      }
    }
  }
}

async function encodeImageFallback(
  imageData: ImageData,
  settings: CompressionSettings,
): Promise<EncodedImage> {
  const quality = settings.quality / 100

  switch (settings.format) {
    case 'jpeg': {
      const bytes = await encodeWithCanvas(imageData, 'image/jpeg', quality)
      return {
        bytes,
        extension: 'jpg',
        format: 'jpeg',
        label: `${FORMAT_LABELS.jpeg} (browser fallback)`,
        mimeType: 'image/jpeg',
      }
    }

    case 'webp': {
      if (isCanvasMimeTypeSupported('image/webp')) {
        const bytes = await encodeWithCanvas(
          imageData,
          'image/webp',
          settings.webpLossless ? 1.0 : quality,
        )
        return {
          bytes,
          extension: 'webp',
          format: 'webp',
          label: `${FORMAT_LABELS.webp} (browser fallback)`,
          mimeType: 'image/webp',
        }
      }
      // WebP 是用户明确选择的格式，不应擅自降级为 JPEG。
      // 提示用户手动切换格式，避免违背需求（如透明通道丢失）。
      throw new CompressionError(
        'WebP WASM 编码失败，且当前浏览器不支持原生 WebP 导出。请尝试切换到 JPEG 格式后重新压缩。',
      )
    }

    case 'avif': {
      if (isCanvasMimeTypeSupported('image/avif')) {
        const bytes = await encodeWithCanvas(
          imageData,
          'image/avif',
          settings.avifLossless ? 1.0 : quality,
        )
        return {
          bytes,
          extension: 'avif',
          format: 'avif',
          label: `${FORMAT_LABELS.avif} (browser fallback)`,
          mimeType: 'image/avif',
        }
      }
      // AVIF Canvas 几乎不被支持，尝试降级到 WebP（仍属于现代格式）
      if (isCanvasMimeTypeSupported('image/webp')) {
        const bytes = await encodeWithCanvas(imageData, 'image/webp', quality)
        return {
          bytes,
          extension: 'webp',
          format: 'webp',
          label: `${FORMAT_LABELS.webp} (fallback from AVIF)`,
          mimeType: 'image/webp',
        }
      }
      // WebP 也不被支持时，不再继续降级到 JPEG，避免违背用户意图
      throw new CompressionError(
        'AVIF WASM 编码失败，且当前浏览器不支持原生 AVIF/WebP 导出。请尝试切换到 JPEG 或 WebP 格式后重新压缩。',
      )
    }

    case 'png': {
      const bytes = await encodeWithCanvas(imageData, 'image/png')
      return {
        bytes,
        extension: 'png',
        format: 'png',
        label: `${FORMAT_LABELS.png} (browser fallback)`,
        mimeType: 'image/png',
      }
    }
  }
}

export async function encodeImage(
  imageData: ImageData,
  settings: CompressionSettings,
): Promise<EncodedImage> {
  try {
    return await encodeImageWasm(imageData, settings)
  } catch (error) {
    console.warn(
      '[squoosh-web] WASM encoder failed, falling back to Canvas.toBlob()',
      error,
    )
    try {
      return await encodeImageFallback(imageData, settings)
    } catch (fallbackError) {
      throw new CompressionError(classifyError(fallbackError), fallbackError)
    }
  }
}

export function buildDownloadName(fileName: string, extension: string): string {
  const trimmed = fileName.replace(/\.[^.]+$/, '')
  return `${trimmed}-compressed.${extension}`
}
