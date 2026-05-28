import { createPublicClient, http, webSocket, type PublicClient } from 'viem'
import { defineChain } from 'viem'

const arcTestnet = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 6 },
  rpcUrls: {
    default: {
      http: [process.env.ARC_RPC_HTTP || 'https://rpc.testnet.arc.network'],
      webSocket: [process.env.ARC_RPC_WSS || 'wss://rpc.testnet.arc.network'],
    },
  },
  blockExplorers: {
    default: { name: 'ArcScan', url: 'https://testnet.arcscan.app' },
  },
  testnet: true,
})

let httpClient: PublicClient | null = null
let wsClient: PublicClient | null = null

export function getHttpClient(): PublicClient {
  if (!httpClient) {
    httpClient = createPublicClient({
      chain: arcTestnet,
      transport: http(process.env.ARC_RPC_HTTP || 'https://rpc.testnet.arc.network', {
        retryCount: 3,
        retryDelay: 1000,
        timeout: 30_000,
      }),
    })
  }
  return httpClient
}

export function getWsClient(): PublicClient {
  if (!wsClient) {
    wsClient = createPublicClient({
      chain: arcTestnet,
      transport: webSocket(process.env.ARC_RPC_WSS || 'wss://rpc.testnet.arc.network', {
        retryCount: 5,
        retryDelay: 1000,
      }),
    })
  }
  return wsClient
}

export { arcTestnet }
