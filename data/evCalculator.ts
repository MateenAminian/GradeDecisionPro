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
import { hasUsableComps } from './validation';
import { netProceedsMultiplier } from './marketplace';

export const DEFAULT_CAPITAL_RATE = 0.05;
export const GRADE_HURDLE_PROBABILITY = 40;
export const GRADE_HURDLE_ANNUALIZED_ROI = 15;

export const BREAK_EVEN_NEED_COMPS = 'Need comps';
export const BREAK_EVEN_NO_GRADE = 'No grade';

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

function breakEvenGrade(comps: CompPrices, threshold: number, usable: boolean): string {
  if (!usable) return BREAK_EVEN_NEED_COMPS;
  if (comps.below8 >= threshold) return 'PSA 7 or below';
  if (comps.psa8 >= threshold) return 'PSA 8';
  if (comps.psa9 >= threshold) return 'PSA 9';
  if (comps.psa10 >= threshold) return 'PSA 10';
  return BREAK_EVEN_NO_GRADE;
}

function breakEvenProbability(grade: string, w: GradeProbabilities): number {
  if (grade === BREAK_EVEN_NEED_COMPS || grade === BREAK_EVEN_NO_GRADE) return 0;
  if (grade === 'PSA 10') return w.psa10 * 100;
  if (grade === 'PSA 9') return (w.psa10 + w.psa9) * 100;
  if (grade === 'PSA 8') return (w.psa10 + w.psa9 + w.psa8) * 100;
  return 100;
}

