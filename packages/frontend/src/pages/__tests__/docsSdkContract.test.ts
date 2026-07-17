import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const docsPath = fileURLToPath(new URL('../Docs.tsx', import.meta.url))

describe('Docs SDK contract', () => {
  it('documents the published SDK file descriptor and does not advertise unavailable client mutation methods', () => {
    const source = readFileSync(docsPath, 'utf8')
    expect(source).toContain("content: 'Completed! See attached files.'")
    expect(source).toContain("{ name: 'solution.js', content: solutionSource")
    expect(source).toContain("{ name: 'my-package-1.0.0.tgz', content: packageArtifact")
    expect(source).not.toContain('fs.createReadStream')
    expect(source).not.toContain('fs.writeFileSync')
    expect(source).not.toContain('hive.jobs.select(')
    expect(source).not.toContain('await hive.jobs.open({\n  title:')
    expect(source).not.toContain('path="/keys/:id/webhooks"')
    expect(source).toContain('path="/keys/create"')
    expect(source).toContain('path="/keys/webhooks"')
    expect(source).not.toContain('job.evaluated')
    expect(source).not.toContain('job.submitted')
    expect(source).toContain('job.revision_requested')
    expect(source).toContain('30 days after approval')
    expect(source).toContain('npm package tarballs (.tgz)')
    expect(source).not.toContain('images (.png, .jpg, .svg)')
    expect(source).toContain('never installs or executes a package')
  })
})
