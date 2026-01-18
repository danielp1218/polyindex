import { Hono } from 'hono';
import { priceRelationSet } from '../services/relation-analyzer';
import type {
  PricingOptions,
  RelationInput,
  RelationType,
} from '@polyindex/relations-engine';
import type { GraphNodeInput } from '../services/graph-outcomes';
import { evaluateGraph } from '../services/graph-outcomes';

export const relationsRouter = new Hono();

type Decision = 'yes' | 'no';

interface RootRelationInput {
  probability: number;
  weight?: number;
  decision?: Decision | string;
  id?: string;
}

interface DependantInput {
  id: string;
  probability: number;
  relation: RelationType;
}

interface CompactRelationsPayload {
  root: RootRelationInput;
  dependants: DependantInput[];
  options?: PricingOptions;
  volatility?: number;
}

interface GraphValidationError {
  path: string;
  message: string;
}

const RELATION_TYPES: RelationType[] = [
  'IMPLIES',
  'CONTRADICTS',
  'PARTITION_OF',
  'SUBEVENT',
  'CONDITIONED_ON',
  'WEAK_SIGNAL',
];

function isCompactPayload(payload: unknown): payload is CompactRelationsPayload {
  if (!payload || typeof payload !== 'object') {
    return false;
  }
  const candidate = payload as CompactRelationsPayload;
  return Array.isArray(candidate.dependants) && !!candidate.root;
}

