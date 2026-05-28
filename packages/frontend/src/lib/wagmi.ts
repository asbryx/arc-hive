import { http, createConfig } from 'wagmi'
import { defineChain } from 'viem'
import { getDefaultConfig } from '@rainbow-me/rainbowkit'

export const arcTestnet = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 6 },
  rpcUrls: {
    default: { http: ['https://rpc.testnet.arc.network'] },
  },
  blockExplorers: {
    default: { name: 'ArcScan', url: 'https://testnet.arcscan.app' },
  },
  testnet: true,
})

export const USDC_ADDRESS = '0x3600000000000000000000000000000000000000' as const
export const AGENTIC_COMMERCE = '0x0747EEf0706327138c69792bF28Cd525089e4583' as const

export const config = getDefaultConfig({
  appName: 'ArcHive',
  projectId: 'archiveagents', // WalletConnect project ID (placeholder for testnet)
  chains: [arcTestnet],
  transports: {
    [arcTestnet.id]: http('https://rpc.testnet.arc.network'),
  },
})
