/**
 * GradeDecision Pro expected-value engine.
 *
 * Models the incremental decision: grade now vs sell raw today.
 * Keep in sync with backend/app/services/ev_calculator.py
 */

import type {
  BatchCard,
  BatchCardResult,
  BatchSummary,
  CompPrices,
  EVInput,
  EVResult,
  GradeProbabilities,
  Recommendation,
} from './types';

export const DEFAULT_CAPITAL_RATE = 0.05;
export const GRADE_HURDLE_PROBABILITY = 40;
export const GRADE_HURDLE_ANNUALIZED_ROI = 15;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function sumProbabilities(p: GradeProbabilities): number {
  return p.psa10 + p.psa9 + p.psa8 + p.below8;
}

export function normalizeProbabilities(p: GradeProbabilities): {
  weights: GradeProbabilities;
  didNormalize: boolean;
} {
  const total = sumProbabilities(p);
  if (total <= 0) {
    return {
      weights: { psa10: 0, psa9: 0, psa8: 0, below8: 0 },
      didNormalize: false,
    };
  }
  return {
    weights: {
      psa10: p.psa10 / total,
      psa9: p.psa9 / total,
      psa8: p.psa8 / total,
      below8: p.below8 / total,
    },
    didNormalize: Math.abs(total - 100) > 0.5,
  };
}

/** Shift gem-rate by `variancePts` percentage points (pessimistic negative, optimistic positive). */
export function applyGradeVariance(
  probs: GradeProbabilities,
  variancePts: number,
): GradeProbabilities {
  let { psa10, psa9, psa8, below8 } = probs;
  if (!variancePts) return { psa10, psa9, psa8, below8 };

  if (variancePts > 0) {
    let need = variancePts;
    const fromBelow = Math.min(need, below8);
    below8 -= fromBelow;
    psa10 += fromBelow;
    need -= fromBelow;
    const from8 = Math.min(need, psa8);
    psa8 -= from8;
    psa10 += from8;
    need -= from8;
    const from9 = Math.min(need, psa9);
    psa9 -= from9;
    psa10 += from9;
  } else {
    const shift = Math.min(-variancePts, psa10);
    psa10 -= shift;
    psa9 += shift;
  }
  return { psa10, psa9, psa8, below8 };
}

function breakEvenGrade(comps: CompPrices, threshold: number): string {
  if (comps.below8 >= threshold) return 'PSA 7 or below';
  if (comps.psa8 >= threshold) return 'PSA 8';
  if (comps.psa9 >= threshold) return 'PSA 9';
  if (comps.psa10 >= threshold) return 'PSA 10';
  return 'None';
}

function breakEvenProbability(grade: string, w: GradeProbabilities): number {
  if (grade === 'None') return 0;
  if (grade === 'PSA 10') return w.psa10 * 100;
  if (grade === 'PSA 9') return (w.psa10 + w.psa9) * 100;
  if (grade === 'PSA 8') return (w.psa10 + w.psa9 + w.psa8) * 100;
  return 100;
}

function recommend(args: {
  profit: number;
  netProfit: number;
  beGrade: string;
  beProb: number;
  annualizedRoi: number;
}): Recommendation {
  if (args.profit <= 0 || args.beGrade === 'None') return 'SELL_RAW';
  if (
    args.netProfit > 0 &&
    args.beProb >= GRADE_HURDLE_PROBABILITY &&
    args.annualizedRoi >= GRADE_HURDLE_ANNUALIZED_ROI
  ) {
    return 'GRADE';
  }
  return 'HOLD';
}

function buildReasoning(args: {
  recommendation: Recommendation;
  expectedValue: number;
  rawValue: number;
  profit: number;
  netProfit: number;
  cost: number;
  beGrade: string;
  beProb: number;
  roi: number;
  annualizedRoi: number;
  days: number;
  capital: number;
  opportunityCost: number;
}): string[] {
  const {
    recommendation,
    expectedValue,
    rawValue,
    profit,
    netProfit,
    cost,
    beGrade,
    beProb,
    roi,
    annualizedRoi,
    days,
    capital,
    opportunityCost,
  } = args;

  if (recommendation === 'GRADE') {
    const lift = rawValue > 0 ? ((expectedValue - rawValue) / rawValue) * 100 : 0;
    return [
      `Expected graded sale of $${expectedValue.toFixed(0)} beats raw $${rawValue.toFixed(0)} by ${lift.toFixed(0)}% before costs.`,
      `Break-even is ${beGrade} (need ≥ $${(rawValue + cost).toFixed(0)} after $${cost.toFixed(0)} in fees). Probability of getting there: ${beProb.toFixed(0)}%.`,
      `Time-adjusted annualized return on $${capital.toFixed(0)} locked for ${days.toFixed(0)} days is ${annualizedRoi.toFixed(0)}% (ROI on fees ${roi.toFixed(0)}%).`,
    ];
  }

  if (recommendation === 'HOLD') {
    return [
      `Expected profit of $${profit.toFixed(0)} is positive, but the case is thin after time and risk.`,
      beGrade === 'None'
        ? 'Even a PSA 10 does not cover raw value plus grading costs at current comps.'
        : `Break-even is ${beGrade} at ${beProb.toFixed(0)}% odds — not a high-confidence submit.`,
      `$${capital.toFixed(0)} would be locked for ${days.toFixed(0)} days (≈$${opportunityCost.toFixed(2)} opportunity cost). Wait for stronger comps or a cheaper/faster service.`,
    ];
  }

  return [
    `Expected graded sale of $${expectedValue.toFixed(0)} does not cover raw $${rawValue.toFixed(0)} plus $${cost.toFixed(0)} in grading costs (expected ${profit >= 0 ? '+' : ''}$${profit.toFixed(0)}).`,
    beGrade === 'None'
      ? 'Even a PSA 10 comp is below break-even. Selling raw preserves capital.'
      : `You would need ${beGrade} or better (${beProb.toFixed(0)}% odds) just to break even.`,
    `Selling raw avoids a ${days.toFixed(0)}-day lockup of $${capital.toFixed(0)}.`,
  ];
}

