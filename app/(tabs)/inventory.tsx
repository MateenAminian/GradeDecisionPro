import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View as RNView } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { FadeInDown } from 'react-native-reanimated';
import { Text } from '@/components/Themed';
import EnterView from '@/components/EnterView';
import Colors from '@/constants/Colors';
import GradientButton from '@/components/ui/GradientButton';
import CardLink from '@/components/ui/CardLink';
import GradeReport from '@/components/GradeReport';
import { useAppStore } from '@/store/useAppStore';
import { analysisTitle, gradeHeadline } from '@/data/cardDisplay';
import { PLACEHOLDER_COMPS } from '@/data/inventoryCard';
import { presetProfiles } from '@/data/presetProfiles';
import { lightImpact } from '@/utils/haptics';

const C = Colors.dark;

function parseMoney(text: string, fallback: number): number {
  const n = parseFloat(text.replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : fallback;
}

export default function InventoryScreen() {
  const inventory = useAppStore((s) => s.inventory);
  const addManualInventoryCard = useAppStore((s) => s.addManualInventoryCard);
  const importMissingBatchCards = useAppStore((s) => s.importMissingBatchCards);

  const [showAdd, setShowAdd] = useState(inventory.length === 0);
  const [player, setPlayer] = useState('');
  const [year, setYear] = useState('');
  const [setName, setSetName] = useState('');
  const [parallel, setParallel] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [raw, setRaw] = useState('0');
  const [c10, setC10] = useState(String(PLACEHOLDER_COMPS.psa10));
  const [c9, setC9] = useState(String(PLACEHOLDER_COMPS.psa9));
  const [c8, setC8] = useState(String(PLACEHOLDER_COMPS.psa8));
  const [c7, setC7] = useState(String(PLACEHOLDER_COMPS.below8));
  const [profileId, setProfileId] = useState('modern-mint');

  useFocusEffect(
    useCallback(() => {
      const added = importMissingBatchCards();
      if (added > 0) setShowAdd(false);
    }, [importMissingBatchCards]),
  );

  useEffect(() => {
    if (inventory.length === 0) setShowAdd(true);
  }, [inventory.length]);

  const handleAdd = () => {
    const metadata = {
      year: year.trim(),
      player: player.trim(),
      set: setName.trim(),
      parallel: parallel.trim(),
      cardNumber: cardNumber.trim(),
    };
    if (!metadata.player && !metadata.set && !metadata.cardNumber) return;
    const profile = presetProfiles.find((p) => p.id === profileId) ?? presetProfiles[0];
    const card = addManualInventoryCard({
      metadata,
      rawValue: parseMoney(raw, 0),
      probabilities: { ...profile.probabilities },
      compPrices: {
        psa10: parseMoney(c10, PLACEHOLDER_COMPS.psa10),
        psa9: parseMoney(c9, PLACEHOLDER_COMPS.psa9),
        psa8: parseMoney(c8, PLACEHOLDER_COMPS.psa8),
        below8: parseMoney(c7, PLACEHOLDER_COMPS.below8),
      },
    });
    setPlayer('');
    setYear('');
    setSetName('');
    setParallel('');
    setCardNumber('');
    setShowAdd(false);
    lightImpact();
    router.push(`/card/${card.id}`);
  };

  const addForm = (
    <EnterView entering={FadeInDown.duration(280)} style={styles.addCard}>
      <Text style={styles.addTitle}>Add card</Text>
      <Text style={styles.addHint}>
        Type the identity, then open the card and tap Scan eBay comps. You can edit the dollars after listings come back.
      </Text>
      <RNView style={styles.addGrid}>
        <Field label="Player" value={player} onChange={setPlayer} grow />
        <Field label="Year" value={year} onChange={setYear} />
        <Field label="Set" value={setName} onChange={setSetName} />
        <Field label="Parallel" value={parallel} onChange={setParallel} />
        <Field label="Number" value={cardNumber} onChange={setCardNumber} />
        <Field label="Raw $" value={raw} onChange={setRaw} keyboardType="numeric" />
        <Field label="PSA 10 $" value={c10} onChange={setC10} keyboardType="numeric" />
        <Field label="PSA 9 $" value={c9} onChange={setC9} keyboardType="numeric" />
        <Field label="PSA 8 $" value={c8} onChange={setC8} keyboardType="numeric" />
        <Field label="Below 8 $" value={c7} onChange={setC7} keyboardType="numeric" />
      </RNView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
        {presetProfiles
          .filter((p) => p.id !== 'custom')
          .map((p) => (
            <Pressable key={p.id} onPress={() => setProfileId(p.id)} accessibilityRole="button" accessibilityLabel={p.name}>
              <RNView style={[styles.profileChip, profileId === p.id && styles.profileChipActive]}>
                <Text style={[styles.profileChipText, profileId === p.id && { color: C.accent }]}>{p.name}</Text>
              </RNView>
            </Pressable>
          ))}
      </ScrollView>
      <RNView style={{ flexDirection: 'row', gap: 8 }}>
        <GradientButton onPress={handleAdd} title="Add to inventory" size="small" style={{ flex: 1 }} />
        {inventory.length > 0 ? (
          <GradientButton onPress={() => setShowAdd(false)} title="Cancel" outline outlineColor={C.textMuted} size="small" />
        ) : null}
      </RNView>
    </EnterView>
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="always"
      showsVerticalScrollIndicator={false}
    >
      <EnterView entering={FadeInDown.duration(300)}>
        <Text style={styles.title}>Inventory</Text>
        <Text style={styles.subtitle}>
          {inventory.length
            ? `${inventory.length} card${inventory.length === 1 ? '' : 's'}. Tap one to scan eBay comps or edit prices.`
            : 'Add a card here, or scan a photo on Analyze. Batch cards also land here.'}
        </Text>
      </EnterView>

      {showAdd ? addForm : (
        <GradientButton onPress={() => setShowAdd(true)} title="Add card" style={{ marginBottom: 12 }} />
      )}

      {inventory.length === 0 && !showAdd ? (
        <RNView style={styles.empty}>
          <FontAwesome name="th-large" size={28} color={C.textMuted} />
          <Text style={styles.emptyTitle}>No cards yet</Text>
          <GradientButton href="/analyze" title="Scan photos" outline outlineColor={C.accent} style={{ marginTop: 8, alignSelf: 'stretch' }} />
        </RNView>
      ) : (
        inventory.map((card, index) => (
          <EnterView key={card.id} entering={FadeInDown.delay(Math.min(index, 8) * 40).duration(280)}>
            <CardLink
              href={`/card/${card.id}`}
              accessibilityLabel={`${analysisTitle(card)}, ${gradeHeadline(card)}`}
              style={styles.rowLink}
            >
              <GradeReport card={card} compact />
            </CardLink>
          </EnterView>
        ))
      )}

      {inventory.length === 0 ? (
        <GradientButton href="/analyze" title="Or scan card photos" outline outlineColor={C.accent} style={{ marginTop: 12 }} />
      ) : null}

      <RNView style={{ height: 80 }} />
    </ScrollView>
  );
}

function Field({
  label,
  value,
  onChange,
  grow,
  keyboardType = 'default',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  grow?: boolean;
  keyboardType?: 'default' | 'numeric';
}) {
  return (
    <RNView style={[styles.field, grow && styles.fieldGrow]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.fieldInput}
        value={value}
        onChangeText={onChange}
        keyboardType={keyboardType}
        placeholderTextColor={C.textMuted}
      />
    </RNView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  content: { padding: 20, paddingBottom: 40, maxWidth: 560, width: '100%', alignSelf: 'center' },
  title: { fontSize: 24, fontWeight: '800', color: C.text, marginBottom: 6 },
  subtitle: { fontSize: 13, color: C.textSecondary, lineHeight: 19, marginBottom: 16 },
  empty: { alignItems: 'center', paddingVertical: 32, gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: C.text },
  rowLink: { marginTop: 10 },
  addCard: {
    backgroundColor: C.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 0.5,
    borderColor: C.border,
  },
  addTitle: { fontSize: 15, fontWeight: '700', color: C.text, marginBottom: 6 },
  addHint: { fontSize: 12, color: C.textMuted, lineHeight: 18, marginBottom: 12 },
  addGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  field: {
    flexGrow: 1,
    flexBasis: '30%',
    backgroundColor: C.background,
    borderRadius: 10,
    padding: 10,
    borderWidth: 0.5,
    borderColor: C.border,
  },
  fieldGrow: { flexBasis: '100%' },
  fieldLabel: { fontSize: 10, color: C.textMuted, marginBottom: 4, textTransform: 'uppercase' },
  fieldInput: { fontSize: 16, fontWeight: '700', color: C.text, padding: 0 },
  profileChip: {
    backgroundColor: C.background,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    marginRight: 8,
    borderWidth: 0.5,
    borderColor: C.border,
  },
  profileChipActive: { borderColor: C.accent + '50' },
  profileChipText: { fontSize: 12, color: C.textSecondary, fontWeight: '600' },
});
