import { StyleSheet, ScrollView, Pressable, View as RNView, TextInput } from 'react-native';
import { Text } from '@/components/Themed';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { LinearGradient } from 'expo-linear-gradient';
import { FadeInDown } from 'react-native-reanimated';
import EnterView from '@/components/EnterView';
import Colors from '@/constants/Colors';
import { useAppStore, DEFAULT_SETTINGS } from '@/store/useAppStore';
import { lightImpact } from '@/utils/haptics';

const C = Colors.dark;

export default function SettingsScreen() {
  const { gradingFee, shippingCost, turnaroundDays, setCosts, resetExample, batchCards } = useAppStore();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="always">
      <EnterView entering={FadeInDown.duration(400)} style={styles.appInfo}>
        <LinearGradient colors={[C.accent, C.accentMuted]} style={styles.logoCircle}>
          <Text style={styles.logoText}>G</Text>
        </LinearGradient>
        <RNView style={styles.appNameRow}>
          <Text style={styles.appNameWhite}>GradeDecision</Text>
          <Text style={styles.appNameAccent}>Pro</Text>
        </RNView>
        <Text style={styles.appVersion}>Grade / Sell Raw / Hold — v1.0</Text>
      </EnterView>

      <EnterView entering={FadeInDown.delay(80).duration(400)}>
        <Text style={styles.sectionTitle}>Default submission costs</Text>
        <Text style={styles.sectionHint}>Used by the calculator and batch model. Change them here or on the calculator.</Text>
        <RNView style={styles.card}>
          <CostRow
            icon="money"
            label="Grading fee"
            value={String(gradingFee)}
            prefix="$"
            onChange={(v) => setCosts({ gradingFee: parseFloat(v) || 0 })}
          />
          <RNView style={styles.rowSep} />
          <CostRow
            icon="truck"
            label="Shipping + insurance"
            value={String(shippingCost)}
            prefix="$"
            onChange={(v) => setCosts({ shippingCost: parseFloat(v) || 0 })}
          />
          <RNView style={styles.rowSep} />
          <CostRow
            icon="clock-o"
            label="Turnaround"
            value={String(turnaroundDays)}
            suffix=" days"
            onChange={(v) => setCosts({ turnaroundDays: parseFloat(v) || 1 })}
          />
        </RNView>
      </EnterView>

      <EnterView entering={FadeInDown.delay(160).duration(400)}>
        <Text style={styles.sectionTitle}>How the decision works</Text>
        <RNView style={styles.card}>
          {[
            { icon: 'line-chart', text: 'Expected value = probability-weighted sale at each grade.' },
            { icon: 'balance-scale', text: 'Break-even is the lowest grade whose comp covers raw + fees.' },
            { icon: 'clock-o', text: 'Annualized ROI uses capital locked (raw + fees) over turnaround days.' },
            { icon: 'check-circle', text: 'GRADE if expected profit is positive after 5% opportunity cost, break-even odds ≥ 40%, and annualized ROI ≥ 15%.' },
            { icon: 'pause-circle', text: 'HOLD if profit is positive but odds or capital velocity are thin.' },
            { icon: 'dollar', text: 'SELL RAW if expected profit is zero/negative, or even a PSA 10 misses break-even.' },
          ].map((row, i) => (
            <RNView key={row.text} style={[styles.explainRow, i > 0 && styles.explainBorder]}>
              <RNView style={styles.rowIconContainer}>
                <FontAwesome name={row.icon as any} size={13} color={C.accent} />
              </RNView>
              <Text style={styles.explainText}>{row.text}</Text>
            </RNView>
          ))}
        </RNView>
      </EnterView>

      <EnterView entering={FadeInDown.delay(220).duration(400)}>
        <Pressable
          style={styles.resetBtn}
          onPress={() => {
            lightImpact();
            resetExample();
          }}
          accessibilityRole="button"
          accessibilityLabel="Reset calculator inputs"
        >
          <FontAwesome name="undo" size={14} color={C.textSecondary} />
          <Text style={styles.resetText}>
            Reset calculator inputs ({DEFAULT_SETTINGS.gradingFee} fee / {DEFAULT_SETTINGS.turnaroundDays}d turnaround)
          </Text>
        </Pressable>
        <Text style={styles.batchNote}>
          {batchCards.length} card{batchCards.length === 1 ? '' : 's'} currently in batch
        </Text>
      </EnterView>

      <Text style={styles.disclaimer}>
        GradeDecision Pro models expected value from the comps and probabilities you enter, plus grading fees and turnaround. Estimates are informational only — actual sale prices and PSA grades will differ. Not affiliated with PSA, BGS, or SGC.
      </Text>

      <RNView style={{ height: 100 }} />
    </ScrollView>
  );
}

