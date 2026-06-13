import { CONFIG } from './config.js'
import { buildEvaluationPrompt, parseEvaluationResponse, EvalContext } from './prompt.js'
import { SECTOR_HINTS } from './sectors.js'
import { callWithFallback, callMultiModel, callLLMWithFallback } from './providers.js'

export type EvalInput = EvalContext

export interface EvalResult {
  score: number
  breakdown: { completeness: number; quality: number; effort: number; format: number } | null
  reasoning: string
  suggestions: string | null
  decision: 'approved' | 'rejected' | 'failed'
  providerUsed: string
  tokensUsed: { input: number; output: number }
  estimatedCost: number
}

/**
 * Estimate LLM cost in USD based on token usage and model pricing.
 * Output tokens are priced at 3x input tokens (industry standard).
 */
function estimateCost(inputTokens: number, outputTokens: number): number {
  const COST_PER_1K_INPUT: Record<string, number> = {
    'gpt-4o': 0.005,
    'gpt-4o-mini': 0.00015,
    'claude-3-5-sonnet': 0.003,
    'claude-3-haiku': 0.00025,
    'mimo-v2.5-pro': 0.001,
    'deepseek-v3.2': 0.0008,
    'qwen3-coder-next': 0.001,
  }
  const model = process.env.LLM_MODEL || 'gpt-4o-mini'
  const inputRate = COST_PER_1K_INPUT[model] || 0.001
  const inputCost = (inputTokens / 1000) * inputRate
  const outputCost = (outputTokens / 1000) * inputRate * 3
  return inputCost + outputCost
}
export async function evaluateDeliverable(input: EvalInput, maxRevisions: number): Promise<EvalResult> {
  const prompt = buildEvaluationPrompt(input)

  let text: string
  let providerUsed: string
  let tokensUsed: { input: number; output: number }

  if (CONFIG.MULTI_MODEL_ENABLED) {
    // Multi-model: call 2 providers in parallel
    const result = await callMultiModel(prompt)

    if (result.secondary && CONFIG.SCORE_AVERAGING) {
      // Parse both scores and average them
      const primaryParsed = parseEvaluationResponse(result.primary.text)
      const secondaryParsed = parseEvaluationResponse(result.secondary.text)

      if (primaryParsed.score > 0 && secondaryParsed.score > 0) {
        const avgScore = Math.round((primaryParsed.score + secondaryParsed.score) / 2)
        const avgCompleteness = Math.round(((primaryParsed.breakdown?.completeness || 0) + (secondaryParsed.breakdown?.completeness || 0)) / 2)
        const avgQuality = Math.round(((primaryParsed.breakdown?.quality || 0) + (secondaryParsed.breakdown?.quality || 0)) / 2)
        const avgEffort = Math.round(((primaryParsed.breakdown?.effort || 0) + (secondaryParsed.breakdown?.effort || 0)) / 2)
        const avgFormat = Math.round(((primaryParsed.breakdown?.format || 0) + (secondaryParsed.breakdown?.format || 0)) / 2)

        text = JSON.stringify({
          score: avgScore,
          breakdown: { completeness: avgCompleteness, quality: avgQuality, effort: avgEffort, format: avgFormat },
          reasoning: `[Multi-model average] ${primaryParsed.reasoning}`,
          suggestions: primaryParsed.suggestions || secondaryParsed.suggestions,
        })
        providerUsed = `${result.primary.provider}+${result.secondary.provider} (averaged)`
        tokensUsed = {
          input: result.primary.tokensUsed.input + (result.secondary?.tokensUsed.input || 0),
          output: result.primary.tokensUsed.output + (result.secondary?.tokensUsed.output || 0),
        }
      } else {
        // One score was 0, use the other
        text = primaryParsed.score > 0 ? result.primary.text : result.secondary!.text
        providerUsed = primaryParsed.score > 0 ? result.primary.provider : result.secondary!.provider
        tokensUsed = primaryParsed.score > 0 ? result.primary.tokensUsed : result.secondary!.tokensUsed
      }
    } else {
      // No secondary or not averaging — use primary
      text = result.primary.text
      providerUsed = result.primary.provider
      tokensUsed = result.primary.tokensUsed
    }
  } else {
    // Single model with fallback chain
    const result = await callWithFallback(prompt)
    text = result.text
    providerUsed = result.provider
    tokensUsed = result.tokensUsed
  }

  const { score, breakdown, reasoning, suggestions } = parseEvaluationResponse(text)

  // Post-evaluation sanity check: flag suspicious perfect scores with injection-related reasoning
  let adjustedScore = score
  if (adjustedScore === 100 && reasoning?.toLowerCase().includes('injection')) {
    console.warn(`[evaluator] Suspicious perfect score with injection-related reasoning`)
    adjustedScore = Math.min(adjustedScore, 75)
  }

  // Clamp breakdown to sector max values (LLM often exceeds limits)
  const sectorWeights = input.sectorConfig?.weights || SECTOR_HINTS[input.category || '']?.weights
  const maxes: Record<string, number> = sectorWeights
    ? { completeness: sectorWeights.completeness || 30, quality: sectorWeights.quality || 30, effort: sectorWeights.effort || 20, format: sectorWeights.format || 20 }
    : { completeness: 30, quality: 30, effort: 20, format: 20 }
  let clampedBreakdown = breakdown
  if (breakdown) {
    clampedBreakdown = { ...breakdown }
    for (const [key, max] of Object.entries(maxes)) {
      if (typeof (clampedBreakdown as any)[key] === 'number') {
        (clampedBreakdown as any)[key] = Math.max(0, Math.min(max, (clampedBreakdown as any)[key]))
      }
    }
  }

  if (score === 0 && !reasoning) {
    throw new Error(`Failed to parse evaluation: ${text.slice(0, 200)}`)
  }

  let decision: 'approved' | 'rejected' | 'failed'
  if (score >= CONFIG.APPROVAL_THRESHOLD) {
    decision = 'approved'
  } else if (input.revisionNumber >= maxRevisions) {
    // This was the final attempt — job fails
    decision = 'failed'
  } else {
    decision = 'rejected'
  }

  // Calculate estimated cost (E-04)
  const estimatedCost = estimateCost(tokensUsed.input, tokensUsed.output)
  console.log(`[evaluator] Tokens: ${tokensUsed.input}in + ${tokensUsed.output}out = $${estimatedCost.toFixed(4)}`)

  return { score: adjustedScore, breakdown: clampedBreakdown, reasoning, suggestions, decision, providerUsed, tokensUsed, estimatedCost }
}
