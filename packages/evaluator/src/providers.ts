/**
 * LLM provider chain — fallback + multi-model evaluation
 * Tries primary → secondary → tertiary. Supports parallel multi-model scoring.
 */

export interface LLMProvider {
  name: string
  baseUrl: string
  apiKey: string
  model: string
  timeoutMs: number
}

export interface LLMResponse {
  provider: string
  text: string
  tokensUsed: { input: number; output: number }
}

// Build provider list from env vars
export function getProviders(): LLMProvider[] {
  const providers: LLMProvider[] = []

  // Primary (always present)
  if (process.env.LLM_API_KEY) {
    providers.push({
      name: 'primary',
      baseUrl: process.env.LLM_BASE_URL || 'https://token-plan-sgp.xiaomimimo.com/v1',
      apiKey: process.env.LLM_API_KEY,
      model: process.env.LLM_MODEL || 'mimo-v2.5-pro',
      timeoutMs: parseInt(process.env.LLM_TIMEOUT_MS || '60000'),
    })
  }

  // Secondary (EnowxLabs)
  if (process.env.LLM_SECONDARY_KEY) {
    providers.push({
      name: 'secondary',
      baseUrl: process.env.LLM_SECONDARY_URL || 'http://localhost:1430/v1',
      apiKey: process.env.LLM_SECONDARY_KEY,
      model: process.env.LLM_SECONDARY_MODEL || 'deepseek-v3.2',
      timeoutMs: parseInt(process.env.LLM_SECONDARY_TIMEOUT_MS || '60000'),
    })
  }

  // Tertiary (SwiftRouter)
  if (process.env.LLM_TERTIARY_KEY) {
    providers.push({
      name: 'tertiary',
      baseUrl: process.env.LLM_TERTIARY_URL || 'http://localhost:8788/v1',
      apiKey: process.env.LLM_TERTIARY_KEY,
      model: process.env.LLM_TERTIARY_MODEL || 'qwen3-coder-next',
      timeoutMs: parseInt(process.env.LLM_TERTIARY_TIMEOUT_MS || '60000'),
    })
  }

  if (providers.length === 0) {
    throw new Error('No LLM providers configured. Set at least LLM_API_KEY.')
  }

  return providers
}

/**
 * Call a single LLM provider
 */
export async function callProvider(provider: LLMProvider, prompt: string): Promise<LLMResponse> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), provider.timeoutMs)

  try {
    const response = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify({
        model: provider.model,
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const body = await response.text()
      const isAuthError = response.status === 401 || body.includes('invalid_key') || body.includes('Invalid API Key')
      throw new Error(
        `LLM API error (${provider.name}): ${response.status}${isAuthError ? ' [AUTH — key may be expired]' : ''} ${body.slice(0, 200)}`
      )
    }

    const data = await response.json() as any
    const text = data.choices?.[0]?.message?.content || ''
    const usage = data.usage || {}

    return {
      provider: provider.name,
      text,
      tokensUsed: {
        input: usage.prompt_tokens || 0,
        output: usage.completion_tokens || 0,
      },
    }
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Call with fallback chain: try primary → secondary → tertiary
 * Returns first successful response
 */
export async function callWithFallback(prompt: string): Promise<LLMResponse> {
  const providers = getProviders()
  const errors: string[] = []

  for (const provider of providers) {
    try {
      const result = await callProvider(provider, prompt)
      console.log(`[providers] ${provider.name} succeeded (${result.tokensUsed.input + result.tokensUsed.output} tokens)`)
      return result
    } catch (err: any) {
      errors.push(`${provider.name}: ${err.message}`)
      console.warn(`[providers] ${provider.name} failed: ${err.message}`)
    }
  }

  throw new Error(`All LLM providers failed:\n${errors.join('\n')}`)
}

/**
 * Simplified fallback chain interface (E-06).
 * Uses a standard OpenAI-compatible chat/completions endpoint.
 * Tries each provider in order; first success wins.
 */
const PROVIDER_CHAIN: LLMProvider[] = [
  {
    name: 'primary',
    apiKey: process.env.LLM_API_KEY || '',
    baseUrl: process.env.LLM_BASE_URL || 'https://token-plan-sgp.xiaomimimo.com/v1',
    model: process.env.LLM_MODEL || 'mimo-v2.5-pro',
    timeoutMs: parseInt(process.env.LLM_TIMEOUT_MS || '60000'),
  },
  {
    name: 'fallback-1',
    apiKey: process.env.LLM_FALLBACK_API_KEY || process.env.LLM_API_KEY || '',
    baseUrl: process.env.LLM_FALLBACK_BASE_URL || 'https://api.anthropic.com/v1',
    model: process.env.LLM_FALLBACK_MODEL || 'claude-3-haiku-20240307',
    timeoutMs: 60000,
  },
]

export async function callLLMWithFallback(prompt: string): Promise<{ content: string; provider: string; usage: any }> {
  const errors: string[] = []

  for (const provider of PROVIDER_CHAIN) {
    if (!provider.apiKey) continue

    try {
      const response = await fetch(`${provider.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${provider.apiKey}`,
        },
        body: JSON.stringify({
          model: provider.model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 2000,
          temperature: 0.1,
        }),
        signal: AbortSignal.timeout(provider.timeoutMs),
      })

      if (!response.ok) {
        const msg = `Provider ${provider.name} returned ${response.status}`
        console.warn(`[evaluator] ${msg}`)
        errors.push(msg)
        continue
      }

      const data = await response.json() as any
      return {
        content: data.choices?.[0]?.message?.content || '',
        provider: provider.name,
        usage: data.usage,
      }
    } catch (err: any) {
      const msg = `Provider ${provider.name} failed: ${err.message}`
      console.warn(`[evaluator] ${msg}`)
      errors.push(msg)
      continue
    }
  }

  throw new Error(`All LLM providers failed:\n${errors.join('\n')}`)
}

/**
 * Multi-model evaluation: call 2 providers in parallel, average scores
 * Falls back to single provider if one fails
 */
export async function callMultiModel(prompt: string): Promise<{ primary: LLMResponse; secondary?: LLMResponse }> {
  const providers = getProviders()

  if (providers.length < 2) {
    // Only one provider — single model evaluation
    const result = await callWithFallback(prompt)
    return { primary: result }
  }

  // Call first 2 providers in parallel
  const [result1, result2] = await Promise.allSettled([
    callProvider(providers[0], prompt),
    callProvider(providers[1], prompt),
  ])

  const primary = result1.status === 'fulfilled' ? result1.value : null
  const secondary = result2.status === 'fulfilled' ? result2.value : null

  if (!primary && !secondary) {
    throw new Error(`Both LLM providers failed:\n${result1.status === 'rejected' ? result1.reason : ''}\n${result2.status === 'rejected' ? result2.reason : ''}`)
  }

  if (!primary && secondary) {
    console.warn('[providers] Primary failed, using secondary')
    return { primary: secondary }
  }

  if (primary && !secondary) {
    console.warn('[providers] Secondary failed, using primary only')
    return { primary }
  }

  return { primary: primary!, secondary: secondary! }
}
