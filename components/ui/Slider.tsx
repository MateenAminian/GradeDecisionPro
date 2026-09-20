import { useMemo, useState } from 'react';
import { Platform, StyleSheet, View, PanResponder, type LayoutChangeEvent } from 'react-native';
import { Text } from '@/components/Themed';
import { LinearGradient } from 'expo-linear-gradient';
import Colors from '@/constants/Colors';

const C = Colors.dark;

interface SliderProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  color?: string;
  min?: number;
  max?: number;
  showPercent?: boolean;
}

export default function Slider({
  label,
  value,
  onChange,
  color = C.accent,
  min = 0,
  max = 100,
  showPercent = true,
}: SliderProps) {
  const [trackWidth, setTrackWidth] = useState(1);
  const range = max - min || 1;
  const fillPct = `${((value - min) / range) * 100}%`;

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt) => {
          const ratio = evt.nativeEvent.locationX / trackWidth;
          onChange(Math.max(min, Math.min(max, Math.round(min + ratio * range))));
        },
        onPanResponderMove: (evt) => {
          const ratio = evt.nativeEvent.locationX / trackWidth;
          onChange(Math.max(min, Math.min(max, Math.round(min + ratio * range))));
        },
      }),
    [trackWidth, min, max, range, onChange],
  );

  return (
    <View>
      {label ? (
        <View style={styles.labelRow}>
          <Text style={styles.label}>{label}</Text>
          <Text style={[styles.value, { color }]}>
            {value}
            {showPercent ? '%' : ''}
          </Text>
        </View>
      ) : null}

      {Platform.OS === 'web' ? (
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ width: '100%', accentColor: color, cursor: 'pointer', height: 20 }}
        />
      ) : (
        <View
          style={styles.track}
          onLayout={(e: LayoutChangeEvent) => setTrackWidth(e.nativeEvent.layout.width || 1)}
          {...panResponder.panHandlers}
        >
          <LinearGradient
            colors={[color, color + '80']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.fill, { width: fillPct as any }]}
          />
          <View style={[styles.thumb, { left: fillPct as any, backgroundColor: color, shadowColor: color }]} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  label: { fontSize: 13, color: C.textSecondary },
  value: { fontSize: 14, fontWeight: '800' },
  track: { height: 6, backgroundColor: C.surfaceElevated, borderRadius: 3, justifyContent: 'center' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 3 },
  thumb: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    marginLeft: -10,
    top: -7,
    shadowOpacity: 0.4,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
});
