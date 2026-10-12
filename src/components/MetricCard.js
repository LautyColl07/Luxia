import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '../context/ThemeContext';
import { useResponsiveLayout } from '../theme/layout';

export default function MetricCard({ label, value, icon, accentColor, onPress }) {
  const { colors } = useAppTheme();
  const layout = useResponsiveLayout();
  const styles = useMemo(() => createStyles(colors, layout), [colors, layout]);
  const normalizedValue = Number.isFinite(Number(value)) ? Number(value) : 0;

  return (
    <Pressable
      accessibilityLabel={`${label}: ${new Intl.NumberFormat('es-AR').format(normalizedValue)}`}
      accessibilityRole="button"
      disabled={!onPress}
      onPress={onPress}
      style={({ focused, hovered, pressed }) => [
        styles.indicator,
        hovered && { backgroundColor: colors.accentSoft },
        focused && { borderColor: colors.focusRing },
        pressed && { opacity: 0.7 },
      ]}
    >
      <MaterialCommunityIcons color={accentColor} name={icon} size={layout.isCompact ? 24 : 28} />
      <Text adjustsFontSizeToFit minimumFontScale={0.65} numberOfLines={1} style={styles.value}>
        {new Intl.NumberFormat('es-AR').format(normalizedValue)}
      </Text>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.accent, { backgroundColor: accentColor }]} />
    </Pressable>
  );
}

const createStyles = (colors, layout) => StyleSheet.create({
  indicator: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: layout.isCompact ? 5 : layout.isPhone ? 10 : 22,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent',
    alignItems: 'flex-start',
  },
  value: {
    color: colors.text,
    fontSize: layout.isPhone ? 23 : 30,
    fontWeight: '700',
    marginTop: 12,
    width: '100%',
  },
  label: {
    flexGrow: 1,
    color: colors.legendText,
    fontSize: layout.isCompact ? 10 : layout.isPhone ? 11 : 13,
    lineHeight: layout.isPhone ? 14 : 18,
    marginTop: 3,
    minHeight: layout.isPhone ? 28 : 36,
  },
  accent: { width: 20, height: 3, borderRadius: 2, marginTop: 11 },
});
