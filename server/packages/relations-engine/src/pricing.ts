import type {
  EventInput,
  PricingDirection,
  PricingOptions,
  PricingResult,
  PricingWarning,
  RelationInput,
} from './types';

const DEFAULT_MAX_ITERATIONS = 200;
const DEFAULT_TOLERANCE = 1e-6;
const DEFAULT_PROBABILITY = 0.5;
const DEFAULT_EPSILON = 0.01;

interface EventState {
  id: string;
  marketProbability?: number;
  probability: number;
  weight: number;
}

function addWarning(warnings: PricingWarning[], code: string, message: string, ids?: string[]) {
  warnings.push({ code, message, ids });
}

function normalizeProbability(value: number | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'number' || Number.isNaN(value) || value < 0 || value > 1) {
    return undefined;
  }
  return value;
}

function normalizeWeight(value: number | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'number' || Number.isNaN(value) || value <= 0) {
    return undefined;
  }
  return value;
}

function getWeight(
  id: string,
  event: EventInput,
  options: PricingOptions,
  warnings: PricingWarning[]
): number {
  const override = options.weights?.[id];
  const normalizedOverride = normalizeWeight(override);
  if (override !== undefined && normalizedOverride === undefined) {
    addWarning(warnings, 'invalid_weight', 'Weight override must be a positive number.', [id]);
  }
  if (normalizedOverride !== undefined) {
    return normalizedOverride;
  }

  const normalized = normalizeWeight(event.weight);
  if (event.weight !== undefined && normalized === undefined) {
    addWarning(warnings, 'invalid_weight', 'Event weight must be a positive number.', [id]);
  }

  return normalized ?? 1;
}

function registerEvent(
  events: Map<string, EventState>,
  event: EventInput,
  options: PricingOptions,
  warnings: PricingWarning[]
) {
  const existing = events.get(event.id);
  const probability = normalizeProbability(event.probabilityYes);
  const defaultProbability = options.defaultProbability ?? DEFAULT_PROBABILITY;
  const overrideWeight = options.weights?.[event.id];
  const normalizedOverride = normalizeWeight(overrideWeight);

  if (!existing) {
    if (event.probabilityYes !== undefined && probability === undefined) {
      addWarning(warnings, 'invalid_probability', 'Market probability must be between 0 and 1.', [event.id]);
    }

    const marketProbability = probability;
    if (marketProbability === undefined) {
      addWarning(
        warnings,
        'missing_market_probability',
        `Market probability missing; defaulting to ${defaultProbability}.`,
        [event.id]
      );
    }

    events.set(event.id, {
      id: event.id,
      marketProbability,
      probability: marketProbability ?? defaultProbability,
      weight: getWeight(event.id, event, options, warnings),
    });
    return;
  }

  if (event.probabilityYes !== undefined) {
    if (probability === undefined) {
      addWarning(warnings, 'invalid_probability', 'Market probability must be between 0 and 1.', [event.id]);
    } else if (existing.marketProbability === undefined) {
      existing.marketProbability = probability;
      existing.probability = probability;
    } else if (Math.abs(existing.marketProbability - probability) > DEFAULT_TOLERANCE) {
      addWarning(
        warnings,
        'conflicting_market_probability',
        'Multiple market probabilities provided; using the first value.',
        [event.id]
      );
    }
  }

  if (overrideWeight !== undefined && normalizedOverride === undefined) {
    addWarning(warnings, 'invalid_weight', 'Weight override must be a positive number.', [event.id]);
  }

  if (normalizedOverride !== undefined) {
    existing.weight = normalizedOverride;
    return;
  }

  const weight = normalizeWeight(event.weight);
  if (event.weight !== undefined && weight === undefined) {
    addWarning(warnings, 'invalid_weight', 'Event weight must be a positive number.', [event.id]);
  } else if (weight !== undefined && weight !== existing.weight) {
    addWarning(
      warnings,
      'conflicting_weight',
      'Multiple weights provided; using the first value.',
      [event.id]
    );
  }
}

