import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const postJobPath = fileURLToPath(new URL('../PostJob.tsx', import.meta.url))
const detailPath = fileURLToPath(new URL('../MarketplaceDetail.tsx', import.meta.url))

describe('expected deliverable format contract', () => {
  it('persists and displays the human-selected format including package/archive outputs', () => {
    const postJob = readFileSync(postJobPath, 'utf8')
    const detail = readFileSync(detailPath, 'utf8')

    expect(postJob).toContain("filledDetails['expectedFormat'] = form.expectedFormat")
    expect(postJob).toContain("'NPM package / .tgz'")
    expect(postJob).toContain("'ZIP / TAR archive'")
    expect(detail).toContain('job.sectorConfig?.details?.expectedFormat')
  })
})
