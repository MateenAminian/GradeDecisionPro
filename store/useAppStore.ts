import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { safeStorage } from '@/store/safeStorage';
import { presetProfiles } from '@/data/presetProfiles';
import { analyzeBatchImages, lookupEbayComps } from '@/api/client';
import { persistImageUri } from '@/utils/persistImage';
import { analysisTitle } from '@/data/cardDisplay';
import { PLACEHOLDER_COMPS, createManualInventoryCard, metadataFromLabel, rebuildInventoryCard } from '@/data/inventoryCard';
import type { BatchCard, CardAnalysisResult, CardMetadata, CompPrices, GradeProbabilities, InventoryCard } from '@/data/types';

const modernMint = presetProfiles.find((p) => p.id === 'modern-mint') ?? presetProfiles[0];

export const DEFAULT_SETTINGS = {
  gradingFee: 50,
  shippingCost: 15,
  turnaroundDays: 45,
};

const EXAMPLE_COMPS: CompPrices = PLACEHOLDER_COMPS;

interface AppState {
  gradingFee: number;
  shippingCost: number;
  turnaroundDays: number;

  rawValue: number;
  cardName: string;
  psa10Comp: number;
  psa9Comp: number;
  psa8Comp: number;
  below8Comp: number;
  selectedProfile: string;
  probabilities: GradeProbabilities;
  priceDropPct: number;
  gradeVariance: number;

  batchCards: BatchCard[];

  batchAnalysisResults: CardAnalysisResult[];
  isAnalyzingBatch: boolean;
  batchError: string | null;
  inventory: InventoryCard[];

  setCosts: (costs: Partial<Pick<AppState, 'gradingFee' | 'shippingCost' | 'turnaroundDays'>>) => void;
  setCalculator: (patch: Partial<Pick<AppState,
    | 'rawValue'
    | 'cardName'
    | 'psa10Comp'
    | 'psa9Comp'
    | 'psa8Comp'
    | 'below8Comp'
    | 'selectedProfile'
    | 'probabilities'
    | 'priceDropPct'
    | 'gradeVariance'
  >>) => void;
  setProfile: (profileId: string) => void;
  addCurrentToBatch: (snapshot?: Partial<Pick<BatchCard, 'name' | 'rawValue' | 'probabilities' | 'profileId' | 'compPrices'>>) => string;
  addBatchCard: (card: Omit<BatchCard, 'id' | 'included'> & { included?: boolean }, metadata?: CardMetadata) => void;
  removeBatchCard: (id: string) => void;
  toggleBatchCard: (id: string) => void;
  setBatchIncluded: (ids: string[], included: boolean) => void;
  processBatchUpload: (imageUris: string[], opts?: { append?: boolean }) => Promise<void>;
  clearBatchAnalysis: () => void;
  addAnalysisToBatch: (results?: CardAnalysisResult[]) => number;
  addScansToInventory: (results: CardAnalysisResult[]) => Promise<InventoryCard[]>;
  addManualInventoryCard: (input: {
    metadata: CardMetadata;
    rawValue?: number;
    probabilities?: GradeProbabilities;
    compPrices?: CompPrices;
  }) => InventoryCard;
  importMissingBatchCards: () => number;
  removeInventoryCard: (id: string) => void;
  updateInventoryMetadata: (id: string, metadata: CardMetadata) => void;
  updateInventoryModeling: (id: string, patch: { rawValue?: number; prices?: CompPrices }) => void;
  refreshInventoryComps: (id: string, metadata?: CardMetadata) => Promise<void>;
  resetExample: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      ...DEFAULT_SETTINGS,
      rawValue: 200,
      cardName: '',
      psa10Comp: EXAMPLE_COMPS.psa10,
      psa9Comp: EXAMPLE_COMPS.psa9,
      psa8Comp: EXAMPLE_COMPS.psa8,
      below8Comp: EXAMPLE_COMPS.below8,
      selectedProfile: modernMint.id,
      probabilities: { ...modernMint.probabilities },
      priceDropPct: 0,
      gradeVariance: 0,
      batchCards: [],
      batchAnalysisResults: [],
      isAnalyzingBatch: false,
      batchError: null,
      inventory: [],

