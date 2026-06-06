import { CONFIG } from './config.js'
import { SECTOR_HINTS } from './sectors.js'
import type { FileAnalysis } from './file-analyzer.js'
import { formatFileForPrompt } from './file-analyzer.js'

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
  // File deliverables (with analysis)
  files?: { filename: string; fileType: string; content: string; analysis?: FileAnalysis }[]
}

export function buildEvaluationPrompt(ctx: EvalContext): string {
  const content = ctx.deliverableContent.slice(0, CONFIG.MAX_DELIVERABLE_LENGTH)

  // Previous evaluations context
  let previousContext = ''
  if (ctx.previousEvaluations.length > 0) {
    previousContext = '\n## Previous Evaluations\n'
    for (const prev of ctx.previousEvaluations) {
      previousContext += `- Score: ${prev.score}/100 — ${prev.reasoning}\n`
      if (prev.suggestions) previousContext += `  Suggestions: ${prev.suggestions}\n`
    }
    previousContext += `\nThis is revision ${ctx.revisionNumber}. The agent was asked to improve based on the above feedback.\n`
  }

  // Sector context with rubric
  let sectorContext = ''
  const sectorId = ctx.sectorConfig?.sector || ctx.category
  if (sectorId) {
    const sector = SECTOR_HINTS[sectorId]
    sectorContext = `\n## Sector: ${sectorId}\n`
    if (sector) {
      sectorContext += `Evaluation guidance: ${sector.evaluatorHint}\n`
      sectorContext += `Expected deliverable: ${sector.deliverableHint}\n`
      sectorContext += `\nScoring weights for this sector:\n`
      sectorContext += `- Completeness: 0-${sector.weights.completeness} points\n`
      sectorContext += `- Quality: 0-${sector.weights.quality} points\n`
      sectorContext += `- Effort: 0-${sector.weights.effort} points\n`
      sectorContext += `- Format: 0-${sector.weights.format} points\n`
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

  // File analysis context
  let fileContext = ''
  if (ctx.files && ctx.files.length > 0) {
    const maxPerFile = Math.floor(CONFIG.MAX_DELIVERABLE_LENGTH / ctx.files.length)
    fileContext = `\n## Uploaded Files (${ctx.files.length} files)\n`

    for (const file of ctx.files) {
      if (file.analysis) {
        fileContext += formatFileForPrompt(file.analysis, file.content, maxPerFile) + '\n\n'
      } else {
        // Fallback: no analysis, just raw content
        fileContext += `### ${file.filename} (${file.fileType})\n\`\`\`\n${file.content.slice(0, maxPerFile)}\n\`\`\`\n\n`
      }
    }
  }

  // Scoring guide
  const scoringGuide = sectorId && SECTOR_HINTS[sectorId]
    ? `Scoring criteria (weighted for ${sectorId}):\n- Completeness: Does it address all requirements? (0-${SECTOR_HINTS[sectorId].weights.completeness} points)\n- Quality: Is the content accurate and well-crafted? (0-${SECTOR_HINTS[sectorId].weights.quality} points)\n- Effort: Does it show genuine effort vs low-quality filler? (0-${SECTOR_HINTS[sectorId].weights.effort} points)\n- Format: Is it properly structured and readable? (0-${SECTOR_HINTS[sectorId].weights.format} points)`
    : `Scoring criteria:\n- Completeness: Does it address all requirements? (0-30 points)\n- Quality: Is the content accurate and well-written? (0-30 points)\n- Effort: Does it show genuine effort vs low-quality filler? (0-20 points)\n- Format: Is it properly structured and readable? (0-20 points)`

  // Build final breakdown template
  const breakdownTemplate = sectorId && SECTOR_HINTS[sectorId]
    ? `{ "completeness": <0-${SECTOR_HINTS[sectorId].weights.completeness}>, "quality": <0-${SECTOR_HINTS[sectorId].weights.quality}>, "effort": <0-${SECTOR_HINTS[sectorId].weights.effort}>, "format": <0-${SECTOR_HINTS[sectorId].weights.format}> }`
    : `{ "completeness": <0-30>, "quality": <0-30>, "effort": <0-20>, "format": <0-20> }`

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
${fileContext}

## Scoring Guide
90-100: Exceptional — exceeds expectations, would hire again
70-89: Good — meets all requirements, solid work
50-69: Needs work — partially meets requirements, significant gaps
30-49: Poor — major gaps, barely addresses requirements
0-29: Rejected — spam, empty, or completely irrelevant

## Your Task
Score this deliverable from 0-100 based on how well it meets the job requirements.

${scoringGuide}

IMPORTANT RULES:
- Score ONLY against the stated requirements, not your own standards
- If requirements are vague, be lenient (benefit of doubt to agent)
- If deliverable is clearly spam/empty/irrelevant, score below 30
- Do not reward empty formatting, verbose filler, or irrelevant content
- For code: working code that solves the problem > beautifully formatted code that doesn't work
- For content: original insights > generic summaries
- Be consistent: similar quality should get similar scores across evaluations
- **FORMAT CHECK**: If client specified an expected file format (e.g. PDF), and the submitted file does NOT match (e.g. .md instead), heavily penalize format score (10-15 points deduction). File format is a concrete deliverable requirement.
${ctx.revisionNumber > 0 ? '- Compare against previous feedback — did the agent address the issues? Improvements should score higher.' : ''}
${sectorId ? `- Apply the sector-specific evaluation guidance above for "${sectorId}" deliverables` : ''}
- If file analysis shows errors (invalid syntax, parse failures), factor that into quality score

Respond in this exact JSON format:
{
  "score": <0-100>,
  "breakdown": ${breakdownTemplate},
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
      // Clamp breakdown to sector max values (LLM often exceeds limits)
      let clamped = null
      if (parsed.breakdown) {
        // Default maxes — overridden by sector config if available
        const maxes: Record<string, number> = { completeness: 30, quality: 30, effort: 20, format: 20 }
        // Try to read sector weights from context (passed through from evaluateDeliverable)
        clamped = { ...parsed.breakdown }
        for (const [key, max] of Object.entries(maxes)) {
          if (typeof clamped[key] === 'number') {
            clamped[key] = Math.max(0, Math.min(max, clamped[key]))
          }
        }
      }

      return {
        score: Math.max(0, Math.min(100, parseInt(parsed.score) || 0)),
        breakdown: clamped,
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
