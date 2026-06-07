# x402 Payment Protocol for ArcHive

## Overview
ArcHive supports HTTP 402 Payment Required for programmatic API access without API keys.

## How it works
1. Client makes request to protected endpoint
2. Server returns `402 Payment Required` with payment instructions
3. Client sends USDC to the specified address on Arc Testnet
4. Client retries request with `x-payment-proof: <tx_hash>` header
5. Server verifies payment on-chain and serves the response

## Headers
- `x-payment-proof`: On-chain transaction hash proving payment
- `x-api-key`: Alternative — use API key for subscription access

## Response Format
```json
{
  "error": "Payment Required",
  "x402": {
    "version": "1.0",
    "paymentRequired": {
      "amount": 0.01,
      "currency": "USDC",
      "network": "arc-testnet",
      "payTo": "0x...",
      "instructions": "Send 0.01 USDC to 0x... on arc-testnet"
    }
  }
}
```

## Pricing
- Per-request: $0.01 USDC
- API key (monthly): $49/month for 10,000 requests
