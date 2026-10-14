import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { useAppTheme } from '../context/ThemeContext';
import { useResponsiveLayout } from '../theme/layout';
import LuxWaving from './LuxWaving';

export default function LuxAssistantBanner({ onPress, isActive = true }) {
  const { colors } = useAppTheme();
  const layout = useResponsiveLayout();
  const styles = useMemo(() => createStyles(colors, layout), [colors, layout]);
  const mascotSize = (layout.isCompact ? 88 : layout.isPhone ? 104 : 120) * 0.96;

  return (
    <View style={styles.banner}>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 440 144" width="100%">
          <Path d="M130 144 C235 144 220 32 320 0 H440 V144 Z" fill={colors.accent} opacity={0.4} />
          <Path
            d="M190 144 C252 42 280 98 330 132 C376 164 410 92 440 84"
            fill="none"
            stroke={colors.accentStrong}
            strokeWidth={1}
            opacity={0.5}
          />
        </Svg>
      </View>
      <View style={styles.copy}>
        <Text style={styles.title}>Hablar con Lux</Text>
        <Text style={styles.description}>Consultá, buscá documentos o pedí resúmenes por voz.</Text>
        <Pressable
          accessibilityLabel="Hablar con Lux"
          accessibilityRole="button"
          onPress={onPress}
          style={({ focused, hovered, pressed }) => [
            styles.button,
            hovered && { backgroundColor: colors.accentStrong },
            focused && { borderColor: colors.focusRing },
            pressed && { opacity: 0.75 },
          ]}
        >
          <MaterialCommunityIcons color={colors.primary} name="arrow-right" size={21} />
        </Pressable>
      </View>
      <View style={styles.mascotFrame}>
        <LuxWaving isActive={isActive} size={mascotSize} />
      </View>
    </View>
  );
}

const createStyles = (colors, layout) => StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: layout.isPhone ? 144 : 154,
    paddingHorizontal: layout.isCompact ? 18 : 22,
    paddingVertical: 16,
    borderRadius: 20,
    backgroundColor: colors.cardElevated,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    overflow: 'hidden',
    gap: layout.isCompact ? 8 : 18
  },
  copy: {
    flex: 1,
    minWidth: 0
  },
  title: {
    color: colors.text,
    fontSize: layout.isCompact ? 21 : 23,
    fontWeight: '700',
    letterSpacing: -0.6
  },
  description: {
    color: colors.legendText,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 5,
    maxWidth: 300
  },
  button: {
    width: 48,
    minHeight: 44,
    marginTop: 10,
    borderRadius: 24,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent'
  },
  mascotFrame: {
    width: layout.isCompact ? 88 : layout.isPhone ? 104 : 120,
    height: layout.isCompact ? 88 : layout.isPhone ? 104 : 120,
    borderRadius: layout.isCompact ? 44 : layout.isPhone ? 52 : 60,
    borderWidth: 2,
    borderColor: colors.gold,
    backgroundColor: colors.card,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
