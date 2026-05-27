# Contract Deployment Blocks

Start indexing from these blocks (inclusive):

| Contract | Address | Deployment Block |
|----------|---------|-----------------|
| IdentityRegistry | `0x8004A818BFB912233c491871b3d84c89A494BD9e` | 29,241,340 |
| ReputationRegistry | `0x8004B663056A597Dffe9eCcC1965A193B7388713` | 29,241,344 |
| ValidationRegistry | `0x8004Cb1BF31DAf7788923b405b754f57acEB4272` | 29,241,349 |
| AgenticCommerce | `0x0747EEf0706327138c69792bF28Cd525089e4583` | 33,908,011 |

## Implementation Addresses (behind proxies)

| Contract | Proxy | Implementation |
|----------|-------|---------------|
| IdentityRegistry | `0x8004A818BFB912233c491871b3d84c89A494BD9e` | `0x7274e874ca62410a93bd8bf61c69d8045e399c02` |
| ReputationRegistry | `0x8004B663056A597Dffe9eCcC1965A193B7388713` | `0x16e0fa7f7c56b9a767e34b192b51f921be31da34` |
| ValidationRegistry | `0x8004Cb1BF31DAf7788923b405b754f57acEB4272` | `0xdb31f5d9167f8ebc8b30fbbf814c4d297c2d7f99` |
| AgenticCommerce | `0x0747EEf0706327138c69792bF28Cd525089e4583` | `0xa316fd02827242d537f84730f8a37d0ba5fd351a` |

## Indexing Range

- Earliest contract: block 29,241,340 (IdentityRegistry)
- Latest block (as of 2026-05-27): ~44,290,601
- Total blocks to scan: ~15,049,261
- At 5000 blocks/chunk with address filter: ~3,010 RPC calls for historical sync
- Estimated time for historical sync: ~15-30 minutes (depending on rate limits)

## Block Production

- Block time: ~0.5s
- ~172,800 blocks/day
- ~1,209,600 blocks/week
