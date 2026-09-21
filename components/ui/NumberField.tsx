import { StyleSheet, View, TextInput, Platform, type StyleProp, type ViewStyle } from 'react-native';
import { Text } from '@/components/Themed';
import Colors from '@/constants/Colors';

const C = Colors.dark;

export default function NumberField({
  label,
  value,
  onChangeText,
  onBlur,
  prefix,
  suffix,
  accentColor,
  keyboardType = 'numeric',
  fullWidth,
  fieldKey,
  placeholder,
  error,
  style,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  onBlur?: () => void;
  prefix?: string;
  suffix?: string;
  accentColor?: string;
  keyboardType?: 'numeric' | 'default';
  fullWidth?: boolean;
  /** Stable identity so rapid re-renders don't remount the wrong input (#4). */
  fieldKey?: string;
  placeholder?: string;
  error?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.field, fullWidth && styles.fullWidth, error && styles.fieldError, style]}>
      {accentColor ? <View style={[styles.accent, { backgroundColor: accentColor }]} /> : null}
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        {prefix ? <Text style={styles.affix}>{prefix}</Text> : null}
        <TextInput
          key={fieldKey ?? label}
          nativeID={fieldKey ?? label}
          autoComplete={Platform.OS === 'web' ? 'off' : undefined}
          autoCorrect={false}
          style={[styles.value, accentColor ? { color: accentColor } : null]}
          value={value}
          onChangeText={onChangeText}
          onBlur={onBlur}
          keyboardType={keyboardType}
          placeholder={placeholder}
          placeholderTextColor={C.textMuted}
          {...(Platform.OS === 'web'
            ? ({ id: fieldKey ?? label, name: fieldKey ?? label } as object)
            : null)}
        />
        {suffix ? <Text style={styles.suffix}>{suffix}</Text> : null}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
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
  fieldError: { borderColor: C.accentRed + '90' },
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
  error: { marginTop: 8, fontSize: 11, color: C.accentRed, lineHeight: 15, fontWeight: '600' },
});
