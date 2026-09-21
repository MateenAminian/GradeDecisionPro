import Colors from '@/constants/Colors';
import type { Recommendation } from './types';

const C = Colors.dark;

export function getRecommendationStyle(rec: Recommendation | string | undefined) {
  switch (rec) {
    case 'GRADE':
      return {
        label: 'GRADE',
        color: C.accentGreen,
        gradient: [C.accentGreen, '#16A34A'] as const,
        icon: 'check-circle' as const,
      };
    case 'HOLD':
      return {
        label: 'HOLD',
        color: C.accent,
        gradient: [C.accent, C.accentMuted] as const,
        icon: 'pause-circle' as const,
      };
    case 'SELL_RAW':
      return {
        label: 'SELL RAW',
        color: C.accentYellow,
        gradient: [C.accentYellow, '#D97706'] as const,
        icon: 'dollar' as const,
      };
    case 'NEED_COMPS':
      return {
        label: 'NEED COMPS',
        color: C.textMuted,
        gradient: [C.textMuted, C.tabIconDefault] as const,
        icon: 'info-circle' as const,
      };
    default:
      return {
        label: '—',
        color: C.textMuted,
        gradient: [C.textMuted, C.tabIconDefault] as const,
        icon: 'question-circle' as const,
      };
  }
}
