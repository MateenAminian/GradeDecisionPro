import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Colors from '@/constants/Colors';

/**
 * iOS Safari's bottom search/tool bar overlays the layout viewport.
 * visualViewport gap tracks that chrome; cap so the software keyboard
 * does not inflate tab-bar padding.
 */
function useWebBottomChromeInset() {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const sync = () => {
      const vv = window.visualViewport;
      if (!vv) {
        setInset(0);
        return;
      }
      const gap = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      setInset(Math.min(gap, 120));
    };

    sync();
    const vv = window.visualViewport;
    vv?.addEventListener('resize', sync);
    vv?.addEventListener('scroll', sync);
    window.addEventListener('resize', sync);
    return () => {
      vv?.removeEventListener('resize', sync);
      vv?.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
    };
  }, []);

  return Platform.OS === 'web' ? inset : 0;
}

export default function TabLayout() {
  const safe = useSafeAreaInsets();
  const chromeInset = useWebBottomChromeInset();
  const { width } = useWindowDimensions();
  const isWeb = Platform.OS === 'web';
  const desktop = isWeb && width >= 1024;
  const webBottomPad = isWeb && !desktop ? Math.max(8, safe.bottom, chromeInset) : 0;

  return (
    <View style={styles.tabsRoot}>
      <Tabs
        screenOptions={{
          headerStyle: {
            backgroundColor: Colors.dark.background,
            elevation: 0,
            shadowOpacity: 0,
            borderBottomWidth: 0,
          },
          headerTintColor: Colors.dark.text,
          headerTitleStyle: { fontWeight: '700', fontSize: 18 },
          sceneStyle: { flex: 1, backgroundColor: Colors.dark.background },
          tabBarActiveTintColor: Colors.dark.accent,
          tabBarInactiveTintColor: Colors.dark.tabIconDefault,
          ...(desktop ? { tabBarPosition: 'top' as const } : null),
          tabBarStyle: desktop
            ? {
                backgroundColor: Colors.dark.surface,
                borderTopWidth: 0,
                borderBottomWidth: 1,
                borderBottomColor: Colors.dark.border,
                height: 56,
                paddingTop: 4,
                paddingBottom: 4,
              }
            : {
                backgroundColor: Colors.dark.surface,
                borderTopWidth: 1,
                borderTopColor: Colors.dark.border,
                paddingTop: 6,
                ...(isWeb
                  ? {
                      height: undefined,
                      paddingBottom: webBottomPad,
                    }
                  : {
                      height: Platform.OS === 'ios' ? 84 : 64,
                    }),
              },
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: '600',
            marginBottom: desktop || Platform.OS === 'ios' ? 0 : 8,
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Decide',
            headerShown: false,
            tabBarIcon: ({ color }) => <FontAwesome name="calculator" size={18} color={color} />,
          }}
        />
        <Tabs.Screen
          name="analyze"
          options={{
            title: 'Analyze',
            headerTitle: 'Scan cards',
            tabBarIcon: ({ color }) => <FontAwesome name="camera" size={18} color={color} />,
          }}
        />
        <Tabs.Screen
          name="inventory"
          options={{
            title: 'Inventory',
            headerTitle: 'Inventory',
            tabBarIcon: ({ color }) => <FontAwesome name="th-large" size={18} color={color} />,
          }}
        />
        <Tabs.Screen
          name="batch"
          options={{
            title: 'Batch',
            headerTitle: 'Batch Modeling',
            tabBarIcon: ({ color }) => <FontAwesome name="th-list" size={18} color={color} />,
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: 'Settings',
            tabBarIcon: ({ color }) => <FontAwesome name="cog" size={18} color={color} />,
          }}
        />
      </Tabs>
    </View>
  );
}

const styles = StyleSheet.create({
  tabsRoot: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
});