export function calculateEV(input: EVInput): EVResult {
  const rawValue = Math.max(0, input.rawValue);
  const gradingFee = Math.max(0, input.gradingFee);
  const shippingCost = Math.max(0, input.shippingCost);
  const turnaroundDays = Math.max(input.turnaroundDays, 1);
  const capitalRate = input.capitalRate ?? DEFAULT_CAPITAL_RATE;

  const { weights, didNormalize } = normalizeProbabilities(input.probabilities);
  const comps = input.compPrices;

  const expectedValue =
    weights.psa10 * comps.psa10 +
    weights.psa9 * comps.psa9 +
    weights.psa8 * comps.psa8 +
    weights.below8 * comps.below8;

  const submissionCost = gradingFee + shippingCost;
  const expectedProfit = expectedValue - rawValue - submissionCost;
  const capitalDeployed = rawValue + submissionCost;
  const opportunityCost = capitalDeployed * capitalRate * (turnaroundDays / 365);
  const netProfit = expectedProfit - opportunityCost;

  const beGrade = breakEvenGrade(comps, rawValue + submissionCost);
  const beProb = breakEvenProbability(beGrade, weights);

  const roi = submissionCost > 0 ? (expectedProfit / submissionCost) * 100 : 0;
  const capitalRoi = capitalDeployed > 0 ? (expectedProfit / capitalDeployed) * 100 : 0;
  const annualizedRoi = capitalRoi * (365 / turnaroundDays);

  const recommendation = recommend({
    profit: expectedProfit,
    netProfit,
    beGrade,
    beProb,
    annualizedRoi,
  });

  return {
    expectedValue: round2(expectedValue),
    expectedProfit: round2(expectedProfit),
    netProfit: round2(netProfit),
    breakEvenGrade: beGrade,
    breakEvenProbability: round2(beProb),
    submissionCost: round2(submissionCost),
    capitalDeployed: round2(capitalDeployed),
    opportunityCost: round2(opportunityCost),
    roi: round2(roi),
    capitalRoi: round2(capitalRoi),
    annualizedRoi: round2(annualizedRoi),
    recommendation,
    reasoning: buildReasoning({
      recommendation,
      expectedValue: round2(expectedValue),
      rawValue,
      profit: round2(expectedProfit),
      netProfit: round2(netProfit),
      cost: round2(submissionCost),
      beGrade,
      beProb: round2(beProb),
      roi: round2(roi),
      annualizedRoi: round2(annualizedRoi),
      days: turnaroundDays,
      capital: round2(capitalDeployed),
      opportunityCost: round2(opportunityCost),
    }),
    probabilitiesNormalized: didNormalize,
  };
}

export function calculateBatchEV(input: {
  cards: BatchCard[];
  gradingFee: number;
  shippingCost: number;
  turnaroundDays: number;
  capitalRate?: number;
}): { cards: BatchCardResult[]; summary: BatchSummary } {
  const included = input.cards.filter((c) => c.included);
  const n = included.length;
  const perCardShipping = n > 0 ? input.shippingCost / n : 0;

  const cards: BatchCardResult[] = input.cards.map((card) => ({
    ...card,
    evResult: calculateEV({
      rawValue: card.rawValue,
      gradingFee: input.gradingFee,
      shippingCost: card.included ? perCardShipping : 0,
      turnaroundDays: input.turnaroundDays,
      probabilities: card.probabilities,
      compPrices: card.compPrices,
      capitalRate: input.capitalRate,
    }),
  }));

  const includedResults = cards.filter((c) => c.included);
  const totalRaw = includedResults.reduce((s, c) => s + c.rawValue, 0);
  const totalGrading = n * input.gradingFee;
  const totalShipping = n > 0 ? input.shippingCost : 0;
  const totalEv = includedResults.reduce((s, c) => s + c.evResult.expectedValue, 0);
  const totalProfit = totalEv - totalRaw - totalGrading - totalShipping;
  const totalCost = totalGrading + totalShipping;
  const overallROI = totalCost > 0 ? (totalProfit / totalCost) * 100 : 0;
  const capital = totalRaw + totalCost;
  const days = Math.max(input.turnaroundDays, 1);
  const capitalRoi = capital > 0 ? (totalProfit / capital) * 100 : 0;
  const annualizedRoi = capitalRoi * (365 / days);
  const worth = cards.filter((c) => c.evResult.recommendation === 'GRADE').length;

  return {
    cards,
    summary: {
      totalCards: cards.length,
      includedCards: n,
      totalRawValue: round2(totalRaw),
      totalGradingCost: round2(totalGrading + totalShipping),
      totalShippingCost: round2(totalShipping),
      totalExpectedValue: round2(totalEv),
      totalExpectedProfit: round2(totalProfit),
      overallROI: round2(overallROI),
      annualizedRoi: round2(annualizedRoi),
      worthGrading: worth,
      notWorthGrading: cards.length - worth,
    },
  };
}

export function applyPriceDrop(comps: CompPrices, dropPct: number): CompPrices {
  const m = 1 - Math.max(0, Math.min(dropPct, 100)) / 100;
  return {
    psa10: comps.psa10 * m,
    psa9: comps.psa9 * m,
    psa8: comps.psa8 * m,
    below8: comps.below8 * m,
  };
}