      setCosts: (costs) => set(costs),
      setCalculator: (patch) => set(patch),

      setProfile: (profileId) => {
        const profile = presetProfiles.find((p) => p.id === profileId);
        set({
          selectedProfile: profileId,
          probabilities: profile && profileId !== 'custom' ? { ...profile.probabilities } : get().probabilities,
        });
      },

      addCurrentToBatch: (snapshot = {}) => {
        const s = get();
        const id = `batch-${Date.now()}`;
        const name = snapshot.name?.trim() || s.cardName.trim() || `Card ${s.batchCards.length + 1}`;
        const card: BatchCard = {
          id,
          name,
          rawValue: snapshot.rawValue ?? s.rawValue,
          probabilities: { ...(snapshot.probabilities ?? s.probabilities) },
          profileId: snapshot.profileId ?? s.selectedProfile,
          compPrices: snapshot.compPrices ?? {
            psa10: s.psa10Comp,
            psa9: s.psa9Comp,
            psa8: s.psa8Comp,
            below8: s.below8Comp,
          },
          included: true,
        };
        set({ batchCards: [card, ...s.batchCards] });
        get().addManualInventoryCard({
          metadata: metadataFromLabel(name),
          rawValue: card.rawValue,
          probabilities: card.probabilities,
          compPrices: card.compPrices,
        });
        return id;
      },

      addBatchCard: (card, metadata) => {
        const id = `batch-${Date.now()}`;
        const next = { ...card, id, included: card.included ?? true };
        set({
          batchCards: [next, ...get().batchCards],
        });
        get().addManualInventoryCard({
          metadata: metadata ?? metadataFromLabel(card.name),
          rawValue: card.rawValue,
          probabilities: card.probabilities,
          compPrices: card.compPrices,
        });
      },

      removeBatchCard: (id) => {
        set({ batchCards: get().batchCards.filter((c) => c.id !== id) });
      },

      toggleBatchCard: (id) => {
        set({
          batchCards: get().batchCards.map((c) => (c.id === id ? { ...c, included: !c.included } : c)),
        });
      },

      setBatchIncluded: (ids, included) => {
        const idSet = new Set(ids);
        set({
          batchCards: get().batchCards.map((c) => (idSet.has(c.id) ? { ...c, included } : c)),
        });
      },

      processBatchUpload: async (imageUris, opts) => {
        const s = get();
        const append = Boolean(opts?.append);
        set({
          isAnalyzingBatch: true,
          batchError: null,
          ...(append ? {} : { batchAnalysisResults: [] }),
        });
        try {
          const response = await analyzeBatchImages(imageUris, {
            gradingFee: s.gradingFee,
            shippingCost: s.shippingCost,
            turnaroundDays: s.turnaroundDays,
            rawValue: s.rawValue,
            psa10Comp: s.psa10Comp,
            psa9Comp: s.psa9Comp,
            psa8Comp: s.psa8Comp,
            below8Comp: s.below8Comp,
          });
          const tagged = response.results.map((result, index) => ({
            ...result,
            imageUri: imageUris[index] ?? result.imageUri,
          }));
          const saved = await get().addScansToInventory(tagged);
          const withIds = tagged.map((result, index) => ({
            ...result,
            inventoryId: saved[index]?.id,
            imageUri: saved[index]?.imageUri ?? result.imageUri,
          }));
          set({
            batchAnalysisResults: append ? [...get().batchAnalysisResults, ...withIds] : withIds,
            isAnalyzingBatch: false,
          });
          get().addAnalysisToBatch(tagged);
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Batch analysis failed';
          set({ batchError: message, isAnalyzingBatch: false });
        }
      },

