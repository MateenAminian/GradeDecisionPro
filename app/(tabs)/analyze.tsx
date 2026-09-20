import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  View as RNView,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { LinearGradient } from 'expo-linear-gradient';
import { FadeInDown } from 'react-native-reanimated';
import { Text } from '@/components/Themed';
import EnterView from '@/components/EnterView';
import Colors from '@/constants/Colors';
import GradientButton from '@/components/ui/GradientButton';
import CardLink from '@/components/ui/CardLink';
import GradeReport from '@/components/GradeReport';
import { useAppStore } from '@/store/useAppStore';
import { getApiBaseUrl } from '@/api/client';

const C = Colors.dark;

export default function AnalyzeScreen() {
  const {
    processBatchUpload,
    isAnalyzingBatch,
    batchAnalysisResults,
    batchError,
    clearBatchAnalysis,
    inventory,
  } = useAppStore();

  const [previewUris, setPreviewUris] = useState<string[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);

  const scannedCards = useMemo(() => {
    const ids = batchAnalysisResults.map((r) => r.inventoryId).filter((id): id is string => Boolean(id));
    if (!ids.length) return [];
    const idSet = new Set(ids);
    return inventory.filter((card) => idSet.has(card.id));
  }, [batchAnalysisResults, inventory]);
  const okCount = scannedCards.filter((card) => card.ok).length;

  const scan = async (uris: string[], append: boolean) => {
    if (!uris.length) return;
    setLocalError(null);
    setPreviewUris((prev) => (append ? [...prev, ...uris] : uris));
    await processBatchUpload(uris, { append });
  };

  const pickFromLibrary = async (append: boolean) => {
    if (isAnalyzingBatch) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted && Platform.OS !== 'web') {
      setLocalError('Photo access is needed to scan cards. Enable it in Settings, or take a photo instead.');
      return;
    }

    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.85,
      selectionLimit: 12,
    });
    if (picked.canceled || !picked.assets?.length) return;
    await scan(picked.assets.map((a) => a.uri).filter(Boolean), append);
  };

  const takePhoto = async (append: boolean) => {
    if (isAnalyzingBatch) return;
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted && Platform.OS !== 'web') {
      setLocalError('Camera access is needed to photograph a card. Enable it in Settings, or choose from your library.');
      return;
    }

    const shot = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.85,
    });
    if (shot.canceled || !shot.assets?.length) return;
    await scan(shot.assets.map((a) => a.uri).filter(Boolean), append);
  };

  const handleClear = () => {
    setPreviewUris([]);
    setLocalError(null);
    clearBatchAnalysis();
  };

  const errorText = localError || batchError;
  const hasResults = batchAnalysisResults.length > 0;
  const appendNext = hasResults || previewUris.length > 0;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="always"
      showsVerticalScrollIndicator={false}
    >
      <EnterView entering={FadeInDown.duration(300)}>
        <Text style={styles.title}>Scan cards</Text>
        <Text style={styles.subtitle}>
          Take a photo or choose from your library. Each card is identified and given a likely PSA grade range in one step.
        </Text>
      </EnterView>

      <EnterView entering={FadeInDown.delay(60).duration(300)} style={styles.actions}>
        <GradientButton
          onPress={() => takePhoto(appendNext)}
          title={appendNext ? 'Photograph another' : 'Take a photo'}
          icon={<FontAwesome name="camera" size={16} color="#FFF" />}
        />
        <GradientButton
          onPress={() => pickFromLibrary(appendNext)}
          title={appendNext ? 'Add from library' : 'Choose photos'}
          outline
          outlineColor={C.accent}
          icon={<FontAwesome name="picture-o" size={16} color={C.accent} />}
        />
        {hasResults || previewUris.length ? (
          <GradientButton
            onPress={handleClear}
            title="Start over"
            outline
            outlineColor={C.textMuted}
          />
        ) : null}
      </EnterView>

      {isAnalyzingBatch ? (
        <EnterView entering={FadeInDown.duration(250)} style={styles.loadingCard}>
          <ActivityIndicator color={C.accent} size="large" />
          <Text style={styles.loadingTitle}>
            Scanning {previewUris.length || 1} card{(previewUris.length || 1) === 1 ? '' : 's'}…
          </Text>
          <Text style={styles.loadingSub}>Identifying each card and estimating its PSA grade range.</Text>
          {previewUris.length > 0 ? (
            <RNView style={styles.thumbRow}>
              {previewUris.slice(0, 8).map((uri) => (
                <Image key={uri} source={{ uri }} style={styles.thumb} />
              ))}
            </RNView>
          ) : null}
        </EnterView>
      ) : null}

      {errorText ? (
        <RNView style={styles.errorCard}>
          <FontAwesome name="exclamation-circle" size={16} color={C.accentRed} />
          <Text style={styles.errorText}>{errorText}</Text>
          <Text style={styles.errorHint}>API: {getApiBaseUrl()}</Text>
        </RNView>
      ) : null}

      {hasResults && !isAnalyzingBatch ? (
        <>
          <LinearGradient
            colors={[C.accent + '18', C.accent + '05']}
            style={styles.summaryCard}
          >
            <Text style={styles.summaryLabel}>READY</Text>
            <Text style={styles.summaryValue}>
              {okCount} card{okCount === 1 ? '' : 's'} saved to inventory
            </Text>
            <Text style={styles.summaryHint}>
              Tap a card for its grade report. They’re also in Batch for EV modeling.
            </Text>
            <GradientButton
              href="/inventory"
              title="Open inventory"
              size="small"
              style={{ marginTop: 12 }}
            />
            <GradientButton
              href="/batch"
              title="Review in batch"
              outline
              outlineColor={C.accentPurple}
              size="small"
              style={{ marginTop: 8 }}
            />
          </LinearGradient>

          {scannedCards.map((card, index) => (
            <EnterView key={card.id} entering={FadeInDown.delay(40 * index).duration(280)}>
              <CardLink href={`/card/${card.id}`} accessibilityLabel={`Open grade report for ${card.name}`} style={styles.resultLink}>
                <GradeReport card={card} compact />
              </CardLink>
            </EnterView>
          ))}
        </>
      ) : null}

      {!isAnalyzingBatch && !hasResults && !errorText ? (
        <RNView style={styles.empty}>
          <FontAwesome name="id-card-o" size={28} color={C.textMuted} />
          <Text style={styles.emptyTitle}>Point, shoot, decide</Text>
          <Text style={styles.emptySub}>
            Front of the card, filling the frame. You can add more photos after the first scan without starting over.
          </Text>
        </RNView>
      ) : null}

      <RNView style={{ height: 80 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  content: { padding: 20, paddingBottom: 40, maxWidth: 560, width: '100%', alignSelf: 'center' },
  title: { fontSize: 24, fontWeight: '800', color: C.text, marginBottom: 6 },
  subtitle: { fontSize: 13, color: C.textSecondary, lineHeight: 19, marginBottom: 16 },
  actions: { gap: 10 },
  loadingCard: {
    marginTop: 16,
    backgroundColor: C.surface,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: C.border,
    gap: 10,
  },
  loadingTitle: { fontSize: 15, fontWeight: '700', color: C.text, textAlign: 'center' },
  loadingSub: { fontSize: 12, color: C.textMuted, textAlign: 'center' },
  thumbRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 8 },
  thumb: { width: 56, height: 56, borderRadius: 8, backgroundColor: C.surfaceElevated },
  errorCard: {
    marginTop: 16,
    backgroundColor: C.accentRed + '12',
    borderColor: C.accentRed + '40',
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 8,
  },
  errorText: { color: C.accentRed, fontSize: 13, fontWeight: '600' },
  errorHint: { color: C.textMuted, fontSize: 11 },
  summaryCard: { marginTop: 16, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: C.accent + '30', marginBottom: 8 },
  summaryLabel: { fontSize: 10, color: C.textMuted, letterSpacing: 0.8, marginBottom: 4 },
  summaryValue: { fontSize: 22, fontWeight: '800', color: C.text },
  summaryHint: { fontSize: 13, color: C.textSecondary, marginTop: 8, lineHeight: 18 },
  resultLink: { marginTop: 10 },
  empty: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: C.text },
  emptySub: { fontSize: 13, color: C.textSecondary, textAlign: 'center', lineHeight: 19, maxWidth: 360 },
});
