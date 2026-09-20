import { StyleSheet, View, TextInput } from 'react-native';
import { Text } from '@/components/Themed';
import Colors from '@/constants/Colors';

const C = Colors.dark;

export default function NumberField({
  label,
  value,
  onChangeText,
  prefix,
  suffix,
  accentColor,
  keyboardType = 'numeric',
  fullWidth,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  prefix?: string;
  suffix?: string;
  accentColor?: string;
  keyboardType?: 'numeric' | 'default';
  fullWidth?: boolean;
}) {
  return (
    <View style={[styles.field, fullWidth && styles.fullWidth]}>
      {accentColor ? <View style={[styles.accent, { backgroundColor: accentColor }]} /> : null}
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        {prefix ? <Text style={styles.affix}>{prefix}</Text> : null}
        <TextInput
          style={[styles.value, accentColor ? { color: accentColor } : null]}
          value={value}
          onChangeText={onChangeText}
          keyboardType={keyboardType}
          placeholderTextColor={C.textMuted}
        />
        {suffix ? <Text style={styles.suffix}>{suffix}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    backgroundColor: C.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 0.5,
    borderColor: C.border,
    flexGrow: 1,
    flexBasis: '45%',
    overflow: 'hidden',
  },
  fullWidth: { flexBasis: '100%' },
  accent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    borderTopLeftRadius: 14,
    borderBottomLeftRadius: 14,
  },
  label: {
    fontSize: 11,
    color: C.textMuted,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  row: { flexDirection: 'row', alignItems: 'baseline' },
  affix: { fontSize: 16, color: C.textMuted, fontWeight: '600', marginRight: 2 },
  suffix: { fontSize: 13, color: C.textMuted },
  value: { fontSize: 20, fontWeight: '700', color: C.text, padding: 0, flex: 1 },
});
