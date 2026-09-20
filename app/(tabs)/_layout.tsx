import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Tabs } from 'expo-router';
import Colors from '@/constants/Colors';

export default function TabLayout() {
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
          tabBarStyle: {
            backgroundColor: Colors.dark.surface,
            borderTopWidth: 1,
            borderTopColor: Colors.dark.border,
            height: Platform.OS === 'ios' ? 84 : 64,
            paddingTop: 6,
          },
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: '600',
            marginBottom: Platform.OS === 'ios' ? 0 : 8,
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
    ...(Platform.OS === 'web' ? { minHeight: '100vh' as unknown as number } : null),
  },
});