function clamp(value: number): number {
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

function updateValue(
  probabilities: Map<string, number>,
  id: string,
  value: number,
  maxDelta: { value: number }
) {
  const prev = probabilities.get(id);
  if (prev === undefined) {
    probabilities.set(id, value);
    maxDelta.value = Math.max(maxDelta.value, Math.abs(value));
    return;
  }
  const delta = Math.abs(prev - value);
  if (delta > maxDelta.value) {
    maxDelta.value = delta;
  }
  probabilities.set(id, value);
}

function getProbability(probabilities: Map<string, number>, id: string): number {
  const value = probabilities.get(id);
  if (value === undefined) {
    return DEFAULT_PROBABILITY;
  }
  return value;
}

function getWeightById(events: Map<string, EventState>, id: string): number {
  return events.get(id)?.weight ?? 1;
}

function directionFromEdge(edge: number | undefined, epsilon: number): PricingDirection {
  if (edge === undefined) {
    return 'NONE';
  }
  if (Math.abs(edge) <= epsilon) {
    return 'NONE';
  }
  return edge > 0 ? 'BUY_YES' : 'BUY_NO';
}

export function priceRelations(
  relations: RelationInput[],
  options: PricingOptions = {}
): PricingResult {
  const warnings: PricingWarning[] = [];
  const events = new Map<string, EventState>();

  const impliesPairs = new Set<string>();
  const forwardPairs = new Set<string>();
  const contradictsPairs = new Set<string>();
  const partitionGroups = new Map<string, Set<string>>();

  for (const relation of relations) {
    registerEvent(events, relation.root, options, warnings);
    registerEvent(events, relation.related, options, warnings);

    if (relation.relation === 'IMPLIES') {
      impliesPairs.add(`${relation.root.id}::${relation.related.id}`);
    } else if (relation.relation === 'SUBEVENT' || relation.relation === 'CONDITIONED_ON') {
      forwardPairs.add(`${relation.root.id}::${relation.related.id}`);
    } else if (relation.relation === 'CONTRADICTS') {
      contradictsPairs.add(`${relation.root.id}::${relation.related.id}`);
    } else if (relation.relation === 'PARTITION_OF') {
      const group = partitionGroups.get(relation.root.id) ?? new Set<string>();
      group.add(relation.related.id);
      partitionGroups.set(relation.root.id, group);
    }
  }

  const probabilities = new Map<string, number>();
  for (const [id, event] of events) {
    probabilities.set(id, clamp(event.probability));
  }

  const maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  const tolerance = options.tolerance ?? DEFAULT_TOLERANCE;

  let converged = false;
  let iterations = 0;

  const implies = Array.from(impliesPairs).map(pair => pair.split('::'));
  const forward = Array.from(forwardPairs).map(pair => pair.split('::'));
  const contradicts = Array.from(contradictsPairs).map(pair => pair.split('::'));

  for (let iter = 0; iter < maxIterations; iter += 1) {
    const maxDelta = { value: 0 };

    for (const [id] of probabilities) {
      updateValue(probabilities, id, clamp(getProbability(probabilities, id)), maxDelta);
    }

    for (const [rootId, relatedId] of implies) {
      const pRoot = getProbability(probabilities, rootId);
      const pRelated = getProbability(probabilities, relatedId);
      if (pRelated <= pRoot) {
        continue;
      }
      const wRoot = getWeightById(events, rootId);
      const wRelated = getWeightById(events, relatedId);
      const combined = wRoot + wRelated;
      const projected = (wRoot * pRoot + wRelated * pRelated) / combined;
      updateValue(probabilities, rootId, projected, maxDelta);
      updateValue(probabilities, relatedId, projected, maxDelta);
    }

    for (const [rootId, relatedId] of forward) {
      const pRoot = getProbability(probabilities, rootId);
      const pRelated = getProbability(probabilities, relatedId);
      if (pRoot <= pRelated) {
        continue;
      }
      const wRoot = getWeightById(events, rootId);
      const wRelated = getWeightById(events, relatedId);
      const combined = wRoot + wRelated;
      const projected = (wRoot * pRoot + wRelated * pRelated) / combined;
      updateValue(probabilities, rootId, projected, maxDelta);
      updateValue(probabilities, relatedId, projected, maxDelta);
    }

    for (const [rootId, relatedId] of contradicts) {
      const pRoot = getProbability(probabilities, rootId);
      const pRelated = getProbability(probabilities, relatedId);
      const sum = pRoot + pRelated;
      if (sum <= 1) {
        continue;
      }
      const wRoot = getWeightById(events, rootId);
      const wRelated = getWeightById(events, relatedId);
      const combined = wRoot + wRelated;
      const excess = sum - 1;
      const newRoot = pRoot - excess * (wRelated / combined);
      const newRelated = pRelated - excess * (wRoot / combined);
      updateValue(probabilities, rootId, newRoot, maxDelta);
      updateValue(probabilities, relatedId, newRelated, maxDelta);
    }

    for (const [groupId, members] of partitionGroups.entries()) {
      const memberIds = Array.from(members);
      if (memberIds.length === 0) {
        continue;
      }

      let sum = 0;
      let denom = 0;
      for (const id of memberIds) {
        const weight = getWeightById(events, id);
        sum += getProbability(probabilities, id);
        denom += 1 / weight;
      }

      const diff = sum - 1;
      if (Math.abs(diff) <= tolerance) {
        continue;
      }
      if (denom === 0) {
        addWarning(
          warnings,
          'invalid_partition_weight',
          `Partition group ${groupId} has invalid weights; skipping adjustment.`,
          memberIds
        );
        continue;
      }

      for (const id of memberIds) {
        const weight = getWeightById(events, id);
        const adjustment = diff * ((1 / weight) / denom);
        updateValue(probabilities, id, getProbability(probabilities, id) - adjustment, maxDelta);
      }
    }

    for (const [id] of probabilities) {
      updateValue(probabilities, id, clamp(getProbability(probabilities, id)), maxDelta);
    }

    iterations = iter + 1;
    if (maxDelta.value < tolerance) {
      converged = true;
      break;
    }
  }

  const epsilon = options.epsilon ?? DEFAULT_EPSILON;
  const coherent = Object.fromEntries(
    Array.from(probabilities.entries()).map(([id, value]) => [id, clamp(value)])
  );

  const edges = Array.from(events.values()).map(event => {
    const coherentProbability = coherent[event.id] ?? DEFAULT_PROBABILITY;
    const marketProbability = event.marketProbability;
    const edge =
      marketProbability === undefined ? undefined : coherentProbability - marketProbability;
    return {
      id: event.id,
      marketProbability,
      coherentProbability,
      edge,
      direction: directionFromEdge(edge, epsilon),
    };
  });

  return {
    probabilities: coherent,
    edges,
    warnings,
    iterations,
    converged,
  };
}
