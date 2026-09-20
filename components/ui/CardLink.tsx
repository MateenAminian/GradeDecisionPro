import { Pressable, type StyleProp, type ViewStyle } from 'react-native';
import { router, type Href } from 'expo-router';
import { lightImpact } from '@/utils/haptics';

interface Props {
  href: Href;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

export default function CardLink({ href, children, style, accessibilityLabel }: Props) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={accessibilityLabel}
      onPress={() => {
        lightImpact();
        router.push(href);
      }}
      style={style}
    >
      {children}
    </Pressable>
  );
}
