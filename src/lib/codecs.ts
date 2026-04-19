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

export async function fileToImageData(file: File): Promise<DecodedImage> {
  const bitmap = await createImageBitmap(file)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height

  const context = canvas.getContext('2d', {
    willReadFrequently: true,
  })

  if (!context) {
    bitmap.close()
    throw new Error('Canvas 2D context is not available in this browser.')
  }

  context.drawImage(bitmap, 0, 0)
  bitmap.close()

  return {
    width: canvas.width,
    height: canvas.height,
    imageData: context.getImageData(0, 0, canvas.width, canvas.height),
  }
}

export async function encodeImage(
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

export function buildDownloadName(fileName: string, extension: string): string {
  const trimmed = fileName.replace(/\.[^.]+$/, '')
  return `${trimmed}-compressed.${extension}`
}
