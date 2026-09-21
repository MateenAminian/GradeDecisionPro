import { useMemo, useState } from 'react';
import { StyleSheet, ScrollView, Pressable, View as RNView, Switch, TextInput } from 'react-native';
import { Text } from '@/components/Themed';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { LinearGradient } from 'expo-linear-gradient';
import { FadeInDown, FadeInRight } from 'react-native-reanimated';
import EnterView from '@/components/EnterView';
import Colors from '@/constants/Colors';
import GradientButton from '@/components/ui/GradientButton';
import { useAppStore } from '@/store/useAppStore';
import { calculateBatchEV } from '@/data/evCalculator';
import { getRecommendationStyle } from '@/data/recommendation';
import { presetProfiles } from '@/data/presetProfiles';
import { analysisTitle } from '@/data/cardDisplay';
import { lightImpact, successNotification } from '@/utils/haptics';
import { exportBatchCsv } from '@/utils/exportCsv';

const C = Colors.dark;

function RecBadge({ recommendation }: { recommendation: string }) {
  const style = getRecommendationStyle(recommendation as 'GRADE' | 'SELL_RAW' | 'HOLD');
  return (
    <RNView style={[styles.recBadge, { backgroundColor: style.color + '18', borderColor: style.color + '40' }]}>
      <Text style={[styles.recBadgeText, { color: style.color }]}>{style.label}</Text>
    </RNView>
  );
}

