import type { Context, Next } from 'hono'

/**
 * x402 Payment Required middleware
 * When a request lacks valid payment, returns HTTP 402 with payment instructions
 */

interface X402Config {
  priceUsd: number
  payToAddress: string
  network: string
}

const DEFAULT_CONFIG: X402Config = {
  priceUsd: 0.01,
  payToAddress: process.env.X402_PAY_TO_ADDRESS || '0x0000000000000000000000000000000000000000',
  network: 'arc-testnet',
}

export function x402PaymentRequired(config: Partial<X402Config> = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config }
  
  return async (c: Context, next: Next) => {
    // Check for payment proof header
    const paymentProof = c.req.header('x-payment-proof')
    const apiKey = c.req.header('x-api-key')
    
    // If valid API key, skip payment
    if (apiKey) {
      // API key validation happens elsewhere
      await next()
      return
    }
    
    // If payment proof provided, verify it (stub — real verification would check on-chain)
    if (paymentProof) {
      // TODO: Verify payment proof on-chain
      // For now, accept any non-empty proof
      c.header('x-payment-status', 'verified')
      await next()
      return
    }
    
    // No payment — return 402
    return c.json({
      error: 'Payment Required',
      x402: {
        version: '1.0',
        paymentRequired: {
          amount: cfg.priceUsd,
          currency: 'USDC',
          network: cfg.network,
          payTo: cfg.payToAddress,
          description: 'ArcHive API access',
          instructions: `Send ${cfg.priceUsd} USDC to ${cfg.payToAddress} on ${cfg.network}`,
        },
        acceptedMethods: ['usdc-transfer', 'api-key'],
      },
      hint: 'Include x-payment-proof header with your on-chain transaction hash, or use x-api-key for subscription access',
    }, 402)
  }
}
