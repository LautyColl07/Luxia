import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import EmptyState from '../components/EmptyState';
import LoadingState from '../components/LoadingState';
import StatusBadge from '../components/StatusBadge';
import DocumentPopover from '../components/documents/DocumentPopover';
import { DOCUMENT_SORT_OPTIONS } from '../components/documents/DocumentsToolbar';
import { getCaseCourtType } from '../constants/caseCourtTypes';
import { useAuth } from '../context/AuthContext';
import { useStudyContext } from '../context/StudyContext';
import { useAppTheme } from '../context/ThemeContext';
import { getCases } from '../services/api';
import { useResponsiveLayout } from '../theme/layout';
import { formatDate, formatDateTime } from '../utils/date';

const STATUS_OPTIONS = [
  { label: 'Todos', value: 'all' }, { label: 'Activa', value: 'Activa' },
  { label: 'Pendiente', value: 'Pendiente' }, { label: 'En proceso', value: 'En proceso' },
  { label: 'Finalizada', value: 'Finalizada' }, { label: 'Archivada', value: 'Archivada' },
];

export default function CasesScreen({ navigation }) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const layout = useResponsiveLayout();
  const { authStatus, currentUser, isAuthReady } = useAuth();
  const { activeContextKey, isHydrated } = useStudyContext();
  const styles = useMemo(() => createStyles(colors, layout, insets.top), [colors, insets.top, layout]);
  const requestSequenceRef = useRef(0);
  const pendingPageRef = useRef(null);
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchingMore, setFetchingMore] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [filters, setFilters] = useState({ status: 'all', startDate: '', endDate: '' });
  const [appliedFilters, setAppliedFilters] = useState(filters);
  const [filterDateError, setFilterDateError] = useState('');
  const [datePickerField, setDatePickerField] = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 320);
    return () => clearTimeout(timer);
  }, [query]);

  const loadCases = useCallback(async (isRefresh = false, fetchPage = 1, currentFilters = appliedFilters, search = debouncedQuery, order = sortBy) => {
    if (!isAuthReady || !isHydrated || authStatus !== 'authenticated' || !currentUser) return;
    const pageKey = `${activeContextKey}:${fetchPage}:${JSON.stringify(currentFilters)}:${search}:${order}`;
    if (pendingPageRef.current === pageKey) return;
    const requestId = ++requestSequenceRef.current;
    pendingPageRef.current = pageKey;
    try {
      if (isRefresh) setRefreshing(true);
      else if (fetchPage === 1) { setLoading(true); setCases([]); setTotalItems(0); }
      else setFetchingMore(true);
      setError('');
      const response = await getCases(null, { ...currentFilters, search, sortBy: order, page: fetchPage, limit: 20 });
      const items = response.items || [];
      if (requestSequenceRef.current !== requestId) return;
      setCases((previous) => fetchPage === 1 ? items : [...previous, ...items]);
      setPage(fetchPage);
      setTotalItems(response.total ?? items.length);
      setTotalPages(response.totalPages || 1);
    } catch (loadError) {
      if (requestSequenceRef.current !== requestId) return;
      console.error('[CasesScreen] No se pudieron cargar las causas.', loadError);
      if (fetchPage === 1) setError(loadError instanceof Error ? loadError.message : 'No pudimos cargar las causas registradas.');
    } finally {
      if (pendingPageRef.current === pageKey) pendingPageRef.current = null;
      if (requestSequenceRef.current === requestId) { setLoading(false); setRefreshing(false); setFetchingMore(false); }
    }
  }, [activeContextKey, appliedFilters, authStatus, currentUser?.uid, debouncedQuery, isAuthReady, isHydrated, sortBy]);

  useFocusEffect(useCallback(() => {
    if (!isAuthReady || !isHydrated || authStatus !== 'authenticated' || !currentUser) return undefined;
    void loadCases(false, 1, appliedFilters, debouncedQuery, sortBy);
    return () => { requestSequenceRef.current += 1; pendingPageRef.current = null; };
  }, [appliedFilters, authStatus, currentUser?.uid, debouncedQuery, isAuthReady, isHydrated, loadCases, sortBy]));

  const applyFilters = () => {
    if ((filters.startDate && !isValidIsoDate(filters.startDate)) || (filters.endDate && !isValidIsoDate(filters.endDate))) {
      setFilterDateError('Elegí una fecha válida en el calendario.');
      return;
    }
    if (filters.startDate && filters.endDate && filters.startDate > filters.endDate) {
      setFilterDateError('La fecha inicial no puede ser posterior a la fecha final.');
      return;
    }
    setFilterDateError('');
    setAppliedFilters({ ...filters });
    setShowFilters(false);
  };
  const clearFilters = () => {
    const next = { status: 'all', startDate: '', endDate: '' };
    setFilters(next); setAppliedFilters(next); setQuery(''); setDebouncedQuery(''); setFilterDateError('');
  };
  const loadMore = () => { if (!loading && !fetchingMore && page < totalPages) void loadCases(false, page + 1); };

  if (loading && cases.length === 0) return <LoadingState title="Cargando causas" message="Estamos reuniendo los expedientes y su información principal." />;
  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Causas</Text>
        {layout.isWebDesktop ? <Text style={styles.subtitle}>Consulta y organiza tus expedientes.</Text> : null}
        <View style={styles.actionRow}>
          <Pressable accessibilityRole="button" onPress={() => navigation.navigate('NewCase')} style={styles.primaryButton}>
            <MaterialCommunityIcons color={colors.textOnPrimary} name="plus" size={19} />
            <Text style={styles.primaryButtonText}>Nueva causa</Text>
          </Pressable>
        </View>
        <View style={styles.searchRow}>
          <View style={styles.searchBox}>
            <MaterialCommunityIcons color={colors.textSecondary} name="magnify" size={21} />
            <TextInput accessibilityLabel="Buscar causas" onChangeText={setQuery} placeholder="Buscar por carátula o descripción..." placeholderTextColor={colors.textMuted} returnKeyType="search" style={styles.searchInput} value={query} />
            {query ? <Pressable accessibilityLabel="Borrar búsqueda" onPress={() => setQuery('')}><MaterialCommunityIcons color={colors.textMuted} name="close-circle" size={18} /></Pressable> : null}
          </View>
          <View style={[styles.searchControls, !layout.isDesktop && styles.searchControlsMobile]}>
            <DocumentPopover label="Ordenar por" triggerStyle={styles.sortTrigger}
              options={DOCUMENT_SORT_OPTIONS.map((option) => ({ ...option,
                icon: sortBy === option.value ? 'check' : undefined,
                onPress: () => setSortBy(option.value),
              }))}>
              <Text style={styles.sortText}>Ordenar por</Text>
              <MaterialCommunityIcons color={colors.textSecondary} name="chevron-down" size={18} />
            </DocumentPopover>
            <Pressable accessibilityRole="button" onPress={() => setShowFilters((open) => !open)} style={[styles.filterToggle, showFilters && styles.filterToggleActive]}>
              <MaterialCommunityIcons color={showFilters ? colors.primary : colors.textSecondary} name="filter-variant" size={18} />
              <Text style={[styles.filterToggleText, showFilters && styles.filterToggleTextActive]}>Filtros</Text>
            </Pressable>
          </View>
        </View>

        {showFilters ? <View style={styles.filterPanel}>
          <Text style={styles.filterLabel}>Estado</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statusOptions}>
            {STATUS_OPTIONS.map((option) => <Pressable key={option.value} onPress={() => setFilters((current) => ({ ...current, status: option.value }))} style={[styles.statusChip, filters.status === option.value && styles.statusChipActive]}><Text style={[styles.statusChipText, filters.status === option.value && styles.statusChipTextActive]}>{option.label}</Text></Pressable>)}
          </ScrollView>
          <View style={styles.dateRow}>
            <DateFilterField label="Desde" value={filters.startDate} onPress={() => setDatePickerField('startDate')} colors={colors} styles={styles} />
            <DateFilterField label="Hasta" value={filters.endDate} onPress={() => setDatePickerField('endDate')} colors={colors} styles={styles} />
          </View>
          {filterDateError ? <Text accessibilityRole="alert" style={styles.dateError}>{filterDateError}</Text> : null}
          <View style={styles.filterActions}><Pressable onPress={clearFilters} style={styles.clearButton}><Text style={styles.clearButtonText}>Limpiar</Text></Pressable><Pressable onPress={applyFilters} style={styles.applyButton}><Text style={styles.applyButtonText}>Aplicar filtros</Text></Pressable></View>
        </View> : null}
        <View style={styles.resultsRow}><Text style={styles.resultsText}>{totalItems === 1 ? '1 causa encontrada' : `${totalItems} causas encontradas`}</Text><View style={styles.separator} /></View>
        {error && !cases.length ? <View accessibilityRole="alert" style={styles.inlineError}>
          <View style={styles.inlineErrorCopy}><Text style={styles.inlineErrorTitle}>No pudimos cargar las causas</Text><Text style={styles.inlineErrorText}>{error}</Text></View>
          <Pressable accessibilityRole="button" onPress={() => void loadCases(false, 1)} style={styles.inlineRetry}><Text style={styles.inlineRetryText}>Reintentar</Text></Pressable>
        </View> : null}
      </View>
      <FlatList
        contentContainerStyle={styles.listContent}
        data={cases}
        keyExtractor={(item) => String(item?.id)}
        keyboardShouldPersistTaps="handled"
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        refreshControl={<RefreshControl onRefresh={() => void loadCases(true, 1)} refreshing={refreshing} tintColor={colors.primary} />}
        renderItem={({ item }) => <CaseRow item={item} colors={colors} styles={styles} onPress={() => navigation.navigate('CaseDetail', { caseId: item?.id })} />}
        ListFooterComponent={fetchingMore ? <ActivityIndicator color={colors.primary} style={styles.loadingMore} /> : null}
        ListEmptyComponent={!loading && !error ? <EmptyState actionLabel="Nueva causa" icon="briefcase-search-outline" message="No se encontraron causas con la búsqueda o los filtros seleccionados." onAction={() => navigation.navigate('NewCase')} title="Sin resultados" /> : null}
        showsVerticalScrollIndicator={false}
      />
      <DatePickerModal
        visible={Boolean(datePickerField)}
        selectedValue={datePickerField ? filters[datePickerField] : ''}
        minDate={datePickerField === 'endDate' ? filters.startDate : ''}
        maxDate={datePickerField === 'startDate' ? filters.endDate : ''}
        colors={colors}
        onClose={() => setDatePickerField(null)}
        onSelect={(value) => {
          setFilters((current) => ({ ...current, [datePickerField]: value }));
          setFilterDateError('');
          setDatePickerField(null);
        }}
      />
    </View>
  );
}