      clearBatchAnalysis: () => set({ batchAnalysisResults: [], batchError: null, isAnalyzingBatch: false }),

      addAnalysisToBatch: (results) => {
        const s = get();
        const ok = (results ?? s.batchAnalysisResults).filter((r) => r.ok && r.evResult);
        const stamp = Date.now();
        const incoming = ok.map((result, index) => {
          const meta = result.metadata;
          const name =
            [meta?.year, meta?.player, meta?.set, meta?.parallel, meta?.cardNumber]
              .filter(Boolean)
              .join(' ')
              .trim() || result.filename || `Vision card ${index + 1}`;
          const gp = result.gradeProbabilities;
          const total = (gp?.psa10Percent ?? 0) + (gp?.psa9Percent ?? 0) + (gp?.psa8Percent ?? 0);
          const below8 = total > 100.5 ? 0 : Math.max(0, 100 - total);
          return {
            id: `vision-${stamp}-${index}`,
            name,
            rawValue: result.estimatedRawValue || s.rawValue,
            probabilities: {
              psa10: gp?.psa10Percent ?? 0,
              psa9: gp?.psa9Percent ?? 0,
              psa8: gp?.psa8Percent ?? 0,
              below8,
            },
            profileId: 'custom' as const,
            compPrices: {
              psa10: s.psa10Comp,
              psa9: s.psa9Comp,
              psa8: s.psa8Comp,
              below8: s.below8Comp,
            },
            included: true,
          };
        });
        set({ batchCards: [...incoming, ...s.batchCards] });
        return incoming.length;
      },

      addScansToInventory: async (results) => {
        const stamp = Date.now();
        const cards: InventoryCard[] = [];
        for (let i = 0; i < results.length; i += 1) {
          const result = results[i];
          const imageUri = result.imageUri ? await persistImageUri(result.imageUri) : undefined;
          cards.push({
            id: `inv-${stamp}-${i}-${Math.random().toString(36).slice(2, 8)}`,
            scannedAt: stamp + i,
            name: analysisTitle(result),
            filename: result.filename,
            ok: result.ok,
            error: result.error,
            imageUri,
            metadata: result.metadata,
            conditionReport: result.conditionReport,
            gradeProbabilities: result.gradeProbabilities,
            estimatedRawValue: result.estimatedRawValue,
            expectedValue: result.expectedValue,
            expectedProfit: result.expectedProfit,
            likelyGrade: result.likelyGrade,
            gradeRange: result.gradeRange,
            recommendation: result.recommendation,
            reasoning: result.reasoning ?? [],
            evResult: result.evResult,
            comps: result.comps,
          });
        }
        set({ inventory: [...cards, ...get().inventory] });
        return cards;
      },

      addManualInventoryCard: (input) => {
        const s = get();
        const card = createManualInventoryCard({
          metadata: input.metadata,
          rawValue: input.rawValue ?? 0,
          probabilities: input.probabilities ?? s.probabilities,
          compPrices: input.compPrices ?? PLACEHOLDER_COMPS,
          gradingFee: s.gradingFee,
          shippingCost: s.shippingCost,
          turnaroundDays: s.turnaroundDays,
        });
        set({ inventory: [card, ...get().inventory] });
        return card;
      },

      importMissingBatchCards: () => {
        const s = get();
        const existing = new Set(
          s.inventory.map((card) => (card.name || '').trim().toLowerCase()).filter(Boolean),
        );
        let added = 0;
        for (const batch of s.batchCards) {
          const key = (batch.name || '').trim().toLowerCase();
          if (!key || existing.has(key)) continue;
          get().addManualInventoryCard({
            metadata: metadataFromLabel(batch.name),
            rawValue: batch.rawValue,
            probabilities: batch.probabilities,
            compPrices: batch.compPrices,
          });
          existing.add(key);
          added += 1;
        }
        return added;
      },

      removeInventoryCard: (id) => {
        set({ inventory: get().inventory.filter((card) => card.id !== id) });
      },

