import { Platform, View, type ViewProps } from 'react-native';
import Animated, { type AnimatedProps } from 'react-native-reanimated';

type Props = AnimatedProps<typeof Animated.View> & ViewProps;

/** Reanimated entering animations can leave content at opacity 0 on web — skip them there. */
export default function EnterView({ entering, children, style, ...rest }: Props) {
  if (Platform.OS === 'web' || !entering) {
    return (
      <View style={style} {...rest}>
        {children}
      </View>
    );
  }

  return (
    <Animated.View entering={entering} style={style} {...rest}>
      {children}
    </Animated.View>
  );
}
