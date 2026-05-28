import { createWalletClient, createPublicClient, http, keccak256, toBytes } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { CONFIG } from './config.js'

const chain = {
  id: CONFIG.CHAIN_ID,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [CONFIG.RPC_URL] } },
}

const ABI = [
  { inputs: [{ name: 'jobId', type: 'uint256' }, { name: 'reason', type: 'bytes32' }, { name: 'optParams', type: 'bytes' }], name: 'complete', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'jobId', type: 'uint256' }, { name: 'reason', type: 'bytes32' }, { name: 'optParams', type: 'bytes' }], name: 'reject', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'jobId', type: 'uint256' }], name: 'getJob', outputs: [{ components: [{ name: 'id', type: 'uint256' }, { name: 'client', type: 'address' }, { name: 'provider', type: 'address' }, { name: 'evaluator', type: 'address' }, { name: 'description', type: 'string' }, { name: 'budget', type: 'uint256' }, { name: 'expiredAt', type: 'uint256' }, { name: 'status', type: 'uint8' }, { name: 'hook', type: 'address' }], name: '', type: 'tuple' }], stateMutability: 'view', type: 'function' },
] as const

// Evaluator calls complete — releases USDC to provider
export async function executeComplete(jobId: bigint, reasoning: string): Promise<string> {
  if (!CONFIG.EVALUATOR_PRIVATE_KEY) throw new Error('EVALUATOR_PRIVATE_KEY not set')

  const account = privateKeyToAccount(CONFIG.EVALUATOR_PRIVATE_KEY as `0x${string}`)
  const walletClient = createWalletClient({ account, chain, transport: http(CONFIG.RPC_URL) })
  const publicClient = createPublicClient({ chain, transport: http(CONFIG.RPC_URL) })

  // Verify job is in Submitted state (2)
  const jobData = await publicClient.readContract({
    address: CONFIG.AGENTIC_COMMERCE,
    abi: ABI,
    functionName: 'getJob',
    args: [jobId],
  })

  if (jobData.status !== 2) {
    throw new Error(`Job ${jobId} not in Submitted state (current: ${jobData.status})`)
  }

  const reasonHash = keccak256(toBytes(reasoning))

  const hash = await walletClient.writeContract({
    address: CONFIG.AGENTIC_COMMERCE,
    abi: ABI,
    functionName: 'complete',
    args: [jobId, reasonHash, '0x'],
  })

  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status !== 'success') throw new Error(`Complete tx reverted: ${hash}`)

  return hash
}

export async function executeReject(jobId: bigint, reasoning: string): Promise<string> {
  if (!CONFIG.EVALUATOR_PRIVATE_KEY) throw new Error('EVALUATOR_PRIVATE_KEY not set')

  const account = privateKeyToAccount(CONFIG.EVALUATOR_PRIVATE_KEY as `0x${string}`)
  const walletClient = createWalletClient({ account, chain, transport: http(CONFIG.RPC_URL) })
  const publicClient = createPublicClient({ chain, transport: http(CONFIG.RPC_URL) })

  const reasonHash = keccak256(toBytes(reasoning))

  const hash = await walletClient.writeContract({
    address: CONFIG.AGENTIC_COMMERCE,
    abi: ABI,
    functionName: 'reject',
    args: [jobId, reasonHash, '0x'],
  })

  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status !== 'success') throw new Error(`Reject tx reverted: ${hash}`)

  return hash
}
