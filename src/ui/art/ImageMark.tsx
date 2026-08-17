import { useState } from 'react'

/**
 * The shared raster mark primitive.
 *
 * Every caller already owns the semantic wrapper and its size. Keeping the
 * image itself presentation-only prevents duplicated labels while preserving
 * the wrapper's existing layout contract across boards, cards, and chrome.
 */
export function ImageMark({ src, className, fallback = '?' }: { src: string; className?: string; fallback?: string }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const classes = ['image-mark', className].filter(Boolean).join(' ')

  if (failedSrc === src) {
    return (
      <span className={`${classes} image-mark-fallback`} aria-hidden="true">
        {fallback}
      </span>
    )
  }

  return (
    <img
      className={classes}
      src={src}
      alt=""
      aria-hidden="true"
      draggable={false}
      decoding="async"
      onError={() => setFailedSrc(src)}
    />
  )
}
