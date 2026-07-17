import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const postJobPath = fileURLToPath(new URL('../PostJob.tsx', import.meta.url))

describe('PostJob transaction safety', () => {
  it('uses the backend-aware write guard before creating an on-chain job', () => {
    const source = readFileSync(postJobPath, 'utf8')

    expect(source).toContain("import { useGuardedWriteContract } from '@/hooks/useGuardedWriteContract'")
    expect(source).toContain('const { writeContractAsync } = useGuardedWriteContract()')
    expect(source).not.toContain("import { useAccount, useWriteContract } from 'wagmi'")
  })
})
