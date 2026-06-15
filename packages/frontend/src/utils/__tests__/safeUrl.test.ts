import { describe, it, expect } from 'vitest'
import { safeHref, safeImageSrc, safeHostname } from '../safeUrl'

describe('safeHref', () => {
  it('accepts plain http(s)', () => {
    expect(safeHref('https://example.com')).toBe('https://example.com/')
    expect(safeHref('http://example.com/path?q=1')).toBe('http://example.com/path?q=1')
  })

  it('accepts relative URLs', () => {
    expect(safeHref('/foo')).toBe('/foo')
    expect(safeHref('./foo')).toBe('./foo')
    expect(safeHref('#section')).toBe('#section')
    expect(safeHref('?q=1')).toBe('?q=1')
  })

  it('accepts mailto / tel', () => {
    expect(safeHref('mailto:a@b.com')).toBe('mailto:a@b.com')
    expect(safeHref('tel:+15551234')).toBe('tel:+15551234')
  })

  it('rejects javascript: URLs', () => {
    expect(safeHref('javascript:alert(1)')).toBeUndefined()
    expect(safeHref('JAVASCRIPT:alert(1)')).toBeUndefined()
    expect(safeHref('  javascript:alert(1)  ')).toBeUndefined()
    // Tab/newline obfuscation that browsers historically tolerated
    expect(safeHref('java\tscript:alert(1)')).toBeUndefined()
    expect(safeHref('java\nscript:alert(1)')).toBeUndefined()
  })

  it('rejects data: URLs (no script delivery via href)', () => {
    expect(safeHref('data:text/html,<script>alert(1)</script>')).toBeUndefined()
    expect(safeHref('data:image/png;base64,iVBORw0KG')).toBeUndefined()
  })

  it('rejects other dangerous schemes', () => {
    expect(safeHref('vbscript:msgbox(1)')).toBeUndefined()
    expect(safeHref('file:///etc/passwd')).toBeUndefined()
    expect(safeHref('blob:https://example.com/abc')).toBeUndefined()
  })

  it('rejects empty / non-string / garbage', () => {
    expect(safeHref('')).toBeUndefined()
    expect(safeHref('   ')).toBeUndefined()
    expect(safeHref(null)).toBeUndefined()
    expect(safeHref(undefined)).toBeUndefined()
    expect(safeHref(123 as any)).toBeUndefined()
    expect(safeHref({ url: 'https://x.com' } as any)).toBeUndefined()
    expect(safeHref('not a url')).toBeUndefined()
  })
})

describe('safeImageSrc', () => {
  it('accepts plain http(s)', () => {
    expect(safeImageSrc('https://cdn.example.com/img.png')).toBe('https://cdn.example.com/img.png')
  })

  it('accepts safe data:image types', () => {
    expect(safeImageSrc('data:image/png;base64,iVBORw0KG')).toBe('data:image/png;base64,iVBORw0KG')
    expect(safeImageSrc('data:image/jpeg;base64,/9j/4AAQ')).toBe('data:image/jpeg;base64,/9j/4AAQ')
    expect(safeImageSrc('data:image/svg+xml;base64,PHN2Zw==')).toBe('data:image/svg+xml;base64,PHN2Zw==')
    expect(safeImageSrc('data:image/gif;base64,R0lGODlh')).toBe('data:image/gif;base64,R0lGODlh')
    expect(safeImageSrc('data:image/webp;base64,UklGRg==')).toBe('data:image/webp;base64,UklGRg==')
    expect(safeImageSrc('data:image/avif;base64,AAAAHGZ0')).toBe('data:image/avif;base64,AAAAHGZ0')
  })

  it('rejects dangerous data: types', () => {
    expect(safeImageSrc('data:text/html,<script>alert(1)</script>')).toBeUndefined()
    expect(safeImageSrc('data:application/javascript,alert(1)')).toBeUndefined()
    // SVG can carry JS via <script> or onload, AND if served from data: with
    // no encoding marker, we can't even be sure browsers treat it as image.
    // Reject inline (non-base64) SVG entirely. Base64-wrapped SVG used as
    // <img src> doesn't execute scripts in modern browsers — we permit that
    // because lots of legitimate avatar/logo workflows produce it.
    expect(safeImageSrc('data:image/svg+xml,<svg onload=alert(1)></svg>')).toBeUndefined()
  })

  it('rejects javascript: and other schemes', () => {
    expect(safeImageSrc('javascript:alert(1)')).toBeUndefined()
    expect(safeImageSrc('vbscript:msgbox(1)')).toBeUndefined()
    expect(safeImageSrc('file:///etc/passwd')).toBeUndefined()
  })

  it('rejects empty / non-string', () => {
    expect(safeImageSrc('')).toBeUndefined()
    expect(safeImageSrc(null)).toBeUndefined()
    expect(safeImageSrc(undefined)).toBeUndefined()
  })
})

describe('safeHostname', () => {
  it('returns hostname for http(s)', () => {
    expect(safeHostname('https://example.com/path')).toBe('example.com')
    expect(safeHostname('http://sub.example.com:8080/')).toBe('sub.example.com')
  })

  it('returns null for unsafe', () => {
    expect(safeHostname('javascript:alert(1)')).toBeNull()
    expect(safeHostname('not a url')).toBeNull()
    expect(safeHostname('')).toBeNull()
    expect(safeHostname(null)).toBeNull()
  })
})
