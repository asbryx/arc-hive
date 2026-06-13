import type { Context, Next } from 'hono'
import { createHash } from 'crypto'
import { query } from '../db.js'
import { createPublicClient, http, parseAbiItem } from 'viem'

/**
 * x402 Payment Required middleware
 * When a request lacks valid payment, returns HTTP 402 with payment instructions.
 *
 * SEC-040: Previous version short-circuited any non-empty `x-api-key` and accepted
 * any non-empty `x-payment-proof` — both let any caller bypass payment.
 * This version requires:
 *   - a verified API key matching api_keys.key_hash with revoked_at IS NULL, OR
 *   - a payment-proof tx that we resolve on-chain to a USDC transfer to payTo of >= priceUsd.
 */

interface X402Config {
  priceUsd: number
  payToAddress: string
  network: string
  rpcUrl?: string
}

const DEFAULT_CONFIG: X402Config = {
  priceUsd: 0.01,
  payToAddress: process.env.X402_PAY_TO_ADDRESS || '0x0000000000000000000000000000000000000000',
  network: 'arc-testnet',
  rpcUrl: process.env.ARC_RPC_HTTP || 'https://rpc.testnet.arc.network',
}

const USDC_TRANSFER = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)')
const USDC_ADDRESS = (process.env.X402_USDC_ADDRESS || '0x3600000000000000000000000000000000000000').toLowerCase()

// SEC-041: Each tx hash may be presented exactly once to prevent replay across endpoints/users.
const acceptedTxHashes = new Map<string, number>()
setInterval(() => {
  const cutoff = Date.now() - 24 * 3600 * 1000
  for (const [k, ts] of acceptedTxHashes) if (ts < cutoff) acceptedTxHashes.delete(k)
}, 60 * 60 * 1000).unref()

async function verifyApiKey(rawKey: string): Promise<boolean> {
  if (!rawKey || typeof rawKey !== 'string' || rawKey.length > 200) return false
  if (!/^ak_[a-f0-9]+$/.test(rawKey)) return false
  const hash = createHash('sha256').update(rawKey).digest('hex')
  const r = await query(
    `SELECT 1 FROM api_keys WHERE key_hash = $1 AND revoked_at IS NULL LIMIT 1`,
    [hash]
  )
  return r.rows.length > 0
}

async function verifyPaymentProof(txHash: string, cfg: X402Config): Promise<boolean> {
  if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) return false
  if (acceptedTxHashes.has(txHash.toLowerCase())) return false
  try {
    const client = createPublicClient({ transport: http(cfg.rpcUrl) })
    const receipt = await client.getTransactionReceipt({ hash: txHash as `0x${string}` })
    if (receipt.status !== 'success') return false

    const minAmount = BigInt(Math.round(cfg.priceUsd * 1_000_000))
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== USDC_ADDRESS) continue
      // topics[0] = Transfer signature, topics[1] = from, topics[2] = to
      if (log.topics.length < 3) continue
      const toTopic = log.topics[2]!.toLowerCase()
      const expectedTo = `0x000000000000000000000000${cfg.payToAddress.slice(2).toLowerCase()}`
      if (toTopic !== expectedTo) continue
      const value = BigInt(log.data || '0x0')
      if (value >= minAmount) {
        acceptedTxHashes.set(txHash.toLowerCase(), Date.now())
        return true
      }
    }
  } catch { return false }
  return false
}

export function x402PaymentRequired(config: Partial<X402Config> = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config }

  return async (c: Context, next: Next) => {
    const paymentProof = c.req.header('x-payment-proof')
    const apiKey = c.req.header('x-api-key')

    if (apiKey && await verifyApiKey(apiKey)) {
      c.set('hasApiKey', true)
      await next()
      return
    }

    if (paymentProof && await verifyPaymentProof(paymentProof, cfg)) {
      c.header('x-payment-status', 'verified')
      await next()
      return
    }

    return c.json({
      error: 'Payment Required',
      x402: {
        version: '1.0',
        paymentRequired: {
          amount: cfg.priceUsd,
          currency: 'USDC',
          network: cfg.network,
          payTo: cfg.payToAddress,
          description: 'ArcHive API access',
          instructions: `Send ${cfg.priceUsd} USDC to ${cfg.payToAddress} on ${cfg.network}`,
        },
        acceptedMethods: ['usdc-transfer', 'api-key'],
      },
      hint: 'Include x-payment-proof header with your on-chain transaction hash, or use x-api-key for subscription access',
    }, 402)
  }
}
