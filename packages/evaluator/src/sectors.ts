/**
 * Sector evaluator hints + scoring rubrics
 * Mirrors frontend/src/lib/sectors.ts but with evaluator-specific details
 */

export interface SectorRubric {
  evaluatorHint: string
  deliverableHint: string
  weights: {
    completeness: number // 0-30
    quality: number      // 0-30
    effort: number       // 0-20
    format: number       // 0-20
  }
  preChecks: string[] // things to check before LLM call
}

export const SECTOR_HINTS: Record<string, SectorRubric> = {
  'Code': {
    evaluatorHint:
      'Evaluate as a code deliverable. Check: correctness, code quality, structure (functions/classes), test coverage (if required), adherence to requirements. Working code > perfect formatting. Check for syntax errors, missing imports, obvious bugs.',
    deliverableHint: 'Expected: code PR, script, or repository link',
    weights: { completeness: 30, quality: 30, effort: 20, format: 20 },
    preChecks: ['syntax_valid', 'has_functions', 'has_imports'],
  },
  'Development': {
    evaluatorHint:
      'Evaluate as a development deliverable. Check: working deployment or codebase, feature completeness, error handling, documentation. A working prototype beats a polished README. Verify code structure and logic.',
    deliverableHint: 'Expected: deployed URL, repository, or working demo',
    weights: { completeness: 30, quality: 25, effort: 25, format: 20 },
    preChecks: ['syntax_valid', 'has_functions'],
  },
  'Data Analysis': {
    evaluatorHint:
      'Evaluate as a data analysis deliverable. Check: data accuracy, insight quality, visualization clarity, completeness of analysis. Verify calculations if possible. Actionable insights > raw data dumps.',
    deliverableHint: 'Expected: dashboard link, dataset files, or analysis report',
    weights: { completeness: 25, quality: 35, effort: 20, format: 20 },
    preChecks: ['has_numbers', 'valid_json_csv'],
  },
  'Content Creation': {
    evaluatorHint:
      'Evaluate as content deliverable. Check: writing quality, audience fit, accuracy, engagement potential, completeness. Authentic voice > generic filler. Check word count and structure.',
    deliverableHint: 'Expected: article, thread, or document link',
    weights: { completeness: 25, quality: 30, effort: 25, format: 20 },
    preChecks: ['min_word_count', 'has_sections'],
  },
  'Research': {
    evaluatorHint:
      'Evaluate as a research deliverable. Check: depth of analysis, source quality, insight originality, logical structure, citation quality. Novel insights > surface-level summaries. Verify claims if possible.',
    deliverableHint: 'Expected: structured report or data package',
    weights: { completeness: 25, quality: 35, effort: 20, format: 20 },
    preChecks: ['min_word_count', 'has_sections', 'has_citations'],
  },
  'Trading': {
    evaluatorHint:
      'Evaluate as a trading deliverable. Check: strategy logic, risk management, backtest rigor (if required), code quality, edge case handling. Risk-adjusted thinking > raw returns. Verify mathematical consistency.',
    deliverableHint: 'Expected: strategy code, backtest results, or performance report',
    weights: { completeness: 25, quality: 30, effort: 25, format: 20 },
    preChecks: ['has_numbers', 'syntax_valid'],
  },
  'DeFi': {
    evaluatorHint:
      'Evaluate as a DeFi deliverable. Check: security practices, gas efficiency, test coverage, deployment success, documentation. Security > features. Check for common vulnerabilities (reentrancy, overflow).',
    deliverableHint: 'Expected: contract address, repository, or deployment URL',
    weights: { completeness: 30, quality: 30, effort: 20, format: 20 },
    preChecks: ['syntax_valid', 'has_security_patterns'],
  },
  'Social Media': {
    evaluatorHint:
      'Evaluate as a social media deliverable. Check: content quality, strategy coherence, platform fit, target alignment. Authentic engagement > vanity metrics. Verify content is platform-appropriate.',
    deliverableHint: 'Expected: content calendar, post links, or engagement report',
    weights: { completeness: 25, quality: 30, effort: 25, format: 20 },
    preChecks: ['min_word_count'],
  },
  'Monitoring': {
    evaluatorHint:
      'Evaluate as a monitoring deliverable. Check: alert accuracy, latency, false positive rate, dashboard completeness, reliability. Working alerts > fancy dashboards. Verify configuration makes sense.',
    deliverableHint: 'Expected: monitoring dashboard, alert bot, or uptime report',
    weights: { completeness: 30, quality: 25, effort: 25, format: 20 },
    preChecks: ['syntax_valid', 'has_config'],
  },
  'Other': {
    evaluatorHint:
      "Evaluate based on the client's stated requirements and evaluation guidance. If no guidance provided, use general quality standards: completeness, accuracy, effort, and formatting. Benefit of doubt to the agent when requirements are vague.",
    deliverableHint: 'Expected: as described by the client',
    weights: { completeness: 30, quality: 30, effort: 20, format: 20 },
    preChecks: [],
  },
}
