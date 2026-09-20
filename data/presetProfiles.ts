import { PresetProfile } from './types';

export const presetProfiles: PresetProfile[] = [
  {
    id: 'modern-mint',
    name: 'Modern Mint',
    description: 'Fresh pull, pack-to-sleeve. High gem rate.',
    probabilities: { psa10: 65, psa9: 25, psa8: 8, below8: 2 },
  },
  {
    id: 'risky-surface',
    name: 'Risky Surface',
    description: 'Visible print lines or surface issues.',
    probabilities: { psa10: 20, psa9: 40, psa8: 30, below8: 10 },
  },
  {
    id: 'vintage',
    name: 'Vintage',
    description: 'Older cards with age-related wear.',
    probabilities: { psa10: 5, psa9: 20, psa8: 35, below8: 40 },
  },
  {
    id: 'off-center',
    name: 'Off-Center',
    description: 'Noticeable centering issues.',
    probabilities: { psa10: 10, psa9: 35, psa8: 35, below8: 20 },
  },
  {
    id: 'custom',
    name: 'Custom',
    description: 'Set your own distribution.',
    probabilities: { psa10: 50, psa9: 30, psa8: 15, below8: 5 },
  },
];
