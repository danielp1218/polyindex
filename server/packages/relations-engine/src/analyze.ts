import type {
  AnalysisFinding,
  AnalysisOptions,
  RelationAnalysis,
  RelationInput,
  RelationsAnalysisResult,
  TradingGuidance,
} from './types';

const DEFAULT_EPSILON = 0.01;
const DEFAULT_WEAK_SIGNAL_MAX_CORRELATION = 0.4;

function addFinding(
  findings: AnalysisFinding[],
  code: string,
  severity: AnalysisFinding['severity'],
  message: string
) {
  findings.push({ code, severity, message });
}

function normalizeProbability(
  label: string,
  value: number | undefined,
  findings: AnalysisFinding[]
): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'number' || Number.isNaN(value) || value < 0 || value > 1) {
    addFinding(
      findings,
      'invalid_probability',
      'warning',
      `${label} must be a number between 0 and 1.`
    );
    return undefined;
  }
  return value;
}

function parseIsoDate(
  label: string,
  value: string | undefined,
  findings: AnalysisFinding[]
): Date | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    addFinding(findings, 'invalid_date', 'warning', `${label} must be an ISO date string.`);
    return undefined;
  }
  return parsed;
}

function requireResolutionCriteria(
  label: string,
  value: string | undefined,
  findings: AnalysisFinding[]
) {
  if (!value) {
    addFinding(
      findings,
      'missing_resolution_criteria',
      'warning',
      `${label} resolution criteria is required for validation.`
    );
  }
}

function addManualReview(findings: AnalysisFinding[], code: string, message: string) {
  addFinding(findings, code, 'info', message);
}

function addGuidance(guidance: TradingGuidance[], type: TradingGuidance['type'], message: string, targets?: string[]) {
  guidance.push({ type, message, targets });
}

function analyzeRelation(relation: RelationInput, options: AnalysisOptions): RelationAnalysis {
  const findings: AnalysisFinding[] = [];
  const guidance: TradingGuidance[] = [];
  const epsilon = relation.metadata?.epsilon ?? options.epsilon ?? DEFAULT_EPSILON;
  const maxCorrelation = options.weakSignalMaxCorrelation ?? DEFAULT_WEAK_SIGNAL_MAX_CORRELATION;

  const pRoot = normalizeProbability('root.probabilityYes', relation.root.probabilityYes, findings);
  const pRelated = normalizeProbability('related.probabilityYes', relation.related.probabilityYes, findings);
  const rootDate = parseIsoDate('root.endDate', relation.root.endDate, findings);
  const relatedDate = parseIsoDate('related.endDate', relation.related.endDate, findings);
  const correlation = relation.metadata?.correlation;

  switch (relation.relation) {
    case 'IMPLIES': {
      requireResolutionCriteria('root', relation.root.resolutionCriteria, findings);
      requireResolutionCriteria('related', relation.related.resolutionCriteria, findings);
      addManualReview(
        findings,
        'manual_resolution_subset',
        'Confirm related resolution criteria is a strict subset of root resolution criteria.'
      );
      addManualReview(
        findings,
        'manual_no_alternative_paths',
        'Confirm there are no alternate resolution paths that allow related to resolve YES without root.'
      );
      if (rootDate && relatedDate && relatedDate > rootDate) {
        addFinding(
          findings,
          'timing_contradiction',
          'error',
          'Related cannot resolve after root for IMPLIES.'
        );
      }
      if (pRoot !== undefined && pRelated !== undefined) {
        if (pRelated > pRoot + epsilon) {
          addFinding(findings, 'probability_incoherent', 'error', 'P(related) exceeds P(root).');
          addGuidance(
            guidance,
            'ARBITRAGE',
            'Incoherence detected: buy YES on root or sell YES on related.',
            [relation.root.id, relation.related.id]
          );
        }
        addGuidance(
          guidance,
          'HEDGE',
          'If long related, a partial long on root reduces variance.',
          [relation.root.id, relation.related.id]
        );
      } else {
        addFinding(
          findings,
          'missing_probability',
          'warning',
          'Both probabilities are required to check P(related) <= P(root).'
        );
      }
      break;
    }
    case 'SUBEVENT': {
      requireResolutionCriteria('root', relation.root.resolutionCriteria, findings);
      requireResolutionCriteria('related', relation.related.resolutionCriteria, findings);
      addManualReview(
        findings,
        'manual_resolution_subset',
        'Confirm root resolution criteria is a strict subset of related resolution criteria.'
      );
      if (rootDate && relatedDate && rootDate > relatedDate) {
        addFinding(
          findings,
          'timing_contradiction',
          'error',
          'Root cannot resolve after related for SUBEVENT.'
        );
      }
      if (pRoot !== undefined && pRelated !== undefined) {
        if (pRoot > pRelated + epsilon) {
          addFinding(findings, 'probability_incoherent', 'error', 'P(root) exceeds P(related).');
          addGuidance(
            guidance,
            'ARBITRAGE',
            'Incoherence detected: buy YES on related or sell YES on root.',
            [relation.root.id, relation.related.id]
          );
        }
      } else {
        addFinding(
          findings,
          'missing_probability',
          'warning',
          'Both probabilities are required to check P(root) <= P(related).'
        );
      }
      break;
    }
    case 'CONTRADICTS': {
      addManualReview(
        findings,
        'manual_mutual_exclusion',
        'Confirm both events cannot resolve YES simultaneously.'
      );
      if (pRoot !== undefined && pRelated !== undefined) {
        if (pRoot + pRelated > 1 + epsilon) {
          addFinding(
            findings,
            'probability_incoherent',
            'error',
            'P(root) + P(related) exceeds 1 for CONTRADICTS.'
          );
          addGuidance(
            guidance,
            'ARBITRAGE',
            'Overpricing detected: short the more inflated outcome(s).',
            [relation.root.id, relation.related.id]
          );
        }
      } else {
        addFinding(
          findings,
          'missing_probability',
          'warning',
          'Both probabilities are required to check P(root) + P(related) <= 1.'
        );
      }
      break;
    }
    case 'PARTITION_OF': {
      addManualReview(
        findings,
        'manual_partition_coverage',
        'Confirm outcomes are mutually exclusive and collectively exhaustive.'
      );
      if (pRelated === undefined) {
        addFinding(
          findings,
          'missing_probability',
          'warning',
          'Each partition member requires probability for sum check.'
        );
      }
      break;
    }
    case 'CONDITIONED_ON': {
      requireResolutionCriteria('root', relation.root.resolutionCriteria, findings);
      requireResolutionCriteria('related', relation.related.resolutionCriteria, findings);
      addManualReview(
        findings,
        'manual_explicit_condition',
        'Confirm root resolution text explicitly conditions on related resolving YES.'
      );
      if (rootDate && relatedDate && rootDate < relatedDate) {
        addFinding(
          findings,
          'timing_contradiction',
          'error',
          'Root cannot resolve before related for CONDITIONED_ON.'
        );
      }
      if (pRoot !== undefined && pRelated !== undefined) {
        if (pRoot > pRelated + epsilon) {
          addFinding(
            findings,
            'probability_incoherent',
            'error',
            'P(root) exceeds P(related) under CONDITIONED_ON.'
          );
          addGuidance(
            guidance,
            'ARBITRAGE',
            'Incoherence detected: adjust exposure so conditioned event does not exceed condition.',
            [relation.root.id, relation.related.id]
          );
        }
        addGuidance(
          guidance,
          'RISK',
          'Never trade conditioned event without accounting for the condition probability.',
          [relation.root.id, relation.related.id]
        );
      } else {
        addFinding(
          findings,
          'missing_probability',
          'warning',
          'Both probabilities are required to check P(root) <= P(related).'
        );
      }
      break;
    }
    case 'WEAK_SIGNAL': {
      if (correlation !== undefined) {
        if (typeof correlation !== 'number' || Number.isNaN(correlation) || correlation < -1 || correlation > 1) {
          addFinding(
            findings,
            'invalid_correlation',
            'warning',
            'Correlation must be between -1 and 1.'
          );
        } else if (Math.abs(correlation) > maxCorrelation) {
          addFinding(
            findings,
            'correlation_too_high',
            'warning',
            'Correlation exceeds conservative max; consider lowering.'
          );
        }
      }
      addGuidance(
        guidance,
        'RISK',
        'Do not initiate a trade solely due to WEAK_SIGNAL; cap combined exposure.',
        [relation.root.id, relation.related.id]
      );
      break;
    }
    default: {
      addFinding(findings, 'unknown_relation', 'error', 'Unknown relation type.');
    }
  }

  return {
    relation: relation.relation,
    rootId: relation.root.id,
    relatedId: relation.related.id,
    findings,
    guidance,
    metrics: {
      pRoot,
      pRelated,
      epsilon,
      correlation: correlation ?? undefined,
    },
  };
}

