import { createWalletClient, createPublicClient, http, keccak256, toBytes } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { CONFIG } from './config.js'

const chain = {
  id: CONFIG.CHAIN_ID,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'ARC', symbol: 'ARC', decimals: 18 },
  rpcUrls: { default: { http: [CONFIG.RPC_URL] } },
}

const ABI = [
  { inputs: [{ name: 'jobId', type: 'uint256' }, { name: 'deliverable', type: 'bytes32' }, { name: 'optParams', type: 'bytes' }], name: 'submit', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'jobId', type: 'uint256' }, { name: 'reason', type: 'bytes32' }, { name: 'optParams', type: 'bytes' }], name: 'complete', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'jobId', type: 'uint256' }, { name: 'reason', type: 'bytes32' }, { name: 'optParams', type: 'bytes' }], name: 'reject', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'jobId', type: 'uint256' }], name: 'claimRefund', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'jobId', type: 'uint256' }], name: 'getJob', outputs: [{ components: [{ name: 'id', type: 'uint256' }, { name: 'client', type: 'address' }, { name: 'provider', type: 'address' }, { name: 'evaluator', type: 'address' }, { name: 'description', type: 'string' }, { name: 'budget', type: 'uint256' }, { name: 'expiredAt', type: 'uint256' }, { name: 'status', type: 'uint8' }, { name: 'hook', type: 'address' }], name: '', type: 'tuple' }], stateMutability: 'view', type: 'function' },
] as const

// Minimal ERC-20 ABI for USDC payout transfers (relay → agent forward step)
const ERC20_ABI = [
  { inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], name: 'transfer', outputs: [{ name: '', type: 'bool' }], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'account', type: 'address' }], name: 'balanceOf', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
] as const

// USDC on Arc Testnet — keep in sync with shared/src/constants.ts and config.
export const USDC_ADDRESS = '0x3600000000000000000000000000000000000000' as `0x${string}`

// FIX: Per-wallet nonce management to prevent cross-wallet nonce collision
const nonceMap = new Map<string, number>()

async function getNextNonce(client: any, address: string): Promise<number> {
  const key = address.toLowerCase()
  if (!nonceMap.has(key) || nonceMap.get(key) === -1) {
    const onChainNonce = await client.getTransactionCount({ address })
    nonceMap.set(key, onChainNonce)
  }
  const nonce = nonceMap.get(key)!
  nonceMap.set(key, nonce + 1)
  return nonce
}

function resetNonce(address?: string) {
  if (address) {
    nonceMap.delete(address.toLowerCase())
  } else {
    nonceMap.clear()
  }
}

function getPublicClient() {
  return createPublicClient({ chain, transport: http(CONFIG.RPC_URL) })
}

function getProviderWallet() {
  if (!CONFIG.PROVIDER_PRIVATE_KEY) throw new Error('PROVIDER_PRIVATE_KEY not set')
  const account = privateKeyToAccount(CONFIG.PROVIDER_PRIVATE_KEY as `0x${string}`)
  return createWalletClient({ account, chain, transport: http(CONFIG.RPC_URL) })
}

function getEvaluatorWallet() {
  if (!CONFIG.EVALUATOR_PRIVATE_KEY) throw new Error('EVALUATOR_PRIVATE_KEY not set')
  const account = privateKeyToAccount(CONFIG.EVALUATOR_PRIVATE_KEY as `0x${string}`)
  return createWalletClient({ account, chain, transport: http(CONFIG.RPC_URL) })
}

// Get on-chain job status
export async function getOnchainJobStatus(jobId: bigint): Promise<number> {
  const publicClient = getPublicClient()
  const jobData = await publicClient.readContract({
    address: CONFIG.AGENTIC_COMMERCE,
    abi: ABI,
    functionName: 'getJob',
    args: [jobId],
  })
  return jobData.status
}

// Get full on-chain job data (including expiredAt)
export async function getOnchainJob(jobId: bigint) {
  const publicClient = getPublicClient()
  try {
    return await publicClient.readContract({
      address: CONFIG.AGENTIC_COMMERCE,
      abi: ABI,
      functionName: 'getJob',
      args: [jobId],
    })
  } catch {
    return null
  }
}