function isProbability(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isWeight(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isVolatility(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function normalizeDecision(value: Decision | string | undefined): Decision {
  if (typeof value === 'string' && value.toLowerCase() === 'no') {
    return 'no';
  }
  return 'yes';
}

function isRelationType(value: unknown): value is RelationType {
  return typeof value === 'string' && RELATION_TYPES.includes(value as RelationType);
}

function isDecision(value: unknown): value is Decision {
  return value === 'yes' || value === 'no';
}

function validateGraphNode(
  node: GraphNodeInput,
  isRoot: boolean,
  path: string,
  seen: Set<string>,
  errors: GraphValidationError[]
) {
  if (!node || typeof node !== 'object') {
    errors.push({ path, message: 'Node must be an object.' });
    return;
  }

  if (!node.id || typeof node.id !== 'string') {
    errors.push({ path, message: 'Node.id is required.' });
  } else if (seen.has(node.id)) {
    errors.push({ path, message: `Duplicate node id: ${node.id}.` });
  } else {
    seen.add(node.id);
  }

  if (!isProbability(node.probability)) {
    errors.push({ path, message: 'Node.probability must be between 0 and 1.' });
  }

  if (!isWeight(node.weight)) {
    errors.push({ path, message: 'Node.weight must be a positive number.' });
  }

  if (!isRoot && !isRelationType(node.relation)) {
    errors.push({ path, message: 'Node.relation must be a valid relation type.' });
  }

  if (node.decision !== undefined && !isDecision(node.decision)) {
    errors.push({ path, message: 'Node.decision must be \"yes\" or \"no\".' });
  }

  if (node.children !== undefined && !Array.isArray(node.children)) {
    errors.push({ path, message: 'Node.children must be an array.' });
    return;
  }

  for (const [index, child] of (node.children ?? []).entries()) {
    validateGraphNode(
      child,
      false,
      `${path}.children[${index}]`,
      seen,
      errors
    );
  }
}

function clampProbability(value: number): number {
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

function targetProbabilityForRelation(
  relation: RelationType,
  rootProbability: number,
  dependantProbability: number
): number {
  switch (relation) {
    case 'IMPLIES':
      return Math.min(dependantProbability, rootProbability);
    case 'SUBEVENT':
    case 'CONDITIONED_ON':
      return Math.max(dependantProbability, rootProbability);
    case 'CONTRADICTS':
      return Math.min(dependantProbability, 1 - rootProbability);
    case 'PARTITION_OF':
    case 'WEAK_SIGNAL':
    default:
      return dependantProbability;
  }
}

function buildRelationsFromCompact(payload: CompactRelationsPayload) {
  const rootId = payload.root.id ?? 'root';
  const rootWeight = isWeight(payload.root.weight) ? payload.root.weight : 1;
  const rootDecision = normalizeDecision(payload.root.decision);

  const relations: RelationInput[] = payload.dependants.map(dependant => ({
    relation: dependant.relation,
    root: {
      id: rootId,
      probabilityYes: payload.root.probability,
      weight: rootWeight,
    },
    related: {
      id: dependant.id,
      probabilityYes: dependant.probability,
    },
  }));

  return {
    relations,
    options: payload.options,
    rootDecision,
    rootWeight,
  };
}

relationsRouter.post('/price', async (c) => {
  const payload = await c.req.json<
    RelationInput[] | { relations: RelationInput[]; options?: PricingOptions } | CompactRelationsPayload
  >();

  if (isCompactPayload(payload)) {
    const { root, dependants } = payload;

    if (!isProbability(root.probability)) {
      return c.json({ error: 'root.probability must be between 0 and 1.' }, 400);
    }

    if (root.weight !== undefined && !isWeight(root.weight)) {
      return c.json({ error: 'root.weight must be a positive number.' }, 400);
    }

    if (!Array.isArray(dependants) || dependants.length === 0) {
      return c.json({ error: 'dependants array required' }, 400);
    }

    if (payload.volatility !== undefined && !isVolatility(payload.volatility)) {
      return c.json({ error: 'volatility must be a non-negative number.' }, 400);
    }

    const invalidDependant = dependants.some(
      dependant =>
        !dependant ||
        !dependant.id ||
        !isProbability(dependant.probability) ||
        !isRelationType(dependant.relation)
    );

    if (invalidDependant) {
      return c.json(
        { error: 'Each dependant requires id, probability, and relation.' },
        400
      );
    }

    const rootDecision = normalizeDecision(root.decision);
    const rootWeight = isWeight(root.weight) ? root.weight : 1;
    const volatility = isVolatility(payload.volatility) ? payload.volatility : 1;
    const baseEpsilon = payload.options?.epsilon ?? 0.01;
    const effectiveEpsilon =
      volatility > 0
        ? Math.max(0, Math.min(0.99, baseEpsilon / volatility))
        : 1;
    const riskExponent = volatility > 0 ? 1 / volatility : 1;

    const partitionDependants = dependants.filter(
      dependant => dependant.relation === 'PARTITION_OF'
    );
    const partitionTargets = new Map<string, number>();

    if (partitionDependants.length > 0) {
      const sum = partitionDependants.reduce(
        (total, dependant) => total + dependant.probability,
        0
      );
      if (sum > 0) {
        const scale = root.probability / sum;
        for (const dependant of partitionDependants) {
          partitionTargets.set(
            dependant.id,
            clampProbability(dependant.probability * scale)
          );
        }
      }
    }

    const response = {
      dependants: dependants.map(dependant => {
        const targetProbability =
          partitionTargets.get(dependant.id) ??
          targetProbabilityForRelation(
            dependant.relation,
            root.probability,
            dependant.probability
          );
        const edge = targetProbability - dependant.probability;
        const adjustedEdge = Math.max(0, Math.abs(edge) - effectiveEpsilon);
        const normalizedEdge =
          1 - effectiveEpsilon > 0
            ? Math.min(1, adjustedEdge / (1 - effectiveEpsilon))
            : 0;
        const decision =
          adjustedEdge > 0 ? (edge > 0 ? 'yes' : 'no') : rootDecision;
        const weight =
          adjustedEdge > 0
            ? rootWeight * Math.pow(normalizedEdge, riskExponent)
            : 0;

        return {
          id: dependant.id,
          weight,
          decision,
          relation: dependant.relation,
        };
      }),
    };

    return c.json(response);
  }

  const relations = Array.isArray(payload) ? payload : payload?.relations;
  const options = Array.isArray(payload) ? undefined : payload?.options;

  if (!relations || !Array.isArray(relations) || relations.length === 0) {
    return c.json({ error: 'relations array required' }, 400);
  }

  const invalid = relations.some(
    relation =>
      !relation ||
      !relation.relation ||
      !relation.root ||
      !relation.root.id ||
      !relation.related ||
      !relation.related.id
  );

  if (invalid) {
    return c.json(
      { error: 'Each relation requires relation, root.id, and related.id.' },
      400
    );
  }

  const result = priceRelationSet(relations, options);
  return c.json(result);
});

relationsRouter.post('/graph', async (c) => {
  const payload = await c.req.json<GraphNodeInput>();
  const errors: GraphValidationError[] = [];
  const seen = new Set<string>();

  validateGraphNode(payload, true, 'root', seen, errors);

  if (errors.length > 0) {
    return c.json({ error: 'Invalid graph payload', details: errors }, 400);
  }

  const result = evaluateGraph(payload);
  return c.json(result);
});
