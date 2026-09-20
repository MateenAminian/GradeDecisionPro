import { Text as DefaultText, View as DefaultView } from 'react-native';
import Colors from '@/constants/Colors';

type ThemeProps = { lightColor?: string; darkColor?: string };
export type TextProps = ThemeProps & DefaultText['props'];
export type ViewProps = ThemeProps & DefaultView['props'];

export function useThemeColor(props: { light?: string; dark?: string }, colorName: keyof typeof Colors.dark) {
  return props.dark || Colors.dark[colorName];
}

export function Text(props: TextProps) {
  const { style, lightColor, darkColor, ...rest } = props;
  const color = useThemeColor({ light: lightColor, dark: darkColor }, 'text');
  return <DefaultText style={[{ color }, style]} {...rest} />;
}

export function View(props: ViewProps) {
  const { style, lightColor, darkColor, ...rest } = props;
  const backgroundColor = useThemeColor({ light: lightColor, dark: darkColor }, 'background');
  return <DefaultView style={[{ backgroundColor }, style]} {...rest} />;
}
