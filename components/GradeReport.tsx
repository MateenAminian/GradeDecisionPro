import { Image, StyleSheet, View as RNView } from 'react-native';
import { Text } from '@/components/Themed';
import Colors from '@/constants/Colors';
import { getRecommendationStyle } from '@/data/recommendation';
import { analysisTitle, gradeHeadline } from '@/data/cardDisplay';
import { summarizeGradeConfidence } from '@/data/gradeConfidence';
import type { InventoryCard, Recommendation } from '@/data/types';

const C = Colors.dark;

export function RecBadge({ recommendation }: { recommendation?: string | null }) {
  const style = getRecommendationStyle(recommendation as Recommendation | undefined);
  return (
    <RNView style={[styles.recBadge, { backgroundColor: style.color + '18', borderColor: style.color + '40' }]}>
      <Text style={[styles.recBadgeText, { color: style.color }]}>{style.label}</Text>
    </RNView>
  );
}

export default function GradeReport({
  card,
  compact = false,
  hideComps = false,
  hideIdentity = false,
}: {
  card: InventoryCard;
  compact?: boolean;
  hideComps?: boolean;
  hideIdentity?: boolean;
}) {
  const confidence = summarizeGradeConfidence(card.gradeProbabilities);

  return (
    <RNView style={[styles.card, !card.ok && styles.cardFail]}>
      {card.imageUri && !compact ? (
        <Image source={{ uri: card.imageUri }} style={styles.hero} resizeMode="contain" />
      ) : null}

      <RNView style={styles.header}>
        {card.imageUri && compact ? (
          <Image source={{ uri: card.imageUri }} style={styles.thumb} />
        ) : null}
        <RNView style={{ flex: 1, marginRight: 8 }}>
          <Text style={styles.name}>{analysisTitle(card)}</Text>
          {card.ok ? (
            <Text style={styles.grade}>{gradeHeadline(card)}</Text>
          ) : (
            <Text style={styles.meta}>Scan failed</Text>
          )}
        </RNView>
        <RecBadge recommendation={card.ok ? card.recommendation : undefined} />
      </RNView>

      {!card.ok ? (
        <Text style={styles.fail}>{card.error || 'Could not analyze this photo'}</Text>
      ) : compact ? null : (
        <>
          <RNView style={styles.metricRow}>
            <RNView style={styles.metric}>
              <Text style={styles.metricLabel}>EV</Text>
              <Text style={styles.metricValue}>${(card.expectedValue ?? 0).toFixed(0)}</Text>
            </RNView>
            <RNView style={styles.metric}>
              <Text style={styles.metricLabel}>PROFIT</Text>
              <Text
                style={[
                  styles.metricValue,
                  { color: (card.expectedProfit ?? 0) >= 0 ? C.accentGreen : C.accentRed },
                ]}
              >
                {(card.expectedProfit ?? 0) >= 0 ? '+' : ''}
                ${(card.expectedProfit ?? 0).toFixed(0)}
              </Text>
            </RNView>
            <RNView style={styles.metric}>
              <Text style={styles.metricLabel}>RAW EST.</Text>
              <Text style={styles.metricValue}>${(card.estimatedRawValue ?? 0).toFixed(0)}</Text>
            </RNView>
          </RNView>

          {card.gradeProbabilities ? (
            <RNView style={styles.probRow}>
              {[
                { l: 'PSA 10', v: card.gradeProbabilities.psa10Percent, c: C.grade10 },
                { l: 'PSA 9', v: card.gradeProbabilities.psa9Percent, c: C.grade9 },
                { l: 'PSA 8', v: card.gradeProbabilities.psa8Percent, c: C.grade8 },
              ].map((p) => (
                <RNView key={p.l} style={styles.probChip}>
                  <Text style={[styles.probValue, { color: p.c }]}>{p.v.toFixed(0)}%</Text>
                  <Text style={styles.probLabel}>{p.l}</Text>
                </RNView>
              ))}
            </RNView>
          ) : null}

          {confidence ? (
            <RNView style={styles.confidenceCard}>
              <RNView>
                <Text style={styles.sectionLabel}>CONFIDENCE / UNCERTAINTY</Text>
                <Text style={styles.confidenceTitle}>
                  {confidence.confidenceScore}/100 · {confidence.label}
                </Text>
              </RNView>
              <Text style={styles.confidenceBand}>{confidence.band}</Text>
            </RNView>
          ) : null}

          {card.comps && !hideComps ? (
            <RNView style={styles.section}>
              <Text style={styles.sectionLabel}>
                {card.comps.source.startsWith('ebay')
                  ? `LIVE EBAY ASKING · ${card.comps.listingCount} listings (not sold)`
                  : card.comps.basis === 'sold'
                    ? 'SOLD COMPS'
                    : card.comps.source === 'manual' || card.comps.source.endsWith('-edited')
                      ? 'MANUAL COMPS'
                      : 'NO COMPS YET'}
              </Text>
              <RNView style={styles.probRow}>
                {[
                  { l: 'PSA 10', v: card.comps.prices.psa10, n: card.comps.samples.psa10 },
                  { l: 'PSA 9', v: card.comps.prices.psa9, n: card.comps.samples.psa9 },
                  { l: 'PSA 8', v: card.comps.prices.psa8, n: card.comps.samples.psa8 },
                  { l: 'Raw', v: card.estimatedRawValue ?? 0, n: card.comps.samples.raw },
                ].map((p) => (
                  <RNView key={p.l} style={styles.probChip}>
                    <Text style={styles.probValue}>${p.v.toFixed(0)}</Text>
                    <Text style={styles.probLabel}>{p.l}{p.n ? ` · ${p.n}` : ''}</Text>
                  </RNView>
                ))}
              </RNView>
              {card.comps.query ? (
                <Text style={styles.reason}>Query: {card.comps.query}</Text>
              ) : null}
            </RNView>
          ) : null}

          {card.conditionReport ? (
            <RNView style={styles.section}>
              <Text style={styles.sectionLabel}>CONDITION</Text>
              <Text style={styles.condition}>
                {[
                  card.conditionReport.centering && `Centering: ${card.conditionReport.centering}`,
                  card.conditionReport.corners && `Corners: ${card.conditionReport.corners}`,
                  card.conditionReport.surfaceNotes,
                ]
                  .filter(Boolean)
                  .join('\n')}
              </Text>
            </RNView>
          ) : null}

          {card.metadata?.player && !hideIdentity ? (
            <RNView style={styles.section}>
              <Text style={styles.sectionLabel}>IDENTITY</Text>
              <Text style={styles.condition}>
                {[
                  card.metadata.player && `Player: ${card.metadata.player}`,
                  card.metadata.year && `Year: ${card.metadata.year}`,
                  card.metadata.set && `Set: ${card.metadata.set}`,
                  card.metadata.cardNumber && `Number: ${card.metadata.cardNumber}`,
                  card.metadata.parallel && `Parallel: ${card.metadata.parallel}`,
                ]
                  .filter(Boolean)
                  .join('\n')}
              </Text>
            </RNView>
          ) : null}

          {card.reasoning?.length ? (
            <RNView style={styles.section}>
              <Text style={styles.sectionLabel}>WHY THIS CALL</Text>
              {card.reasoning.map((line) => (
                <Text key={line} style={styles.reason}>
                  {line}
                </Text>
              ))}
            </RNView>
          ) : null}
        </>
      )}

      {compact ? (
        <RNView style={styles.openHint}>
          <Text style={styles.openHintText}>Open grade report</Text>
          <Text style={styles.openHintText}>›</Text>
        </RNView>
      ) : null}
    </RNView>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: C.surface,
    borderRadius: 16,
    padding: 14,
    borderWidth: 0.5,
    borderColor: C.border,
  },
  cardFail: { borderColor: C.accentRed + '50' },
  hero: {
    width: '100%',
    height: 280,
    borderRadius: 12,
    backgroundColor: C.background,
    marginBottom: 14,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  thumb: { width: 56, height: 78, borderRadius: 8, marginRight: 10, backgroundColor: C.surfaceElevated },
  name: { fontSize: 16, fontWeight: '700', color: C.text },
  grade: { fontSize: 13, fontWeight: '700', color: C.accent, marginTop: 4 },
  meta: { fontSize: 12, color: C.textSecondary, marginTop: 2 },
  recBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  recBadgeText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  metricRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  metric: { flex: 1, backgroundColor: C.background, borderRadius: 10, padding: 10 },
  metricLabel: { fontSize: 9, color: C.textMuted, letterSpacing: 0.5, marginBottom: 4 },
  metricValue: { fontSize: 16, fontWeight: '800', color: C.text },
  probRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  probChip: { flex: 1, alignItems: 'center', backgroundColor: C.background, borderRadius: 10, paddingVertical: 8 },
  probValue: { fontSize: 14, fontWeight: '800' },
  probLabel: { fontSize: 10, color: C.textMuted, marginTop: 2 },
  confidenceCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: C.background,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 0.5,
    borderColor: C.accent + '30',
    gap: 12,
  },
  confidenceTitle: { fontSize: 13, color: C.text, fontWeight: '800' },
  confidenceBand: { fontSize: 14, color: C.accent, fontWeight: '900' },
  section: { marginTop: 6, marginBottom: 8 },
  sectionLabel: { fontSize: 10, color: C.textMuted, letterSpacing: 0.8, marginBottom: 6 },
  condition: { fontSize: 13, color: C.textSecondary, lineHeight: 20 },
  reason: { fontSize: 12, color: C.textMuted, lineHeight: 18, marginBottom: 4 },
  fail: { fontSize: 13, color: C.accentRed },
  openHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  openHintText: { fontSize: 12, color: C.textMuted, fontWeight: '600' },
});
