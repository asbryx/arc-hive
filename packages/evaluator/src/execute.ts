import { createWalletClient, createPublicClient, http, keccak256, toBytes } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { CONFIG } from './config.js'

const chain = {
  id: CONFIG.CHAIN_ID,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 6 },
  rpcUrls: { default: { http: [CONFIG.RPC_URL] } },
}

const ABI = [
  { inputs: [{ name: 'jobId', type: 'uint256' }, { name: 'reason', type: 'bytes32' }, { name: 'optParams', type: 'bytes' }], name: 'complete', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'jobId', type: 'uint256' }, { name: 'reason', type: 'bytes32' }, { name: 'optParams', type: 'bytes' }], name: 'reject', outputs: [], stateMutability: 'nonpayable', type: 'function' },
] as const

export async function executeComplete(jobId: bigint, reasoning: string): Promise<string> {
  if (!CONFIG.EVALUATOR_PRIVATE_KEY) throw new Error('EVALUATOR_PRIVATE_KEY not set')

  const account = privateKeyToAccount(CONFIG.EVALUATOR_PRIVATE_KEY as `0x${string}`)
  const walletClient = createWalletClient({ account, chain, transport: http(CONFIG.RPC_URL) })
  const publicClient = createPublicClient({ chain, transport: http(CONFIG.RPC_URL) })

  const reasonHash = keccak256(toBytes(reasoning))

  const hash = await walletClient.writeContract({
    address: CONFIG.AGENTIC_COMMERCE,
    abi: ABI,
    functionName: 'complete',
    args: [jobId, reasonHash, '0x'],
  })

  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status !== 'success') throw new Error(`Tx reverted: ${hash}`)

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
  if (receipt.status !== 'success') throw new Error(`Tx reverted: ${hash}`)

  return hash
}
