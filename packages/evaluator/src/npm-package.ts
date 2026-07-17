import { gunzip } from 'node:zlib'
import { promisify } from 'node:util'
import { extract } from 'tar-stream'

const gunzipAsync = promisify(gunzip)
const MAX_DECOMPRESSED_BYTES = 5 * 1024 * 1024
const MAX_ARCHIVE_ENTRIES = 10_000
const MAX_PACKAGE_JSON_BYTES = 128 * 1024
const MAX_README_BYTES = 64 * 1024

function stripControlChars(value: string): string {
  return Array.from(value)
    .filter((char) => {
      const code = char.codePointAt(0) ?? 0
      return code >= 0x20 && code !== 0x7f
    })
    .join('')
}

function safeText(value: unknown, maxLength = 200): string | null {
  if (typeof value !== 'string') return null
  const normalized = stripControlChars(value).trim()
  return normalized ? normalized.slice(0, maxLength) : null
}

function isSafeArchivePath(name: string): boolean {
  return !!name && !name.startsWith('/') && !name.includes('\\') && !name.split('/').includes('..')
}

async function readPackageEntries(
  archive: Buffer,
): Promise<{ packageJson: Buffer | null; readme: Buffer | null }> {
  if (archive.length === 0) throw new Error('archive is empty')

  const decompressed = await gunzipAsync(archive, { maxOutputLength: MAX_DECOMPRESSED_BYTES })

  return new Promise((resolve, reject) => {
    const extractor = extract()
    let entryCount = 0
    let packageJson: Buffer | null = null
    let readme: Buffer | null = null
    let failure: Error | null = null

    extractor.on('entry', (header, stream, next) => {
      entryCount++
      const name = header.name || ''
      const isTarget =
        name === 'package/package.json' || /^package\/readme(?:\.[a-z0-9]+)?$/i.test(name)
      const maxBytes = name === 'package/package.json' ? MAX_PACKAGE_JSON_BYTES : MAX_README_BYTES

      if (entryCount > MAX_ARCHIVE_ENTRIES) failure ||= new Error('archive has too many entries')
      if (!isSafeArchivePath(name)) failure ||= new Error('archive contains unsafe path')
      if (header.type !== 'file' && isTarget)
        failure ||= new Error('package metadata entry is not a regular file')
      if (isTarget && (header.size || 0) > maxBytes)
        failure ||= new Error(`${name} exceeds metadata size limit`)

      if (!isTarget || failure) {
        stream.resume()
        stream.on('end', next)
        return
      }

      const chunks: Buffer[] = []
      let bytes = 0
      stream.on('data', (chunk: Buffer) => {
        bytes += chunk.length
        if (bytes <= maxBytes) chunks.push(chunk)
        else failure ||= new Error(`${name} exceeds metadata size limit`)
      })
      stream.on('error', (error) => {
        failure ||= error as Error
      })
      stream.on('end', () => {
        if (!failure) {
          const value = Buffer.concat(chunks)
          if (name === 'package/package.json') packageJson = value
          else if (!readme) readme = value
        }
        next()
      })
    })

    extractor.once('error', reject)
    extractor.once('finish', () => {
      if (failure) reject(failure)
      else resolve({ packageJson, readme })
    })
    extractor.end(decompressed)
  })
}

/**
 * Inspect an npm tarball without extracting it to disk or executing its code.
 * Only package/package.json and the first package/README* file are exposed to
 * the evaluator. The output is deliberately bounded and metadata-only.
 */
export async function analyzeNpmPackage(archive: Buffer): Promise<string> {
  try {
    const { packageJson, readme } = await readPackageEntries(archive)
    if (!packageJson) return '[npm-package metadata; package.json unavailable]'

    let manifest: Record<string, unknown>
    try {
      manifest = JSON.parse(packageJson.toString('utf8'))
    } catch {
      return '[npm-package metadata; package.json is invalid JSON]'
    }

    const lines = ['[npm-package metadata; do not execute package scripts]']
    const name = safeText(manifest.name)
    const version = safeText(manifest.version)
    const description = safeText(manifest.description, 500)
    const main = safeText(manifest.main)
    const types = safeText(manifest.types)
    if (name) lines.push(`name: ${name}`)
    if (version) lines.push(`version: ${version}`)
    if (description) lines.push(`description: ${description}`)
    if (main) lines.push(`main: ${main}`)
    if (types) lines.push(`types: ${types}`)

    const scripts =
      manifest.scripts && typeof manifest.scripts === 'object'
        ? Object.keys(manifest.scripts as Record<string, unknown>).slice(0, 20)
        : []
    if (scripts.length) lines.push(`scripts: ${scripts.join(', ')}`)

    const dependencies =
      manifest.dependencies && typeof manifest.dependencies === 'object'
        ? Object.keys(manifest.dependencies as Record<string, unknown>).slice(0, 30)
        : []
    if (dependencies.length)
      lines.push(`dependencies (${dependencies.length}): ${dependencies.join(', ')}`)

    const files = Array.isArray(manifest.files)
      ? manifest.files.filter((value): value is string => typeof value === 'string').slice(0, 20)
      : []
    if (files.length) lines.push(`published files: ${files.join(', ')}`)

    if (readme) {
      const text = stripControlChars(readme.toString('utf8')).trim().slice(0, 4000)
      if (text) lines.push(`README: ${text}`)
    }

    return lines.join('\n')
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown archive error'
    return `[npm-package metadata unavailable: ${message}]`
  }
}
