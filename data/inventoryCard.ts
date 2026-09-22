import type { CardMetadata, CompPrices, CompSnapshot, CompSnapshotPrices, GradeProbabilities, InventoryCard, VisionGradeProbabilities } from '@/data/types';
import { calculateEV } from '@/data/evCalculator';
import { analysisTitle } from '@/data/cardDisplay';

/** Empty comps — never seed the UI with fake sample prices. */
export const PLACEHOLDER_COMPS: CompPrices = {
  psa10: 0,
  psa9: 0,
  psa8: 0,
  below8: 0,
};

export function emptyMetadata(): CardMetadata {
  return { year: '', player: '', set: '', cardNumber: '', parallel: '' };
}

export function metadataFromLabel(label: string): CardMetadata {
  const trimmed = label.trim();
  const match = trimmed.match(/^(\d{4}(?:-\d{2})?)\s+(.+)$/);
  if (match) {
    return { ...emptyMetadata(), year: match[1], player: match[2] };
  }
  return { ...emptyMetadata(), player: trimmed };
}

export function visionToEngineProbs(gp?: VisionGradeProbabilities | null): GradeProbabilities {
  const psa10 = gp?.psa10Percent ?? 0;
  const psa9 = gp?.psa9Percent ?? 0;
  const psa8 = gp?.psa8Percent ?? 0;
  const total = psa10 + psa9 + psa8;
  return {
    psa10,
    psa9,
    psa8,
    below8: total > 100.5 ? 0 : Math.max(0, 100 - total),
  };
}

export function snapshotPricesForModeling(prices?: CompSnapshotPrices | null): CompPrices {
  return {
    psa10: prices?.psa10 ?? 0,
    psa9: prices?.psa9 ?? 0,
    psa8: prices?.psa8 ?? 0,
    below8: prices?.below8 ?? 0,
  };
}

export function engineToVisionProbs(p: GradeProbabilities): VisionGradeProbabilities {
  return {
    psa10Percent: p.psa10,
    psa9Percent: p.psa9,
    psa8Percent: p.psa8,
  };
}

function likelyFromProbs(p: GradeProbabilities): { likelyGrade: string; gradeRange: string } {
  const scored = [
    ['PSA 10', p.psa10],
    ['PSA 9', p.psa9],
    ['PSA 8', p.psa8],
  ] as const;
  const sorted = [...scored].sort((a, b) => b[1] - a[1]);
  const likely = sorted[0][1] > 0 ? sorted[0][0] : 'Unknown';
  return { likelyGrade: likely, gradeRange: likely };
}

function compNotes(snapshot: CompSnapshot): string[] {
  const notes: string[] = [];
  if (snapshot.basis === 'sold' || snapshot.source.startsWith('cardsight')) {
    notes.push(
      `Prices are CardSight sold-auction medians (${snapshot.listingCount} sales${snapshot.period ? `, ${snapshot.period}` : ''}).`,
    );
    if (snapshot.fallbackReason) {
      notes.push(snapshot.fallbackReason);
    }
  }
  if (snapshot.source.startsWith('ebay')) {
    notes.push(
      `Prices are median live eBay asking prices (${snapshot.listingCount} listings). Not sold comps.`,
    );
    const missing = (
      [
        ['PSA 10', snapshot.samples.psa10],
        ['PSA 9', snapshot.samples.psa9],
        ['PSA 8', snapshot.samples.psa8],
        ['below 8', snapshot.samples.below8],
      ] as const
    )
      .filter(([, count]) => count <= 0)
      .map(([label]) => label);
    if (missing.length) {
      notes.push('Fallback Decide comps used for: ' + missing.join(', ') + '.');
    }
  }
  if (snapshot.source === 'manual' || snapshot.source.endsWith('-edited')) {
    notes.push('Comp prices were edited for modeling.');
  }
  return notes;
}

export function rebuildInventoryCard(
  card: InventoryCard,
  patch: {
    metadata?: CardMetadata | null;
    comps?: CompSnapshot | null;
    estimatedRawValue?: number | null;
    gradingFee: number;
    shippingCost: number;
    turnaroundDays: number;
  },
): InventoryCard {
  const metadata = patch.metadata !== undefined ? patch.metadata : card.metadata;
  const comps = patch.comps !== undefined ? patch.comps : card.comps;
  const estimatedRawValue =
    patch.estimatedRawValue !== undefined ? patch.estimatedRawValue : card.estimatedRawValue;
  const rawValue = estimatedRawValue && estimatedRawValue > 0 ? estimatedRawValue : 0;
  const prices = snapshotPricesForModeling(comps?.prices);
  const ev = calculateEV({
    rawValue,
    gradingFee: patch.gradingFee,
    shippingCost: patch.shippingCost,
    turnaroundDays: Math.max(patch.turnaroundDays, 1),
    probabilities: visionToEngineProbs(card.gradeProbabilities),
    compPrices: prices,
  });
  return {
    ...card,
    metadata,
    name: analysisTitle({ ...card, metadata }),
    estimatedRawValue,
    expectedValue: ev.expectedValue,
    expectedProfit: ev.expectedProfit,
    recommendation: ev.recommendation,
    evResult: ev,
    comps,
    reasoning: [...(comps ? compNotes(comps) : []), ...ev.reasoning],
  };
}

export function createManualInventoryCard(input: {
  metadata: CardMetadata;
  rawValue: number;
  probabilities: GradeProbabilities;
  compPrices: CompPrices;
  gradingFee: number;
  shippingCost: number;
  turnaroundDays: number;
}): InventoryCard {
  const { likelyGrade, gradeRange } = likelyFromProbs(input.probabilities);
  const stub: InventoryCard = {
    id: `inv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    scannedAt: Date.now(),
    name: analysisTitle({ metadata: input.metadata }),
    filename: 'manual',
    ok: true,
    metadata: input.metadata,
    gradeProbabilities: engineToVisionProbs(input.probabilities),
    estimatedRawValue: input.rawValue,
    likelyGrade,
    gradeRange,
    reasoning: [],
    comps: {
      source: 'manual',
      query: '',
      listingCount: 0,
      prices: input.compPrices,
      samples: { raw: 0, psa10: 0, psa9: 0, psa8: 0, below8: 0 },
      listings: [],
    },
  };
  return rebuildInventoryCard(stub, {
    gradingFee: input.gradingFee,
    shippingCost: input.shippingCost,
    turnaroundDays: input.turnaroundDays,
  });
}
