import { useEffect, useId } from 'react';
import type { CSSProperties, MouseEvent, ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { router, type Href } from 'expo-router';

interface Props {
  href: Href;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

const handlers = new Map<string, () => void>();
let delegateInstalled = false;

function installDelegate() {
  if (delegateInstalled || typeof document === 'undefined') return;
  delegateInstalled = true;
  const onDomEvent = (event: Event) => {
    const el = (event.target as HTMLElement | null)?.closest?.('[data-gdp-card]');
    if (!el) return;
    const id = el.getAttribute('data-gdp-card');
    const fn = id ? handlers.get(id) : undefined;
    if (!fn) return;
    event.preventDefault();
    event.stopPropagation();
    fn();
  };
  document.addEventListener('click', onDomEvent, true);
}

if (typeof document !== 'undefined') installDelegate();

export default function CardLink({ href, children, style, accessibilityLabel }: Props) {
  const id = useId();
  const fire = () => router.push(href);

  handlers.set(id, fire);
  useEffect(() => {
    installDelegate();
    handlers.set(id, fire);
    return () => {
      handlers.delete(id);
    };
  }, [id, href]);

  const onClick = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    fire();
  };

  const flat = (Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean)) : style) as ViewStyle | undefined;
  const css: CSSProperties = {
    display: 'block',
    textDecoration: 'none',
    color: 'inherit',
    cursor: 'pointer',
    background: typeof flat?.backgroundColor === 'string' ? flat.backgroundColor : undefined,
    borderRadius: typeof flat?.borderRadius === 'number' ? flat.borderRadius : 16,
    marginTop: typeof flat?.marginTop === 'number' ? flat.marginTop : undefined,
  };

  return (
    <a href={String(href)} aria-label={accessibilityLabel} data-gdp-card={id} style={css} onClick={onClick}>
      {children}
    </a>
  );
}
