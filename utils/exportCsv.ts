import { Platform } from 'react-native';
import type { BatchCardResult, InventoryCard } from '@/data/types';

function downloadCsv(filename: string, csv: string) {
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }
  // Native: best-effort console / share via clipboard isn't wired — web is primary export path.
  console.log(csv);
}

function escapeCell(value: string | number | null | undefined): string {
  const s = value == null ? '' : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function exportInventoryCsv(cards: InventoryCard[]) {
  const header = [
    'name',
    'recommendation',
    'expectedValue',
    'expectedProfit',
    'raw',
    'likelyGrade',
    'lifecycle',
    'returnedGrade',
    'soldPrice',
    'predictedEv',
    'compSource',
  ];
  const rows = cards.map((c) =>
    [
      c.name,
      c.recommendation ?? '',
      c.expectedValue ?? '',
      c.expectedProfit ?? '',
      c.estimatedRawValue ?? '',
      c.likelyGrade ?? '',
      c.lifecycle ?? 'modeled',
      c.returnedGrade ?? '',
      c.soldPrice ?? '',
      c.predictedEvAtDecide ?? '',
      c.comps?.basis || c.comps?.source || '',
    ]
      .map(escapeCell)
      .join(','),
  );
  downloadCsv(`gdp-inventory-${Date.now()}.csv`, [header.join(','), ...rows].join('\n'));
}

export function exportBatchCsv(cards: BatchCardResult[]) {
  const header = [
    'name',
    'included',
    'recommendation',
    'expectedValue',
    'expectedProfit',
    'raw',
    'psa10',
    'psa9',
    'psa8',
    'below8',
  ];
  const rows = cards.map((c) =>
    [
      c.name,
      c.included ? 'yes' : 'no',
      c.evResult.recommendation,
      c.evResult.expectedValue,
      c.evResult.expectedProfit,
      c.rawValue,
      c.compPrices.psa10,
      c.compPrices.psa9,
      c.compPrices.psa8,
      c.compPrices.below8,
    ]
      .map(escapeCell)
      .join(','),
  );
  downloadCsv(`gdp-batch-${Date.now()}.csv`, [header.join(','), ...rows].join('\n'));
}
