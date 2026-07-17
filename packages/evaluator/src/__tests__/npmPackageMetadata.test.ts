import { describe, expect, it } from 'vitest'
import { createGzip } from 'node:zlib'
import { pack } from 'tar-stream'
import { analyzeNpmPackage } from '../npm-package.js'

function createPackageTgz(entries: Record<string, string>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const packer = pack()
    const chunks: Buffer[] = []
    const gzip = createGzip()
    gzip.on('data', (chunk: Buffer) => chunks.push(chunk))
    gzip.on('end', () => resolve(Buffer.concat(chunks)))
    gzip.on('error', reject)
    packer.on('error', reject)
    packer.pipe(gzip)
    for (const [name, content] of Object.entries(entries)) packer.entry({ name }, content)
    packer.finalize()
  })
}

describe('npm package evaluator metadata', () => {
  it('extracts only package metadata and readme from an in-memory tgz', async () => {
    const tgz = await createPackageTgz({
      'package/package.json': JSON.stringify({
        name: '@archivee/example',
        version: '1.2.3',
        main: 'dist/index.js',
        scripts: { test: 'vitest' },
        dependencies: { viem: '^2.0.0' },
        files: ['dist'],
      }),
      'package/README.md': '# Example\n\nA package deliverable.',
      'package/dist/index.js': 'export const hidden = true',
    })

    const result = await analyzeNpmPackage(tgz)
    expect(result).toContain('name: @archivee/example')
    expect(result).toContain('version: 1.2.3')
    expect(result).toContain('scripts: test')
    expect(result).toContain('README: # Example')
    expect(result).not.toContain('hidden = true')
  })

  it('does not accept traversal entries as evaluator input', async () => {
    const tgz = await createPackageTgz({
      '../package.json': JSON.stringify({ name: 'evil', version: '1.0.0' }),
      'package/README.md': 'safe readme',
    })
    const result = await analyzeNpmPackage(tgz)
    expect(result).toMatch(/metadata (unavailable|; package\.json unavailable)/)
    expect(result).not.toContain('name: evil')
  })
})
