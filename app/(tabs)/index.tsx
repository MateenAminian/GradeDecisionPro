import { useMemo, useState, useCallback } from 'react';
import { StyleSheet, ScrollView, Pressable, View as RNView } from 'react-native';
import { Text } from '@/components/Themed';
import { presetProfiles } from '@/data/presetProfiles';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { LinearGradient } from 'expo-linear-gradient';
import { FadeInDown } from 'react-native-reanimated';
import EnterView from '@/components/EnterView';
import Colors from '@/constants/Colors';
import Slider from '@/components/ui/Slider';
import NumberField from '@/components/ui/NumberField';
import GradientButton from '@/components/ui/GradientButton';
import { useFocusEffect } from 'expo-router';
import { useAppStore } from '@/store/useAppStore';
import {
  applyGradeVariance,
  applyPriceDrop,
  calculateEV,
  sumProbabilities,
} from '@/data/evCalculator';
import { getRecommendationStyle } from '@/data/recommendation';
import { lightImpact, successNotification } from '@/utils/haptics';

const C = Colors.dark;

function num(text: string): number {
  const n = parseFloat(text.replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

export default function CalculatorScreen() {
  const store = useAppStore();
  const [addedFlash, setAddedFlash] = useState(false);

  const [rawText, setRawText] = useState(String(store.rawValue));
  const [feeText, setFeeText] = useState(String(store.gradingFee));
  const [shipText, setShipText] = useState(String(store.shippingCost));
  const [daysText, setDaysText] = useState(String(store.turnaroundDays));
  const [c10, setC10] = useState(String(store.psa10Comp));
  const [c9, setC9] = useState(String(store.psa9Comp));
  const [c8, setC8] = useState(String(store.psa8Comp));
  const [c7, setC7] = useState(String(store.below8Comp));

  useFocusEffect(
    useCallback(() => {
      const s = useAppStore.getState();
      setFeeText(String(s.gradingFee));
      setShipText(String(s.shippingCost));
      setDaysText(String(s.turnaroundDays));
      setRawText(String(s.rawValue));
      setC10(String(s.psa10Comp));
      setC9(String(s.psa9Comp));
      setC8(String(s.psa8Comp));
      setC7(String(s.below8Comp));
    }, []),
  );

  const rawValue = num(rawText);
  const gradingFee = num(feeText);
  const shippingCost = num(shipText);
  const turnaroundDays = num(daysText) || 1;

  const persistCosts = (fee: string, ship: string, days: string) => {
    store.setCosts({
      gradingFee: num(fee),
      shippingCost: num(ship),
      turnaroundDays: num(days) || 1,
    });
  };

  const persistComps = (p10: string, p9: string, p8: string, p7: string) => {
    store.setCalculator({
      rawValue,
      psa10Comp: num(p10),
      psa9Comp: num(p9),
      psa8Comp: num(p8),
      below8Comp: num(p7),
    });
  };

  const adjustedProbs = useMemo(
    () => applyGradeVariance(store.probabilities, store.gradeVariance),
    [store.probabilities, store.gradeVariance],
  );
  const adjustedComps = useMemo(
    () =>
      applyPriceDrop(
        { psa10: num(c10), psa9: num(c9), psa8: num(c8), below8: num(c7) },
        store.priceDropPct,
      ),
    [c10, c9, c8, c7, store.priceDropPct],
  );

  const display = useMemo(
    () =>
      calculateEV({
        rawValue,
        gradingFee,
        shippingCost,
        turnaroundDays,
        probabilities: adjustedProbs,
        compPrices: adjustedComps,
      }),
    [rawValue, gradingFee, shippingCost, turnaroundDays, adjustedProbs, adjustedComps],
  );

  const recStyle = getRecommendationStyle(display.recommendation);
  const totalProb = sumProbabilities(store.probabilities);

  const handleProfileSelect = (profileId: string) => {
    lightImpact();
    store.setProfile(profileId);
  };

  const setProb = (key: keyof typeof store.probabilities, value: number) => {
    store.setCalculator({
      selectedProfile: 'custom',
      probabilities: { ...store.probabilities, [key]: value },
    });
  };

  const handleAddToBatch = () => {
    persistCosts(feeText, shipText, daysText);
    persistComps(c10, c9, c8, c7);
    store.addCurrentToBatch({
      name: store.cardName,
      rawValue,
      probabilities: adjustedProbs,
      profileId: store.gradeVariance ? 'custom' : store.selectedProfile,
      compPrices: adjustedComps,
    });
    successNotification();
    setAddedFlash(true);
    setTimeout(() => setAddedFlash(false), 1800);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="always"
      showsVerticalScrollIndicator={false}
    >
      <EnterView entering={FadeInDown.duration(300)} style={styles.header}>
        <RNView>
          <RNView style={styles.logoRow}>
            <Text style={styles.logoWhite}>GradeDecision</Text>
            <Text style={styles.logoAccent}>Pro</Text>
          </RNView>
          <Text style={styles.tagline}>Know before you submit.</Text>
        </RNView>
      </EnterView>

      <EnterView entering={FadeInDown.duration(400)}>
        <LinearGradient
          colors={[recStyle.gradient[0] + '15', recStyle.gradient[1] + '05']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.resultBanner, { borderColor: recStyle.color + '30' }]}
        >
          <RNView style={styles.resultRow}>
            <RNView>
              <Text style={styles.resultLabel}>RECOMMENDATION</Text>
              <Text style={[styles.resultRec, { color: recStyle.color }]}>{recStyle.label}</Text>
            </RNView>
            <RNView style={{ alignItems: 'flex-end' }}>
              <Text style={styles.resultLabel}>EXPECTED VALUE</Text>
              <Text style={[styles.resultEV, { color: recStyle.color }]}>
                ${display.expectedValue.toFixed(0)}
              </Text>
            </RNView>
          </RNView>
          <RNView style={styles.resultMetrics}>
            {[
              {
                label: 'PROFIT',
                value: `${display.expectedProfit > 0 ? '+' : ''}$${display.expectedProfit.toFixed(0)}`,
                color: display.expectedProfit > 0 ? C.accentGreen : C.accentRed,
              },
              { label: 'ANN. ROI', value: `${display.annualizedRoi.toFixed(0)}%`, color: C.accent },
              { label: 'BREAK-EVEN', value: display.breakEvenGrade, color: C.accentYellow },
            ].map((m) => (
              <RNView key={m.label} style={styles.resultMetric}>
                <Text style={styles.resultMetricLabel}>{m.label}</Text>
                <Text style={[styles.resultMetricValue, { color: m.color }]}>{m.value}</Text>
              </RNView>
            ))}
          </RNView>
          <RNView style={styles.beRow}>
            <Text style={styles.beText}>
              {display.breakEvenProbability.toFixed(0)}% chance of hitting {display.breakEvenGrade}
            </Text>
            <Text style={styles.beText}>${display.capitalDeployed.toFixed(0)} capital locked</Text>
          </RNView>
        </LinearGradient>
      </EnterView>

      <EnterView entering={FadeInDown.delay(80).duration(400)} style={styles.reasonCard}>
        {display.reasoning.map((line, i) => (
          <RNView key={i} style={styles.reasonRow}>
            <FontAwesome name={i === 0 ? 'line-chart' : i === 1 ? 'balance-scale' : 'clock-o'} size={12} color={recStyle.color} />
            <Text style={styles.reasonText}>{line}</Text>
          </RNView>
        ))}
      </EnterView>

      <EnterView entering={FadeInDown.delay(100).duration(400)}>
        <Text style={styles.sectionTitle}>Card & Costs</Text>
        <RNView style={styles.nameWrap}>
          <NumberField
            label="Card (optional)"
            value={store.cardName}
            onChangeText={(v) => store.setCalculator({ cardName: v })}
            keyboardType="default"
            fullWidth
          />
        </RNView>
        <RNView style={styles.inputGrid}>
          <NumberField
            label="Raw Value"
            prefix="$"
            value={rawText}
            onChangeText={(v) => {
              setRawText(v);
              store.setCalculator({ rawValue: num(v) });
            }}
          />
          <NumberField
            label="Grading Fee"
            prefix="$"
            value={feeText}
            onChangeText={(v) => {
              setFeeText(v);
              persistCosts(v, shipText, daysText);
            }}
          />
          <NumberField
            label="Ship + Ins."
            prefix="$"
            value={shipText}
            onChangeText={(v) => {
              setShipText(v);
              persistCosts(feeText, v, daysText);
            }}
          />
          <NumberField
            label="Turnaround"
            suffix=" days"
            value={daysText}
            onChangeText={(v) => {
              setDaysText(v);
              persistCosts(feeText, shipText, v);
            }}
          />
        </RNView>
      </EnterView>

      <EnterView entering={FadeInDown.delay(160).duration(400)}>
        <Text style={styles.sectionTitle}>Comp Prices</Text>
        <RNView style={styles.inputGrid}>
          <NumberField label="PSA 10" prefix="$" value={c10} onChangeText={(v) => { setC10(v); persistComps(v, c9, c8, c7); }} accentColor={C.grade10} />
          <NumberField label="PSA 9" prefix="$" value={c9} onChangeText={(v) => { setC9(v); persistComps(c10, v, c8, c7); }} accentColor={C.grade9} />
          <NumberField label="PSA 8" prefix="$" value={c8} onChangeText={(v) => { setC8(v); persistComps(c10, c9, v, c7); }} accentColor={C.grade8} />
          <NumberField label="Below 8" prefix="$" value={c7} onChangeText={(v) => { setC7(v); persistComps(c10, c9, c8, v); }} accentColor={C.gradeBelow} />
        </RNView>
      </EnterView>

      <EnterView entering={FadeInDown.delay(220).duration(400)}>
        <Text style={styles.sectionTitle}>Grade Probability</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.profileScroll}>
          {presetProfiles.map((p) => {
            const isActive = store.selectedProfile === p.id;
            return (
              <Pressable
                key={p.id}
                onPress={() => handleProfileSelect(p.id)}
                accessibilityRole="button"
                accessibilityLabel={p.name}
                accessibilityState={{ selected: isActive }}
              >
                {isActive ? (
                  <LinearGradient
                    colors={[C.accent + '25', C.accent + '10']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={[styles.profileChip, styles.profileChipActive]}
                  >
                    <Text style={[styles.profileChipText, styles.profileChipTextActive]}>{p.name}</Text>
                  </LinearGradient>
                ) : (
                  <RNView style={styles.profileChip}>
                    <Text style={styles.profileChipText}>{p.name}</Text>
                  </RNView>
                )}
              </Pressable>
            );
          })}
        </ScrollView>

        <RNView style={styles.probCard}>
          <Slider label="PSA 10" value={store.probabilities.psa10} onChange={(v) => setProb('psa10', v)} color={C.grade10} />
          <Slider label="PSA 9" value={store.probabilities.psa9} onChange={(v) => setProb('psa9', v)} color={C.grade9} />
          <Slider label="PSA 8" value={store.probabilities.psa8} onChange={(v) => setProb('psa8', v)} color={C.grade8} />
          <Slider label="Below 8" value={store.probabilities.below8} onChange={(v) => setProb('below8', v)} color={C.gradeBelow} />
          <RNView style={styles.probTotal}>
            <Text style={styles.probTotalLabel}>Total</Text>
            <Text style={[styles.probTotalValue, { color: totalProb === 100 ? C.accentGreen : C.accentRed }]}>
              {totalProb}%{totalProb !== 100 ? ' · auto-normalized in EV' : ''}
            </Text>
          </RNView>
        </RNView>
      </EnterView>

      <EnterView entering={FadeInDown.delay(280).duration(400)}>
        <Text style={styles.sectionTitle}>Sensitivity</Text>
        <RNView style={styles.sensitivityCard}>
          <Text style={styles.sensitivityLabel}>
            Comp prices drop{' '}
            <Text style={{ color: C.accentYellow, fontWeight: '800' }}>{store.priceDropPct}%</Text>
          </Text>
          <Slider
            label=""
            value={store.priceDropPct}
            onChange={(v) => store.setCalculator({ priceDropPct: v })}
            color={C.accentYellow}
            max={50}
            showPercent={false}
          />
          <Text style={[styles.sensitivityLabel, { marginTop: 16 }]}>
            Gem-rate shock{' '}
            <Text style={{ color: C.accent, fontWeight: '800' }}>
              {store.gradeVariance > 0 ? '+' : ''}
              {store.gradeVariance} pts
            </Text>
          </Text>
          <Slider
            label=""
            value={store.gradeVariance}
            onChange={(v) => store.setCalculator({ gradeVariance: v })}
            color={C.accent}
            min={-25}
            max={25}
            showPercent={false}
          />
          {store.gradeVariance !== 0 && (
            <Text style={styles.varianceHint}>
              Modeled PSA 10 rate: {adjustedProbs.psa10}% (base {store.probabilities.psa10}%)
            </Text>
          )}
        </RNView>
      </EnterView>

      <EnterView entering={FadeInDown.delay(340).duration(400)} style={{ marginTop: 12, gap: 10 }}>
        <GradientButton
          href="/batch"
          onPress={handleAddToBatch}
          title={addedFlash ? 'Added to batch' : 'Add this card to batch'}
          icon={<FontAwesome name={addedFlash ? 'check' : 'plus'} size={16} color="#FFF" />}
          colors={[C.accentGreen, '#16A34A']}
        />
        <GradientButton
          href="/batch"
          title={`Open batch${store.batchCards.length ? ` (${store.batchCards.length})` : ''}`}
          icon={<FontAwesome name="th-list" size={16} color={C.accentPurple} />}
          outline
          outlineColor={C.accentPurple}
        />
      </EnterView>

      <RNView style={{ height: 100 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  content: { padding: 20, paddingTop: 60, paddingBottom: 40, maxWidth: 560, width: '100%', alignSelf: 'center' },
  header: { marginBottom: 18 },
  logoRow: { flexDirection: 'row', alignItems: 'baseline' },
  logoWhite: { fontSize: 28, fontWeight: '800', color: C.text },
  logoAccent: { fontSize: 28, fontWeight: '800', color: C.accent, marginLeft: 6 },
  tagline: { fontSize: 13, color: C.textMuted, marginTop: 4, fontStyle: 'italic' },
  resultBanner: {
    borderRadius: 20, padding: 20, borderWidth: 1, marginBottom: 12, overflow: 'hidden',
  },
  resultRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  resultLabel: { fontSize: 10, color: C.textMuted, marginBottom: 6, letterSpacing: 0.8 },
  resultRec: { fontSize: 26, fontWeight: '900' },
  resultEV: { fontSize: 26, fontWeight: '800' },
  resultMetrics: { flexDirection: 'row', gap: 8 },
  resultMetric: { flex: 1, backgroundColor: C.background + '60', borderRadius: 10, padding: 10, alignItems: 'center' },
  resultMetricLabel: { fontSize: 9, color: C.textMuted, marginBottom: 4, letterSpacing: 0.5 },
  resultMetricValue: { fontSize: 13, fontWeight: '800', textAlign: 'center' },
  beRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  beText: { fontSize: 11, color: C.textSecondary },
  reasonCard: { marginBottom: 20, gap: 8 },
  reasonRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: C.surface, borderRadius: 12, padding: 12, borderWidth: 0.5, borderColor: C.border,
  },
  reasonText: { fontSize: 12, color: C.textSecondary, flex: 1, lineHeight: 18 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: C.text, marginBottom: 12, marginTop: 4 },
  nameWrap: { marginBottom: 10 },
  inputGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  profileScroll: { marginBottom: 14 },
  profileChip: {
    backgroundColor: C.surface, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20,
    marginRight: 8, borderWidth: 0.5, borderColor: C.border,
  },
  profileChipActive: { borderColor: C.accent + '50' },
  profileChipText: { fontSize: 13, color: C.textSecondary, fontWeight: '600' },
  profileChipTextActive: { color: C.accent },
  probCard: {
    backgroundColor: C.surface, borderRadius: 16, padding: 18, marginBottom: 20,
    borderWidth: 0.5, borderColor: C.border, gap: 16,
  },
  probTotal: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 0.5, borderTopColor: C.border, paddingTop: 12 },
  probTotalLabel: { fontSize: 13, color: C.textSecondary, fontWeight: '700' },
  probTotalValue: { fontSize: 13, fontWeight: '800' },
  sensitivityCard: {
    backgroundColor: C.surface, borderRadius: 16, padding: 18, borderWidth: 0.5, borderColor: C.border,
  },
  sensitivityLabel: { fontSize: 14, color: C.textSecondary, marginBottom: 14 },
  varianceHint: { fontSize: 12, color: C.textMuted, marginTop: 10 },
});