function DateFilterField({ label, value, onPress, colors, styles }) {
  return <View style={styles.dateField}>
    <Text style={styles.filterLabel}>{label}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${value ? formatFilterDate(value) : 'Elegir fecha'}`} onPress={onPress} style={styles.datePickerTrigger}>
      <MaterialCommunityIcons color={colors.textSecondary} name="calendar-month-outline" size={18} />
      <Text style={[styles.datePickerText, !value && styles.datePickerPlaceholder]}>{value ? formatFilterDate(value) : 'Elegir fecha'}</Text>
      <MaterialCommunityIcons color={colors.textMuted} name="chevron-down" size={18} />
    </Pressable>
  </View>;
}

function DatePickerModal({ visible, selectedValue, minDate, maxDate, colors, onClose, onSelect }) {
  const today = new Date();
  const [month, setMonth] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const calendarStyles = useMemo(() => createCalendarStyles(colors), [colors]);

  useEffect(() => {
    if (!visible) return;
    const selected = parseIsoDate(selectedValue) || new Date();
    setMonth({ year: selected.getFullYear(), month: selected.getMonth() });
  }, [visible, selectedValue]);

  const first = new Date(month.year, month.month, 1);
  const startOffset = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(month.year, month.month + 1, 0).getDate();
  const cells = [...Array(startOffset).fill(null), ...Array.from({ length: daysInMonth }, (_, index) => index + 1)];
  while (cells.length % 7) cells.push(null);
  const monthLabel = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' }).format(first);
  const moveMonth = (delta) => {
    const next = new Date(month.year, month.month + delta, 1);
    setMonth({ year: next.getFullYear(), month: next.getMonth() });
  };

  return <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
    <View style={calendarStyles.backdrop}>
      <Pressable accessibilityRole="button" accessibilityLabel="Cerrar calendario" onPress={onClose} style={StyleSheet.absoluteFill} />
      <View accessibilityViewIsModal style={calendarStyles.dialog}>
        <View style={calendarStyles.header}>
          <Text style={calendarStyles.title}>Elegir fecha</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Cerrar calendario" onPress={onClose} style={calendarStyles.closeButton}><MaterialCommunityIcons color={colors.textSecondary} name="close" size={20} /></Pressable>
        </View>
        <View style={calendarStyles.monthRow}>
          <Pressable accessibilityRole="button" accessibilityLabel="Mes anterior" onPress={() => moveMonth(-1)} style={calendarStyles.monthButton}><MaterialCommunityIcons color={colors.text} name="chevron-left" size={23} /></Pressable>
          <Text style={calendarStyles.monthLabel}>{monthLabel}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Mes siguiente" onPress={() => moveMonth(1)} style={calendarStyles.monthButton}><MaterialCommunityIcons color={colors.text} name="chevron-right" size={23} /></Pressable>
        </View>
        <View style={calendarStyles.grid}>
          {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((day, index) => <Text key={`${day}-${index}`} style={calendarStyles.weekday}>{day}</Text>)}
          {cells.map((day, index) => {
            if (!day) return <View key={`empty-${index}`} style={calendarStyles.dayCell} />;
            const dateValue = `${month.year}-${String(month.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const selected = selectedValue === dateValue;
            const disabled = (minDate && dateValue < minDate) || (maxDate && dateValue > maxDate);
            return <Pressable accessibilityRole="button" accessibilityLabel={formatFilterDate(dateValue)} accessibilityState={{ selected, disabled: Boolean(disabled) }} disabled={Boolean(disabled)} key={dateValue} onPress={() => onSelect(dateValue)} style={[calendarStyles.dayCell, selected && calendarStyles.selectedDay, disabled && calendarStyles.disabledDay]}>
              <Text style={[calendarStyles.dayText, selected && calendarStyles.selectedDayText, disabled && calendarStyles.disabledDayText]}>{day}</Text>
            </Pressable>;
          })}
        </View>
        <View style={calendarStyles.footer}>
          <Pressable onPress={onClose} style={calendarStyles.cancelButton}><Text style={calendarStyles.cancelText}>Cancelar</Text></Pressable>
          <Pressable onPress={() => onSelect('')} style={calendarStyles.clearDateButton}><Text style={calendarStyles.clearDateText}>Quitar fecha</Text></Pressable>
        </View>
      </View>
    </View>
  </Modal>;
}

