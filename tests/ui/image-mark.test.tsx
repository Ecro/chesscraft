// @vitest-environment jsdom
import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ImageMark } from '@ui/art/ImageMark'

describe('ImageMark', () => {
  it('replaces a failed asset with a visible safe fallback', () => {
    const { container } = render(<ImageMark src="/missing.webp" className="brand-mark" />)
    const image = container.querySelector('img')
    expect(image).not.toBeNull()

    fireEvent.error(image!)

    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('.image-mark-fallback')?.textContent).toBe('?')
    expect(container.querySelector('.brand-mark')?.getAttribute('aria-hidden')).toBe('true')
  })

  it('retries when a failed image source changes', () => {
    const { container, rerender } = render(<ImageMark src="/missing.webp" />)
    fireEvent.error(container.querySelector('img')!)
    rerender(<ImageMark src="/recovered.webp" />)
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/recovered.webp')
  })
})
