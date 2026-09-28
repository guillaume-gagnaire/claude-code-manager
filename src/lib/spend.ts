// What an agent has used, including its running turn: the CLI reports a turn's exact cost only
// when it ends, until then the backend estimates it from list prices.

import { fUsd } from './format';
import type { Agent } from './types';

export interface Spent {
  tokens: number;
  cost: number;
  /** Part of it comes from a running turn: the cost is an estimate. */
  estimated: boolean;
}

export function spent(a: Pick<Agent, 'tokens' | 'cost' | 'liveTokens' | 'liveCost'>): Spent {
  const liveTokens = a.liveTokens ?? 0;
  return { tokens: a.tokens + liveTokens, cost: a.cost + (a.liveCost ?? 0), estimated: liveTokens > 0 || (a.liveCost ?? 0) > 0 };
}

export function fSpentUsd(s: { cost: number; estimated: boolean }): string {
  return (s.estimated ? '≈ ' : '') + fUsd(s.cost);
}

export const ESTIMATE_HINT = 'Estimation (tarifs publics) pendant que Claude travaille ; coût exact à la fin du tour';
