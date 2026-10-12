import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, View } from 'react-native';

import { useAppTheme } from '../context/ThemeContext';

export type CaseScope = 'personal' | 'study';

export type CaseScopeSelectorProps = {
  value?: CaseScope;
  defaultValue?: CaseScope;
  onValueChange?: (value: CaseScope) => void;
};

const OPTIONS = [
  { value: 'personal', label: 'Mis Causas', icon: 'account' },
  { value: 'study', label: 'Causas del estudio', icon: 'account-group-outline' },
] as const;

// Home uses only local state in stage 1. A future owner can supply value and
// onValueChange. This component never changes study context, requests or storage.
export default function CaseScopeSelector({
  value,
  defaultValue = 'personal',
  onValueChange,
}: CaseScopeSelectorProps) {
  const { colors } = useAppTheme();
  const [localValue, setLocalValue] = useState(defaultValue);
  const [width, setWidth] = useState(0);
  const [focusedValue, setFocusedValue] = useState<CaseScope | null>(null);
  const selectedValue = value ?? localValue;
  const progress = useRef(new Animated.Value(selectedValue === 'study' ? 1 : 0)).current;
  const reduceMotion = useRef(false);
  const styles = useMemo(() => createStyles(colors), [colors]);
  const segmentWidth = Math.max(0, (width - 8) / 2);

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) reduceMotion.current = enabled;
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      reduceMotion.current = enabled;
    });
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: selectedValue === 'study' ? 1 : 0,
      duration: reduceMotion.current ? 0 : 220,
      easing: Easing.inOut(Easing.cubic),
      // Colors and translation share one timeline on native and web.
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [progress, selectedValue]);

  return (
    <View
      accessibilityLabel="Contexto de causas"
      accessibilityRole="radiogroup"
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={styles.container}
    >
      {segmentWidth > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.indicator,
            {
              width: segmentWidth,
              transform: [{ translateX: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [0, segmentWidth],
              }) }],
            },
          ]}
        />
      ) : (
        <View pointerEvents="none" style={[
          styles.indicator,
          {
            left: selectedValue === 'study' ? '50%' : 4,
            right: selectedValue === 'study' ? 4 : '50%',
          },
        ]} />
      )}
      {OPTIONS.map((option, index) => {
        const activeOpacity = progress.interpolate({
          inputRange: [0, 1],
          outputRange: index === 0 ? [1, 0] : [0, 1],
        });
        const inactiveOpacity = progress.interpolate({
          inputRange: [0, 1],
          outputRange: index === 0 ? [0, 1] : [1, 0],
        });
        return (
          <Pressable
            accessibilityLabel={option.label}
            accessibilityRole="radio"
            accessibilityState={{ checked: selectedValue === option.value }}
            key={option.value}
            onBlur={() => setFocusedValue(null)}
            onFocus={() => setFocusedValue(option.value)}
            onPress={() => {
              if (value === undefined) setLocalValue(option.value);
              onValueChange?.(option.value);
            }}
            style={({ pressed }) => [
              styles.option,
              focusedValue === option.value && { borderColor: colors.focusRing },
              pressed && { opacity: 0.8 },
            ]}
          >
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.icon}>
              <Animated.View style={{ opacity: inactiveOpacity }}>
                <MaterialCommunityIcons color={colors.text} name={option.icon} size={19} />
              </Animated.View>
              <Animated.View style={[StyleSheet.absoluteFill, { opacity: activeOpacity }]}>
                <MaterialCommunityIcons color={colors.textOnPrimary} name={option.icon} size={19} />
              </Animated.View>
            </View>
            <Animated.Text style={[
              styles.label,
              { color: progress.interpolate({
                inputRange: [0, 1],
                outputRange: index === 0
                  ? [colors.textOnPrimary, colors.text]
                  : [colors.text, colors.textOnPrimary],
              }) },
            ]}>
              {option.label}
            </Animated.Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const createStyles = (colors: ReturnType<typeof useAppTheme>['colors']) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: 28,
    padding: 4,
    width: '100%',
    maxWidth: 460,
    minHeight: 48
  },
  indicator: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    left: 4,
    borderRadius: 24,
    backgroundColor: colors.primaryDeep
  },
  option: {
    flex: 1,
    minWidth: 0,
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 5,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: 24
  },
  icon: {
    width: 19,
    height: 19
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    flexShrink: 1,
    textAlign: 'center'
  }
});
