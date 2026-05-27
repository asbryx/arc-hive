# Arc Testnet RPC Configuration

## Endpoints

| Type | URL |
|------|-----|
| HTTP RPC | `https://rpc.testnet.arc.network` |
| WebSocket | `wss://rpc.testnet.arc.network` |
| Explorer | `https://testnet.arcscan.app` |

## Chain Config

| Parameter | Value |
|-----------|-------|
| Chain ID | `5042002` |
| Chain ID (hex) | `0x4cef52` |
| Block time | ~0.5s (alternates 0s/1s timestamps) |
| Finality | Deterministic (sub-second) |
| Gas token | USDC (`0x3600000000000000000000000000000000000000`) |
| Gas cost | ~0.006 USDC per tx |

## eth_getLogs Limits

- **Max results per query: 20,000 logs**
- Not a fixed block range limit — it's result-count based
- Unfiltered query on recent blocks: ~352 blocks before hitting 20k limit
- With address/topic filters (our use case): can query much larger ranges since we're filtering to specific contracts
- Error message: `query exceeds max results 20000, retry with the range <from>-<to>`

## Indexer Strategy

Given these constraints:

1. **Historical sync:** Query in chunks of ~5000 blocks with address filter (should be well under 20k results per chunk since we only watch 4 contracts)
2. **Live sync:** Use WebSocket (`eth_subscribe` for new blocks), process each block's relevant logs
3. **Fallback:** If WSS drops, poll `eth_blockNumber` every 1s and fetch missed blocks

## Current Block Height

~44,289,324 as of 2026-05-27 (need to find deployment block of each contract to know where to start historical sync)

## Contracts to Watch

```
IdentityRegistry:    0x8004A818BFB912233c491871b3d84c89A494BD9e
ReputationRegistry:  0x8004B663056A597Dffe9eCcC1965A193B7388713
ValidationRegistry:  0x8004Cb1BF31DAf7788923b405b754f57acEB4272
AgenticCommerce:     0x0747EEf0706327138c69792bF28Cd525089e4583
```

## Additional Job Contracts Found on Testnet

These are third-party deployments (from hackathon projects) that also implement job/agent patterns:

```
AgentRegistry:       0x9fe01a9AF637402c53B23571a0EbDA6b2127DC21  (43 txs, 41 agents)
JobManager:          0xE1d55342d72662868D6EEeb3D37e410D1108F039  (8 txs, 1 job)
AgentJobBoard:       0xD9756Ef6cC429cDeEDD4c6c5e8DF0d7d51Dd0666  (9 txs, 2 jobs)
TaskRegistry:        0x2Ec3180e23AC9C82205cb3Cd6885f2a27543E291  (50 txs, 16 tasks)
```

Note: These may have different ABIs. Phase 1 focuses on official ERC-8004/8183 contracts. Third-party contracts added in Phase 2+.

## viem Chain Definition

```typescript
import { defineChain } from 'viem'

export const arcTestnet = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: {
    name: 'USDC',
    symbol: 'USDC',
    decimals: 6,
  },
  rpcUrls: {
    default: {
      http: ['https://rpc.testnet.arc.network'],
      webSocket: ['wss://rpc.testnet.arc.network'],
    },
  },
  blockExplorers: {
    default: {
      name: 'ArcScan',
      url: 'https://testnet.arcscan.app',
    },
  },
  testnet: true,
})
```
