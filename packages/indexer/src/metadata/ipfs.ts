import * as db from '../db/queries.js'

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

      const response = await fetch(uri, {
        signal: AbortSignal.timeout(15_000),
        headers: { 'Accept': 'application/json' },
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const json = await response.json()

      await db.updateAgentMetadata(BigInt(item.agent_id), item.source_contract, {
        name: json.name || null,
        description: json.description || null,
        imageUri: json.image || null,
        agentType: json.agent_type || null,
        capabilities: Array.isArray(json.capabilities) ? json.capabilities : null,
        version: json.version || null,
      })

      await db.markMetadataDone(BigInt(item.agent_id))
    } catch (err) {
      await db.markMetadataFailed(BigInt(item.agent_id), (err as Error).message)
    }
  }
}

function resolveUri(uri: string): string | null {
  if (!uri) return null

  const gateways = (process.env.IPFS_GATEWAYS || 'https://ipfs.io/ipfs/').split(',')
  const gateway = gateways[0]

  if (uri.startsWith('ipfs://')) {
    const cid = uri.replace('ipfs://', '')
    return `${gateway}${cid}`
  }

  if (uri.startsWith('ar://')) {
    const id = uri.replace('ar://', '')
    return `https://arweave.net/${id}`
  }

  if (uri.startsWith('http://') || uri.startsWith('https://')) {
    return uri
  }

  if (uri.startsWith('data:')) {
    return null // data URIs not supported for fetch
  }

  // Assume bare CID
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
