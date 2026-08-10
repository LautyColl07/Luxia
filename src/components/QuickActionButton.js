import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '../context/ThemeContext';
import { CARD_LAYOUT, useResponsiveLayout } from '../theme/layout';

export default function QuickActionButton({ title, subtitle, icon, onPress, fullWidth = false }) {
  const { colors } = useAppTheme();
  const layout = useResponsiveLayout();
  const styles = useMemo(() => createStyles(colors, layout), [colors, layout]);

  return (
    <Pressable
      onPress={onPress}
      style={({ focused, hovered, pressed }) => [
        styles.card,
        fullWidth && styles.cardFullWidth,
        hovered && styles.cardHovered,
        focused && styles.cardFocused,
        pressed && styles.cardPressed,
      ]}
    >
      <View style={styles.iconWrapper}>
        <MaterialCommunityIcons color={colors.primary} name={icon} size={22} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
    </Pressable>
  );
}

const createStyles = (colors, layout) => StyleSheet.create({
  card: {
    width: layout.isDesktop ? '31.5%' : '48%',
    backgroundColor: colors.card,
    borderRadius: layout.isWebDesktop ? 16 : CARD_LAYOUT.borderRadius,
    padding: layout.isWebDesktop ? 16 : CARD_LAYOUT.padding,
    minHeight: 164,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: layout.isWebDesktop ? 0.08 : 0.18,
    shadowRadius: 18,
    elevation: 4,
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  cardFullWidth: {
    width: layout.isDesktop ? '31.5%' : '100%',
  },
  cardPressed: {
    transform: [{ scale: 0.99 }],
  },
  cardHovered: {
    borderColor: colors.primary,
    shadowOpacity: 0.24,
  },
  cardFocused: {
    borderColor: colors.focusRing,
  },
  iconWrapper: {
    width: CARD_LAYOUT.iconSize,
    height: CARD_LAYOUT.iconSize,
    borderRadius: CARD_LAYOUT.iconRadius,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 21,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 8,
  },
});
