import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated } from 'react-native';

const STORAGE_KEY = 'luxia.documents.viewMode.v1';

export default function useDocumentViewMode() {
  const [viewMode, setViewMode] = useState('list');
  const selectionChanged = useRef(false);
  const reduceMotion = useRef(true);
  const opacity = useRef(new Animated.Value(1)).current;
  // Serialize writes so rapid toggles cannot persist an older selection last.
  const writeQueue = useRef(Promise.resolve());

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (mounted && !selectionChanged.current && (stored === 'list' || stored === 'grid')) setViewMode(stored);
    }).catch(() => undefined);
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) reduceMotion.current = enabled;
    }).catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      reduceMotion.current = enabled;
      if (enabled) { opacity.stopAnimation(); opacity.setValue(1); }
    });
    return () => { mounted = false; subscription.remove(); opacity.stopAnimation(); };
  }, [opacity]);

  const changeViewMode = useCallback((nextMode) => {
    if (!['list', 'grid'].includes(nextMode) || nextMode === viewMode) return;
    selectionChanged.current = true;
    setViewMode(nextMode);
    writeQueue.current = writeQueue.current.then(() => AsyncStorage.setItem(STORAGE_KEY, nextMode)).catch(() => undefined);
    opacity.stopAnimation();
    opacity.setValue(reduceMotion.current ? 1 : 0.88);
    if (!reduceMotion.current) Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: false }).start();
  }, [opacity, viewMode]);

  return { viewMode, changeViewMode, opacity };
}