function parseIsoDate(value) {
  if (!isValidIsoDate(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function isValidIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function formatFilterDate(value) {
  const date = parseIsoDate(value);
  return date ? formatDate(date) : '';
}

function CaseRow({ item, colors, styles, onPress }) {
  const courtType = getCaseCourtType(item?.courtType);
  const upcoming = (item?.hearings || []).map((hearing) => hearing?.date).filter((date) => date && new Date(date) >= new Date()).sort((a, b) => new Date(a) - new Date(b))[0];
  const secondary = item?.description && item.description !== 'Sin informacion adicional registrada.' ? item.description : null;
  return <Pressable accessibilityRole="button" onPress={onPress} style={styles.row}>
    <View style={[styles.courtIconBox, { backgroundColor: `${courtType.color}18` }]}><MaterialCommunityIcons color={courtType.color} name={courtType.icon} size={25} /></View>
    <View style={[styles.courtAccent, { backgroundColor: courtType.color }]} />
    <View style={styles.rowContent}>
      <View style={styles.rowTitleLine}><Text numberOfLines={1} style={styles.rowTitle}>{item?.title || 'Causa sin título'}</Text><StatusBadge status={item?.status} style={styles.mobileBadge} /></View>
      {secondary ? <Text numberOfLines={1} style={styles.rowDescription}>{secondary}</Text> : null}
      <View style={styles.rowMeta}>
        {item?.court ? <View style={styles.metaLine}><MaterialCommunityIcons color={colors.textMuted} name="bank-outline" size={15} /><Text numberOfLines={1} style={styles.metaText}>{item.court}</Text></View> : null}
        <View style={styles.metaLine}><MaterialCommunityIcons color={colors.textMuted} name="calendar-outline" size={15} /><Text numberOfLines={1} style={styles.metaText}>{upcoming ? `Próxima audiencia · ${formatDateTime(upcoming)}` : `Fecha de alta · ${formatDate(item?.createdAt)}`}</Text></View>
      </View>
    </View>
    <View style={styles.rowEnd}><StatusBadge status={item?.status} style={styles.desktopBadge} /><MaterialCommunityIcons color={colors.textMuted} name="chevron-right" size={23} /></View>
  </Pressable>;
}

const createStyles = (colors, layout, topInset) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center', paddingTop: layout.isWebDesktop ? 28 : Math.max(topInset + 12, layout.topSpacing), paddingHorizontal: layout.gutter, gap: 12 },
  title: { color: colors.text, fontSize: layout.isPhone ? 28 : 30, fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { color: colors.textSecondary, fontSize: 14, marginTop: -8 },
  actionRow: { flexDirection: 'row' },
  primaryButton: { minHeight: 46, paddingHorizontal: 18, borderRadius: 17, backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  primaryButtonText: { color: colors.textOnPrimary, fontSize: 14, fontWeight: '700' },
  searchRow: { flexDirection: layout.isDesktop ? 'row' : 'column', alignItems: layout.isDesktop ? 'center' : 'stretch', gap: 8 },
  searchBox: { flex: layout.isDesktop ? 1 : undefined, minWidth: 0, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 13, borderRadius: 18, backgroundColor: colors.inputBackground, borderWidth: 1, borderColor: colors.borderSoft },
  searchInput: { flex: 1, minWidth: 0, color: colors.text, fontSize: 14, paddingVertical: 10, outlineStyle: 'none' },
  searchControls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  searchControlsMobile: { width: '100%', justifyContent: 'flex-end' },
  filterToggle: { minHeight: 48, paddingHorizontal: 15, borderRadius: 18, flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderColor: colors.borderSoft, backgroundColor: colors.card },
  filterToggleActive: { borderColor: colors.primary, backgroundColor: colors.accentSoft },
  filterToggleText: { color: colors.textSecondary, fontSize: 14, fontWeight: '600' },
  filterToggleTextActive: { color: colors.primary },
  sortTrigger: { minHeight: 44, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: colors.borderSoft, borderRadius: 14, backgroundColor: colors.card },
  sortText: { color: colors.textSecondary, fontSize: 12 },
  filterPanel: { width: '100%', minWidth: 0, padding: 15, gap: 11, borderRadius: 17, borderWidth: 1, borderColor: colors.borderSoft, backgroundColor: colors.card },
  filterLabel: { color: colors.textSecondary, fontSize: 11, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase' },
  statusOptions: { gap: 7, paddingVertical: 2 },
  statusChip: { paddingHorizontal: 11, paddingVertical: 7, borderRadius: 12, borderWidth: 1, borderColor: colors.borderSoft, backgroundColor: colors.background },
  statusChipActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  statusChipText: { color: colors.textSecondary, fontSize: 12 },
  statusChipTextActive: { color: colors.textOnPrimary, fontWeight: '700' },
  dateRow: { width: '100%', minWidth: 0, flexDirection: layout.isPhone ? 'column' : 'row', gap: 10 },
  dateField: { flex: 1, minWidth: 0, gap: 7 },
  datePickerTrigger: { width: '100%', minWidth: 0, minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.borderSoft, backgroundColor: colors.inputBackground, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 9 },
  datePickerText: { flex: 1, minWidth: 0, flexShrink: 1, color: colors.text, fontSize: 14 },
  datePickerPlaceholder: { color: colors.textMuted },
  dateError: { color: colors.danger, fontSize: 12, lineHeight: 17 },
  inlineError: { padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.danger, backgroundColor: colors.dangerSoft, flexDirection: 'row', alignItems: 'center', gap: 12 },
  inlineErrorCopy: { flex: 1, gap: 3 },
  inlineErrorTitle: { color: colors.danger, fontSize: 13, fontWeight: '700' },
  inlineErrorText: { color: colors.textSecondary, fontSize: 12 },
  inlineRetry: { minHeight: 38, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 10, backgroundColor: colors.primary },
  inlineRetryText: { color: colors.textOnPrimary, fontSize: 12, fontWeight: '700' },
  filterActions: { width: '100%', minWidth: 0, flexDirection: layout.isPhone ? 'column-reverse' : 'row', justifyContent: 'flex-end', alignItems: layout.isPhone ? 'stretch' : 'center', gap: 8, borderTopWidth: 1, borderTopColor: colors.borderSoft, paddingTop: 10, marginTop: 2 },
  clearButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  clearButtonText: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
  applyButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 15, borderRadius: 12, backgroundColor: colors.primary },
  applyButtonText: { color: colors.textOnPrimary, fontSize: 13, fontWeight: '700' },
  resultsRow: { paddingTop: 6, gap: 10 },
  resultsText: { color: colors.textMuted, fontSize: 12, fontWeight: '500' },
  separator: { height: 1, backgroundColor: colors.borderSoft },
  listContent: { width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center', paddingHorizontal: layout.gutter, paddingBottom: 30 },
  row: { minHeight: layout.isPhone ? 126 : 132, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
  courtIconBox: { width: 50, height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  courtAccent: { width: 3, alignSelf: 'stretch', maxHeight: 106, borderRadius: 2, flexShrink: 0 },
  rowContent: { flex: 1, minWidth: 0, gap: 4 },
  rowTitleLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 6 },
  rowTitle: { flex: 1, minWidth: 0, color: colors.text, fontSize: 16, fontWeight: '700' },
  rowDescription: { color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
  rowMeta: { gap: 3, marginTop: 3 },
  metaLine: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
  metaText: { flexShrink: 1, color: colors.textSecondary, fontSize: 12 },
  rowEnd: { alignItems: 'center', gap: 3, flexShrink: 0 },
  mobileBadge: { display: layout.isPhone ? 'flex' : 'none', paddingHorizontal: 9, paddingVertical: 5 },
  desktopBadge: { display: layout.isPhone ? 'none' : 'flex' },
  loadingMore: { padding: 20 },
});

const createCalendarStyles = (colors) => StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 16, backgroundColor: 'rgba(0, 0, 0, 0.58)' },
  dialog: { width: '100%', maxWidth: 380, padding: 18, borderRadius: 20, borderWidth: 1, borderColor: colors.borderSoft, backgroundColor: colors.card, shadowColor: colors.shadow, shadowOpacity: 0.2, shadowRadius: 20, elevation: 10 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: colors.text, fontSize: 18, fontWeight: '700' },
  closeButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, marginBottom: 12 },
  monthButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: colors.backgroundAlt },
  monthLabel: { color: colors.text, fontSize: 15, fontWeight: '700', textTransform: 'capitalize' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  weekday: { width: `${100 / 7}%`, height: 36, textAlign: 'center', textAlignVertical: 'center', color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  dayCell: { width: `${100 / 7}%`, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  dayText: { color: colors.text, fontSize: 14 },
  selectedDay: { backgroundColor: colors.primary },
  selectedDayText: { color: colors.textOnPrimary, fontWeight: '700' },
  disabledDay: { opacity: 0.3 },
  disabledDayText: { color: colors.textMuted },
  footer: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.borderSoft },
  cancelButton: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 12 },
  cancelText: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
  clearDateButton: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 10, backgroundColor: colors.accentSoft },
  clearDateText: { color: colors.primary, fontSize: 13, fontWeight: '700' },
});
