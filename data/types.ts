export type Recommendation = 'GRADE' | 'SELL_RAW' | 'HOLD' | 'NEED_COMPS';

export type InventoryLifecycle = 'modeled' | 'submitted' | 'returned' | 'sold';

export interface GradeProbabilities {
  psa10: number;
  psa9: number;
  psa8: number;
  below8: number;
}

export interface CompPrices {
  psa10: number;
  psa9: number;
  psa8: number;
  below8: number;
}

export interface CompSamples {
  raw: number;
  psa10: number;
  psa9: number;
  psa8: number;
  below8: number;
}

export interface CompListing {
  title: string;
  price?: number | null;
  bucket: string;
  url?: string;
  itemId?: string;
}

export interface CompSnapshot {
  source: string;
  query: string;
  listingCount: number;
  prices: CompPrices;
  samples: CompSamples;
  fetchedAt?: string | null;
  raw?: number | null;
  listings?: CompListing[];
  /** asking | sold | manual | asking-haircut */
  basis?: string;
}

export interface EVInput {
  rawValue: number;
  gradingFee: number;
  shippingCost: number;
  turnaroundDays: number;
  probabilities: GradeProbabilities;
  compPrices: CompPrices;
  /** Annual opportunity-cost rate on locked capital. Default 5%. */
  capitalRate?: number;
  /** Marketplace + payment + tax drag on sale proceeds (0–1 multiplier already applied via fees). */
  marketplaceFeePct?: number;
  paymentFeePct?: number;
  taxPct?: number;
  /** Extra days assumed to sell after graded card returns. */
  daysToSell?: number;
  /** Declared value for upcharge modeling. Defaults to max PSA 10/9 comps. */
  declaredValue?: number;
  /** Tier declared-value limit before upcharge. */
  declaredValueLimit?: number;
  /** Flat upcharge added to fee when DV exceeds limit. */
  upchargeEstimate?: number;
  /** Optional Collectors Club / membership cost allocated to this card. */
  membershipCostPerCard?: number;
  /** Comp basis label for reasoning (asking / sold / haircut). */
  compBasis?: string;
}

export interface EVResult {
  expectedValue: number;
  /** Gross probability-weighted sale before sell-side fees. */
  grossExpectedValue: number;
  expectedProfit: number;
  netProfit: number;
  breakEvenGrade: string;
  breakEvenProbability: number;
  submissionCost: number;
  capitalDeployed: number;
  opportunityCost: number;
  roi: number;
  capitalRoi: number;
  annualizedRoi: number;
  recommendation: Recommendation;
  reasoning: string[];
  probabilitiesNormalized: boolean;
  insufficientComps: boolean;
  upchargeApplied: number;
  membershipCostPerCard: number;
  marketplaceFeeAmount: number;
  warnings: string[];
}

export interface PresetProfile {
  id: string;
  name: string;
  description: string;
  probabilities: GradeProbabilities;
}

export interface BatchCard {
  id: string;
  name: string;
  rawValue: number;
  probabilities: GradeProbabilities;
  profileId: string;
  compPrices: CompPrices;
  included: boolean;
}

export interface BatchSummary {
  totalCards: number;
  includedCards: number;
  totalRawValue: number;
  totalGradingCost: number;
  totalShippingCost: number;
  totalExpectedValue: number;
  totalExpectedProfit: number;
  overallROI: number;
  annualizedRoi: number;
  worthGrading: number;
  notWorthGrading: number;
}

export interface BatchCardResult extends BatchCard {
  evResult: EVResult;
}

export interface CardMetadata {
  year: string;
  player: string;
  set: string;
  cardNumber: string;
  parallel: string;
}

export interface ConditionReport {
  centering: string;
  corners: string;
  surfaceNotes: string;
}

export interface VisionGradeProbabilities {
  psa10Percent: number;
  psa9Percent: number;
  psa8Percent: number;
}

export interface CardAnalysisResult {
  filename: string;
  ok: boolean;
  error?: string | null;
  metadata?: CardMetadata | null;
  conditionReport?: ConditionReport | null;
  gradeProbabilities?: VisionGradeProbabilities | null;
  estimatedRawValue?: number | null;
  expectedValue?: number | null;
  expectedProfit?: number | null;
  likelyGrade?: string | null;
  gradeRange?: string | null;
  recommendation?: Recommendation | string | null;
  reasoning: string[];
  evResult?: EVResult | null;
  imageUri?: string;
  inventoryId?: string;
  comps?: CompSnapshot | null;
}

export interface InventoryCard {
  id: string;
  scannedAt: number;
  name: string;
  filename: string;
  ok: boolean;
  error?: string | null;
  imageUri?: string;
  metadata?: CardMetadata | null;
  conditionReport?: ConditionReport | null;
  gradeProbabilities?: VisionGradeProbabilities | null;
  estimatedRawValue?: number | null;
  expectedValue?: number | null;
  expectedProfit?: number | null;
  likelyGrade?: string | null;
  gradeRange?: string | null;
  recommendation?: Recommendation | string | null;
  reasoning: string[];
  evResult?: EVResult | null;
  comps?: CompSnapshot | null;
  lifecycle?: InventoryLifecycle;
  submittedAt?: number | null;
  returnedGrade?: string | null;
  soldPrice?: number | null;
  predictedEvAtDecide?: number | null;
}

export interface AnalyzeBatchResponse {
  results: CardAnalysisResult[];
  analyzed: number;
  failed: number;
}

export interface AnalyzeBatchOptions {
  gradingFee: number;
  shippingCost: number;
  turnaroundDays: number;
  rawValue: number;
  psa10Comp: number;
  psa9Comp: number;
  psa8Comp: number;
  below8Comp: number;
}

export interface DecideHistoryEntry {
  id: string;
  savedAt: number;
  cardName: string;
  recommendation: Recommendation | string;
  expectedValue: number;
  expectedProfit: number;
  rawValue: number;
  gradingFee: number;
  comps: CompPrices;
}
