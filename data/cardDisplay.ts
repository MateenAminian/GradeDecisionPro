import type { CardAnalysisResult, CardMetadata, InventoryCard } from '@/data/types';

export function analysisTitle(result: {
  metadata?: CardMetadata | null;
  filename?: string;
  name?: string;
}): string {
  const meta = result.metadata;
  const label = [meta?.year, meta?.player, meta?.set, meta?.parallel, meta?.cardNumber]
    .filter(Boolean)
    .join(' ')
    .trim();
  return label || result.name || result.filename || 'Card';
}

export function gradeHeadline(card: Pick<InventoryCard, 'likelyGrade' | 'gradeRange'> | Pick<CardAnalysisResult, 'likelyGrade' | 'gradeRange'>): string {
  const likely = card.likelyGrade || '';
  const range = card.gradeRange || '';
  if (likely && range && range !== likely) return `${likely} · ${range}`;
  return likely || range || 'Grade pending';
}
