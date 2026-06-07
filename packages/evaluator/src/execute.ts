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

// FIX O-02: Nonce management to prevent concurrent txn nonce races
let currentNonce: number | null = null

async function getNextNonce(client: any, address: string): Promise<number> {
  if (currentNonce === null) {
    currentNonce = await client.getTransactionCount({ address })
  }
  const nonce = currentNonce
  currentNonce++
  return nonce
}

function resetNonce() {
  currentNonce = null
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

// Evaluator calls reject — locks funds until expiry
export async function executeReject(jobId: bigint, reasoning: string): Promise<string> {
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

    return hash
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
