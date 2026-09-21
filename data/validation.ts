import type { CompPrices } from '@/data/types';

export interface FieldWarning {
  field: string;
  message: string;
}

export function validateDecideInputs(args: {
  rawValue: number;
  gradingFee: number;
  shippingCost: number;
  turnaroundDays: number;
  comps: CompPrices;
}): FieldWarning[] {
  const warnings: FieldWarning[] = [];
  if (args.rawValue < 0) warnings.push({ field: 'rawValue', message: 'Raw value cannot be negative.' });
  if (args.gradingFee < 0) warnings.push({ field: 'gradingFee', message: 'Grading fee cannot be negative.' });
  if (args.shippingCost < 0) warnings.push({ field: 'shippingCost', message: 'Shipping cannot be negative.' });
  if (args.turnaroundDays < 1) {
    warnings.push({ field: 'turnaroundDays', message: 'Turnaround must be at least 1 day.' });
  }
  if (args.turnaroundDays > 400) {
    warnings.push({ field: 'turnaroundDays', message: 'Turnaround over 400 days looks unrealistic — check the tier.' });
  }

  const { psa10, psa9, psa8, below8 } = args.comps;
  for (const [field, value] of [
    ['psa10', psa10],
    ['psa9', psa9],
    ['psa8', psa8],
    ['below8', below8],
  ] as const) {
    if (value < 0) warnings.push({ field, message: 'Comp prices cannot be negative.' });
  }

  if (psa10 > 0 && psa9 > 0 && psa10 < psa9) {
    warnings.push({ field: 'psa10', message: 'PSA 10 comp is below PSA 9 — check for inverted comps.' });
  }
  if (psa9 > 0 && psa8 > 0 && psa9 < psa8) {
    warnings.push({ field: 'psa9', message: 'PSA 9 comp is below PSA 8 — check for inverted comps.' });
  }
  if (args.rawValue > 0 && psa10 > 0 && psa10 < args.rawValue) {
    warnings.push({
      field: 'psa10',
      message: 'PSA 10 comp is below raw value — grading rarely makes sense at these numbers.',
    });
  }

  return warnings;
}

export function hasUsableComps(comps: CompPrices): boolean {
  return comps.psa10 > 0 || comps.psa9 > 0 || comps.psa8 > 0 || comps.below8 > 0;
}
