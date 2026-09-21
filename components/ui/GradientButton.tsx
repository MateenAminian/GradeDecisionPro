import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router, type Href } from 'expo-router';
import { Text } from '@/components/Themed';
import Colors from '@/constants/Colors';
import { lightImpact } from '@/utils/haptics';

const C = Colors.dark;

interface Props {
  onPress?: () => void;
  href?: Href;
  title: string;
  icon?: React.ReactNode;
  colors?: readonly [string, string, ...string[]];
  style?: ViewStyle;
  outline?: boolean;
  outlineColor?: string;
  textColor?: string;
  size?: 'default' | 'small';
  disabled?: boolean;
}

export default function GradientButton({
  onPress,
  href,
  title,
  icon,
  colors = [C.accent, C.accentMuted],
  style,
  outline = false,
  outlineColor,
  textColor = '#FFFFFF',
  size = 'default',
  disabled = false,
}: Props) {
  const handlePress = () => {
    if (disabled) return;
    lightImpact();
    onPress?.();
    if (href) router.push(href);
  };

  const visual = outline ? (
    <View style={[styles.outline, { borderColor: outlineColor || colors[0] }, size === 'small' && styles.sm]}>
      {icon}
      <Text style={[styles.text, { color: outlineColor || colors[0] }, size === 'small' && styles.smText]}>{title}</Text>
    </View>
  ) : (
    <LinearGradient
      colors={colors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={[styles.gradient, size === 'small' && styles.sm]}
    >
      {icon}
      <Text style={[styles.text, { color: textColor }, size === 'small' && styles.smText]}>{title}</Text>
    </LinearGradient>
  );

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
      disabled={disabled}
      style={({ pressed }) => [styles.wrap, style, disabled && styles.disabled, pressed && !disabled && styles.pressed]}
    >
      {visual}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: 14, overflow: 'hidden' },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.65 },
  gradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 14,
    gap: 10,
    width: '100%',
  },
  outline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 14,
    gap: 10,
    borderWidth: 1.5,
    backgroundColor: 'transparent',
    width: '100%',
  },
  text: { fontSize: 16, fontWeight: '700' },
  sm: { paddingVertical: 12, paddingHorizontal: 18 },
  smText: { fontSize: 14 },
});
