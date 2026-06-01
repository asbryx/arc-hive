/**
 * Sector evaluator hints — mirrors frontend/src/lib/sectors.ts
 * but only the fields the evaluator needs.
 */
export const SECTOR_HINTS: Record<string, { evaluatorHint: string; deliverableHint: string }> = {
  'Code': {
    evaluatorHint:
      'Evaluate as a code deliverable. Check: correctness, code quality, test coverage (if required), adherence to requirements. Working code > perfect formatting.',
    deliverableHint: 'Expected: code PR, script, or repository link',
  },
  'Development': {
    evaluatorHint:
      'Evaluate as a development deliverable. Check: working deployment or codebase, feature completeness, error handling, documentation. A working prototype beats a polished README.',
    deliverableHint: 'Expected: deployed URL, repository, or working demo',
  },
  'Data Analysis': {
    evaluatorHint:
      'Evaluate as a data analysis deliverable. Check: data accuracy, insight quality, visualization clarity, completeness of analysis. Actionable insights > raw data dumps.',
    deliverableHint: 'Expected: dashboard link, dataset files, or analysis report',
  },
  'Content Creation': {
    evaluatorHint:
      'Evaluate as content deliverable. Check: writing quality, audience fit, accuracy, engagement potential, completeness. Authentic voice > generic filler.',
    deliverableHint: 'Expected: article, thread, or document link',
  },
  'Research': {
    evaluatorHint:
      'Evaluate as a research deliverable. Check: depth of analysis, source quality, insight originality, logical structure, citation quality. Novel insights > surface-level summaries.',
    deliverableHint: 'Expected: structured report or data package',
  },
  'Trading': {
    evaluatorHint:
      'Evaluate as a trading deliverable. Check: strategy logic, risk management, backtest rigor (if required), code quality, edge case handling. Risk-adjusted thinking > raw returns.',
    deliverableHint: 'Expected: strategy code, backtest results, or performance report',
  },
  'DeFi': {
    evaluatorHint:
      'Evaluate as a DeFi deliverable. Check: security practices, gas efficiency, test coverage, deployment success, documentation. Security > features.',
    deliverableHint: 'Expected: contract address, repository, or deployment URL',
  },
  'Social Media': {
    evaluatorHint:
      'Evaluate as a social media deliverable. Check: content quality, strategy coherence, platform fit, target alignment. Authentic engagement > vanity metrics.',
    deliverableHint: 'Expected: content calendar, post links, or engagement report',
  },
  'Monitoring': {
    evaluatorHint:
      'Evaluate as a monitoring deliverable. Check: alert accuracy, latency, false positive rate, dashboard completeness, reliability. Working alerts > fancy dashboards.',
    deliverableHint: 'Expected: monitoring dashboard, alert bot, or uptime report',
  },
  'Other': {
    evaluatorHint:
      "Evaluate based on the client's stated requirements and evaluation guidance. If no guidance provided, use general quality standards: completeness, accuracy, effort, and formatting. Benefit of doubt to the agent when requirements are vague.",
    deliverableHint: 'Expected: as described by the client',
  },
}
