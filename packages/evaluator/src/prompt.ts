import { CONFIG } from './config.js'

export interface EvalContext {
  jobTitle: string
  jobDescription: string
  requirements: string | null
  deliverableContent: string
  deliverableLink: string | null
  deliverableNotes: string | null
  revisionNumber: number
  previousEvaluations: { score: number; reasoning: string; suggestions: string | null }[]
}

export function buildEvaluationPrompt(ctx: EvalContext): string {
  const content = ctx.deliverableContent.slice(0, CONFIG.MAX_DELIVERABLE_LENGTH)

  let previousContext = ''
  if (ctx.previousEvaluations.length > 0) {
    previousContext = '\n## Previous Evaluations\n'
    for (const prev of ctx.previousEvaluations) {
      previousContext += `- Score: ${prev.score}/100 — ${prev.reasoning}\n`
      if (prev.suggestions) previousContext += `  Suggestions: ${prev.suggestions}\n`
    }
    previousContext += `\nThis is revision ${ctx.revisionNumber}. The agent was asked to improve based on the above feedback.\n`
  }

  return `You are an impartial job evaluator for ArcHive marketplace.

## Job Requirements
Title: ${ctx.jobTitle}
Description: ${ctx.jobDescription}
Specific Requirements:
${ctx.requirements || 'No specific requirements listed.'}
${previousContext}
## Submitted Deliverable (version ${ctx.revisionNumber + 1})
Content: ${content}
Link: ${ctx.deliverableLink || 'None'}
Notes: ${ctx.deliverableNotes || 'None'}

## Your Task
Score this deliverable from 0-100 based on how well it meets the job requirements.

Scoring criteria:
- Completeness: Does it address all requirements? (0-30 points)
- Quality: Is the content accurate and well-written? (0-30 points)
- Effort: Does it show genuine effort vs low-quality filler? (0-20 points)
- Format: Is it properly structured and readable? (0-20 points)

IMPORTANT:
- Score ONLY against the stated requirements, not your own standards
- If requirements are vague, be lenient (benefit of doubt to agent)
- If deliverable is clearly spam/empty/irrelevant, score below 30
- Ignore formatting/style unless requirements specify it
${ctx.revisionNumber > 0 ? '- Compare against previous feedback — did the agent address the issues?' : ''}

Respond in this exact JSON format:
{
  "score": <0-100>,
  "breakdown": { "completeness": <0-30>, "quality": <0-30>, "effort": <0-20>, "format": <0-20> },
  "reasoning": "<2-3 sentences explaining the score>",
  "suggestions": "<if score < 70, specific improvements needed. null if approved>"
}`
}

export function parseEvaluationResponse(response: string): {
  score: number
  breakdown: { completeness: number; quality: number; effort: number; format: number } | null
  reasoning: string
  suggestions: string | null
} {
  // Try JSON parse first
  try {
    // Strip markdown code fences if present
    let cleaned = response.replace(/```json\s*/g, '').replace(/```\s*/g, '')
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      return {
        score: Math.max(0, Math.min(100, parseInt(parsed.score) || 0)),
        breakdown: parsed.breakdown || null,
        reasoning: parsed.reasoning || 'No reasoning provided',
        suggestions: parsed.suggestions || null,
      }
    }
  } catch {}

  // Fallback: SCORE/REASONING format
  const scoreMatch = response.match(/SCORE:\s*(\d+)/)
  const reasonMatch = response.match(/REASONING:\s*(.+)/s)

  return {
    score: scoreMatch ? Math.max(0, Math.min(100, parseInt(scoreMatch[1]))) : 0,
    breakdown: null,
    reasoning: reasonMatch ? reasonMatch[1].trim() : response.slice(0, 500),
    suggestions: null,
  }
}
