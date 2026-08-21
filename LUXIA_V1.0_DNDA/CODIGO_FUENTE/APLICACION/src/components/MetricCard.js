import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '../context/ThemeContext';

export default function MetricCard({ label, value, icon, accentColor, onPress }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const normalizedValue = Number.isFinite(Number(value)) ? Number(value) : 0;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        pressed && styles.cardPressed,
      ]}
    >
      <View style={[styles.iconWrapper, { backgroundColor: `${accentColor}18` }]}>
        <MaterialCommunityIcons color={accentColor} name={icon} size={22} />
      </View>
      <Text style={styles.value}>{new Intl.NumberFormat('es-AR').format(normalizedValue)}</Text>
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const createStyles = (colors) => StyleSheet.create({
  card: {
    flex: 1,
    height: '100%',
    backgroundColor: colors.card,
    borderRadius: 24,
    padding: 18,
    justifyContent: 'space-between',
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 4,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  cardPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.985 }],
  },
  iconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '700',
  },
  label: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    minHeight: 40,
  },
});
