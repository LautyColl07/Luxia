import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '../context/ThemeContext';

export default function ActivityFilterChips({ filters, selectedFilter, onSelect }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      horizontal
      showsHorizontalScrollIndicator={false}
    >
      {filters.map((filter) => {
        const isActive = filter.key === selectedFilter;

        return (
          <Pressable
            key={filter.key}
            onPress={() => onSelect(filter.key)}
            style={[styles.chip, isActive && styles.chipActive]}
          >
            <Text style={[styles.chipText, isActive && styles.chipTextActive]}>{filter.label}</Text>
          </Pressable>
        );
      })}
      <View style={styles.trailingSpace} />
    </ScrollView>
  );
}

const createStyles = (colors) => StyleSheet.create({
  content: {
    gap: 10,
    paddingVertical: 4,
    paddingRight: 4,
  },
  chip: {
    backgroundColor: colors.card,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
  chipTextActive: {
    color: colors.textOnPrimary,
  },
  trailingSpace: {
    width: 4,
  },
});
