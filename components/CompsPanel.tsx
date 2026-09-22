import { useEffect, useMemo, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, TextInput, View as RNView } from 'react-native';
import { Text } from '@/components/Themed';
import Colors from '@/constants/Colors';
import GradientButton from '@/components/ui/GradientButton';
import NumberField from '@/components/ui/NumberField';
import type { CardMetadata, CompListing, InventoryCard } from '@/data/types';
import { useAppStore } from '@/store/useAppStore';

const C = Colors.dark;

const BUCKETS: { id: string; label: string; color: string }[] = [
  { id: 'psa10', label: 'PSA 10', color: C.grade10 },
  { id: 'psa9', label: 'PSA 9', color: C.grade9 },
  { id: 'psa8', label: 'PSA 8', color: C.grade8 },
  { id: 'below8', label: 'Below 8', color: C.gradeBelow },
  { id: 'raw', label: 'Raw', color: C.accent },
];

const BUCKET_LABELS: Record<string, string> = {
  raw: 'raw',
  psa10: 'PSA 10',
  psa9: 'PSA 9',
  psa8: 'PSA 8',
  below8: 'below 8',
};

function num(text: string): number {
  const n = parseFloat(text.replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function priceText(value: number | null | undefined): string {
  return value == null ? '' : String(value);
}

function openListing(url: string) {
  if (!url) return;
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  Linking.openURL(url);
}

function sourceLabel(card: InventoryCard): string {
  const comps = card.comps;
  if (!comps) return 'No comps yet — scan sold auctions or enter prices.';
  if (comps.basis === 'sold' || comps.source?.startsWith('cardsight')) {
    return `SOLD AUCTION COMPS · ${comps.listingCount || 0} sales${comps.period ? ` · ${comps.period}` : ''} — preferred for Decide EV`;
  }
  if (comps.source === 'manual') return 'MANUAL COMPS · edit any value to remodel';
  if (comps.source?.endsWith('-edited')) {
    return `${comps.source.startsWith('cardsight') ? 'SOLD AUCTION' : 'EBAY ASKING'} (EDITED) · ${comps.listingCount} listings`;
  }
  if (comps.source?.startsWith('ebay') || comps.basis === 'asking') {
    return `LIVE EBAY ASKING · ${comps.listingCount} listings — not sold comps`;
  }
  return 'No comps yet — scan sold auctions or type your own';
}

export default function CompsPanel({ card }: { card: InventoryCard }) {
  const updateInventoryMetadata = useAppStore((s) => s.updateInventoryMetadata);
  const updateInventoryModeling = useAppStore((s) => s.updateInventoryModeling);
  const refreshInventoryComps = useAppStore((s) => s.refreshInventoryComps);

  const [year, setYear] = useState(card.metadata?.year ?? '');
  const [player, setPlayer] = useState(card.metadata?.player ?? '');
  const [setName, setSetName] = useState(card.metadata?.set ?? '');
  const [parallel, setParallel] = useState(card.metadata?.parallel ?? '');
  const [cardNumber, setCardNumber] = useState(card.metadata?.cardNumber ?? '');
  const [rawText, setRawText] = useState(String(card.estimatedRawValue ?? 0));
  const [c10, setC10] = useState(priceText(card.comps?.prices.psa10));
  const [c9, setC9] = useState(priceText(card.comps?.prices.psa9));
  const [c8, setC8] = useState(priceText(card.comps?.prices.psa8));
  const [c7, setC7] = useState(priceText(card.comps?.prices.below8));
  const [scanning, setScanning] = useState(false);
  const [forceRefreshing, setForceRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setYear(card.metadata?.year ?? '');
    setPlayer(card.metadata?.player ?? '');
    setSetName(card.metadata?.set ?? '');
    setParallel(card.metadata?.parallel ?? '');
    setCardNumber(card.metadata?.cardNumber ?? '');
    setRawText(String(card.estimatedRawValue ?? 0));
    setC10(priceText(card.comps?.prices.psa10));
    setC9(priceText(card.comps?.prices.psa9));
    setC8(priceText(card.comps?.prices.psa8));
    setC7(priceText(card.comps?.prices.below8));
  }, [card.id, card.comps?.fetchedAt]);

  const metadataFromFields = (): CardMetadata => ({
    year: year.trim(),
    player: player.trim(),
    set: setName.trim(),
    parallel: parallel.trim(),
    cardNumber: cardNumber.trim(),
  });

  const persistIdentity = (next: CardMetadata) => {
    updateInventoryMetadata(card.id, next);
  };

  const persistPrices = (p10: string, p9: string, p8: string, p7: string, raw: string) => {
    updateInventoryModeling(card.id, {
      rawValue: num(raw),
      prices: {
        psa10: num(p10),
        psa9: num(p9),
        psa8: num(p8),
        below8: num(p7),
      },
    });
  };

  const scan = async (refresh = false) => {
    if (scanning || forceRefreshing) return;
    const meta = metadataFromFields();
    if (refresh) {
      setForceRefreshing(true);
    } else {
      setScanning(true);
    }
    setError(null);
    persistIdentity(meta);
    try {
      await refreshInventoryComps(card.id, meta, { refresh });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sold comps lookup failed');
    } finally {
      setScanning(false);
      setForceRefreshing(false);
    }
  };

  const listings = card.comps?.listings ?? [];
  const grouped = useMemo(() => {
    const map: Record<string, CompListing[]> = {};
    for (const row of listings) {
      const key = row.bucket || 'raw';
      (map[key] ??= []).push(row);
    }
    return map;
  }, [listings]);

  return (
    <RNView style={styles.wrap}>
      <Text style={styles.sectionLabel}>SEARCH IDENTITY</Text>
      <Text style={styles.hint}>Fix the player, set, number, or parallel, then scan. Sold comps match this text, not the photo.</Text>
      <RNView style={styles.identityGrid}>
        <IdentityField label="Year" value={year} onChange={setYear} onBlur={() => persistIdentity(metadataFromFields())} />
        <IdentityField label="Player" value={player} onChange={setPlayer} onBlur={() => persistIdentity(metadataFromFields())} />
        <IdentityField label="Set" value={setName} onChange={setSetName} onBlur={() => persistIdentity(metadataFromFields())} />
        <IdentityField label="Parallel" value={parallel} onChange={setParallel} onBlur={() => persistIdentity(metadataFromFields())} />
        <IdentityField label="Number" value={cardNumber} onChange={setCardNumber} onBlur={() => persistIdentity(metadataFromFields())} />
      </RNView>

      <GradientButton
        title={scanning ? 'Scanning sold comps…' : 'Scan sold comps'}
        onPress={() => scan(false)}
        style={{ marginTop: 4 }}
      />
      <Pressable
        onPress={() => scan(true)}
        disabled={scanning || forceRefreshing}
        style={styles.refreshLink}
      >
        <Text style={styles.refreshText}>{forceRefreshing ? 'Refreshing comps…' : 'Refresh comps (force new CardSight lookup)'}</Text>
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Text style={[styles.sectionLabel, { marginTop: 16 }]}>{sourceLabel(card)}</Text>
      {card.comps?.query ? <Text style={styles.query}>Query: {card.comps.query}</Text> : null}
      {card.comps?.fallbackReason ? <Text style={styles.fallback}>{card.comps.fallbackReason}</Text> : null}

      <RNView style={styles.priceGrid}>
        <NumberField
          label="Raw"
          prefix="$"
          value={rawText}
          onChangeText={(v) => {
            setRawText(v);
            persistPrices(c10, c9, c8, c7, v);
          }}
        />
        <NumberField
          label="PSA 10"
          prefix="$"
          accentColor={C.grade10}
          value={c10}
          onChangeText={(v) => {
            setC10(v);
            persistPrices(v, c9, c8, c7, rawText);
          }}
        />
        <NumberField
          label="PSA 9"
          prefix="$"
          accentColor={C.grade9}
          value={c9}
          onChangeText={(v) => {
            setC9(v);
            persistPrices(c10, v, c8, c7, rawText);
          }}
        />
        <NumberField
          label="PSA 8"
          prefix="$"
          accentColor={C.grade8}
          value={c8}
          onChangeText={(v) => {
            setC8(v);
            persistPrices(c10, c9, v, c7, rawText);
          }}
        />
        <NumberField
          label="Below 8"
          prefix="$"
          accentColor={C.gradeBelow}
          value={c7}
          onChangeText={(v) => {
            setC7(v);
            persistPrices(c10, c9, c8, v, rawText);
          }}
        />
      </RNView>
      {card.comps?.fallbackBuckets?.length ? (
        <Text style={styles.insufficient}>
          No sold auctions in the window for {card.comps.fallbackBuckets.map((bucket) => BUCKET_LABELS[bucket] ?? bucket).join(', ')} — enter a comp.
        </Text>
      ) : null}
      <Text style={styles.hint}>Edit any dollar amount to remodel EV with your own comps. Sample counts are next to each listing group.</Text>

      {listings.length === 0 ? (
        <Text style={styles.empty}>No retrieved listings yet. Scan sold comps to inspect auction sales, or type comps above.</Text>
      ) : (
        BUCKETS.map((bucket) => {
          const rows = grouped[bucket.id];
          if (!rows?.length) return null;
          const sample =
            bucket.id === 'raw'
              ? card.comps?.samples.raw
              : bucket.id === 'psa10'
                ? card.comps?.samples.psa10
                : bucket.id === 'psa9'
                  ? card.comps?.samples.psa9
                  : bucket.id === 'psa8'
                    ? card.comps?.samples.psa8
                    : card.comps?.samples.below8;
          return (
            <RNView key={bucket.id} style={styles.group}>
              <Text style={[styles.groupLabel, { color: bucket.color }]}>
                {bucket.label} · {sample ?? rows.length}
              </Text>
              {rows.map((row, index) => (
                <Pressable
                  key={`${row.itemId || row.url || row.title}-${index}`}
                  onPress={() => row.url && openListing(row.url)}
                  style={styles.listing}
                  accessibilityRole="link"
                  accessibilityLabel={row.title}
                >
                  <Text style={styles.listingPrice}>
                    {row.price != null ? `$${row.price.toFixed(0)}` : '—'}
                  </Text>
                  <Text style={styles.listingTitle} numberOfLines={2}>
                    {row.title}
                  </Text>
                  <Text style={styles.listingOpen}>{row.soldAt || row.source || (row.url ? 'Open' : '')}</Text>
                </Pressable>
              ))}
            </RNView>
          );
        })
      )}
    </RNView>
  );
}

function IdentityField({
  label,
  value,
  onChange,
  onBlur,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
}) {
  return (
    <RNView style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.fieldInput}
        value={value}
        onChangeText={onChange}
        onBlur={onBlur}
        placeholderTextColor={C.textMuted}
        autoCapitalize="words"
      />
    </RNView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: C.surface,
    borderRadius: 16,
    padding: 14,
    borderWidth: 0.5,
    borderColor: C.border,
    marginTop: 14,
  },
  sectionLabel: {
    fontSize: 10,
    color: C.textMuted,
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  hint: { fontSize: 12, color: C.textMuted, lineHeight: 18, marginBottom: 10 },
  query: { fontSize: 12, color: C.textSecondary, marginBottom: 10 },
  fallback: { fontSize: 12, color: C.accentYellow, lineHeight: 18, marginBottom: 10 },
  insufficient: { fontSize: 12, color: C.accentYellow, lineHeight: 18, marginBottom: 10 },
  refreshLink: { alignSelf: 'flex-start', marginTop: 8, paddingVertical: 4 },
  refreshText: { color: C.accent, fontSize: 12, fontWeight: '700' },
  identityGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  field: {
    backgroundColor: C.background,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexGrow: 1,
    flexBasis: '45%',
  },
  fieldLabel: { fontSize: 10, color: C.textMuted, letterSpacing: 0.4, marginBottom: 4 },
  fieldInput: { fontSize: 14, fontWeight: '600', color: C.text, padding: 0 },
  priceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  error: { color: C.accentRed, fontSize: 12, marginTop: 8 },
  empty: { fontSize: 13, color: C.textSecondary, lineHeight: 19, marginTop: 4 },
  group: { marginTop: 10 },
  groupLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.4, marginBottom: 6 },
  listing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.background,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 6,
  },
  listingPrice: { width: 58, fontSize: 13, fontWeight: '800', color: C.text },
  listingTitle: { flex: 1, fontSize: 12, color: C.textSecondary, lineHeight: 17 },
  listingOpen: { fontSize: 11, color: C.accent, fontWeight: '700' },
});
