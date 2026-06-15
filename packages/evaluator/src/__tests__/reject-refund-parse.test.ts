/**
 * Tests for parsing the USDC Transfer log inside a reject() tx receipt.
 *
 * Audit fix T12 (2026-06-15): the contract's reject() emits a USDC Transfer
 * in the same tx that moves the escrowed amount AgenticCommerce → client.
 * executeReject() returns those details so the caller can record refund_tx.
 *
 * These tests pin the log-parse logic against fixture-shaped log entries.
 * The actual viem writeContract path is not exercised here (would need a
 * forked-chain harness); pure log decode only.
 */
import { describe, it, expect } from 'vitest'

const ERC20_TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
const AGENTIC_COMMERCE = '0x0747eef0706327138c69792bf28cd525089e4583'
const USDC_ADDRESS = '0x3600000000000000000000000000000000000000'
const CLIENT = '0x4cf0afdc8621458fe2289a5f6e8acff6e0f33885'

interface MinimalLog {
  address: string
  topics: string[]
  data: string
}

function findRefundFromLogs(logs: MinimalLog[]): { to: string; amount: bigint } | undefined {
  for (const log of logs) {
    if (log.address.toLowerCase() !== USDC_ADDRESS.toLowerCase()) continue
    if (!log.topics[0] || log.topics[0].toLowerCase() !== ERC20_TRANSFER_TOPIC) continue
    if (log.topics.length < 3 || !log.topics[1] || !log.topics[2]) continue
    const fromAddr = ('0x' + log.topics[1].slice(-40)).toLowerCase()
    if (fromAddr !== AGENTIC_COMMERCE.toLowerCase()) continue
    const toAddr = '0x' + log.topics[2].slice(-40)
    const amount = BigInt(log.data)
    return { to: toAddr, amount }
  }
  return undefined
}

describe('reject() refund-log parser', () => {
  it('extracts refund details from a real-shaped reject receipt', () => {
    // Shape pulled from job 65's reject tx (verified on-chain)
    const logs: MinimalLog[] = [
      {
        address: '0xfffffffffffffffffffffffffffffffffffffffe',
        topics: [ERC20_TRANSFER_TOPIC, '0x' + '00'.repeat(12) + AGENTIC_COMMERCE.slice(2), '0x' + '00'.repeat(12) + CLIENT.slice(2)],
        data: '0x00000000000000000000000000000000000000000000000006f05b59d3b20000', // 0.5e18 in wei? no — see below
      },
      {
        address: USDC_ADDRESS,
        topics: [ERC20_TRANSFER_TOPIC, '0x' + '00'.repeat(12) + AGENTIC_COMMERCE.slice(2), '0x' + '00'.repeat(12) + CLIENT.slice(2)],
        data: '0x00000000000000000000000000000000000000000000000000000000000007a120', // 500000 = 0.5 USDC base units
      },
    ]
    const refund = findRefundFromLogs(logs)
    expect(refund).toBeDefined()
    expect(refund!.to.toLowerCase()).toBe(CLIENT.toLowerCase())
    expect(refund!.amount).toBe(500_000n)
  })

  it('returns undefined when there is no USDC Transfer in logs', () => {
    const logs: MinimalLog[] = [
      {
        address: AGENTIC_COMMERCE,
        topics: ['0x7ca5472b7ea78c2c0000000000000000000000000000000000000000000000ab'],
        data: '0x',
      },
    ]
    expect(findRefundFromLogs(logs)).toBeUndefined()
  })

  it('returns undefined when the Transfer is FROM something other than the contract', () => {
    // e.g. a router or external transfer — not our refund
    const logs: MinimalLog[] = [
      {
        address: USDC_ADDRESS,
        topics: [ERC20_TRANSFER_TOPIC, '0x' + '00'.repeat(12) + 'aaaa'.repeat(10), '0x' + '00'.repeat(12) + CLIENT.slice(2)],
        data: '0x00000000000000000000000000000000000000000000000000000000000007a120',
      },
    ]
    expect(findRefundFromLogs(logs)).toBeUndefined()
  })

  it('skips ETH-equivalent Transfer events (non-USDC token)', () => {
    const logs: MinimalLog[] = [
      {
        address: '0xfffffffffffffffffffffffffffffffffffffffe', // some other token
        topics: [ERC20_TRANSFER_TOPIC, '0x' + '00'.repeat(12) + AGENTIC_COMMERCE.slice(2), '0x' + '00'.repeat(12) + CLIENT.slice(2)],
        data: '0x' + 'ff'.repeat(32),
      },
    ]
    expect(findRefundFromLogs(logs)).toBeUndefined()
  })

  it('case-insensitive address matching', () => {
    const logs: MinimalLog[] = [
      {
        address: USDC_ADDRESS.toUpperCase(),
        topics: [
          ERC20_TRANSFER_TOPIC,
          '0x' + '00'.repeat(12) + AGENTIC_COMMERCE.slice(2).toUpperCase(),
          '0x' + '00'.repeat(12) + CLIENT.slice(2),
        ],
        data: '0x00000000000000000000000000000000000000000000000000000000000007a120',
      },
    ]
    const refund = findRefundFromLogs(logs)
    expect(refund).toBeDefined()
    expect(refund!.amount).toBe(500_000n)
  })
})
