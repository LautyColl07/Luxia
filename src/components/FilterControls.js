import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '../context/ThemeContext';

function useFilterTheme() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return { colors, styles };
}

export function FilterPanel({ children }) {
  const { styles } = useFilterTheme();
  return <View style={styles.panel}>{children}</View>;
}

export function FilterSection({ label, divided, children }) {
  const { styles } = useFilterTheme();
  return (
    <View style={[styles.section, divided && styles.divider]}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

export function FilterChip({ label, selected, onPress, multiple = false }) {
  const { colors, styles } = useFilterTheme();
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole={multiple ? 'checkbox' : 'radio'}
      aria-checked={selected}
      onBlur={() => setFocused(false)}
      onFocus={() => setFocused(true)}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.chipSelected,
        (focused || pressed) && styles.focus,
      ]}
    >
      {multiple ? (
        <MaterialCommunityIcons
          color={selected ? colors.text : colors.textSecondary}
          name={selected ? 'checkbox-marked-outline' : 'checkbox-blank-outline'}
          size={17}
        />
      ) : null}
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

export function FilterField({ label, value, icon, expanded, onPress }) {
  const { colors, styles } = useFilterTheme();
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      accessibilityLabel={`${label}: ${value}`}
      accessibilityRole="button"
      aria-expanded={expanded}
      onBlur={() => setFocused(false)}
      onFocus={() => setFocused(true)}
      onPress={onPress}
      style={({ pressed }) => [styles.field, expanded && styles.fieldExpanded, (focused || pressed) && styles.focus]}
    >
      <MaterialCommunityIcons color={colors.textSecondary} name={icon} size={18} />
      <Text style={styles.fieldText}>{value}</Text>
      <MaterialCommunityIcons color={colors.textSecondary} name={expanded ? 'chevron-up' : 'chevron-down'} size={18} />
    </Pressable>
  );
}

const createStyles = (colors) => StyleSheet.create({
  panel: {
    width: '100%',
    minWidth: 0,
    padding: 15,
    gap: 12,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.card,
  },
  section: { minWidth: 0, gap: 8 },
  divider: { borderTopWidth: 1, borderTopColor: colors.borderSoft, paddingTop: 12 },
  label: { color: colors.textSecondary, fontSize: 11, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase' },
  chip: {
    minHeight: 40,
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.background,
  },
  chipSelected: { borderColor: colors.primary, backgroundColor: colors.accentStrong },
  chipText: { flexShrink: 1, color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
  chipTextSelected: { color: colors.text, fontWeight: '700' },
  field: {
    minHeight: 44,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.inputBackground,
  },
  fieldExpanded: { borderColor: colors.primary },
  fieldText: { flex: 1, minWidth: 0, color: colors.text, fontSize: 14 },
  focus: { borderColor: colors.focusRing },
});
