/** Sell-side friction assumptions for net-proceeds EV. */

export const DEFAULT_MARKETPLACE_FEE_PCT = 13;
export const DEFAULT_PAYMENT_FEE_PCT = 0;
export const DEFAULT_TAX_PCT = 0;
/** Discount applied to asking comps when treating them as a sold proxy. */
export const DEFAULT_ASKING_HAIRCUT_PCT = 10;
/** Assumed days to sell a graded card after return (liquidity). */
export const DEFAULT_DAYS_TO_SELL = 30;

export function netProceedsMultiplier(args: {
  marketplaceFeePct: number;
  paymentFeePct?: number;
  taxPct?: number;
}): number {
  const m = Math.max(0, args.marketplaceFeePct) / 100;
  const p = Math.max(0, args.paymentFeePct ?? 0) / 100;
  const t = Math.max(0, args.taxPct ?? 0) / 100;
  return Math.max(0, 1 - m - p - t);
}

export function applyAskingHaircut(price: number, haircutPct: number): number {
  const h = Math.max(0, Math.min(100, haircutPct)) / 100;
  return price * (1 - h);
}