export default function BatchScreen() {
  const {
    batchCards,
    gradingFee,
    shippingCost,
    turnaroundDays,
    toggleBatchCard,
    removeBatchCard,
    setBatchIncluded,
    addBatchCard,
    applyMarketplaceFees,
    marketplaceFeePct,
    paymentFeePct,
    taxPct,
    daysToSell,
  } = useAppStore();

  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [year, setYear] = useState('');
  const [cardSet, setCardSet] = useState('');
  const [parallel, setParallel] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [raw, setRaw] = useState('');
  const [c10, setC10] = useState('');
  const [c9, setC9] = useState('');
  const [c8, setC8] = useState('');
  const [c7, setC7] = useState('');
  const [profileId, setProfileId] = useState('modern-mint');
  const [addError, setAddError] = useState<string | null>(null);

  const { cards: evaluatedCards, summary } = useMemo(
    () =>
      calculateBatchEV({
        cards: batchCards,
        gradingFee,
        shippingCost,
        turnaroundDays,
        marketplaceFeePct: applyMarketplaceFees ? marketplaceFeePct : 0,
        paymentFeePct: applyMarketplaceFees ? paymentFeePct : 0,
        taxPct: applyMarketplaceFees ? taxPct : 0,
        daysToSell,
      }),
    [
      batchCards,
      gradingFee,
      shippingCost,
      turnaroundDays,
      applyMarketplaceFees,
      marketplaceFeePct,
      paymentFeePct,
      taxPct,
      daysToSell,
    ],
  );

  const handleOptimize = () => {
    const gradeIds = evaluatedCards.filter((c) => c.evResult.recommendation === 'GRADE').map((c) => c.id);
    const rest = evaluatedCards.filter((c) => c.evResult.recommendation !== 'GRADE').map((c) => c.id);
    setBatchIncluded(gradeIds, true);
    setBatchIncluded(rest, false);
    successNotification();
  };

  const handleAdd = () => {
    const metadata = {
      year: year.trim(),
      player: name.trim(),
      set: cardSet.trim(),
      parallel: parallel.trim(),
      cardNumber: cardNumber.trim(),
    };
    const hasIdentity =
      Boolean(metadata.player) ||
      (Boolean(metadata.set) && Boolean(metadata.cardNumber)) ||
      Boolean(metadata.year && metadata.player);
    if (!hasIdentity) {
      setAddError('Add a player name, or set + card number, before creating a batch card.');
      return;
    }
    setAddError(null);
    const profile = presetProfiles.find((p) => p.id === profileId) ?? presetProfiles[0];
    const label = analysisTitle({ metadata }) || `Card ${batchCards.length + 1}`;
    addBatchCard(
      {
        name: label,
        rawValue: parseFloat(raw) || 0,
        probabilities: { ...profile.probabilities },
        profileId: profile.id,
        compPrices: {
          psa10: parseFloat(c10) || 0,
          psa9: parseFloat(c9) || 0,
          psa8: parseFloat(c8) || 0,
          below8: parseFloat(c7) || 0,
        },
      },
      metadata,
    );
    setName('');
    setYear('');
    setCardSet('');
    setParallel('');
    setCardNumber('');
    setRaw('');
    setC10('');
    setC9('');
    setC8('');
    setC7('');
    setShowAdd(false);
    lightImpact();
  };

  const profitColor = summary.totalExpectedProfit > 0 ? C.accentGreen : C.accentRed;
  const addForm = (
    <EnterView entering={FadeInDown.duration(300)} style={styles.addCard}>
      <Text style={styles.costTitle}>Add card</Text>
      <TextInput
        style={styles.nameInput}
        placeholder="Player name"
        placeholderTextColor={C.textMuted}
        value={name}
        onChangeText={(v) => {
          setName(v);
          if (addError) setAddError(null);
        }}
      />
      <RNView style={styles.addGrid}>
        <MiniInput label="Year" value={year} onChange={setYear} keyboardType="default" />
        <MiniInput label="Set" value={cardSet} onChange={setCardSet} keyboardType="default" />
        <MiniInput label="Parallel" value={parallel} onChange={setParallel} keyboardType="default" />
        <MiniInput label="Number" value={cardNumber} onChange={setCardNumber} keyboardType="default" />
        <MiniInput label="Raw" value={raw} onChange={setRaw} />
        <MiniInput label="PSA 10" value={c10} onChange={setC10} />
        <MiniInput label="PSA 9" value={c9} onChange={setC9} />
        <MiniInput label="PSA 8" value={c8} onChange={setC8} />
        <MiniInput label="Below 8" value={c7} onChange={setC7} />
      </RNView>
      {addError ? <Text style={styles.addError}>{addError}</Text> : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
        {presetProfiles.filter((p) => p.id !== 'custom').map((p) => (
          <Pressable key={p.id} onPress={() => setProfileId(p.id)} accessibilityRole="button" accessibilityLabel={p.name}>
            <RNView style={[styles.profileChip, profileId === p.id && styles.profileChipActive]}>
              <Text style={[styles.profileChipText, profileId === p.id && { color: C.accent }]}>{p.name}</Text>
            </RNView>
          </Pressable>
        ))}
      </ScrollView>
      <RNView style={{ flexDirection: 'row', gap: 8 }}>
        <GradientButton onPress={handleAdd} title="Add to batch + inventory" size="small" style={{ flex: 1 }} />
        {batchCards.length > 0 ? (
          <GradientButton onPress={() => setShowAdd(false)} title="Cancel" outline outlineColor={C.textMuted} size="small" />
        ) : null}
      </RNView>
    </EnterView>
  );

  if (batchCards.length === 0) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="always">
        <Text style={styles.title}>Batch Submission</Text>
        <Text style={styles.subtitle}>
          Add cards with comps and a probability profile. Shipping is ${shippingCost} once for the whole submission.
        </Text>
        {addForm}
        <GradientButton
          href="/"
          title="Or model a card in the calculator"
          icon={<FontAwesome name="calculator" size={16} color={C.accent} />}
          outline
          outlineColor={C.accent}
          style={{ marginTop: 12 }}
        />
        <RNView style={{ height: 40 }} />
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="always">
      <EnterView entering={FadeInDown.duration(400)}>
        <Text style={styles.title}>Batch Submission</Text>
        <Text style={styles.subtitle}>
          Shipping is one cost for the whole submission (${shippingCost}), not per card. Grading fee is ${gradingFee} each.
        </Text>
      </EnterView>

      {batchCards.length > 0 && (
        <EnterView entering={FadeInDown.delay(80).duration(400)}>
          <LinearGradient
            colors={[profitColor + '12', profitColor + '04']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.summaryCard, { borderColor: profitColor + '30' }]}
          >
            <RNView style={styles.summaryTopRow}>
              <RNView>
                <Text style={styles.summaryLabel}>NET EXPECTED PROFIT</Text>
                <Text style={[styles.summaryProfit, { color: profitColor }]}>
                  {summary.totalExpectedProfit > 0 ? '+' : ''}${summary.totalExpectedProfit.toFixed(0)}
                </Text>
              </RNView>
              <RNView style={{ alignItems: 'flex-end' }}>
                <Text style={styles.summaryLabel}>ANN. ROI</Text>
                <Text style={[styles.summaryROI, { color: profitColor }]}>{summary.annualizedRoi.toFixed(0)}%</Text>
              </RNView>
            </RNView>

            <RNView style={styles.summaryGrid}>
              {[
                { label: 'Cards', value: `${summary.includedCards}/${summary.totalCards}`, color: C.text },
                { label: 'Raw Value', value: `$${summary.totalRawValue.toFixed(0)}`, color: C.textSecondary },
                { label: 'Submit Cost', value: `$${summary.totalGradingCost.toFixed(0)}`, color: C.accentYellow },
                { label: 'Expected EV', value: `$${summary.totalExpectedValue.toFixed(0)}`, color: C.accent },
              ].map((m) => (
                <RNView key={m.label} style={styles.summaryMetric}>
                  <Text style={styles.summaryMetricLabel}>{m.label}</Text>
                  <Text style={[styles.summaryMetricValue, { color: m.color }]}>{m.value}</Text>
                </RNView>
              ))}
            </RNView>

            <RNView style={styles.summaryVerdictRow}>
              <RNView style={[styles.verdictPill, { backgroundColor: C.accentGreen + '15' }]}>
                <FontAwesome name="check" size={10} color={C.accentGreen} />
                <Text style={[styles.verdictText, { color: C.accentGreen }]}>{summary.worthGrading} grade</Text>
              </RNView>
              <RNView style={[styles.verdictPill, { backgroundColor: C.accentYellow + '15' }]}>
                <FontAwesome name="times" size={10} color={C.accentYellow} />
                <Text style={[styles.verdictText, { color: C.accentYellow }]}>{summary.notWorthGrading} skip</Text>
              </RNView>
            </RNView>
          </LinearGradient>
        </EnterView>
      )}

      {batchCards.length > 0 && (
        <EnterView entering={FadeInDown.delay(120).duration(400)} style={styles.actionRow}>
          <GradientButton
            onPress={handleOptimize}
            title="Keep GRADE cards only"
            icon={<FontAwesome name="magic" size={16} color="#FFF" />}
            colors={[C.accent, C.accentMuted]}
            size="small"
            style={{ flex: 1 }}
          />
          <GradientButton
            onPress={() => exportBatchCsv(evaluatedCards)}
            title="CSV"
            outline
            outlineColor={C.accent}
            size="small"
          />
        </EnterView>
      )}

      {evaluatedCards.map((card, i) => (
        <EnterView key={card.id} entering={FadeInRight.delay(80 + i * 40).duration(400).springify()}>
          <RNView style={[styles.cardRow, !card.included && styles.cardRowExcluded]}>
            <RNView style={styles.cardInfo}>
              <Text style={[styles.cardName, !card.included && { opacity: 0.4 }]}>{card.name}</Text>
              <RNView style={styles.cardMetaRow}>
                <Text style={styles.cardMeta}>Raw: ${card.rawValue}</Text>
                <Text style={styles.cardMetaSep}>|</Text>
                <Text style={[styles.cardMeta, { color: C.accent }]}>
                  EV: ${card.evResult.expectedValue.toFixed(0)}
                </Text>
                <Text style={styles.cardMetaSep}>|</Text>
                <Text
                  style={[
                    styles.cardMeta,
                    { color: card.evResult.expectedProfit > 0 ? C.accentGreen : C.accentRed },
                  ]}
                >
                  {card.evResult.expectedProfit > 0 ? '+' : ''}${card.evResult.expectedProfit.toFixed(0)}
                </Text>
              </RNView>
              <RecBadge recommendation={card.evResult.recommendation} />
            </RNView>
            <Switch
              value={card.included}
              onValueChange={() => toggleBatchCard(card.id)}
              trackColor={{ false: C.surfaceElevated, true: C.accent + '40' }}
              thumbColor={card.included ? C.accent : C.textMuted}
            />
            <Pressable
              onPress={() => removeBatchCard(card.id)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.removeBtn}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${card.name}`}
            >
              <FontAwesome name="trash-o" size={16} color={C.accentRed} />
            </Pressable>
          </RNView>
        </EnterView>
      ))}

      {showAdd ? (
        addForm
      ) : (
        <EnterView entering={FadeInDown.delay(200).duration(400)} style={{ marginTop: 8 }}>
          <GradientButton
            onPress={() => setShowAdd(true)}
            title="Add another card"
            icon={<FontAwesome name="plus" size={14} color={C.accent} />}
            outline
            outlineColor={C.accent}
          />
        </EnterView>
      )}

      {batchCards.length > 0 && (
        <EnterView entering={FadeInDown.delay(240).duration(400)}>
          <RNView style={styles.costBreakdown}>
            <Text style={styles.costTitle}>Cost Breakdown</Text>
            {[
              { l: 'Grading fees', v: `$${gradingFee} × ${summary.includedCards} = $${gradingFee * summary.includedCards}` },
              { l: 'Shipping & insurance (once)', v: `$${summary.totalShippingCost.toFixed(0)}` },
              { l: 'Total submission cost', v: `$${summary.totalGradingCost.toFixed(0)}` },
              { l: 'Turnaround', v: `${turnaroundDays} days` },
            ].map((row, i) => (
              <RNView key={row.l} style={[styles.costRow, i > 0 && styles.costRowBorder]}>
                <Text style={styles.costLabel}>{row.l}</Text>
                <Text style={styles.costValue}>{row.v}</Text>
              </RNView>
            ))}
          </RNView>
        </EnterView>
      )}

      <RNView style={{ height: 100 }} />
    </ScrollView>
  );
}

function MiniInput({
  label,
  value,
  onChange,
  keyboardType = 'numeric',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  keyboardType?: 'numeric' | 'default';
}) {
  return (
    <RNView style={styles.miniField}>
      <Text style={styles.miniLabel}>{label}</Text>
      <TextInput style={styles.miniInput} value={value} onChangeText={onChange} keyboardType={keyboardType} placeholderTextColor={C.textMuted} />
    </RNView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', padding: 32, maxWidth: 560, width: '100%', alignSelf: 'center' },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: C.text, marginTop: 16, marginBottom: 8 },
  emptySub: { fontSize: 14, color: C.textSecondary, textAlign: 'center', lineHeight: 20 },
  content: { padding: 20, paddingBottom: 40, maxWidth: 720, width: '100%', alignSelf: 'center' },
  title: { fontSize: 24, fontWeight: '800', color: C.text, marginBottom: 6 },
  subtitle: { fontSize: 13, color: C.textSecondary, lineHeight: 19, marginBottom: 20 },
  summaryCard: { borderRadius: 20, padding: 20, borderWidth: 1, marginBottom: 16, overflow: 'hidden' },
  summaryTopRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  summaryLabel: { fontSize: 9, color: C.textMuted, letterSpacing: 0.8, marginBottom: 4 },
  summaryProfit: { fontSize: 28, fontWeight: '900' },
  summaryROI: { fontSize: 24, fontWeight: '800' },
  summaryGrid: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  summaryMetric: { flex: 1, backgroundColor: C.background + '60', borderRadius: 10, padding: 10, alignItems: 'center' },
  summaryMetricLabel: { fontSize: 8, color: C.textMuted, letterSpacing: 0.5, marginBottom: 4 },
  summaryMetricValue: { fontSize: 13, fontWeight: '800' },
  summaryVerdictRow: { flexDirection: 'row', gap: 8 },
  verdictPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  verdictText: { fontSize: 12, fontWeight: '600' },
  actionRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  cardRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface,
    borderRadius: 14, padding: 12, marginBottom: 8, borderWidth: 0.5, borderColor: C.border,
  },
  cardRowExcluded: { opacity: 0.5 },
  cardInfo: { flex: 1, marginRight: 8 },
  cardName: { fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 4 },
  cardMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6, flexWrap: 'wrap' },
  cardMeta: { fontSize: 11, color: C.textSecondary, fontWeight: '500' },
  cardMetaSep: { fontSize: 11, color: C.border },
  recBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, borderWidth: 1 },
  recBadgeText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  removeBtn: { padding: 6, marginLeft: 4 },
  costBreakdown: {
    backgroundColor: C.surface, borderRadius: 16, padding: 16, marginTop: 16,
    borderWidth: 0.5, borderColor: C.border,
  },
  costTitle: { fontSize: 15, fontWeight: '700', color: C.text, marginBottom: 12 },
  costRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10 },
  costRowBorder: { borderTopWidth: 0.5, borderTopColor: C.surfaceElevated },
  costLabel: { fontSize: 13, color: C.textMuted },
  costValue: { fontSize: 13, fontWeight: '600', color: C.text },
  addCard: {
    backgroundColor: C.surface, borderRadius: 16, padding: 16, marginTop: 8,
    borderWidth: 0.5, borderColor: C.border,
  },
  nameInput: {
    backgroundColor: C.background, borderRadius: 10, padding: 12, color: C.text,
    fontSize: 15, marginBottom: 12, borderWidth: 0.5, borderColor: C.border,
  },
  addError: { color: C.accentRed, fontSize: 12, marginBottom: 10, fontWeight: '600' },
  addGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  miniField: {
    flexGrow: 1, flexBasis: '30%', backgroundColor: C.background, borderRadius: 10,
    padding: 10, borderWidth: 0.5, borderColor: C.border,
  },
  miniLabel: { fontSize: 10, color: C.textMuted, marginBottom: 4, textTransform: 'uppercase' },
  miniInput: { fontSize: 16, fontWeight: '700', color: C.text, padding: 0 },
  profileChip: {
    backgroundColor: C.background, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16,
    marginRight: 8, borderWidth: 0.5, borderColor: C.border,
  },
  profileChipActive: { borderColor: C.accent + '50' },
  profileChipText: { fontSize: 12, color: C.textSecondary, fontWeight: '600' },
});
