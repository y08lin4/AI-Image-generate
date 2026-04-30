import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  src: string
  title: string
  remoteUrl?: string
  onCopyImage?: () => void | Promise<void>
  onCopyRemoteUrl?: () => void | Promise<void>
  onClose: () => void
}

type ImageDimensions = { width: number; height: number }

export function ImagePreviewModal({ src, title, remoteUrl, onCopyImage, onCopyRemoteUrl, onClose }: Props) {
  const [dimensions, setDimensions] = useState<ImageDimensions | undefined>()

  useEffect(() => {
    setDimensions(undefined)
  }, [src])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  const hasActions = Boolean(onCopyImage || (remoteUrl && onCopyRemoteUrl))

  return createPortal(
    <div className="preview-mask" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="preview-dialog" role="dialog" aria-modal="true" aria-label={title}>
        <button type="button" className="preview-close" onClick={onClose} aria-label="关闭预览">×</button>
        <div className="preview-info">
          <span>{formatDimensions(dimensions)}</span>
          <span>{formatActualRatio(dimensions)}</span>
          <span>{formatImageSize(src)}</span>
        </div>
        {hasActions ? (
          <div className="preview-actions">
            {onCopyImage ? <button type="button" onClick={() => void onCopyImage()}>复制图片</button> : null}
            {remoteUrl && onCopyRemoteUrl ? <button type="button" onClick={() => void onCopyRemoteUrl()}>复制URL</button> : null}
          </div>
        ) : null}
        <img
          src={src}
          alt={title}
          onLoad={(event) => setDimensions({
            width: event.currentTarget.naturalWidth,
            height: event.currentTarget.naturalHeight,
          })}
        />
      </div>
    </div>,
    document.body,
  )
}

function formatImageSize(dataUrl: string) {
  const bytes = getDataUrlBytes(dataUrl)
  if (!bytes) return '未知大小'
  const mb = bytes / 1024 / 1024
  if (mb >= 1) return `${mb >= 10 ? mb.toFixed(0) : mb.toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function formatDimensions(dimensions?: ImageDimensions) {
  return dimensions ? `${dimensions.width}×${dimensions.height}` : '读取尺寸中'
}

function formatActualRatio(dimensions?: ImageDimensions) {
  if (!dimensions) return '读取比例中'
  const divisor = gcd(dimensions.width, dimensions.height)
  return `${dimensions.width / divisor}:${dimensions.height / divisor}`
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a)
  let y = Math.abs(b)
  while (y) {
    const next = x % y
    x = y
    y = next
  }
  return x || 1
}

function getDataUrlBytes(dataUrl: string) {
  const marker = ';base64,'
  const index = dataUrl.indexOf(marker)
  if (index < 0) return dataUrl.startsWith('data:') ? new TextEncoder().encode(dataUrl).length : 0
  const base64 = dataUrl.slice(index + marker.length).replace(/\s/g, '')
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor(base64.length * 3 / 4) - padding)
}