      updateInventoryMetadata: (id, metadata) => {
        const costs = get();
        set({
          inventory: get().inventory.map((card) =>
            card.id === id
              ? rebuildInventoryCard(card, {
                  metadata,
                  gradingFee: costs.gradingFee,
                  shippingCost: costs.shippingCost,
                  turnaroundDays: costs.turnaroundDays,
                })
              : card,
          ),
        });
      },

      updateInventoryModeling: (id, patch) => {
        const costs = get();
        set({
          inventory: get().inventory.map((card) => {
            if (card.id !== id) return card;
            const current = card.comps?.prices ?? PLACEHOLDER_COMPS;
            const prices = patch.prices ?? current;
            const editedSource = card.comps?.source?.startsWith('ebay')
              ? 'ebay-live-edited'
              : 'manual';
            const comps = {
              source: editedSource,
              query: card.comps?.query ?? '',
              listingCount: card.comps?.listingCount ?? 0,
              prices,
              samples: card.comps?.samples ?? { raw: 0, psa10: 0, psa9: 0, psa8: 0, below8: 0 },
              fetchedAt: card.comps?.fetchedAt,
              raw: patch.rawValue ?? card.comps?.raw ?? card.estimatedRawValue,
              listings: card.comps?.listings ?? [],
            };
            return rebuildInventoryCard(card, {
              comps,
              estimatedRawValue: patch.rawValue ?? card.estimatedRawValue,
              gradingFee: costs.gradingFee,
              shippingCost: costs.shippingCost,
              turnaroundDays: costs.turnaroundDays,
            });
          }),
        });
      },

      refreshInventoryComps: async (id, metadata) => {
        const s = get();
        const card = s.inventory.find((item) => item.id === id);
        if (!card) throw new Error('Card not found');
        const meta = metadata ?? card.metadata ?? {
          year: '',
          player: '',
          set: '',
          cardNumber: '',
          parallel: '',
        };
        const snapshot = await lookupEbayComps(meta, {
          fallback: card.comps?.prices ?? PLACEHOLDER_COMPS,
          refresh: true,
        });
        const next = rebuildInventoryCard(card, {
          metadata: meta,
          comps: snapshot,
          estimatedRawValue: snapshot.raw && snapshot.raw > 0 ? snapshot.raw : card.estimatedRawValue,
          gradingFee: s.gradingFee,
          shippingCost: s.shippingCost,
          turnaroundDays: s.turnaroundDays,
        });
        set({
          inventory: get().inventory.map((item) => (item.id === id ? next : item)),
        });
      },

      resetExample: () =>
        set({
          ...DEFAULT_SETTINGS,
          rawValue: 200,
          cardName: '',
          psa10Comp: EXAMPLE_COMPS.psa10,
          psa9Comp: EXAMPLE_COMPS.psa9,
          psa8Comp: EXAMPLE_COMPS.psa8,
          below8Comp: EXAMPLE_COMPS.below8,
          selectedProfile: modernMint.id,
          probabilities: { ...modernMint.probabilities },
          priceDropPct: 0,
          gradeVariance: 0,
        }),
    }),
    {
      name: 'gdp-mvp-v1',
      storage: createJSONStorage(() => safeStorage),
      partialize: (state) => ({
        gradingFee: state.gradingFee,
        shippingCost: state.shippingCost,
        turnaroundDays: state.turnaroundDays,
        rawValue: state.rawValue,
        cardName: state.cardName,
        psa10Comp: state.psa10Comp,
        psa9Comp: state.psa9Comp,
        psa8Comp: state.psa8Comp,
        below8Comp: state.below8Comp,
        selectedProfile: state.selectedProfile,
        probabilities: state.probabilities,
        priceDropPct: state.priceDropPct,
        gradeVariance: state.gradeVariance,
        batchCards: state.batchCards,
        inventory: state.inventory,
      }),
    },
  ),
);
