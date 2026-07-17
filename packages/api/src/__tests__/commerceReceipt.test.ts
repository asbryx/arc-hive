import { describe, expect, it } from 'vitest'
import { encodeAbiParameters, keccak256, padHex, stringToHex } from 'viem'
import { hasCommerceEvent, hasSubmittedDeliverable } from '../lib/commerce-receipt.js'

const CONTRACT = '0x0747eef0706327138c69792bf28cd525089e4583' as const
const CLIENT = '0x1111111111111111111111111111111111111111' as const
const OTHER_CLIENT = '0x2222222222222222222222222222222222222222' as const
const PROVIDER = '0x3333333333333333333333333333333333333333' as const
const EVALUATOR = '0xc1fef538dc6357435372ceb69970d4078f4d3528' as const

function indexed(value: `0x${string}` | bigint) {
  return padHex(typeof value === 'bigint' ? `0x${value.toString(16)}` : value, { size: 32 })
}

function createdReceipt(jobId = 42n, client: `0x${string}` = CLIENT) {
  return {
    status: 'success',
    logs: [{
      address: CONTRACT,
      topics: [
        keccak256(stringToHex('JobCreated(uint256,address,address,address,uint256,address)')),
        indexed(jobId),
        indexed(client),
        indexed(CLIENT),
      ],
      data: encodeAbiParameters(
        [{ type: 'address' }, { type: 'uint256' }, { type: 'address' }],
        [EVALUATOR, 1_700_000_000n, '0x0000000000000000000000000000000000000000'],
      ),
    }],
  }
}

function fundedReceipt(jobId = 42n, client: `0x${string}` = CLIENT) {
  return {
    status: 'success',
    logs: [{
      address: CONTRACT,
      topics: [
        keccak256(stringToHex('JobFunded(uint256,address,uint256)')),
        indexed(jobId),
        indexed(client),
      ],
      data: encodeAbiParameters([{ type: 'uint256' }], [1_000_000n]),
    }],
  }
}

function submittedReceipt(jobId = 42n, provider: `0x${string}` = PROVIDER) {
  return {
    status: 'success',
    logs: [{
      address: CONTRACT,
      topics: [
        keccak256(stringToHex('JobSubmitted(uint256,address,bytes32)')),
        indexed(jobId),
        indexed(provider),
      ],
      data: encodeAbiParameters([{ type: 'bytes32' }], [padHex('0x01', { size: 32 })]),
    }],
  }
}

function completedReceipt(jobId = 42n) {
  return {
    status: 'success',
    logs: [{
      address: CONTRACT,
      topics: [
        keccak256(stringToHex('JobCompleted(uint256,address,bytes32)')),
        indexed(jobId),
        indexed(EVALUATOR),
      ],
      data: encodeAbiParameters([{ type: 'bytes32' }], [padHex('0x01', { size: 32 })]),
    }],
  }
}

describe('commerce transaction receipt guard', () => {
  it('accepts JobCreated only for the exact on-chain job and client', () => {
    expect(hasCommerceEvent(createdReceipt(), 'JobCreated', 42n, CLIENT)).toBe(true)
    expect(hasCommerceEvent(createdReceipt(43n), 'JobCreated', 42n, CLIENT)).toBe(false)
    expect(hasCommerceEvent(createdReceipt(42n, OTHER_CLIENT), 'JobCreated', 42n, CLIENT)).toBe(false)
  })

  it('accepts a successful funding event for the exact job and client', () => {
    expect(hasCommerceEvent(fundedReceipt(), 'JobFunded', 42n, CLIENT)).toBe(true)
  })

  it('rejects mismatched job, client, contract, or failed receipt', () => {
    expect(hasCommerceEvent(fundedReceipt(43n), 'JobFunded', 42n, CLIENT)).toBe(false)
    expect(hasCommerceEvent(fundedReceipt(42n, OTHER_CLIENT), 'JobFunded', 42n, CLIENT)).toBe(false)
    expect(hasCommerceEvent({ ...fundedReceipt(), status: 'reverted' }, 'JobFunded', 42n, CLIENT)).toBe(false)
    expect(hasCommerceEvent({ ...fundedReceipt(), logs: [{ ...fundedReceipt().logs[0], address: OTHER_CLIENT }] }, 'JobFunded', 42n, CLIENT)).toBe(false)
  })

  it('accepts submission only for the exact on-chain job and provider', () => {
    expect(hasCommerceEvent(submittedReceipt(), 'JobSubmitted', 42n, PROVIDER)).toBe(true)
    expect(hasCommerceEvent(submittedReceipt(43n), 'JobSubmitted', 42n, PROVIDER)).toBe(false)
    expect(hasCommerceEvent(submittedReceipt(42n, OTHER_CLIENT), 'JobSubmitted', 42n, PROVIDER)).toBe(false)
  })

  it('binds a persisted Explorer deliverable to the exact submitted content hash', () => {
    const hash = padHex('0x01', { size: 32 })
    expect(hasSubmittedDeliverable(submittedReceipt(), 42n, PROVIDER, hash)).toBe(true)
    expect(hasSubmittedDeliverable(submittedReceipt(), 42n, PROVIDER, padHex('0x02', { size: 32 }))).toBe(false)
    expect(hasSubmittedDeliverable(submittedReceipt(), 42n, OTHER_CLIENT, hash)).toBe(false)
  })

  it('accepts completion only when the exact on-chain job emitted JobCompleted', () => {
    expect(hasCommerceEvent(completedReceipt(), 'JobCompleted', 42n)).toBe(true)
    expect(hasCommerceEvent(completedReceipt(43n), 'JobCompleted', 42n)).toBe(false)
  })
})