function CostRow({
  icon,
  label,
  value,
  prefix,
  suffix,
  onChange,
}: {
  icon: string;
  label: string;
  value: string;
  prefix?: string;
  suffix?: string;
  onChange: (v: string) => void;
}) {
  return (
    <RNView style={styles.costRow}>
      <RNView style={styles.rowIconContainer}>
        <FontAwesome name={icon as any} size={14} color={C.textSecondary} />
      </RNView>
      <Text style={styles.rowLabel}>{label}</Text>
      {prefix ? <Text style={styles.affix}>{prefix}</Text> : null}
      <TextInput
        style={styles.costInput}
        value={value}
        onChangeText={onChange}
        keyboardType="numeric"
        placeholderTextColor={C.textMuted}
      />
      {suffix ? <Text style={styles.affix}>{suffix}</Text> : null}
    </RNView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  content: { padding: 20, paddingBottom: 40, maxWidth: 560, width: '100%', alignSelf: 'center' },
  appInfo: { alignItems: 'center', marginBottom: 28, marginTop: 8 },
  logoCircle: { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  logoText: { fontSize: 24, fontWeight: '900', color: C.text },
  appNameRow: { flexDirection: 'row', alignItems: 'baseline' },
  appNameWhite: { fontSize: 22, fontWeight: '800', color: C.text },
  appNameAccent: { fontSize: 22, fontWeight: '800', color: C.accent, marginLeft: 5 },
  appVersion: { fontSize: 12, color: C.textMuted, marginTop: 4 },
  sectionTitle: {
    fontSize: 12, fontWeight: '700', color: C.textMuted, marginBottom: 8, marginTop: 4,
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  sectionHint: { fontSize: 12, color: C.textSecondary, marginBottom: 10, lineHeight: 18 },
  card: {
    backgroundColor: C.surface, borderRadius: 16, overflow: 'hidden',
    marginBottom: 20, borderWidth: 0.5, borderColor: C.border,
  },
  costRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16 },
  rowIconContainer: {
    width: 30, height: 30, borderRadius: 8, backgroundColor: C.surfaceElevated,
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  rowLabel: { flex: 1, fontSize: 15, color: C.text },
  affix: { fontSize: 13, color: C.textMuted, marginHorizontal: 4 },
  costInput: { minWidth: 64, textAlign: 'right', fontSize: 16, fontWeight: '700', color: C.text, paddingVertical: 4 },
  rowSep: { height: 0.5, backgroundColor: C.surfaceElevated, marginLeft: 58 },
  explainRow: { flexDirection: 'row', alignItems: 'flex-start', padding: 14, gap: 4 },
  explainBorder: { borderTopWidth: 0.5, borderTopColor: C.surfaceElevated },
  explainText: { flex: 1, fontSize: 13, color: C.textSecondary, lineHeight: 19 },
  resetBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.surface,
    borderRadius: 12, padding: 14, borderWidth: 0.5, borderColor: C.border, marginBottom: 8,
  },
  resetText: { flex: 1, fontSize: 13, color: C.textSecondary, fontWeight: '600' },
  batchNote: { fontSize: 12, color: C.textMuted, marginBottom: 20, textAlign: 'center' },
  disclaimer: { fontSize: 11, color: C.textMuted, lineHeight: 16, textAlign: 'center', marginTop: 8 },
});
