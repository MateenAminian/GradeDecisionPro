import { ScrollView, StyleSheet, TextInput, View as RNView, Pressable } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Text } from '@/components/Themed';
import Colors from '@/constants/Colors';
import GradientButton from '@/components/ui/GradientButton';
import GradeReport from '@/components/GradeReport';
import CompsPanel from '@/components/CompsPanel';
import { useAppStore } from '@/store/useAppStore';
import { analysisTitle } from '@/data/cardDisplay';
import { lightImpact } from '@/utils/haptics';
import type { InventoryLifecycle } from '@/data/types';

const C = Colors.dark;

const LIFECYCLES: { id: InventoryLifecycle; label: string }[] = [
  { id: 'modeled', label: 'Modeled' },
  { id: 'submitted', label: 'Submitted' },
  { id: 'returned', label: 'Returned' },
  { id: 'sold', label: 'Sold' },
];

export default function CardReportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const card = useAppStore((s) => s.inventory.find((item) => item.id === id));
  const removeInventoryCard = useAppStore((s) => s.removeInventoryCard);
  const updateInventoryLifecycle = useAppStore((s) => s.updateInventoryLifecycle);
  const setCalculator = useAppStore((s) => s.setCalculator);
  const setProfile = useAppStore((s) => s.setProfile);

  const title = card ? analysisTitle(card) : 'Grade report';
  const lifecycle = card?.lifecycle ?? 'modeled';
  const predicted = card?.predictedEvAtDecide ?? card?.expectedValue ?? null;
  const sold = card?.soldPrice;
  const diff =
    sold != null && predicted != null ? sold - predicted : null;

  return (
    <>
      <Stack.Screen options={{ title, headerBackTitle: 'Inventory' }} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="always"
        showsVerticalScrollIndicator={false}
      >
        {card ? (
          <>
            <Text style={styles.scanned}>
              Scanned {new Date(card.scannedAt).toLocaleString()}
            </Text>
            <GradeReport card={card} hideComps hideIdentity />

            {card.gradeProbabilities ? (
              <RNView style={styles.bandCard}>
                <Text style={styles.bandTitle}>Grade confidence band</Text>
                <Text style={styles.bandSub}>
                  {card.gradeRange || card.likelyGrade || 'Range'} · not a single point estimate
                </Text>
                <RNView style={styles.bandRow}>
                  <Text style={{ color: C.grade10 }}>
                    10 · {(card.gradeProbabilities.psa10Percent ?? 0).toFixed(0)}%
                  </Text>
                  <Text style={{ color: C.grade9 }}>
                    9 · {(card.gradeProbabilities.psa9Percent ?? 0).toFixed(0)}%
                  </Text>
                  <Text style={{ color: C.grade8 }}>
                    8 · {(card.gradeProbabilities.psa8Percent ?? 0).toFixed(0)}%
                  </Text>
                </RNView>
                <GradientButton
                  href="/"
                  title="Use probabilities in Decide"
                  size="small"
                  style={{ marginTop: 12 }}
                  onPress={() => {
                    const gp = card.gradeProbabilities!;
                    const psa10 = gp.psa10Percent ?? 0;
                    const psa9 = gp.psa9Percent ?? 0;
                    const psa8 = gp.psa8Percent ?? 0;
                    const below8 = Math.max(0, 100 - psa10 - psa9 - psa8);
                    setProfile('custom');
                    setCalculator({
                      probabilities: { psa10, psa9, psa8, below8 },
                      rawValue: card.estimatedRawValue ?? 0,
                      cardName: analysisTitle(card),
                      psa10Comp: card.comps?.prices.psa10 ?? 0,
                      psa9Comp: card.comps?.prices.psa9 ?? 0,
                      psa8Comp: card.comps?.prices.psa8 ?? 0,
                      below8Comp: card.comps?.prices.below8 ?? 0,
                    });
                    lightImpact();
                  }}
                />
              </RNView>
            ) : null}

            <CompsPanel card={card} />

            <RNView style={styles.lifecycleCard}>
              <Text style={styles.bandTitle}>Outcome tracking</Text>
              <Text style={styles.bandSub}>Mark submit → return → sale to compare vs predicted EV.</Text>
              <RNView style={styles.lifeRow}>
                {LIFECYCLES.map((l) => (
                  <Pressable
                    key={l.id}
                    onPress={() => {
                      updateInventoryLifecycle(card.id, {
                        lifecycle: l.id,
                        predictedEvAtDecide: card.predictedEvAtDecide ?? card.expectedValue ?? null,
                      });
                      lightImpact();
                    }}
                    style={[styles.lifeChip, lifecycle === l.id && styles.lifeChipActive]}
                  >
                    <Text style={[styles.lifeChipText, lifecycle === l.id && { color: C.accent }]}>
                      {l.label}
                    </Text>
                  </Pressable>
                ))}
              </RNView>
              <Text style={styles.fieldLabel}>Returned grade</Text>
              <TextInput
                style={styles.input}
                value={card.returnedGrade ?? ''}
                placeholder="e.g. PSA 9"
                placeholderTextColor={C.textMuted}
                onChangeText={(v) => updateInventoryLifecycle(card.id, { returnedGrade: v })}
              />
              <Text style={styles.fieldLabel}>Sold price ($)</Text>
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                value={card.soldPrice != null ? String(card.soldPrice) : ''}
                placeholder="Actual sale"
                placeholderTextColor={C.textMuted}
                onChangeText={(v) => {
                  const n = parseFloat(v.replace(/[^0-9.]/g, ''));
                  updateInventoryLifecycle(card.id, {
                    soldPrice: Number.isFinite(n) ? n : null,
                    lifecycle: 'sold',
                  });
                }}
              />
              {diff != null ? (
                <Text style={styles.diffText}>
                  Sale vs predicted EV: {diff >= 0 ? '+' : ''}${diff.toFixed(0)}
                  {predicted != null ? ` (predicted $${predicted.toFixed(0)})` : ''}
                </Text>
              ) : null}
            </RNView>

            <GradientButton
              href="/batch"
              title="Open in batch modeling"
              outline
              outlineColor={C.accentPurple}
              style={{ marginTop: 14 }}
            />
            <GradientButton
              onPress={() => {
                removeInventoryCard(card.id);
                router.replace('/inventory');
              }}
              title="Remove from inventory"
              outline
              outlineColor={C.accentRed}
              textColor={C.accentRed}
              style={{ marginTop: 10 }}
            />
          </>
        ) : (
          <RNView style={styles.empty}>
            <FontAwesome name="search" size={22} color={C.textMuted} />
            <Text style={styles.emptyTitle}>Card not found</Text>
            <Text style={styles.emptySub}>It may have been removed. Scan it again from Analyze.</Text>
            <GradientButton href="/inventory" title="Back to inventory" style={{ marginTop: 8, alignSelf: 'stretch' }} />
          </RNView>
        )}
        <RNView style={{ height: 40 }} />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  content: { padding: 20, paddingBottom: 40, maxWidth: 720, width: '100%', alignSelf: 'center' },
  scanned: { fontSize: 12, color: C.textMuted, marginBottom: 12 },
  empty: { alignItems: 'center', paddingVertical: 48, gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: C.text },
  emptySub: { fontSize: 13, color: C.textSecondary, textAlign: 'center', lineHeight: 19, maxWidth: 360 },
  bandCard: {
    backgroundColor: C.surface, borderRadius: 14, padding: 14, marginTop: 12,
    borderWidth: 0.5, borderColor: C.border, marginBottom: 8,
  },
  bandTitle: { fontSize: 14, fontWeight: '700', color: C.text },
  bandSub: { fontSize: 12, color: C.textSecondary, marginTop: 4, marginBottom: 8 },
  bandRow: { flexDirection: 'row', gap: 14, flexWrap: 'wrap' },
  lifecycleCard: {
    backgroundColor: C.surface, borderRadius: 14, padding: 14, marginTop: 12,
    borderWidth: 0.5, borderColor: C.border,
  },
  lifeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  lifeChip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14,
    backgroundColor: C.background, borderWidth: 0.5, borderColor: C.border,
  },
  lifeChipActive: { borderColor: C.accent + '60' },
  lifeChipText: { fontSize: 12, color: C.textSecondary, fontWeight: '600' },
  fieldLabel: { fontSize: 11, color: C.textMuted, marginBottom: 4, marginTop: 8 },
  input: {
    backgroundColor: C.background, borderRadius: 10, padding: 12, color: C.text,
    borderWidth: 0.5, borderColor: C.border, fontSize: 15, fontWeight: '600',
  },
  diffText: { marginTop: 12, fontSize: 13, color: C.accent, fontWeight: '700' },
});
