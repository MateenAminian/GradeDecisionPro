import type { VisionGradeProbabilities } from '@/data/types';

export interface GradeConfidenceSummary {
  confidenceScore: number;
  band: string;
  label: string;
}

export function summarizeGradeConfidence(gp?: VisionGradeProbabilities | null): GradeConfidenceSummary | null {
  if (!gp) return null;
  const grades = [
    { grade: 10, label: 'PSA 10', pct: gp.psa10Percent ?? 0 },
    { grade: 9, label: 'PSA 9', pct: gp.psa9Percent ?? 0 },
    { grade: 8, label: 'PSA 8', pct: gp.psa8Percent ?? 0 },
  ].filter((row) => row.pct > 0);

  if (!grades.length) return null;

  const sorted = [...grades].sort((a, b) => b.pct - a.pct);
  const top = sorted[0];
  const second = sorted[1]?.pct ?? 0;
  const included = grades.filter((row) => row.pct >= 10 || row.grade === top.grade);
  const low = Math.min(...included.map((row) => row.grade));
  const high = Math.max(...included.map((row) => row.grade));
  const confidenceScore = Math.max(0, Math.min(100, Math.round(top.pct + (top.pct - second) / 2)));
  const band = low === high ? `PSA ${high}` : `PSA ${low}-${high}`;
  const label =
    confidenceScore >= 75
      ? 'High confidence'
      : confidenceScore >= 55
        ? 'Medium confidence'
        : 'Wide uncertainty';

  return { confidenceScore, band, label };
}
