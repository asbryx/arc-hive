/**
 * Sector-specific configurations for ArcHive marketplace.
 * Each sector defines: description placeholder, optional detail fields,
 * evaluator hints, and expected deliverable types.
 *
 * Detail fields are OPTIONAL — they guide the poster, not restrict them.
 */

export interface SectorDetailField {
  key: string
  label: string
  type: 'text' | 'select' | 'multiselect' | 'checkbox'
  placeholder?: string
  options?: string[]
}

export interface SectorConfig {
  id: string
  label: string
  descriptionPlaceholder: string
  detailFields: SectorDetailField[]
  evaluatorHint: string
  deliverableHint: string
  icon: string
}

export const SECTORS: Record<string, SectorConfig> = {
  'Code': {
    id: 'Code',
    label: 'Code',
    icon: '⟨⟩',
    descriptionPlaceholder:
      'Describe the code you need. What should it do? What language or framework? Any specific patterns or standards to follow?',
    detailFields: [
      {
        key: 'language',
        label: 'Language / Framework',
        type: 'text',
        placeholder: 'e.g. TypeScript, Python, Rust, Solidity',
      },
      {
        key: 'deliverableType',
        label: 'Deliverable type',
        type: 'select',
        options: ['PR / Merge request', 'Standalone script', 'Library / Package', 'CLI tool', 'Code snippet'],
      },
      {
        key: 'testRequired',
        label: 'Tests required',
        type: 'checkbox',
      },
    ],
    evaluatorHint:
      'Evaluate as a code deliverable. Check: correctness, code quality, test coverage (if required), adherence to requirements. Working code > perfect formatting.',
    deliverableHint: 'Expected: code PR, script, or repository link',
  },

  'Development': {
    id: 'Development',
    label: 'Development',
    icon: '⚙',
    descriptionPlaceholder:
      'Describe the project. What are you building? API, web app, bot, smart contract? What features do you need?',
    detailFields: [
      {
        key: 'projectType',
        label: 'Project type',
        type: 'select',
        options: ['API / Backend', 'Web App', 'Smart Contract', 'CLI Tool', 'Bot', 'Full Stack', 'Other'],
      },
      {
        key: 'techStack',
        label: 'Tech stack',
        type: 'text',
        placeholder: 'e.g. React + Express + PostgreSQL',
      },
      {
        key: 'hostingTarget',
        label: 'Hosting target',
        type: 'select',
        options: ['Vercel', 'Self-hosted', 'On-chain', 'Serverless', 'No preference'],
      },
    ],
    evaluatorHint:
      'Evaluate as a development deliverable. Check: working deployment or codebase, feature completeness, error handling, documentation. A working prototype beats a polished README.',
    deliverableHint: 'Expected: deployed URL, repository, or working demo',
  },

  'Data Analysis': {
    id: 'Data Analysis',
    label: 'Data Analysis',
    icon: '📊',
    descriptionPlaceholder:
      'What data needs analyzing? What questions should be answered? What insights are you looking for?',
    detailFields: [
      {
        key: 'dataSource',
        label: 'Data sources',
        type: 'text',
        placeholder: 'e.g. On-chain RPC, Dune Analytics, CSV files, APIs',
      },
      {
        key: 'outputFormat',
        label: 'Output format',
        type: 'select',
        options: ['Dashboard / Visualization', 'Report (PDF/Markdown)', 'Dataset (CSV/JSON)', 'Charts + Summary', 'Raw analysis'],
      },
      {
        key: 'timeRange',
        label: 'Time range',
        type: 'text',
        placeholder: 'e.g. Last 30 days, Q1 2026, All-time',
      },
    ],
    evaluatorHint:
      'Evaluate as a data analysis deliverable. Check: data accuracy, insight quality, visualization clarity, completeness of analysis. Actionable insights > raw data dumps.',
    deliverableHint: 'Expected: dashboard link, dataset files, or analysis report',
  },

  'Content Creation': {
    id: 'Content Creation',
    label: 'Content',
    icon: '✍',
    descriptionPlaceholder:
      'What content do you need? What topic? Who is the audience? Any specific tone or style?',
    detailFields: [
      {
        key: 'contentType',
        label: 'Content type',
        type: 'select',
        options: ['Article / Blog post', 'Twitter thread', 'Documentation', 'Copywriting', 'Newsletter', 'Tutorial'],
      },
      {
        key: 'tone',
        label: 'Tone',
        type: 'select',
        options: ['Technical', 'Casual', 'Professional', 'Persuasive', 'Educational'],
      },
      {
        key: 'targetAudience',
        label: 'Target audience',
        type: 'text',
        placeholder: 'e.g. DeFi developers, crypto traders, general public',
      },
      {
        key: 'wordCount',
        label: 'Word count (approx)',
        type: 'text',
        placeholder: 'e.g. 1000-2000',
      },
    ],
    evaluatorHint:
      'Evaluate as content deliverable. Check: writing quality, audience fit, accuracy, engagement potential, completeness. Authentic voice > generic filler.',
    deliverableHint: 'Expected: article, thread, or document link',
  },

  'Research': {
    id: 'Research',
    label: 'Research',
    icon: '🔬',
    descriptionPlaceholder:
      'What topic needs research? What questions should be answered? How deep should the analysis go?',
    detailFields: [
      {
        key: 'researchScope',
        label: 'Research scope',
        type: 'text',
        placeholder: 'e.g. L2 landscape, MEV strategies, tokenomics models',
      },
      {
        key: 'depthLevel',
        label: 'Depth level',
        type: 'select',
        options: ['Quick overview', 'Deep dive', 'Academic grade'],
      },
      {
        key: 'sourceRequirements',
        label: 'Source requirements',
        type: 'text',
        placeholder: 'e.g. On-chain data, academic papers, protocol docs',
      },
    ],
    evaluatorHint:
      'Evaluate as a research deliverable. Check: depth of analysis, source quality, insight originality, logical structure, citation quality. Novel insights > surface-level summaries.',
    deliverableHint: 'Expected: structured report or data package',
  },

  'Trading': {
    id: 'Trading',
    label: 'Trading',
    icon: '📈',
    descriptionPlaceholder:
      'What trading strategy or analysis do you need? What markets? What risk parameters?',
    detailFields: [
      {
        key: 'strategyType',
        label: 'Strategy type',
        type: 'select',
        options: ['Arbitrage', 'Market Making', 'Trend Following', 'Grid', 'Scalping', 'Custom'],
      },
      {
        key: 'market',
        label: 'Market / Pair',
        type: 'text',
        placeholder: 'e.g. ETH/USDC, BTC perpetuals, SOL spot',
      },
      {
        key: 'riskParameters',
        label: 'Risk parameters',
        type: 'text',
        placeholder: 'e.g. Max 5% drawdown, 2x leverage, 10% position size',
      },
      {
        key: 'backtestRequired',
        label: 'Backtest required',
        type: 'checkbox',
      },
    ],
    evaluatorHint:
      'Evaluate as a trading deliverable. Check: strategy logic, risk management, backtest rigor (if required), code quality, edge case handling. Risk-adjusted thinking > raw returns.',
    deliverableHint: 'Expected: strategy code, backtest results, or performance report',
  },

  'DeFi': {
    id: 'DeFi',
    label: 'DeFi',
    icon: '🏦',
    descriptionPlaceholder:
      'What DeFi protocol or integration do you need? What chain? What functionality?',
    detailFields: [
      {
        key: 'protocolType',
        label: 'Protocol type',
        type: 'select',
        options: ['DEX', 'Lending', 'Yield / Vault', 'Bridge', 'Staking', 'Custom'],
      },
      {
        key: 'chain',
        label: 'Target chain',
        type: 'select',
        options: ['Ethereum', 'Arbitrum', 'Base', 'Arc', 'Solana', 'Multi-chain', 'Other'],
      },
      {
        key: 'auditRequired',
        label: 'Security audit needed',
        type: 'checkbox',
      },
    ],
    evaluatorHint:
      'Evaluate as a DeFi deliverable. Check: security practices, gas efficiency, test coverage, deployment success, documentation. Security > features.',
    deliverableHint: 'Expected: contract address, repository, or deployment URL',
  },

  'Social Media': {
    id: 'Social Media',
    label: 'Social Media',
    icon: '📣',
    descriptionPlaceholder:
      'What social media work do you need? What platform? What campaign goal?',
    detailFields: [
      {
        key: 'platform',
        label: 'Platform',
        type: 'multiselect',
        options: ['Twitter / X', 'Discord', 'Telegram', 'Reddit', 'Farcaster'],
      },
      {
        key: 'campaignGoal',
        label: 'Campaign goal',
        type: 'select',
        options: ['Awareness', 'Growth', 'Engagement', 'Product Launch', 'Community Building'],
      },
      {
        key: 'frequency',
        label: 'Frequency',
        type: 'select',
        options: ['One-time', 'Daily', 'Weekly', 'Campaign-based'],
      },
    ],
    evaluatorHint:
      'Evaluate as a social media deliverable. Check: content quality, strategy coherence, platform fit, target alignment. Authentic engagement > vanity metrics.',
    deliverableHint: 'Expected: content calendar, post links, or engagement report',
  },

  'Monitoring': {
    id: 'Monitoring',
    label: 'Monitoring',
    icon: '📡',
    descriptionPlaceholder:
      'What needs monitoring? What alerts do you need? What SLA targets?',
    detailFields: [
      {
        key: 'monitorTarget',
        label: 'Monitor target',
        type: 'text',
        placeholder: 'e.g. Smart contract events, API uptime, wallet activity',
      },
      {
        key: 'alertChannel',
        label: 'Alert channel',
        type: 'select',
        options: ['Telegram', 'Discord', 'Email', 'Webhook', 'Dashboard only'],
      },
      {
        key: 'checkFrequency',
        label: 'Check frequency',
        type: 'select',
        options: ['Real-time', 'Every minute', 'Every 5 min', 'Hourly', 'Custom'],
      },
    ],
    evaluatorHint:
      'Evaluate as a monitoring deliverable. Check: alert accuracy, latency, false positive rate, dashboard completeness, reliability. Working alerts > fancy dashboards.',
    deliverableHint: 'Expected: monitoring dashboard, alert bot, or uptime report',
  },
}

export const SECTOR_LIST = Object.values(SECTORS)

export function getSector(id: string): SectorConfig | undefined {
  return SECTORS[id]
}
