import { useEffect, useState } from 'react'
import {
  type BackendStatus,
  getBackendStatus,
  subscribeBackendStatus,
} from '@/api/backendStatus'

/**
 * Subscribe to backend liveness changes.
 *
 * Audit fix T7 (2026-06-15). Use anywhere a component needs to react to
 * the API going down — typically to disable wallet-tx buttons or surface
 * a banner.
 */
export function useBackendStatus(): BackendStatus {
  const [status, setStatus] = useState<BackendStatus>(getBackendStatus())

  useEffect(() => {
    const unsubscribe = subscribeBackendStatus(setStatus)
    return unsubscribe
  }, [])

  return status
}
