import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '../../context/ThemeContext';
import DocumentPopover from './DocumentPopover';

export const DOCUMENT_SORT_OPTIONS = [
  { value: 'newest', label: 'Más recientes' },
  { value: 'oldest', label: 'Más antiguos' },
  { value: 'name_asc', label: 'Nombre ascendente (A–Z)' },
  { value: 'name_desc', label: 'Nombre descendente (Z–A)' },
];
export const DOCUMENT_CATEGORY_OPTIONS = [
  { value: 'demanda', label: 'Demandas' },
  { value: 'escrito', label: 'Escritos' },
  { value: 'anexo', label: 'Anexos' },
  { value: 'prueba', label: 'Pruebas' },
];

// Values match the document API; the screen owns the selected query.
export default function DocumentsToolbar({ viewMode, onViewModeChange, sortBy, onSortChange,
  selectedCategories = [], onCategoriesChange, sortingEnabled = false, filtersEnabled = false }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const canSort = sortingEnabled && Boolean(onSortChange);
  const canFilter = filtersEnabled && Boolean(onCategoriesChange);
  const sortLabel = DOCUMENT_SORT_OPTIONS.find((option) => option.value === sortBy)?.label;
  return (
    <View style={styles.toolbar}>
      <DocumentPopover label={canSort && sortLabel ? `Ordenar por: ${sortLabel}` : 'Ordenar por'} triggerStyle={styles.sort}
        message={canSort ? undefined : 'Próximamente. Las opciones todavía no modifican el orden de los documentos.'}
        options={DOCUMENT_SORT_OPTIONS.map((option) => ({ ...option, disabled: !canSort,
          icon: canSort && sortBy === option.value ? 'check' : undefined,
          onPress: () => onSortChange?.(option.value) }))}>
        <Text style={styles.controlText}>Ordenar por</Text>
        <MaterialCommunityIcons name="chevron-down" size={18} color={colors.textSecondary} />
      </DocumentPopover>
      <DocumentPopover label="Filtros" icon="filter-variant" textStyle={styles.controlText} triggerStyle={styles.filters}
        message={canFilter ? undefined : 'Próximamente. La clasificación y los filtros por categoría todavía no están disponibles.'}
        options={[...DOCUMENT_CATEGORY_OPTIONS.map((option) => ({ ...option, disabled: !canFilter,
          icon: canFilter && selectedCategories.includes(option.value) ? 'checkbox-marked-outline' : 'checkbox-blank-outline',
          onPress: () => onCategoriesChange?.(selectedCategories.includes(option.value)
            ? selectedCategories.filter((value) => value !== option.value) : [...selectedCategories, option.value]) })),
          ...(canFilter && selectedCategories.length ? [{ value: 'clear', label: 'Limpiar filtros', icon: 'filter-remove-outline',
            onPress: () => onCategoriesChange([]) }] : [])]}>
        <Text style={styles.controlText}>{selectedCategories.length ? `Filtros (${selectedCategories.length})` : 'Filtros'}</Text>
      </DocumentPopover>
      <View style={styles.viewSelector} accessibilityRole="radiogroup" accessibilityLabel="Vista de documentos">
        {[{ value: 'list', label: 'Vista de lista', icon: 'format-list-bulleted' },
          { value: 'grid', label: 'Vista de cuadrícula', icon: 'view-grid-outline' }].map((option) => (
          <Pressable key={option.value} accessibilityRole="radio" accessibilityLabel={option.label}
            accessibilityState={{ checked: viewMode === option.value }}
            aria-checked={viewMode === option.value}
            onPress={() => onViewModeChange(option.value)}
            style={({ pressed, focused, hovered }) => [styles.viewButton,
              viewMode === option.value && styles.activeView, hovered && styles.hovered,
              focused && styles.focused, pressed && styles.pressed]}>
            <MaterialCommunityIcons name={option.icon} size={21}
              color={viewMode === option.value ? colors.text : colors.textSecondary} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export function CreateWritingButton({ onCreateWriting, style, textStyle }) {
  const { colors } = useAppTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Crear escrito, próximamente"
      onPress={onCreateWriting} style={({ pressed, focused }) => [style,
        focused && { borderColor: colors.focusRing }, pressed && { opacity: 0.78 }]}>
      <MaterialCommunityIcons color={colors.textOnPrimary} name="plus" size={18} />
      <Text style={textStyle}>Crear escrito</Text>
    </Pressable>
  );
}

const createStyles = (colors) => StyleSheet.create({
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  sort: { paddingHorizontal: 4 },
  controlText: { color: colors.textSecondary, fontSize: 12 },
  filters: { borderColor: colors.border, borderRadius: 22, paddingHorizontal: 12 },
  viewSelector: { marginLeft: 'auto', flexDirection: 'row', gap: 2 },
  viewButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: 'transparent' },
  activeView: { backgroundColor: colors.accentStrong, borderColor: colors.border },
  hovered: { backgroundColor: colors.accentSoft },
  focused: { borderColor: colors.focusRing },
  pressed: { opacity: 0.72 },
});
