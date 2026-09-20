import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { StateStorage } from 'zustand/middleware';

/** In-memory fallback when Expo web SSR has no window/localStorage. */
const ssrMemory = new Map<string, string>();

function isWebSsr() {
  return Platform.OS === 'web' && typeof window === 'undefined';
}

export const safeStorage: StateStorage = {
  getItem: async (name) => {
    if (isWebSsr()) return ssrMemory.get(name) ?? null;
    if (Platform.OS === 'web') return window.localStorage.getItem(name);
    return AsyncStorage.getItem(name);
  },
  setItem: async (name, value) => {
    if (isWebSsr()) {
      ssrMemory.set(name, value);
      return;
    }
    if (Platform.OS === 'web') {
      window.localStorage.setItem(name, value);
      return;
    }
    await AsyncStorage.setItem(name, value);
  },
  removeItem: async (name) => {
    if (isWebSsr()) {
      ssrMemory.delete(name);
      return;
    }
    if (Platform.OS === 'web') {
      window.localStorage.removeItem(name);
      return;
    }
    await AsyncStorage.removeItem(name);
  },
};