// Provider submits deliverable on-chain (required before complete/reject)
export async function executeSubmit(jobId: bigint, deliverableContent: string): Promise<string> {
  const providerWallet = getProviderWallet()
  const publicClient = getPublicClient()

  // FIX O-06: Hash full content instead of only first 100 bytes
  const contentHash = keccak256(toBytes(deliverableContent))

  // FIX O-02: Get sequential nonce
  const nonce = await getNextNonce(publicClient, providerWallet.account.address)

  // FIX O-03: Estimate gas with 20% buffer
  const gas = await publicClient.estimateContractGas({
    address: CONFIG.AGENTIC_COMMERCE,
    abi: ABI,
    functionName: 'submit',
    args: [jobId, contentHash, '0x'],
    account: providerWallet.account.address,
  })

  try {
    const hash = await providerWallet.writeContract({
      address: CONFIG.AGENTIC_COMMERCE,
      abi: ABI,
      functionName: 'submit',
      args: [jobId, contentHash, '0x'],
      nonce,
      gas: gas * 120n / 100n,
    })

    // FIX O-05: Add 60-second timeout to waitForTransactionReceipt
    const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 })
    if (receipt.status !== 'success') throw new Error(`Submit tx reverted: ${hash}`)

    return hash
  } catch (err) {
    resetNonce()
    throw err
  }
}

// Evaluator calls complete — releases USDC to provider
export async function executeComplete(jobId: bigint, reasoning: string): Promise<string> {
  const evaluatorWallet = getEvaluatorWallet()
  const publicClient = getPublicClient()

  const reasonHash = keccak256(toBytes(reasoning))

  // FIX O-02: Get sequential nonce
  const nonce = await getNextNonce(publicClient, evaluatorWallet.account.address)

  // FIX O-03: Estimate gas with 20% buffer
  const gas = await publicClient.estimateContractGas({
    address: CONFIG.AGENTIC_COMMERCE,
    abi: ABI,
    functionName: 'complete',
    args: [jobId, reasonHash, '0x'],
    account: evaluatorWallet.account.address,
  })

  try {
    const hash = await evaluatorWallet.writeContract({
      address: CONFIG.AGENTIC_COMMERCE,
      abi: ABI,
      functionName: 'complete',
      args: [jobId, reasonHash, '0x'],
      nonce,
      gas: gas * 120n / 100n,
    })

    // FIX O-05: Add 60-second timeout to waitForTransactionReceipt
    const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 })
    if (receipt.status !== 'success') throw new Error(`Complete tx reverted: ${hash}`)

    return hash
  } catch (err) {
    resetNonce()
    throw err
  }
}

/** ERC-20 Transfer event topic — keccak256("Transfer(address,address,uint256)") */
const ERC20_TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'

/**
 * Refund details extracted from a reject() transaction receipt.
 *
 * On Arc Testnet (verified via on-chain trace of job 65's reject tx
 * 0xfa300b…72391, Nov 2026), the contract's `reject()` instantly emits a
 * USDC Transfer log moving the escrowed amount AgenticCommerce → client.
 * The audit's earlier comment + PR #16 claimed reject() did NOT refund
 * and that funds waited until expiredAt + claimRefund() — that was wrong.
 * See packages/evaluator/src/__tests__/execute-reject.test.ts.
 */
export interface RejectResult {
  txHash: string
  /** Set when reject() emitted a USDC Transfer with the contract as sender. */
  refund?: {
    to: `0x${string}`
    /** Amount in USDC base units (6 decimals). */
    amount: bigint
  }
}

// Evaluator calls reject — instantly refunds the client via the contract's
// own escrow → client USDC Transfer (verified on-chain).
export async function executeReject(jobId: bigint, reasoning: string): Promise<RejectResult> {
  const evaluatorWallet = getEvaluatorWallet()
  const publicClient = getPublicClient()

  const reasonHash = keccak256(toBytes(reasoning))

  // FIX O-02: Get sequential nonce
  const nonce = await getNextNonce(publicClient, evaluatorWallet.account.address)

  // FIX O-03: Estimate gas with 20% buffer
  const gas = await publicClient.estimateContractGas({
    address: CONFIG.AGENTIC_COMMERCE,
    abi: ABI,
    functionName: 'reject',
    args: [jobId, reasonHash, '0x'],
    account: evaluatorWallet.account.address,
  })

  try {
    const hash = await evaluatorWallet.writeContract({
      address: CONFIG.AGENTIC_COMMERCE,
      abi: ABI,
      functionName: 'reject',
      args: [jobId, reasonHash, '0x'],
      nonce,
      gas: gas * 120n / 100n,
    })

    // FIX O-05: Add 60-second timeout to waitForTransactionReceipt
    const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 })
    if (receipt.status !== 'success') throw new Error(`Reject tx reverted: ${hash}`)

    // Parse USDC Transfer log: from=AgenticCommerce, any to, value=escrowed amount.
    // Defensive — if the contract behaviour ever changes (e.g. a future deploy
    // moves to deferred-refund semantics), we'd see refund=undefined and the
    // caller treats it as "reject succeeded but refund deferred".
    const result: RejectResult = { txHash: hash }
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== USDC_ADDRESS.toLowerCase()) continue
      if (!log.topics[0] || log.topics[0].toLowerCase() !== ERC20_TRANSFER_TOPIC) continue
      if (log.topics.length < 3 || !log.topics[1] || !log.topics[2]) continue
      const fromAddr = ('0x' + log.topics[1].slice(-40)).toLowerCase()
      if (fromAddr !== CONFIG.AGENTIC_COMMERCE.toLowerCase()) continue
      const toAddr = ('0x' + log.topics[2].slice(-40)) as `0x${string}`
      const amount = BigInt(log.data)
      result.refund = { to: toAddr, amount }
      break
    }
    return result
  } catch (err) {
    resetNonce()
    throw err
  }
}

