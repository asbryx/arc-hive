import * as db from '../db/queries.js'
import dns from 'node:dns/promises'

// SEC-030: Anyone can register an agent on-chain with arbitrary metadata_uri.
// We must therefore treat every URI as adversarial and refuse to fetch from
// loopback / private / link-local / metadata addresses, including after DNS
// resolution. Same threat model as keys.ts validateWebhookUrl.

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(p => parseInt(p, 10))
  if (parts.length !== 4 || parts.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return false
  const [a, b, c, d] = parts
  if (a === 10 || a === 127 || a === 0) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 100 && b >= 64 && b <= 127) return true     // CGNAT / Tailscale
  if (a >= 224) return true
  if (a === 100 && b === 100 && c === 100 && d === 200) return true // Alibaba
  return false
}
function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase().replace(/^\[|\]$/g, '')
  if (lower === '::1' || lower === '::') return true
  if (lower.startsWith('fe80:')) return true
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true
  if (lower.startsWith('ff')) return true
  const m = lower.match(/^(?:0+:){0,5}(?:ffff:)?(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/)
  if (m && isPrivateIPv4(m[1])) return true
  return false
}

async function isSafePublicHost(hostname: string): Promise<boolean> {
  if (!hostname) return false
  const lower = hostname.toLowerCase()
  if (lower === 'localhost') return false
  if (lower.endsWith('.internal') || lower.endsWith('.local') ||
      lower.endsWith('.localdomain') || lower.endsWith('.lan') ||
      lower.endsWith('.intranet') || lower.endsWith('.corp') ||
      lower.endsWith('.home') || lower.endsWith('.private')) return false
  if (lower === 'metadata.google.internal') return false

  if (/^[\d.]+$/.test(lower)) return !isPrivateIPv4(lower)
  if (lower.includes(':')) return !isPrivateIPv6(lower)

  let resolvedAny = false
  try {
    const a = await dns.resolve4(lower)
    resolvedAny ||= a.length > 0
    for (const ip of a) if (isPrivateIPv4(ip)) return false
  } catch {}
  try {
    const a6 = await dns.resolve6(lower)
    resolvedAny ||= a6.length > 0
    for (const ip of a6) if (isPrivateIPv6(ip)) return false
  } catch {}
  return resolvedAny
}

const MAX_METADATA_BYTES = 256 * 1024 // 256KB cap on metadata payload

export async function fetchPendingMetadata(): Promise<void> {
  const items = await db.getPendingMetadata(5)
  if (items.length === 0) return

  for (const item of items) {
    try {
      const uri = resolveUri(item.metadata_uri)
      if (!uri) {
        await db.markMetadataFailed(BigInt(item.agent_id), 'Invalid URI')
        continue
      }

      // SEC-031: SSRF guard — reject http(s) URIs that resolve to internal hosts.
      let parsed: URL
      try { parsed = new URL(uri) } catch {
        await db.markMetadataFailed(BigInt(item.agent_id), 'Invalid URL')
        continue
      }
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        await db.markMetadataFailed(BigInt(item.agent_id), 'Unsupported protocol')
        continue
      }
      if (parsed.username || parsed.password) {
        await db.markMetadataFailed(BigInt(item.agent_id), 'Userinfo not allowed')
        continue
      }
      if (!(await isSafePublicHost(parsed.hostname))) {
        await db.markMetadataFailed(BigInt(item.agent_id), 'Host blocked (private/internal)')
        continue
      }

      const response = await fetch(uri, {
        signal: AbortSignal.timeout(15_000),
        headers: { 'Accept': 'application/json', 'User-Agent': 'arc-hive-indexer/1.0' },
        redirect: 'manual',           // SEC-032: don't follow redirects to internal hosts
      })

      if (response.status >= 300 && response.status < 400) {
        throw new Error(`Redirect not followed (${response.status})`)
      }
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      // SEC-033: bound payload size before parsing JSON
      const cl = parseInt(response.headers.get('content-length') || '0', 10)
      if (cl && cl > MAX_METADATA_BYTES) throw new Error('Metadata too large')
      const text = await response.text()
      if (text.length > MAX_METADATA_BYTES) throw new Error('Metadata too large')
      const json = JSON.parse(text)
      if (!json || typeof json !== 'object' || Array.isArray(json)) {
        throw new Error('Metadata must be a JSON object')
      }

      await db.updateAgentMetadata(BigInt(item.agent_id), item.source_contract, {
        // SEC-034: coerce + bound everything that originates on-chain (attacker-controlled)
        name: typeof json.name === 'string' ? json.name.slice(0, 200) : null,
        description: typeof json.description === 'string' ? json.description.slice(0, 5000) : null,
        imageUri: typeof json.image === 'string' ? json.image.slice(0, 500) : null,
        agentType: typeof json.agent_type === 'string' ? json.agent_type.slice(0, 100) : null,
        capabilities: Array.isArray(json.capabilities)
          ? json.capabilities.filter((c: unknown) => typeof c === 'string').slice(0, 32).map((s: string) => s.slice(0, 100))
          : null,
        version: typeof json.version === 'string' ? json.version.slice(0, 50) : null,
      })

      await db.markMetadataDone(BigInt(item.agent_id))
    } catch (err) {
      await db.markMetadataFailed(BigInt(item.agent_id), (err as Error).message)
    }
  }
}

function resolveUri(uri: string): string | null {
  if (!uri || typeof uri !== 'string') return null
  if (uri.length > 1024) return null

  const gateways = (process.env.IPFS_GATEWAYS || 'https://ipfs.io/ipfs/').split(',')
  const gateway = gateways[0]

  if (uri.startsWith('ipfs://')) {
    const cid = uri.replace('ipfs://', '').split(/[?#]/)[0]
    if (!/^[a-zA-Z0-9./_-]+$/.test(cid)) return null     // SEC-035: refuse weird CIDs
    return `${gateway}${cid}`
  }

  if (uri.startsWith('ar://')) {
    const id = uri.replace('ar://', '').split(/[?#]/)[0]
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) return null
    return `https://arweave.net/${id}`
  }

  if (uri.startsWith('http://') || uri.startsWith('https://')) {
    return uri
  }

  if (uri.startsWith('data:')) {
    return null // data URIs not supported for fetch
  }

  // Bare CID — accept only base58/base32 alphanumerics
  if (!/^[a-zA-Z0-9]+$/.test(uri)) return null
  return `${gateway}${uri}`
}

let metadataInterval: ReturnType<typeof setInterval> | null = null

export function startMetadataFetcher(): void {
  const interval = parseInt(process.env.METADATA_FETCH_INTERVAL_MS || '5000')
  console.log(`[Metadata] Starting fetcher (interval: ${interval}ms)`)

  metadataInterval = setInterval(async () => {
    try {
      await fetchPendingMetadata()
    } catch (err) {
      console.error(`[Metadata] Fetch error:`, (err as Error).message)
    }
  }, interval)
}

export function stopMetadataFetcher(): void {
  if (metadataInterval) {
    clearInterval(metadataInterval)
    metadataInterval = null
  }
}
