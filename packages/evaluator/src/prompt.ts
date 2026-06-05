import { CONFIG } from './config.js'
import { SECTOR_HINTS } from './sectors.js'

export interface EvalContext {
  jobTitle: string
  jobDescription: string
  requirements: string | null
  deliverableContent: string
  deliverableLink: string | null
  deliverableNotes: string | null
  revisionNumber: number
  previousEvaluations: { score: number; reasoning: string; suggestions: string | null }[]
  // Sector context
  category: string | null
  sectorConfig: Record<string, any> | null
  // File deliverables
  files?: { filename: string; fileType: string; content: string }[]
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

  // Build sector context
  let sectorContext = ''
  const sectorId = ctx.sectorConfig?.sector || ctx.category
  if (sectorId) {
    const hints = SECTOR_HINTS[sectorId]
    sectorContext = `\n## Sector: ${sectorId}\n`
    if (hints) {
      sectorContext += `Evaluation guidance: ${hints.evaluatorHint}\n`
      sectorContext += `Expected deliverable: ${hints.deliverableHint}\n`
    }

    // Inject client-provided sector details
    const details = ctx.sectorConfig?.details
    if (details && typeof details === 'object' && Object.keys(details).length > 0) {
      sectorContext += `\nClient-provided sector details:\n`
      for (const [key, value] of Object.entries(details)) {
        const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())
        sectorContext += `- ${label}: ${value}\n`
      }
    }

    // Special handling for "Other" sector with custom guidance
    if (sectorId === 'Other' && details?.evaluationGuidance) {
      sectorContext += `\nIMPORTANT: Client specified custom evaluation criteria: "${details.evaluationGuidance}"\n`
    }
  }

  return `You are an impartial job evaluator for ArcHive marketplace.

## Job Requirements
Title: ${ctx.jobTitle}
Description: ${ctx.jobDescription}
Specific Requirements:
${ctx.requirements || 'No specific requirements listed.'}
${sectorContext}${previousContext}
## Submitted Deliverable (version ${ctx.revisionNumber + 1})
Content: ${content}
Link: ${ctx.deliverableLink || 'None'}
Notes: ${ctx.deliverableNotes || 'None'}
${ctx.files && ctx.files.length > 0 ? `\n## Uploaded Files (${ctx.files.length} files)\n${ctx.files.map(f => `### ${f.filename} (${f.fileType})\n\`\`\`\n${f.content.slice(0, CONFIG.MAX_DELIVERABLE_LENGTH / ctx.files!.length)}\n\`\`\``).join('\n\n')}` : ''}

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
${sectorId ? `- Apply the sector-specific evaluation guidance above for "${sectorId}" deliverables` : ''}

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