// Claim refund after expiry (called by evaluator cron)
export async function executeClaimRefund(jobId: bigint): Promise<string> {
  const evaluatorWallet = getEvaluatorWallet()
  const publicClient = getPublicClient()

  // FIX O-02: Get sequential nonce
  const nonce = await getNextNonce(publicClient, evaluatorWallet.account.address)

  // FIX O-03: Estimate gas with 20% buffer
  const gas = await publicClient.estimateContractGas({
    address: CONFIG.AGENTIC_COMMERCE,
    abi: ABI,
    functionName: 'claimRefund',
    args: [jobId],
    account: evaluatorWallet.account.address,
  })

  try {
    const hash = await evaluatorWallet.writeContract({
      address: CONFIG.AGENTIC_COMMERCE,
      abi: ABI,
      functionName: 'claimRefund',
      args: [jobId],
      nonce,
      gas: gas * 120n / 100n,
    })

    // FIX O-05: Add 60-second timeout to waitForTransactionReceipt
    const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 })
    if (receipt.status !== 'success') throw new Error(`ClaimRefund tx reverted: ${hash}`)

    return hash
  } catch (err) {
    resetNonce()
    throw err
  }
}

/**
 * Forward escrowed USDC from PLATFORM_RELAY (provider wallet) to the agent.
 *
 * Background: contract `complete()` releases USDC to the on-chain `provider`,
 * which for the marketplace flow is always PLATFORM_RELAY. Without this
 * forward step the agent never receives funds — see audit T9.
 *
 * Returns the ERC-20 transfer tx hash on success. Caller is responsible for
 * idempotency persistence (open_jobs.payout_tx). This function will happily
 * send a duplicate transfer if called twice — that's by design (it can also
 * be used for retries when the prior tx genuinely failed to land).
 */
export async function executePayoutForward(
  recipient: `0x${string}`,
  amount: bigint,
): Promise<string> {
  if (!recipient || !/^0x[a-fA-F0-9]{40}$/.test(recipient)) {
    throw new Error(`Invalid payout recipient: ${recipient}`)
  }
  if (amount <= 0n) {
    throw new Error(`Invalid payout amount: ${amount}`)
  }

  // Provider wallet === PLATFORM_RELAY === source of funds for the forward.
  const providerWallet = getProviderWallet()
  const publicClient = getPublicClient()

  // Sanity: relay must hold at least `amount` of USDC. Fails loudly rather
  // than reverting on-chain with an opaque transfer revert.
  const balance = (await publicClient.readContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [providerWallet.account.address],
  })) as bigint
  if (balance < amount) {
    throw new Error(
      `Relay USDC balance ${balance} < payout amount ${amount} (recipient=${recipient})`,
    )
  }

  const nonce = await getNextNonce(publicClient, providerWallet.account.address)

  const gas = await publicClient.estimateContractGas({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'transfer',
    args: [recipient, amount],
    account: providerWallet.account.address,
  })

  try {
    const hash = await providerWallet.writeContract({
      address: USDC_ADDRESS,
      abi: ERC20_ABI,
      functionName: 'transfer',
      args: [recipient, amount],
      nonce,
      gas: (gas * 120n) / 100n,
    })

    const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 })
    if (receipt.status !== 'success') {
      throw new Error(`Payout transfer reverted: ${hash}`)
    }
    return hash
  } catch (err) {
    resetNonce(providerWallet.account.address)
    throw err
  }
}
