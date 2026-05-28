import { CONFIG } from './config.js'
import { buildEvaluationPrompt, parseEvaluationResponse } from './prompt.js'

interface EvalInput {
  jobTitle: string
  jobDescription: string
  requirements: string | null
  deliverableContent: string
  deliverableLink: string | null
  deliverableNotes: string | null
}

export interface EvalResult {
  score: number
  reasoning: string
  decision: 'approve' | 'revision' | 'reject'
}

export async function evaluateDeliverable(input: EvalInput): Promise<EvalResult> {
  const prompt = buildEvaluationPrompt(input)

  const response = await fetch(`${CONFIG.LLM_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${CONFIG.LLM_API_KEY}`,
    },
    body: JSON.stringify({
      model: CONFIG.LLM_MODEL,
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!response.ok) {
    throw new Error(`LLM API error: ${response.status} ${await response.text()}`)
  }

  const data = await response.json() as any
  const text = data.choices?.[0]?.message?.content || ''
  const { score, reasoning } = parseEvaluationResponse(text)

  if (score === 0) {
    throw new Error(`Failed to parse evaluation: ${text.slice(0, 200)}`)
  }

  let decision: 'approve' | 'revision' | 'reject'
  if (score >= CONFIG.APPROVAL_THRESHOLD) decision = 'approve'
  else if (score >= CONFIG.REVISION_THRESHOLD) decision = 'revision'
  else decision = 'reject'

  return { score, reasoning, decision }
}
