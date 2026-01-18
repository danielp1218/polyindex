import type { DependencyDecision } from './dependenciesApi';
import type { DependencyDecisionResult } from './dependencyQueue';

export interface DependencyWorkerRequest {
  eventUrl: string;
  keep: boolean;
  fallbackDecision?: DependencyDecision;
  fallbackWeight?: number;
  risk?: number;
}

export async function processDependencyDecisionInBackground(
  payload: DependencyWorkerRequest
): Promise<DependencyDecisionResult> {
  const response = await browser.runtime.sendMessage({
    action: 'processDependencyDecision',
    payload,
  });

  if (!response?.ok) {
    throw new Error(response?.error || 'Failed to process dependency decision.');
  }

  return response.result as DependencyDecisionResult;
}
