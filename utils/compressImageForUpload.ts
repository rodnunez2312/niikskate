export type CompressImageOptions = {
  maxWidth?: number
  maxHeight?: number
  /** Target upper bound; quality is lowered until under this or min quality. */
  maxBytes?: number
  mimeType?: 'image/jpeg' | 'image/webp'
  quality?: number
  minQuality?: number
}

export const PRODUCT_PHOTO_UPLOAD = {
  maxWidth: 1200,
  maxHeight: 1200,
  maxBytes: 480 * 1024,
  mimeType: 'image/jpeg' as const,
  quality: 0.86,
  minQuality: 0.55,
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not read image.'))
    }
    img.src = url
  })
}

function scaleDimensions(
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number,
): { width: number; height: number } {
  let w = width
  let h = height
  if (w <= maxWidth && h <= maxHeight) return { width: w, height: h }
  const ratio = Math.min(maxWidth / w, maxHeight / h)
  w = Math.round(w * ratio)
  h = Math.round(h * ratio)
  return { width: w, height: h }
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise(resolve => canvas.toBlob(resolve, mimeType, quality))
}

/**
 * Resize and compress photos in the browser before Supabase upload (skateshop admin).
 */
export async function compressImageForUpload(
  file: File,
  options: CompressImageOptions = PRODUCT_PHOTO_UPLOAD,
): Promise<File> {
  if (!file.type.startsWith('image/')) {
    throw new Error('File is not an image.')
  }

  const maxWidth = options.maxWidth ?? PRODUCT_PHOTO_UPLOAD.maxWidth
  const maxHeight = options.maxHeight ?? PRODUCT_PHOTO_UPLOAD.maxHeight
  const maxBytes = options.maxBytes ?? PRODUCT_PHOTO_UPLOAD.maxBytes
  const mimeType = options.mimeType ?? PRODUCT_PHOTO_UPLOAD.mimeType
  const minQuality = options.minQuality ?? PRODUCT_PHOTO_UPLOAD.minQuality
  let quality = options.quality ?? PRODUCT_PHOTO_UPLOAD.quality

  if (file.size <= maxBytes && file.type === mimeType) {
    const img = await loadImage(file)
    if (img.width <= maxWidth && img.height <= maxHeight) {
      return file
    }
  }

  const img = await loadImage(file)
  const { width, height } = scaleDimensions(img.width, img.height, maxWidth, maxHeight)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not process image.')

  if (mimeType === 'image/jpeg') {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
  }
  ctx.drawImage(img, 0, 0, width, height)

  let blob: Blob | null = null
  while (quality >= minQuality) {
    blob = await canvasToBlob(canvas, mimeType, quality)
    if (!blob) throw new Error('Could not compress image.')
    if (blob.size <= maxBytes) break
    quality -= 0.08
  }

  if (!blob) throw new Error('Could not compress image.')

  const base = file.name.replace(/\.[^.]+$/, '') || 'photo'
  const safeName = base.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 80)
  const ext = mimeType === 'image/webp' ? 'webp' : 'jpg'
  return new File([blob], `${safeName}.${ext}`, { type: mimeType, lastModified: Date.now() })
}