export function analyzeRelations(
  relations: RelationInput[],
  options: AnalysisOptions = {}
): RelationsAnalysisResult {
  const analyses = relations.map(relation => analyzeRelation(relation, options));

  const partitionGroups = new Map<string, number[]>();
  relations.forEach((relation, index) => {
    if (relation.relation !== 'PARTITION_OF') {
      return;
    }
    const group = partitionGroups.get(relation.root.id) ?? [];
    group.push(index);
    partitionGroups.set(relation.root.id, group);
  });

  for (const [, indices] of partitionGroups) {
    const epsilons = indices.map(index => analyses[index].metrics?.epsilon ?? DEFAULT_EPSILON);
    const epsilon = Math.max(...epsilons);
    let sum = 0;
    let missing = false;

    for (const index of indices) {
      const metric = analyses[index].metrics;
      if (!metric || metric.pRelated === undefined) {
        missing = true;
        continue;
      }
      sum += metric.pRelated;
    }

    for (const index of indices) {
      const analysis = analyses[index];
      const baseMetrics = analysis.metrics ?? { epsilon };
      analysis.metrics = {
        ...baseMetrics,
        partitionSum: missing ? undefined : sum,
        partitionExpected: 1,
      };

      if (missing) {
        addFinding(
          analysis.findings,
          'partition_missing_probability',
          'warning',
          'All partition members need probabilities to validate sum.'
        );
        continue;
      }

      if (sum < 1 - epsilon) {
        addFinding(
          analysis.findings,
          'partition_sum_below_one',
          'warning',
          'Partition sum is below 1; outcomes appear underpriced.'
        );
        addGuidance(
          analysis.guidance,
          'ARBITRAGE',
          'Partition sum below 1: buy underpriced outcomes.',
          [analysis.rootId]
        );
      } else if (sum > 1 + epsilon) {
        addFinding(
          analysis.findings,
          'partition_sum_above_one',
          'error',
          'Partition sum exceeds 1; outcomes appear overpriced.'
        );
        addGuidance(
          analysis.guidance,
          'ARBITRAGE',
          'Partition sum above 1: short overpriced outcomes.',
          [analysis.rootId]
        );
      }
    }
  }

  let errors = 0;
  let warnings = 0;
  let infos = 0;

  for (const analysis of analyses) {
    for (const finding of analysis.findings) {
      if (finding.severity === 'error') {
        errors += 1;
      } else if (finding.severity === 'warning') {
        warnings += 1;
      } else {
        infos += 1;
      }
    }
  }

  return {
    analyses,
    summary: { errors, warnings, infos },
  };
}
