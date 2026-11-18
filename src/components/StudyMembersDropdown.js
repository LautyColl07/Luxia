import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '../context/ThemeContext';
import { FilterField } from './FilterControls';

export default function StudyMembersDropdown({
  label, emptyLabel, includeAll = false, members, selected, onSelect, loading, error, onRetry, style,
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [expanded, setExpanded] = useState(false);

  const selectedMember = selected.length === 1
    ? members.find((member) => String(member.userId) === selected[0])
    : null;
  const value = selected.length === 0
    ? emptyLabel
    : selectedMember?.name || `${selected.length} ${selected.length === 1 ? 'integrante' : 'integrantes'}`;

  return (
    <View style={[styles.control, style]}>
      <FilterField
        label={label}
        value={value}
        icon="account-multiple-outline"
        expanded={expanded}
        onPress={() => setExpanded((current) => !current)}
      />
      {expanded ? (
        <View style={styles.dropdown}>
          {includeAll ? (
            <MemberOption label="Todos" selected={!selected.length} onPress={() => onSelect([])} colors={colors} styles={styles} />
          ) : null}
          {members.length ? (
            <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" style={[styles.memberList, includeAll && styles.separatedList]}>
              {members.map((member) => {
                const id = String(member.userId);
                const checked = selected.includes(id);
                return (
                  <MemberOption
                    key={id}
                    label={member.name}
                    selected={checked}
                    onPress={() => onSelect(checked ? selected.filter((item) => item !== id) : [...selected, id])}
                    colors={colors}
                    styles={styles}
                  />
                );
              })}
            </ScrollView>
          ) : (
            <Text style={styles.listMessage}>
              {loading ? 'Cargando integrantes…' : error ? 'No pudimos cargar los integrantes.' : 'No hay integrantes activos.'}
            </Text>
          )}
          {error ? (
            <Pressable accessibilityRole="button" onPress={onRetry} style={styles.option}>
              <Text style={styles.retryText}>Reintentar</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function MemberOption({ label, selected, onPress, colors, styles }) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="checkbox"
      aria-checked={selected}
      onBlur={() => setFocused(false)}
      onFocus={() => setFocused(true)}
      onPress={onPress}
      style={({ pressed }) => [styles.option, selected && styles.optionSelected, (focused || pressed) && styles.optionFocus]}
    >
      <MaterialCommunityIcons color={selected ? colors.text : colors.textSecondary} name={selected ? 'checkbox-marked-outline' : 'checkbox-blank-outline'} size={18} />
      <Text style={styles.optionText}>{label}</Text>
    </Pressable>
  );
}

const createStyles = (colors) => StyleSheet.create({
  control: { width: '100%', gap: 6 },
  dropdown: { borderWidth: 1, borderColor: colors.borderSoft, borderRadius: 12, backgroundColor: colors.inputBackground, padding: 4 },
  memberList: { maxHeight: 208, flexGrow: 0 },
  separatedList: { borderTopWidth: 1, borderTopColor: colors.borderSoft, marginTop: 4, paddingTop: 4 },
  option: { minHeight: 44, paddingHorizontal: 9, paddingVertical: 7, flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 8, borderWidth: 1, borderColor: 'transparent' },
  optionSelected: { backgroundColor: colors.accentStrong },
  optionFocus: { borderColor: colors.focusRing },
  optionText: { flex: 1, color: colors.text, fontSize: 14 },
  listMessage: { padding: 10, color: colors.textSecondary, fontSize: 13 },
  retryText: { color: colors.text, fontSize: 13, fontWeight: '700' },
});
