import { useMemo, useState, useCallback, useRef } from 'react';
import { StyleSheet, ScrollView, Pressable, View as RNView, Platform, useWindowDimensions } from 'react-native';
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
import { FEE_ASSUMPTIONS_AS_OF, getTier, GRADER_LABELS, SERVICE_TIERS } from '@/data/graders';
import { applyAskingHaircut } from '@/data/marketplace';
import { validateDecideInputs } from '@/data/validation';
import { lookupSoldComps } from '@/api/client';
import { metadataFromLabel } from '@/data/inventoryCard';
import type { CompPrices, GradeProbabilities } from '@/data/types';

const C = Colors.dark;

function num(text: string): number {
  const n = parseFloat(text.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function moneyText(n: number): string {
  return n > 0 ? String(n) : '';
}

function soldPrice(value: number | null | undefined): number {
  return value ?? 0;
}

export default function CalculatorScreen() {
  const store = useAppStore();
  const { width } = useWindowDimensions();
  const wide = width >= 1024;
  const [addedFlash, setAddedFlash] = useState(false);
  const [attemptedInvalidAdd, setAttemptedInvalidAdd] = useState(false);
  const editingRef = useRef(false);

  const [cardName, setCardName] = useState(store.cardName);
  const [rawText, setRawText] = useState(moneyText(store.rawValue));
  const [feeText, setFeeText] = useState(String(store.gradingFee));
  const [shipText, setShipText] = useState(String(store.shippingCost));
  const [daysText, setDaysText] = useState(String(store.turnaroundDays));
  const [c10, setC10] = useState(moneyText(store.psa10Comp));
  const [c9, setC9] = useState(moneyText(store.psa9Comp));
  const [c8, setC8] = useState(moneyText(store.psa8Comp));
  const [c7, setC7] = useState(moneyText(store.below8Comp));
  const [dvText, setDvText] = useState(moneyText(store.declaredValue));
  const [compScanMessage, setCompScanMessage] = useState<string | null>(null);
  const [compScanError, setCompScanError] = useState<string | null>(null);
  const [scanningComps, setScanningComps] = useState(false);

  const hydrateFromStore = useCallback(() => {
    if (editingRef.current) return;
    const s = useAppStore.getState();
    setCardName(s.cardName);
    setFeeText(String(s.gradingFee));
    setShipText(String(s.shippingCost));
    setDaysText(String(s.turnaroundDays));
    setRawText(moneyText(s.rawValue));
    setC10(moneyText(s.psa10Comp));
    setC9(moneyText(s.psa9Comp));
    setC8(moneyText(s.psa8Comp));
    setC7(moneyText(s.below8Comp));
    setDvText(moneyText(s.declaredValue));
  }, []);

  useFocusEffect(
    useCallback(() => {
      hydrateFromStore();
    }, [hydrateFromStore]),
  );

  const rawValue = num(rawText);
  const gradingFee = num(feeText);
  const shippingCost = num(shipText);
  const turnaroundDays = num(daysText);
  const tier = getTier(store.selectedTierId);
  const membershipCards = Math.max(1, store.membershipCards || 1);
  const membershipCostPerCard = Math.max(0, store.membershipFee || 0) / membershipCards;

  const enteredComps: CompPrices = useMemo(
    () => ({ psa10: num(c10), psa9: num(c9), psa8: num(c8), below8: num(c7) }),
    [c10, c9, c8, c7],
  );
  const impliedDeclaredValue = Math.max(num(dvText), enteredComps.psa10, enteredComps.psa9, enteredComps.psa8, 0);
  const upchargeTriggered = impliedDeclaredValue > tier.declaredValueLimit;
  const thinLiquidity = store.daysToSell >= 45 || (store.recentSoldCount > 0 && store.recentSoldCount < 3);
  const highPopLowLiquidity = store.psa10PopCount >= 1000 && (store.recentSoldCount === 0 || store.recentSoldCount < 5);

  const adjustedProbs = useMemo(
    () => applyGradeVariance(store.probabilities, store.gradeVariance),
    [store.probabilities, store.gradeVariance],
  );

  const haircut = store.applyAskingHaircut ? store.askingHaircutPct : 0;
  const basisComps = useMemo(() => {
    if (!haircut) return enteredComps;
    return {
      psa10: applyAskingHaircut(enteredComps.psa10, haircut),
      psa9: applyAskingHaircut(enteredComps.psa9, haircut),
      psa8: applyAskingHaircut(enteredComps.psa8, haircut),
      below8: applyAskingHaircut(enteredComps.below8, haircut),
    };
  }, [enteredComps, haircut]);

  const adjustedComps = useMemo(
    () => applyPriceDrop(basisComps, store.priceDropPct),
    [basisComps, store.priceDropPct],
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
        marketplaceFeePct: store.applyMarketplaceFees ? store.marketplaceFeePct : 0,
        paymentFeePct: store.applyMarketplaceFees ? store.paymentFeePct : 0,
        taxPct: store.applyMarketplaceFees ? store.taxPct : 0,
        daysToSell: store.daysToSell,
        declaredValue: num(dvText) || undefined,
        declaredValueLimit: tier.declaredValueLimit,
        upchargeEstimate: tier.upchargeEstimate,
        membershipCostPerCard,
        compBasis: haircut ? 'asking-haircut' : 'asking',
      }),
    [
      rawValue,
      gradingFee,
      shippingCost,
      turnaroundDays,
      adjustedProbs,
      adjustedComps,
      store.applyMarketplaceFees,
      store.marketplaceFeePct,
      store.paymentFeePct,
      store.taxPct,
      store.daysToSell,
      dvText,
      tier,
      haircut,
      membershipCostPerCard,
    ],
  );

  const compareDisplay = useMemo(() => {
    if (!store.compareProfileId) return null;
    const profile = presetProfiles.find((p) => p.id === store.compareProfileId);
    if (!profile) return null;
    return calculateEV({
      rawValue,
      gradingFee,
      shippingCost,
      turnaroundDays,
      probabilities: applyGradeVariance(profile.probabilities, store.gradeVariance),
      compPrices: adjustedComps,
      marketplaceFeePct: store.applyMarketplaceFees ? store.marketplaceFeePct : 0,
      paymentFeePct: store.applyMarketplaceFees ? store.paymentFeePct : 0,
      taxPct: store.applyMarketplaceFees ? store.taxPct : 0,
      daysToSell: store.daysToSell,
      declaredValue: num(dvText) || undefined,
      declaredValueLimit: tier.declaredValueLimit,
      upchargeEstimate: tier.upchargeEstimate,
      membershipCostPerCard,
      compBasis: haircut ? 'asking-haircut' : 'asking',
    });
  }, [
    store.compareProfileId,
    store.gradeVariance,
    rawValue,
    gradingFee,
    shippingCost,
    turnaroundDays,
    adjustedComps,
    store.applyMarketplaceFees,
    store.marketplaceFeePct,
    store.paymentFeePct,
    store.taxPct,
    store.daysToSell,
    dvText,
    tier,
    haircut,
    membershipCostPerCard,
  ]);

  const recStyle = getRecommendationStyle(display.recommendation);
  const totalProb = sumProbabilities(store.probabilities);
  const warnings = validateDecideInputs({
    rawValue,
    gradingFee,
    shippingCost,
    turnaroundDays,
    comps: enteredComps,
  });
  const fieldError = (field: string) => warnings.find((w) => w.field === field)?.message;
  const hasInputErrors = warnings.length > 0;

  const persistAll = () => {
    store.setCalculator({
      cardName: cardName.trim(),
      rawValue,
      psa10Comp: num(c10),
      psa9Comp: num(c9),
      psa8Comp: num(c8),
      below8Comp: num(c7),
      declaredValue: num(dvText),
    });
    store.setCosts({
      gradingFee,
      shippingCost,
      turnaroundDays,
    });
  };

  const handleProfileSelect = (profileId: string) => {
    lightImpact();
    store.setProfile(profileId);
  };

  const setProb = (key: keyof GradeProbabilities, value: number) => {
    store.setCalculator({
      selectedProfile: 'custom',
      probabilities: { ...store.probabilities, [key]: value },
    });
  };

  const handleAddToBatch = () => {
    if (hasInputErrors) {
      setAttemptedInvalidAdd(true);
      return;
    }
    persistAll();
    store.addCurrentToBatch({
      name: cardName.trim(),
      rawValue,
      probabilities: adjustedProbs,
      profileId: store.gradeVariance ? 'custom' : store.selectedProfile,
      compPrices: adjustedComps,
    });
    store.saveDecideSnapshot({
      cardName: cardName.trim() || 'Untitled card',
      recommendation: display.recommendation,
      expectedValue: display.expectedValue,
      expectedProfit: display.expectedProfit,
      rawValue,
      gradingFee,
      comps: adjustedComps,
    });
    successNotification();
    setAddedFlash(true);
    setTimeout(() => setAddedFlash(false), 1800);
  };

  const handleScanComps = async () => {
    if (scanningComps) return;
    const meta = metadataFromLabel(cardName);
    if (!meta.player && !meta.year && !meta.set && !meta.cardNumber) {
      setCompScanError('Enter a card name like "2018 Luka Doncic Prizm 280" before scanning.');
      return;
    }
    persistAll();
    setScanningComps(true);
    setCompScanError(null);
    setCompScanMessage(null);
    try {
      const snapshot = await lookupSoldComps(meta, {
        fallback: enteredComps,
        refresh: false,
      });
      const nextRaw = snapshot.raw && snapshot.raw > 0 ? snapshot.raw : rawValue;
      const snapshotComps = {
        psa10: soldPrice(snapshot.prices.psa10),
        psa9: soldPrice(snapshot.prices.psa9),
        psa8: soldPrice(snapshot.prices.psa8),
        below8: soldPrice(snapshot.prices.below8),
      };
      setRawText(moneyText(nextRaw));
      setC10(moneyText(snapshotComps.psa10));
      setC9(moneyText(snapshotComps.psa9));
      setC8(moneyText(snapshotComps.psa8));
      setC7(moneyText(snapshotComps.below8));
      store.setCalculator({
        cardName: cardName.trim(),
        rawValue: nextRaw,
        psa10Comp: snapshotComps.psa10,
        psa9Comp: snapshotComps.psa9,
        psa8Comp: snapshotComps.psa8,
        below8Comp: snapshotComps.below8,
        recentSoldCount: snapshot.basis === 'sold' || snapshot.source.startsWith('cardsight') ? snapshot.listingCount : store.recentSoldCount,
      });
      setCompScanMessage(
        snapshot.fallbackReason ||
          (snapshot.basis === 'sold' || snapshot.source.startsWith('cardsight')
            ? `Loaded CardSight sold-auction medians (${snapshot.listingCount} sales${snapshot.period ? `, ${snapshot.period}` : ''}).`
            : `Loaded eBay asking fallback (${snapshot.listingCount} listings).`),
      );
    } catch (err) {
      setCompScanError(err instanceof Error ? err.message : 'Sold comps lookup failed');
    } finally {
      setScanningComps(false);
    }
  };

  const contentMax = wide ? 1120 : 560;
  const wideFieldStyle = wide ? styles.gridFieldWide : undefined;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { maxWidth: contentMax }]}
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
              <Text style={styles.resultLabel}>NET EXPECTED VALUE</Text>
              <Text style={[styles.resultEV, { color: recStyle.color }]}>
                {display.insufficientComps ? '—' : `$${display.expectedValue.toFixed(0)}`}
              </Text>
            </RNView>
          </RNView>
          <RNView style={styles.resultMetrics}>
            {[
              {
                label: 'PROFIT',
                value: display.insufficientComps
                  ? '—'
                  : `${display.expectedProfit > 0 ? '+' : ''}$${display.expectedProfit.toFixed(0)}`,
                color: display.expectedProfit > 0 ? C.accentGreen : C.accentRed,
              },
              {
                label: 'ANN. ROI',
                value: display.insufficientComps ? '—' : `${display.annualizedRoi.toFixed(0)}%`,
                color: C.accent,
              },
              {
                label: 'BREAK-EVEN',
                value: display.breakEvenGrade,
                color: C.accentYellow,
              },
            ].map((m) => (
              <RNView key={m.label} style={styles.resultMetric}>
                <Text style={styles.resultMetricLabel}>{m.label}</Text>
                <Text style={[styles.resultMetricValue, { color: m.color }]}>{m.value}</Text>
              </RNView>
            ))}
          </RNView>
          <RNView style={styles.beRow}>
            <Text style={styles.beText}>
              {display.insufficientComps
                ? 'Add comps to unlock break-even odds'
                : `${display.breakEvenProbability.toFixed(0)}% chance of hitting ${display.breakEvenGrade}`}
            </Text>
            <Text style={styles.beText}>
              {display.insufficientComps ? '' : `$${display.capitalDeployed.toFixed(0)} capital locked`}
            </Text>
          </RNView>
          <Text style={styles.basisHint}>
            EV uses {haircut ? `asking comps − ${haircut}% sold haircut` : 'entered comps as-is'} · fees as of{' '}
            {FEE_ASSUMPTIONS_AS_OF}
          </Text>
        </LinearGradient>
      </EnterView>

      <EnterView entering={FadeInDown.delay(80).duration(400)} style={styles.reasonCard}>
        {display.reasoning.map((line, i) => (
          <RNView key={i} style={styles.reasonRow}>
            <FontAwesome
              name={i === 0 ? 'line-chart' : i === 1 ? 'balance-scale' : 'clock-o'}
              size={12}
              color={recStyle.color}
            />
            <Text style={styles.reasonText}>{line}</Text>
          </RNView>
        ))}
        {display.warnings.map((w) => (
          <RNView key={w} style={styles.warnRow}>
            <FontAwesome name="exclamation-triangle" size={12} color={C.accentYellow} />
            <Text style={styles.warnText}>{w}</Text>
          </RNView>
        ))}
        {warnings.map((w) => (
          <RNView key={`${w.field}-${w.message}`} style={styles.warnRow}>
            <FontAwesome name="exclamation-circle" size={12} color={C.accentRed} />
            <Text style={styles.warnText}>{w.message}</Text>
          </RNView>
        ))}
      </EnterView>

      <EnterView entering={FadeInDown.delay(100).duration(400)}>
        <Text style={styles.sectionTitle}>Service tier</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.profileScroll}>
          {SERVICE_TIERS.map((t) => {
            const active = store.selectedTierId === t.id;
            return (
              <Pressable
                key={t.id}
                onPress={() => {
                  lightImpact();
                  store.applyServiceTier(t.id);
                  setFeeText(String(t.fee));
                  setDaysText(String(t.turnaroundDays));
                }}
                accessibilityRole="button"
                accessibilityLabel={t.name}
              >
                <RNView style={[styles.profileChip, active && styles.profileChipActive]}>
                  <Text style={[styles.profileChipText, active && { color: C.accent }]}>
                    {GRADER_LABELS[t.graderId]} · {t.name.replace(/^(PSA|CGC|SGC)\s/, '')}
                  </Text>
                  <Text style={styles.tierMeta}>
                    ${t.fee} · {t.turnaroundDays}d
                  </Text>
                </RNView>
              </Pressable>
            );
          })}
        </ScrollView>
      </EnterView>

      <EnterView entering={FadeInDown.delay(120).duration(400)}>
        <Text style={styles.sectionTitle}>Card & Costs</Text>
        <RNView style={styles.nameWrap}>
          <NumberField
            fieldKey="decide-card-name"
            label="Card (optional)"
            value={cardName}
            onChangeText={(v) => {
              editingRef.current = true;
              setCardName(v);
            }}
            onBlur={() => {
              editingRef.current = false;
              store.setCalculator({ cardName: cardName.trim() });
            }}
            keyboardType="default"
            fullWidth
            placeholder="Player / set / number"
          />
        </RNView>
        <RNView style={[styles.inputGrid, wide && styles.inputGridWide]}>
          <NumberField
            fieldKey="decide-raw"
            label="Raw Value"
            prefix="$"
            value={rawText}
            error={fieldError('rawValue')}
            style={wideFieldStyle}
            onChangeText={(v) => {
              editingRef.current = true;
              setRawText(v);
            }}
            onBlur={() => {
              editingRef.current = false;
              store.setCalculator({ rawValue: num(rawText) });
            }}
          />
          <NumberField
            fieldKey="decide-fee"
            label="Grading Fee"
            prefix="$"
            value={feeText}
            error={fieldError('gradingFee')}
            style={wideFieldStyle}
            onChangeText={(v) => {
              editingRef.current = true;
              setFeeText(v);
            }}
            onBlur={() => {
              editingRef.current = false;
              store.setCosts({ gradingFee: num(feeText) });
            }}
          />
          <NumberField
            fieldKey="decide-ship"
            label="Ship + Ins."
            prefix="$"
            value={shipText}
            error={fieldError('shippingCost')}
            style={wideFieldStyle}
            onChangeText={(v) => {
              editingRef.current = true;
              setShipText(v);
            }}
            onBlur={() => {
              editingRef.current = false;
              store.setCosts({ shippingCost: num(shipText) });
            }}
          />
          <NumberField
            fieldKey="decide-days"
            label="Turnaround"
            suffix=" days"
            value={daysText}
            error={fieldError('turnaroundDays')}
            style={wideFieldStyle}
            onChangeText={(v) => {
              editingRef.current = true;
              setDaysText(v);
            }}
            onBlur={() => {
              editingRef.current = false;
              store.setCosts({ turnaroundDays: num(daysText) || 1 });
            }}
          />
          <NumberField
            fieldKey="decide-dv"
            label="Declared value"
            prefix="$"
            value={dvText}
            style={wideFieldStyle}
            onChangeText={(v) => {
              editingRef.current = true;
              setDvText(v);
            }}
            onBlur={() => {
              editingRef.current = false;
              store.setCalculator({ declaredValue: num(dvText) });
            }}
            placeholder="Auto from PSA 10"
          />
        </RNView>
        {hasInputErrors ? (
          <RNView style={styles.inlineValidationPanel}>
            <Text style={styles.inlineValidationTitle}>Fix these inputs before trusting EV</Text>
            {warnings.map((w) => (
              <Text key={`inline-${w.field}-${w.message}`} style={styles.inlineValidationText}>
                • {w.message}
              </Text>
            ))}
          </RNView>
        ) : null}
      </EnterView>

      <EnterView entering={FadeInDown.delay(140).duration(400)}>
        <Text style={styles.sectionTitle}>Required risk controls</Text>
        <RNView style={styles.infoPanel}>
          <Text style={styles.panelEyebrow}>#12 MEMBERSHIP / UPCHARGE</Text>
          <RNView style={styles.panelGrid}>
            <NumberField
              fieldKey="decide-membership-fee"
              label="Collectors Club / membership"
              prefix="$"
              value={store.membershipFee > 0 ? String(store.membershipFee) : ''}
              placeholder="Optional"
              style={wideFieldStyle}
              onChangeText={(v) => store.setCosts({ membershipFee: num(v) })}
            />
            <NumberField
              fieldKey="decide-membership-cards"
              label="Amortize over"
              suffix=" cards"
              value={String(store.membershipCards || 1)}
              style={wideFieldStyle}
              onChangeText={(v) => store.setCosts({ membershipCards: Math.max(1, num(v) || 1) })}
            />
            <NumberField
              fieldKey="decide-days-to-sell"
              label="Days to sell"
              suffix=" days"
              value={String(store.daysToSell)}
              style={wideFieldStyle}
              onChangeText={(v) => store.setCosts({ daysToSell: Math.max(0, num(v)) })}
            />
            <NumberField
              fieldKey="decide-recent-sold"
              label="Recent sold comps"
              value={store.recentSoldCount > 0 ? String(store.recentSoldCount) : ''}
              placeholder="Manual count"
              style={wideFieldStyle}
              onChangeText={(v) => store.setCalculator({ recentSoldCount: Math.max(0, num(v)) })}
            />
            <NumberField
              fieldKey="decide-psa10-pop"
              label="PSA 10 pop count"
              value={store.psa10PopCount > 0 ? String(store.psa10PopCount) : ''}
              placeholder="Manual pop"
              style={wideFieldStyle}
              onChangeText={(v) => store.setCalculator({ psa10PopCount: Math.max(0, num(v)) })}
            />
          </RNView>
          <RNView style={[styles.insightRow, upchargeTriggered ? styles.insightWarn : styles.insightOk]}>
            <FontAwesome
              name={upchargeTriggered ? 'exclamation-triangle' : 'check-circle'}
              size={13}
              color={upchargeTriggered ? C.accentYellow : C.accentGreen}
            />
            <Text style={styles.insightText}>
              {upchargeTriggered
                ? `Upcharge modeled: implied declared value $${impliedDeclaredValue.toFixed(0)} is above ${tier.name}'s $${tier.declaredValueLimit} limit, so $${tier.upchargeEstimate} is added.`
                : `No upcharge modeled yet: implied declared value $${impliedDeclaredValue.toFixed(0)} is within ${tier.name}'s $${tier.declaredValueLimit} limit.`}
            </Text>
          </RNView>
          <Text style={styles.panelHint}>
            Membership adds ${membershipCostPerCard.toFixed(2)} per card to submission cost and EV totals when a fee is entered.
          </Text>
          <Text style={styles.panelEyebrow}>#14 SOLD COMPS / SALES VELOCITY</Text>
          <RNView style={[styles.insightRow, thinLiquidity ? styles.insightWarn : styles.insightOk]}>
            <FontAwesome name={thinLiquidity ? 'hourglass-half' : 'line-chart'} size={13} color={thinLiquidity ? C.accentYellow : C.accentGreen} />
            <Text style={styles.insightText}>
              {thinLiquidity
                ? `Thin liquidity overlay: modeled ${store.daysToSell} days to sell${store.recentSoldCount > 0 ? ` with only ${store.recentSoldCount} recent sold comp${store.recentSoldCount === 1 ? '' : 's'}` : ''}. EV may be slower than the headline.`
                : `Velocity looks usable at ${store.daysToSell} days to sell. Sold comps remain safer than asking prices for go/no-go.`}
            </Text>
          </RNView>
          <Text style={styles.panelEyebrow}>#18 POP REPORT / FLOODED TIER</Text>
          <RNView style={[styles.insightRow, highPopLowLiquidity ? styles.insightWarn : styles.insightNeutral]}>
            <FontAwesome name="users" size={13} color={highPopLowLiquidity ? C.accentYellow : C.accent} />
            <Text style={styles.insightText}>
              {highPopLowLiquidity
                ? `Flooded PSA 10 warning: pop ${store.psa10PopCount.toFixed(0)} with ${store.recentSoldCount || 0} recent sales can trap capital even when EV looks green.`
                : store.psa10PopCount > 0
                  ? `Pop overlay: PSA 10 population ${store.psa10PopCount.toFixed(0)}. Watch velocity before grading into crowded tiers.`
                  : 'Manual MVP placeholder: enter PSA Pop Report count to surface crowded-tier warnings while a live Pop API is unavailable.'}
            </Text>
          </RNView>
        </RNView>
      </EnterView>

      <EnterView entering={FadeInDown.delay(160).duration(400)}>
        <Text style={styles.sectionTitle}>Comp Prices</Text>
        <Text style={styles.sectionHint}>
          Prefer sold comps for go/no-go. CardSight sold-auction scans run through the backend; eBay asking remains fallback.
        </Text>
        <RNView style={styles.compScanRow}>
          <GradientButton
            title={scanningComps ? 'Scanning sold comps…' : 'Scan sold comps'}
            onPress={handleScanComps}
            disabled={scanningComps}
            style={styles.compScanButton}
          />
        </RNView>
        {compScanError ? <Text style={styles.compScanError}>{compScanError}</Text> : null}
        {compScanMessage ? <Text style={styles.compScanMessage}>{compScanMessage}</Text> : null}
        <RNView style={[styles.inputGrid, wide && styles.inputGridWide]}>
          <NumberField
            fieldKey="decide-c10"
            label="PSA 10"
            prefix="$"
            value={c10}
            error={fieldError('psa10')}
            style={wideFieldStyle}
            onChangeText={(v) => {
              editingRef.current = true;
              setC10(v);
            }}
            onBlur={() => {
              editingRef.current = false;
              store.setCalculator({ psa10Comp: num(c10) });
            }}
            accentColor={C.grade10}
          />
          <NumberField
            fieldKey="decide-c9"
            label="PSA 9"
            prefix="$"
            value={c9}
            error={fieldError('psa9')}
            style={wideFieldStyle}
            onChangeText={(v) => {
              editingRef.current = true;
              setC9(v);
            }}
            onBlur={() => {
              editingRef.current = false;
              store.setCalculator({ psa9Comp: num(c9) });
            }}
            accentColor={C.grade9}
          />
          <NumberField
            fieldKey="decide-c8"
            label="PSA 8"
            prefix="$"
            value={c8}
            error={fieldError('psa8')}
            style={wideFieldStyle}
            onChangeText={(v) => {
              editingRef.current = true;
              setC8(v);
            }}
            onBlur={() => {
              editingRef.current = false;
              store.setCalculator({ psa8Comp: num(c8) });
            }}
            accentColor={C.grade8}
          />
          <NumberField
            fieldKey="decide-c7"
            label="Below 8"
            prefix="$"
            value={c7}
            error={fieldError('below8')}
            style={wideFieldStyle}
            onChangeText={(v) => {
              editingRef.current = true;
              setC7(v);
            }}
            onBlur={() => {
              editingRef.current = false;
              store.setCalculator({ below8Comp: num(c7) });
            }}
            accentColor={C.gradeBelow}
          />
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
                onLongPress={() => {
                  lightImpact();
                  store.setCalculator({
                    compareProfileId: store.compareProfileId === p.id ? null : p.id,
                  });
                }}
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
                  <RNView
                    style={[
                      styles.profileChip,
                      store.compareProfileId === p.id && { borderColor: C.accentPurple + '80' },
                    ]}
                  >
                    <Text style={styles.profileChipText}>{p.name}</Text>
                  </RNView>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
        <Text style={styles.sectionHint}>Long-press a preset to compare it side-by-side with the active profile.</Text>

        {compareDisplay ? (
          <RNView style={styles.compareRow}>
            <RNView style={styles.compareCard}>
              <Text style={styles.compareLabel}>Active · {store.selectedProfile}</Text>
              <Text style={[styles.compareRec, { color: recStyle.color }]}>{recStyle.label}</Text>
              <Text style={styles.compareMeta}>
                EV ${display.expectedValue.toFixed(0)} · {display.expectedProfit >= 0 ? '+' : ''}$
                {display.expectedProfit.toFixed(0)}
              </Text>
            </RNView>
            <RNView style={styles.compareCard}>
              <Text style={styles.compareLabel}>Compare · {store.compareProfileId}</Text>
              <Text
                style={[
                  styles.compareRec,
                  { color: getRecommendationStyle(compareDisplay.recommendation).color },
                ]}
              >
                {getRecommendationStyle(compareDisplay.recommendation).label}
              </Text>
              <Text style={styles.compareMeta}>
                EV ${compareDisplay.expectedValue.toFixed(0)} · {compareDisplay.expectedProfit >= 0 ? '+' : ''}$
                {compareDisplay.expectedProfit.toFixed(0)}
              </Text>
            </RNView>
          </RNView>
        ) : null}

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
        {hasInputErrors ? (
          <RNView style={styles.addBlockerPanel}>
            <Text style={styles.inlineValidationTitle}>
              {attemptedInvalidAdd ? 'Add blocked: fix validation errors first' : 'Cannot add invalid card to batch'}
            </Text>
            {warnings.map((w) => (
              <Text key={`add-block-${w.field}-${w.message}`} style={styles.inlineValidationText}>
                • {w.message}
              </Text>
            ))}
          </RNView>
        ) : null}
        <GradientButton
          href={hasInputErrors ? undefined : '/batch'}
          onPress={handleAddToBatch}
          title={hasInputErrors ? 'Fix input errors before batch' : addedFlash ? 'Added to batch' : 'Add this card to batch'}
          icon={<FontAwesome name={hasInputErrors ? 'exclamation-circle' : addedFlash ? 'check' : 'plus'} size={16} color="#FFF" />}
          colors={hasInputErrors ? [C.accentRed, '#991B1B'] : [C.accentGreen, '#16A34A']}
          disabled={hasInputErrors}
        />
        <GradientButton
          href="/batch"
          title={`Open batch${store.batchCards.length ? ` (${store.batchCards.length})` : ''}`}
          icon={<FontAwesome name="th-list" size={16} color={C.accentPurple} />}
          outline
          outlineColor={C.accentPurple}
        />
      </EnterView>

      <RNView style={{ height: Platform.OS === 'web' && wide ? 40 : 100 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  content: { padding: 20, paddingTop: 60, paddingBottom: 40, width: '100%', alignSelf: 'center' },
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
  beText: { fontSize: 11, color: C.textSecondary, flexShrink: 1 },
  basisHint: { fontSize: 11, color: C.textMuted, marginTop: 10 },
  reasonCard: { marginBottom: 20, gap: 8 },
  reasonRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: C.surface, borderRadius: 12, padding: 12, borderWidth: 0.5, borderColor: C.border,
  },
  reasonText: { fontSize: 12, color: C.textSecondary, flex: 1, lineHeight: 18 },
  warnRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: C.surfaceElevated, borderRadius: 12, padding: 12,
  },
  warnText: { fontSize: 12, color: C.accentYellow, flex: 1, lineHeight: 18 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: C.text, marginBottom: 12, marginTop: 4 },
  sectionHint: { fontSize: 12, color: C.textSecondary, marginBottom: 12, lineHeight: 18 },
  compScanRow: { marginBottom: 10 },
  compScanButton: { alignSelf: 'flex-start', minWidth: 210 },
  compScanError: { color: C.accentRed, fontSize: 12, marginTop: -4, marginBottom: 10 },
  compScanMessage: { color: C.accentYellow, fontSize: 12, lineHeight: 18, marginTop: -4, marginBottom: 10 },
  nameWrap: { marginBottom: 10 },
  inputGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  inputGridWide: { gap: 12 },
  gridFieldWide: { flexBasis: '30%', minWidth: 220 },
  inlineValidationPanel: {
    backgroundColor: C.accentRed + '12',
    borderColor: C.accentRed + '50',
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 20,
    gap: 5,
  },
  addBlockerPanel: {
    backgroundColor: C.accentRed + '12',
    borderColor: C.accentRed + '60',
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 5,
  },
  inlineValidationTitle: { fontSize: 13, color: C.accentRed, fontWeight: '800' },
  inlineValidationText: { fontSize: 12, color: C.accentRed, lineHeight: 18 },
  infoPanel: {
    backgroundColor: C.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 0.5,
    borderColor: C.border,
    marginBottom: 20,
    gap: 12,
  },
  panelGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  panelEyebrow: { fontSize: 10, color: C.textMuted, letterSpacing: 0.8, fontWeight: '800' },
  panelHint: { fontSize: 12, color: C.textMuted, lineHeight: 18 },
  insightRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: 12,
    padding: 12,
    borderWidth: 0.5,
  },
  insightOk: { backgroundColor: C.accentGreen + '12', borderColor: C.accentGreen + '35' },
  insightWarn: { backgroundColor: C.accentYellow + '12', borderColor: C.accentYellow + '40' },
  insightNeutral: { backgroundColor: C.accent + '10', borderColor: C.accent + '30' },
  insightText: { flex: 1, fontSize: 12, color: C.textSecondary, lineHeight: 18 },
  profileScroll: { marginBottom: 14 },
  profileChip: {
    backgroundColor: C.surface, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16,
    marginRight: 8, borderWidth: 0.5, borderColor: C.border,
  },
  profileChipActive: { borderColor: C.accent + '50' },
  profileChipText: { fontSize: 13, color: C.textSecondary, fontWeight: '600' },
  profileChipTextActive: { color: C.accent },
  tierMeta: { fontSize: 10, color: C.textMuted, marginTop: 2 },
  compareRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  compareCard: {
    flex: 1, backgroundColor: C.surface, borderRadius: 14, padding: 14,
    borderWidth: 0.5, borderColor: C.border,
  },
  compareLabel: { fontSize: 11, color: C.textMuted, marginBottom: 6 },
  compareRec: { fontSize: 18, fontWeight: '800', marginBottom: 4 },
  compareMeta: { fontSize: 12, color: C.textSecondary },
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