function recommend(args: {
  insufficientComps: boolean;
  profit: number;
  netProfit: number;
  beGrade: string;
  beProb: number;
  annualizedRoi: number;
}): Recommendation {
  if (args.insufficientComps) return 'NEED_COMPS';
  if (args.profit <= 0 || args.beGrade === BREAK_EVEN_NO_GRADE) return 'SELL_RAW';
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
  grossExpectedValue: number;
  rawValue: number;
  profit: number;
  cost: number;
  beGrade: string;
  beProb: number;
  roi: number;
  annualizedRoi: number;
  days: number;
  capital: number;
  opportunityCost: number;
  marketplaceFeeAmount: number;
  upchargeApplied: number;
  comps: CompPrices;
  compBasis?: string;
  daysToSell: number;
}): string[] {
  const {
    recommendation,
    expectedValue,
    grossExpectedValue,
    rawValue,
    profit,
    cost,
    beGrade,
    beProb,
    roi,
    annualizedRoi,
    days,
    capital,
    opportunityCost,
    marketplaceFeeAmount,
    upchargeApplied,
    comps,
    compBasis,
    daysToSell,
  } = args;

  if (recommendation === 'NEED_COMPS') {
    return [
      'Add PSA 10 / 9 / 8 (and below-8) comps before trusting a grade recommendation.',
      'Live eBay scan results are asking prices, not sold comps — prefer sold when you have them.',
      'Until comps are set, Decide stays in an incomplete state instead of guessing.',
    ];
  }

  const basisNote =
    compBasis === 'asking' || compBasis === 'asking-haircut'
      ? `Comps are ${compBasis === 'asking-haircut' ? 'asking prices with a sold haircut' : 'live asking prices'} — sold comps are safer for go/no-go.`
      : compBasis === 'sold'
        ? 'Comps are marked as sold market — better for EV than asking listings.'
        : null;

  const feeNote =
    marketplaceFeeAmount > 0
      ? `Net proceeds after ~$${marketplaceFeeAmount.toFixed(0)} estimated sell-side fees.`
      : null;
  const upchargeNote =
    upchargeApplied > 0
      ? `Declared-value upcharge of $${upchargeApplied.toFixed(0)} was added to submission cost.`
      : null;
  const liquidityNote =
    daysToSell >= 45 && comps.psa10 > 0
      ? `Modeled ${daysToSell} days to sell after return — thin liquidity can erase paper EV.`
      : null;

  if (recommendation === 'GRADE') {
    const lift = rawValue > 0 ? ((expectedValue - rawValue) / rawValue) * 100 : 0;
    return [
      `Expected net graded sale of $${expectedValue.toFixed(0)} (gross $${grossExpectedValue.toFixed(0)}) beats raw $${rawValue.toFixed(0)} by ${lift.toFixed(0)}% before grading costs.`,
      `Break-even is ${beGrade} (need ≥ $${(rawValue + cost).toFixed(0)} after $${cost.toFixed(0)} in fees). Probability of getting there: ${beProb.toFixed(0)}%.`,
      `Time-adjusted annualized return on $${capital.toFixed(0)} locked for ${days.toFixed(0)} days is ${annualizedRoi.toFixed(0)}% (ROI on fees ${roi.toFixed(0)}%).`,
      basisNote,
      feeNote,
      upchargeNote,
      liquidityNote,
    ].filter(Boolean) as string[];
  }

  if (recommendation === 'HOLD') {
    const beLine =
      beGrade === BREAK_EVEN_NO_GRADE
        ? comps.psa10 > 0
          ? 'Even a PSA 10 does not cover raw value plus grading costs at current comps.'
          : 'No entered grade comp clears break-even yet — add stronger comps or cut fees.'
        : `Break-even is ${beGrade} at ${beProb.toFixed(0)}% odds — not a high-confidence submit.`;
    return [
      `Expected profit of $${profit.toFixed(0)} is positive, but the case is thin after time and risk.`,
      beLine,
      `$${capital.toFixed(0)} would be locked for ${days.toFixed(0)} days (≈$${opportunityCost.toFixed(2)} opportunity cost). Wait for stronger comps or a cheaper/faster service.`,
      basisNote,
      feeNote,
      upchargeNote,
      liquidityNote,
    ].filter(Boolean) as string[];
  }

  // SELL_RAW
  const beLine =
    beGrade === BREAK_EVEN_NO_GRADE
      ? comps.psa10 > 0
        ? 'Even a PSA 10 comp is below break-even. Selling raw preserves capital.'
        : 'No grade comp clears break-even at current inputs. Selling raw preserves capital.'
      : `You would need ${beGrade} or better (${beProb.toFixed(0)}% odds) just to break even.`;

  return [
    `Expected net graded sale of $${expectedValue.toFixed(0)} does not cover raw $${rawValue.toFixed(0)} plus $${cost.toFixed(0)} in grading costs (expected ${profit >= 0 ? '+' : ''}$${profit.toFixed(0)}).`,
    beLine,
    `Selling raw avoids a ${days.toFixed(0)}-day lockup of $${capital.toFixed(0)}.`,
    basisNote,
    feeNote,
    upchargeNote,
    liquidityNote,
  ].filter(Boolean) as string[];
}

