import { ScrollView, StyleSheet, View as RNView } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Text } from '@/components/Themed';
import Colors from '@/constants/Colors';
import GradientButton from '@/components/ui/GradientButton';
import GradeReport from '@/components/GradeReport';
import CompsPanel from '@/components/CompsPanel';
import { useAppStore } from '@/store/useAppStore';
import { analysisTitle } from '@/data/cardDisplay';

const C = Colors.dark;

export default function CardReportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const card = useAppStore((s) => s.inventory.find((item) => item.id === id));
  const removeInventoryCard = useAppStore((s) => s.removeInventoryCard);

  const title = card ? analysisTitle(card) : 'Grade report';

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
            <CompsPanel card={card} />
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
  content: { padding: 20, paddingBottom: 40, maxWidth: 560, width: '100%', alignSelf: 'center' },
  scanned: { fontSize: 12, color: C.textMuted, marginBottom: 12 },
  empty: { alignItems: 'center', paddingVertical: 48, gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: C.text },
  emptySub: { fontSize: 13, color: C.textSecondary, textAlign: 'center', lineHeight: 19, maxWidth: 360 },
});
