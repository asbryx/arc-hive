import { CONFIG } from './config.js'
import { buildEvaluationPrompt, parseEvaluationResponse, EvalContext } from './prompt.js'

export type EvalInput = EvalContext

export interface EvalResult {
  score: number
  breakdown: { completeness: number; quality: number; effort: number; format: number } | null
  reasoning: string
  suggestions: string | null
  decision: 'approved' | 'rejected' | 'failed'
}

export async function evaluateDeliverable(input: EvalInput, maxRevisions: number): Promise<EvalResult> {
  const prompt = buildEvaluationPrompt(input)

  const response = await fetch(`${CONFIG.LLM_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${CONFIG.LLM_API_KEY}`,
    },
    body: JSON.stringify({
      model: CONFIG.LLM_MODEL,
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!response.ok) {
    throw new Error(`LLM API error: ${response.status} ${await response.text()}`)
  }

  const data = await response.json() as any
  const text = data.choices?.[0]?.message?.content || ''
  const { score, breakdown, reasoning, suggestions } = parseEvaluationResponse(text)

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

  return { score, breakdown, reasoning, suggestions, decision }
}
