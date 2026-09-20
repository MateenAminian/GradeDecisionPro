import { useEffect, useId, useRef } from 'react';
import type { CSSProperties, MouseEvent, ReactNode } from 'react';
import type { ViewStyle } from 'react-native';
import { router, type Href } from 'expo-router';
import Colors from '@/constants/Colors';

const C = Colors.dark;

interface Props {
  onPress?: () => void;
  href?: Href;
  title: string;
  icon?: ReactNode;
  colors?: readonly [string, string, ...string[]];
  style?: ViewStyle;
  outline?: boolean;
  outlineColor?: string;
  textColor?: string;
  size?: 'default' | 'small';
}

const handlers = new Map<string, () => void>();
let delegateInstalled = false;

function installDelegate() {
  if (delegateInstalled || typeof document === 'undefined') return;
  delegateInstalled = true;
  const onDomEvent = (event: Event) => {
    const el = (event.target as HTMLElement | null)?.closest?.('[data-gdp-btn]');
    if (!el) return;
    const id = el.getAttribute('data-gdp-btn');
    const fn = id ? handlers.get(id) : undefined;
    if (!fn) return;
    event.preventDefault();
    event.stopPropagation();
    fn();
  };
  document.addEventListener('click', onDomEvent, true);
  document.addEventListener('pointerup', onDomEvent, true);
}

if (typeof document !== 'undefined') {
  installDelegate();
}

/** Web-only native <a>/<button>. RN Pressable onPress does not fire inside ScrollView on this stack. */
export default function GradientButton({
  onPress,
  href,
  title,
  colors = [C.accent, C.accentMuted],
  style,
  outline = false,
  outlineColor,
  textColor = '#FFFFFF',
  size = 'default',
}: Props) {
  const id = useId();
  const last = useRef(0);

  const fire = () => {
    const now = Date.now();
    if (now - last.current < 250) return;
    last.current = now;
    onPress?.();
    if (href) router.push(href);
  };

  handlers.set(id, fire);
  useEffect(() => {
    installDelegate();
    handlers.set(id, fire);
    return () => {
      handlers.delete(id);
    };
  }, [id, onPress, href]);

  const onClick = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    fire();
  };

  const css: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    boxSizing: 'border-box',
    width: style?.flex == null ? '100%' : undefined,
    flex: style?.flex != null ? Number(style.flex) : undefined,
    padding: size === 'small' ? '12px 18px' : '16px 24px',
    borderRadius: 14,
    border: outline ? `1.5px solid ${outlineColor || colors[0]}` : 'none',
    background: outline ? 'transparent' : `linear-gradient(90deg, ${colors[0]}, ${colors[1]})`,
    color: outline ? outlineColor || colors[0] : textColor,
    fontWeight: 700,
    fontSize: size === 'small' ? 14 : 16,
    cursor: 'pointer',
    fontFamily: 'inherit',
    textDecoration: 'none',
    appearance: 'none',
  };

  if (href) {
    return (
      <a href={String(href)} aria-label={title} data-gdp-btn={id} style={css} onClick={onClick}>
        {title}
      </a>
    );
  }

  return (
    <button type="button" aria-label={title} data-gdp-btn={id} style={css} onClick={onClick}>
      {title}
    </button>
  );
}
