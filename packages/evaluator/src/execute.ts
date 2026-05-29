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

// Provider submits deliverable on-chain (required before complete/reject)
export async function executeSubmit(jobId: bigint, deliverableContent: string): Promise<string> {
  const providerWallet = getProviderWallet()
  const publicClient = getPublicClient()

  const contentHash = keccak256(toBytes(deliverableContent.slice(0, 100)))

  const hash = await providerWallet.writeContract({
    address: CONFIG.AGENTIC_COMMERCE,
    abi: ABI,
    functionName: 'submit',
    args: [jobId, contentHash, '0x'],
  })

  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status !== 'success') throw new Error(`Submit tx reverted: ${hash}`)

  return hash
}

// Evaluator calls complete — releases USDC to provider
export async function executeComplete(jobId: bigint, reasoning: string): Promise<string> {
  const evaluatorWallet = getEvaluatorWallet()
  const publicClient = getPublicClient()

  const reasonHash = keccak256(toBytes(reasoning.slice(0, 100)))

  const hash = await evaluatorWallet.writeContract({
    address: CONFIG.AGENTIC_COMMERCE,
    abi: ABI,
    functionName: 'complete',
    args: [jobId, reasonHash, '0x'],
  })

  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status !== 'success') throw new Error(`Complete tx reverted: ${hash}`)

  return hash
}

// Evaluator calls reject — locks funds until expiry
export async function executeReject(jobId: bigint, reasoning: string): Promise<string> {
  const evaluatorWallet = getEvaluatorWallet()
  const publicClient = getPublicClient()

  const reasonHash = keccak256(toBytes(reasoning.slice(0, 100)))

  const hash = await evaluatorWallet.writeContract({
    address: CONFIG.AGENTIC_COMMERCE,
    abi: ABI,
    functionName: 'reject',
    args: [jobId, reasonHash, '0x'],
  })

  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status !== 'success') throw new Error(`Reject tx reverted: ${hash}`)

  return hash
}

// Claim refund after expiry (called by evaluator cron)
export async function executeClaimRefund(jobId: bigint): Promise<string> {
  const evaluatorWallet = getEvaluatorWallet()
  const publicClient = getPublicClient()

  const hash = await evaluatorWallet.writeContract({
    address: CONFIG.AGENTIC_COMMERCE,
    abi: ABI,
    functionName: 'claimRefund',
    args: [jobId],
  })

  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status !== 'success') throw new Error(`ClaimRefund tx reverted: ${hash}`)

  return hash
}
