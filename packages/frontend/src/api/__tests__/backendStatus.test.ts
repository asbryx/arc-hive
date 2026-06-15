import { describe, it, expect, beforeEach } from 'vitest'
import {
  applyFetchResult,
  getBackendStatus,
  isBackendOnline,
  markBackendOffline,
  markBackendOnline,
  subscribeBackendStatus,
  __resetBackendStatusForTests,
} from '../backendStatus'

beforeEach(() => {
  __resetBackendStatusForTests()
})

describe('backendStatus core', () => {
  it('starts in unknown state', () => {
    expect(getBackendStatus()).toBe('unknown')
    expect(isBackendOnline()).toBe(true) // unknown is not "offline"
  })

  it('markBackendOffline / markBackendOnline transitions', () => {
    markBackendOffline()
    expect(getBackendStatus()).toBe('offline')
    expect(isBackendOnline()).toBe(false)

    markBackendOnline()
    expect(getBackendStatus()).toBe('online')
    expect(isBackendOnline()).toBe(true)
  })
})

describe('applyFetchResult', () => {
  function fakeResponse(status: number): Response {
    return new Response(null, { status })
  }

  it('marks offline on 502/503/504', () => {
    applyFetchResult(fakeResponse(502))
    expect(getBackendStatus()).toBe('offline')

    __resetBackendStatusForTests()
    applyFetchResult(fakeResponse(503))
    expect(getBackendStatus()).toBe('offline')

    __resetBackendStatusForTests()
    applyFetchResult(fakeResponse(504))
    expect(getBackendStatus()).toBe('offline')
  })

  it('marks online on 2xx / 3xx / 4xx (backend reachable, even if app rejects)', () => {
    applyFetchResult(fakeResponse(200))
    expect(getBackendStatus()).toBe('online')

    __resetBackendStatusForTests()
    applyFetchResult(fakeResponse(404))
    expect(getBackendStatus()).toBe('online')

    __resetBackendStatusForTests()
    applyFetchResult(fakeResponse(401))
    expect(getBackendStatus()).toBe('online')
  })

  it('does NOT touch status on 500/501/505 (app bug, not infra outage)', () => {
    markBackendOnline()
    applyFetchResult(fakeResponse(500))
    expect(getBackendStatus()).toBe('online')

    markBackendOnline()
    applyFetchResult(fakeResponse(501))
    expect(getBackendStatus()).toBe('online')
  })

  it('marks offline on null response (fetch threw)', () => {
    applyFetchResult(null, new Error('Failed to fetch'))
    expect(getBackendStatus()).toBe('offline')
  })

  it('ignores AbortError (deliberate cancellation)', () => {
    markBackendOnline()
    const abortErr = Object.assign(new Error('aborted'), { name: 'AbortError' })
    applyFetchResult(null, abortErr)
    expect(getBackendStatus()).toBe('online')
  })

  it('recovers offline → online after a successful request', () => {
    applyFetchResult(fakeResponse(502))
    expect(getBackendStatus()).toBe('offline')

    applyFetchResult(fakeResponse(200))
    expect(getBackendStatus()).toBe('online')
  })
})

describe('subscribeBackendStatus', () => {
  it('fires listener immediately with current state', () => {
    markBackendOffline()
    let seen: any = null
    const unsub = subscribeBackendStatus((s) => {
      seen = s
    })
    expect(seen).toBe('offline')
    unsub()
  })

  it('fires on transitions', () => {
    const seen: string[] = []
    const unsub = subscribeBackendStatus((s) => seen.push(s))

    markBackendOffline()
    markBackendOnline()
    markBackendOffline()

    // initial 'unknown' + 3 transitions
    expect(seen).toEqual(['unknown', 'offline', 'online', 'offline'])
    unsub()
  })

  it('does not fire on no-op transition', () => {
    markBackendOnline()
    const seen: string[] = []
    const unsub = subscribeBackendStatus((s) => seen.push(s))

    markBackendOnline()
    markBackendOnline()
    expect(seen).toEqual(['online']) // just the initial replay
    unsub()
  })

  it('returns unsubscribe function', () => {
    let count = 0
    const unsub = subscribeBackendStatus(() => count++)
    expect(count).toBe(1) // initial replay
    unsub()
    markBackendOffline()
    markBackendOnline()
    expect(count).toBe(1) // unchanged after unsubscribe
  })

  it('isolates a throwing subscriber from other subscribers', () => {
    let goodCalls = 0
    subscribeBackendStatus(() => {
      throw new Error('bad listener')
    })
    subscribeBackendStatus(() => {
      goodCalls++
    })
    markBackendOffline()
    expect(goodCalls).toBeGreaterThanOrEqual(1)
  })
})