export function calculateEV(input: EVInput): EVResult {
  const rawValue = Math.max(0, input.rawValue);
  const shippingCost = Math.max(0, input.shippingCost);
  const turnaroundDays = Math.max(input.turnaroundDays, 1);
  const daysToSell = Math.max(0, input.daysToSell ?? 0);
  const capitalRate = input.capitalRate ?? DEFAULT_CAPITAL_RATE;
  const comps = input.compPrices;
  const usable = hasUsableComps(comps);

  const declaredValue =
    input.declaredValue && input.declaredValue > 0
      ? input.declaredValue
      : Math.max(comps.psa10, comps.psa9, comps.psa8, 0);
  const dvLimit = input.declaredValueLimit ?? Infinity;
  const upchargeEstimate = input.upchargeEstimate ?? 0;
  const upchargeApplied = declaredValue > dvLimit && upchargeEstimate > 0 ? upchargeEstimate : 0;

  const gradingFee = Math.max(0, input.gradingFee) + upchargeApplied;

  const { weights, didNormalize } = normalizeProbabilities(input.probabilities);

  const grossExpectedValue =
    weights.psa10 * comps.psa10 +
    weights.psa9 * comps.psa9 +
    weights.psa8 * comps.psa8 +
    weights.below8 * comps.below8;

  const proceedsMult = netProceedsMultiplier({
    marketplaceFeePct: input.marketplaceFeePct ?? 0,
    paymentFeePct: input.paymentFeePct ?? 0,
    taxPct: input.taxPct ?? 0,
  });
  const expectedValue = grossExpectedValue * proceedsMult;
  const marketplaceFeeAmount = grossExpectedValue - expectedValue;

  const submissionCost = gradingFee + shippingCost;
  const expectedProfit = expectedValue - rawValue - submissionCost;
  const capitalDeployed = rawValue + submissionCost;
  const lockedDays = turnaroundDays + daysToSell;
  const opportunityCost = capitalDeployed * capitalRate * (lockedDays / 365);
  const netProfit = expectedProfit - opportunityCost;

  const beGrade = breakEvenGrade(comps, rawValue + submissionCost, usable);
  const beProb = breakEvenProbability(beGrade, weights);

  const roi = submissionCost > 0 ? (expectedProfit / submissionCost) * 100 : 0;
  const capitalRoi = capitalDeployed > 0 ? (expectedProfit / capitalDeployed) * 100 : 0;
  const annualizedRoi = capitalRoi * (365 / lockedDays);

  const recommendation = recommend({
    insufficientComps: !usable,
    profit: expectedProfit,
    netProfit,
    beGrade,
    beProb,
    annualizedRoi,
  });

  const warnings: string[] = [];
  if (!usable) warnings.push('Enter comps to unlock a GRADE / SELL RAW / HOLD call.');
  if (upchargeApplied > 0) {
    warnings.push(
      `Modeled declared value $${declaredValue.toFixed(0)} exceeds the tier limit ($${dvLimit}) — added $${upchargeApplied} upcharge.`,
    );
  }
  if ((input.marketplaceFeePct ?? 0) <= 0 && usable) {
    warnings.push('Marketplace fees are off — EV uses gross comps.');
  }
  if (comps.psa10 > 500 && (weights.psa10 * 100) >= 50) {
    warnings.push('High modeled PSA 10 rate into a rich gem market — check pop/liquidity before submitting.');
  }

  return {
    expectedValue: round2(expectedValue),
    grossExpectedValue: round2(grossExpectedValue),
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
      grossExpectedValue: round2(grossExpectedValue),
      rawValue,
      profit: round2(expectedProfit),
      cost: round2(submissionCost),
      beGrade,
      beProb: round2(beProb),
      roi: round2(roi),
      annualizedRoi: round2(annualizedRoi),
      days: lockedDays,
      capital: round2(capitalDeployed),
      opportunityCost: round2(opportunityCost),
      marketplaceFeeAmount: round2(marketplaceFeeAmount),
      upchargeApplied,
      comps,
      compBasis: input.compBasis,
      daysToSell,
    }),
    probabilitiesNormalized: didNormalize,
    insufficientComps: !usable,
    upchargeApplied,
    marketplaceFeeAmount: round2(marketplaceFeeAmount),
    warnings,
  };
}

export function calculateBatchEV(input: {
  cards: BatchCard[];
  gradingFee: number;
  shippingCost: number;
  turnaroundDays: number;
  capitalRate?: number;
  marketplaceFeePct?: number;
  paymentFeePct?: number;
  taxPct?: number;
  daysToSell?: number;
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
      marketplaceFeePct: input.marketplaceFeePct,
      paymentFeePct: input.paymentFeePct,
      taxPct: input.taxPct,
      daysToSell: input.daysToSell,
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
  const days = Math.max(input.turnaroundDays, 1) + Math.max(0, input.daysToSell ?? 0);
  const capitalRoi = capital > 0 ? (totalProfit / capital) * 100 : 0;
  const annualizedRoi = capitalRoi * (365 / days);
  // Badges track the included set so toggles update immediately (#10).
  const worth = includedResults.filter((c) => c.evResult.recommendation === 'GRADE').length;

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
      notWorthGrading: n - worth,
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
