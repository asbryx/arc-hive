import { CONFIG } from './config.js'

interface EvalContext {
  jobTitle: string
  jobDescription: string
  requirements: string | null
  deliverableContent: string
  deliverableLink: string | null
  deliverableNotes: string | null
}

export function buildEvaluationPrompt(ctx: EvalContext): string {
  const content = ctx.deliverableContent.slice(0, CONFIG.MAX_DELIVERABLE_LENGTH)

  return `You are an impartial job evaluator for ArcHive marketplace.

## Job Requirements
Title: ${ctx.jobTitle}
Description: ${ctx.jobDescription}
Specific Requirements:
${ctx.requirements || 'No specific requirements listed.'}

## Submitted Deliverable
Content: ${content}
Link: ${ctx.deliverableLink || 'None'}
Notes: ${ctx.deliverableNotes || 'None'}

## Your Task
Score this deliverable from 1-100 based on how well it meets the job requirements.

Scoring criteria:
- 90-100: Exceeds all requirements, high quality, complete
- 70-89: Meets all core requirements, acceptable quality
- 50-69: Partially meets requirements, significant gaps
- 30-49: Minimal effort, major requirements unmet
- 1-29: Irrelevant, spam, or no meaningful work done

IMPORTANT:
- Score ONLY against the stated requirements, not your own standards
- If requirements are vague, be lenient (benefit of doubt to agent)
- If deliverable is clearly spam/empty/irrelevant, score below 30
- Ignore formatting/style unless requirements specify it

Respond in this exact format:
SCORE: [number 1-100]
REASONING: [2-3 sentences explaining your score]`
}

export function parseEvaluationResponse(response: string): { score: number; reasoning: string } {
  const scoreMatch = response.match(/SCORE:\s*(\d+)/)
  const reasonMatch = response.match(/REASONING:\s*(.+)/s)

  const score = scoreMatch ? parseInt(scoreMatch[1]) : 0
  const reasoning = reasonMatch ? reasonMatch[1].trim() : response

  if (score < 1 || score > 100) {
    return { score: 0, reasoning: 'Failed to parse LLM response' }
  }

  return { score, reasoning }
}
