import { useCallback } from 'react'
import { useWriteContract } from 'wagmi'
import { getBackendStatus } from '@/api/backendStatus'

/**
 * Wrap wagmi's `writeContractAsync` so we refuse to broadcast on-chain
 * transactions while the backend API is offline.
 *
 * Audit fix T7 (2026-06-15). Several flows require the backend to mirror
 * an on-chain action (createJob → POST /open-jobs, fund → POST /:id/fund,
 * etc.). Sending the on-chain tx while the API is unreachable leaves the
 * marketplace state inconsistent: the chain has the action, the DB
 * doesn't, and reconciliation is manual. The user is also burning gas
 * for an action they can't complete.
 *
 * The guard is opt-in — wallet-only flows that don't need API mirroring
 * (a hypothetical pure-wagmi action) can keep using `useWriteContract`
 * directly.
 */
export class BackendOfflineError extends Error {
  constructor() {
    super('Backend is offline. Please try again in a moment.')
    this.name = 'BackendOfflineError'
  }
}

export function useGuardedWriteContract() {
  const wagmi = useWriteContract()

  const guardedWriteContractAsync = useCallback(
    async (args: Parameters<typeof wagmi.writeContractAsync>[0]) => {
      if (getBackendStatus() === 'offline') {
        throw new BackendOfflineError()
      }
      return wagmi.writeContractAsync(args)
    },
    [wagmi],
  )

  return {
    ...wagmi,
    writeContractAsync: guardedWriteContractAsync,
  }
}
