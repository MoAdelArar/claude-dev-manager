export interface CostEstimate {
  templateId: string;
  templateName: string;
  steps: number;
  tokens: {
    min: number;
    max: number;
    average: number;
  };
  cost: {
    min: number;
    max: number;
    average: number;
  };
  time: {
    minSeconds: number;
    maxSeconds: number;
    averageSeconds: number;
  };
  agents: string[];
}

interface TemplateEstimateData {
  name: string;
  steps: number;
  tokensRange: [number, number];
  costRange: [number, number];
  timeRange: [number, number];
  agents: string[];
}

const CLAUDE_SONNET_PRICING = {
  inputPerMillion: 3.0,
  outputPerMillion: 15.0,
};

const TEMPLATE_ESTIMATES: Record<string, TemplateEstimateData> = {
  'quick-fix': {
    name: 'Quick Fix',
    steps: 2,
    tokensRange: [15000, 25000],
    costRange: [0.05, 0.10],
    timeRange: [60, 120],
    agents: ['Developer', 'Reviewer'],
  },
  'feature': {
    name: 'Feature',
    steps: 4,
    tokensRange: [40000, 60000],
    costRange: [0.15, 0.25],
    timeRange: [180, 300],
    agents: ['Planner', 'Architect', 'Developer', 'Reviewer'],
  },
  'full-feature': {
    name: 'Full Feature',
    steps: 6,
    tokensRange: [80000, 120000],
    costRange: [0.30, 0.50],
    timeRange: [300, 480],
    agents: ['Planner', 'Architect', 'Developer', 'Reviewer', 'Reviewer (Security)', 'Operator'],
  },
  'review-only': {
    name: 'Review Only',
    steps: 1,
    tokensRange: [20000, 40000],
    costRange: [0.08, 0.15],
    timeRange: [60, 120],
    agents: ['Reviewer'],
  },
  'design-only': {
    name: 'Design Only',
    steps: 2,
    tokensRange: [30000, 50000],
    costRange: [0.10, 0.18],
    timeRange: [90, 180],
    agents: ['Planner', 'Architect'],
  },
  'deploy': {
    name: 'Deploy',
    steps: 1,
    tokensRange: [10000, 20000],
    costRange: [0.04, 0.08],
    timeRange: [30, 90],
    agents: ['Operator'],
  },
};

const DEFAULT_TEMPLATE = 'feature';

export function getTemplateEstimate(templateId?: string): CostEstimate {
  const id = templateId || DEFAULT_TEMPLATE;
  const data = TEMPLATE_ESTIMATES[id] || TEMPLATE_ESTIMATES[DEFAULT_TEMPLATE];
  
  const [minTokens, maxTokens] = data.tokensRange;
  const [minCost, maxCost] = data.costRange;
  const [minTime, maxTime] = data.timeRange;

  return {
    templateId: id,
    templateName: data.name,
    steps: data.steps,
    tokens: {
      min: minTokens,
      max: maxTokens,
      average: Math.round((minTokens + maxTokens) / 2),
    },
    cost: {
      min: minCost,
      max: maxCost,
      average: Number(((minCost + maxCost) / 2).toFixed(2)),
    },
    time: {
      minSeconds: minTime,
      maxSeconds: maxTime,
      averageSeconds: Math.round((minTime + maxTime) / 2),
    },
    agents: data.agents,
  };
}

export function getAllTemplateEstimates(): CostEstimate[] {
  return Object.keys(TEMPLATE_ESTIMATES).map((id) => getTemplateEstimate(id));
}

export function formatTokenCount(tokens: number): string {
  if (tokens < 1000) {
    return String(tokens);
  }
  if (tokens < 1000000) {
    return `${(tokens / 1000).toFixed(1)}K`;
  }
  return `${(tokens / 1000000).toFixed(2)}M`;
}

export function formatCost(cost: number): string {
  if (cost < 0.01) {
    return `$${(cost * 100).toFixed(2)}¢`;
  }
  return `$${cost.toFixed(2)}`;
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (remainingSeconds === 0) {
    return `${minutes}m`;
  }
  return `${minutes}m ${remainingSeconds}s`;
}

export function estimateFromDescription(description: string): CostEstimate {
  const lowerDesc = description.toLowerCase();
  
  if (
    lowerDesc.includes('bug') ||
    lowerDesc.includes('fix') ||
    lowerDesc.includes('typo') ||
    lowerDesc.includes('tweak') ||
    lowerDesc.includes('small')
  ) {
    return getTemplateEstimate('quick-fix');
  }

  if (
    lowerDesc.includes('deploy') ||
    lowerDesc.includes('release') ||
    lowerDesc.includes('ci/cd') ||
    lowerDesc.includes('pipeline')
  ) {
    return getTemplateEstimate('deploy');
  }

  if (
    lowerDesc.includes('review') ||
    lowerDesc.includes('audit') ||
    lowerDesc.includes('security') ||
    lowerDesc.includes('performance')
  ) {
    return getTemplateEstimate('review-only');
  }

  if (
    lowerDesc.includes('design') ||
    lowerDesc.includes('architecture') ||
    lowerDesc.includes('rfc') ||
    lowerDesc.includes('spec')
  ) {
    return getTemplateEstimate('design-only');
  }

  if (
    lowerDesc.includes('full') ||
    lowerDesc.includes('complete') ||
    lowerDesc.includes('production') ||
    lowerDesc.includes('secure') ||
    lowerDesc.includes('security')
  ) {
    return getTemplateEstimate('full-feature');
  }

  return getTemplateEstimate('feature');
}

export function getEstimatedCostFromTokens(inputTokens: number, outputTokens: number): number {
  const inputCost = (inputTokens / 1_000_000) * CLAUDE_SONNET_PRICING.inputPerMillion;
  const outputCost = (outputTokens / 1_000_000) * CLAUDE_SONNET_PRICING.outputPerMillion;
  return Number((inputCost + outputCost).toFixed(4));
}
