/** Service tiers and alternate graders — fee/TAT assumptions for Decide. */

export type GraderId = 'psa' | 'cgc' | 'sgc';

export interface ServiceTier {
  id: string;
  graderId: GraderId;
  name: string;
  fee: number;
  turnaroundDays: number;
  /** Declared-value ceiling before upcharges typically apply (USD). */
  declaredValueLimit: number;
  /** Extra fee when modeled DV exceeds the limit (flat estimate). */
  upchargeEstimate: number;
  notes?: string;
}

/** Last verified against public PSA/CGC/SGC pricing pages. */
export const FEE_ASSUMPTIONS_AS_OF = '2026-09-21';

export const SERVICE_TIERS: ServiceTier[] = [
  {
    id: 'psa-value',
    graderId: 'psa',
    name: 'PSA Value',
    fee: 24.99,
    turnaroundDays: 150,
    declaredValueLimit: 499,
    upchargeEstimate: 50,
    notes: 'Often paused / backlog — verify before submit.',
  },
  {
    id: 'psa-standard',
    graderId: 'psa',
    name: 'PSA Standard',
    fee: 59.99,
    turnaroundDays: 90,
    declaredValueLimit: 499,
    upchargeEstimate: 75,
  },
  {
    id: 'psa-express',
    graderId: 'psa',
    name: 'PSA Express',
    fee: 149,
    turnaroundDays: 20,
    declaredValueLimit: 2499,
    upchargeEstimate: 100,
  },
  {
    id: 'cgc-modern',
    graderId: 'cgc',
    name: 'CGC Modern',
    fee: 20,
    turnaroundDays: 40,
    declaredValueLimit: 400,
    upchargeEstimate: 40,
  },
  {
    id: 'cgc-standard',
    graderId: 'cgc',
    name: 'CGC Standard',
    fee: 50,
    turnaroundDays: 30,
    declaredValueLimit: 1000,
    upchargeEstimate: 60,
  },
  {
    id: 'sgc-economy',
    graderId: 'sgc',
    name: 'SGC Economy',
    fee: 15,
    turnaroundDays: 60,
    declaredValueLimit: 500,
    upchargeEstimate: 35,
  },
  {
    id: 'sgc-regular',
    graderId: 'sgc',
    name: 'SGC Regular',
    fee: 25,
    turnaroundDays: 30,
    declaredValueLimit: 1500,
    upchargeEstimate: 50,
  },
];

export const DEFAULT_TIER_ID = 'psa-standard';

export function getTier(id: string | undefined | null): ServiceTier {
  return SERVICE_TIERS.find((t) => t.id === id) ?? SERVICE_TIERS.find((t) => t.id === DEFAULT_TIER_ID)!;
}

export const GRADER_LABELS: Record<GraderId, string> = {
  psa: 'PSA',
  cgc: 'CGC',
  sgc: 'SGC',
};
