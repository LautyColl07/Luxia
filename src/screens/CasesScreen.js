import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import LoadingState from '../components/LoadingState';
import StatusBadge from '../components/StatusBadge';
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
const QUICK_OPTIONS = [
  { label: 'Todas', value: 'all' }, { label: 'Activas', value: 'Activa' },
  { label: 'En proceso', value: 'En proceso' }, { label: 'Finalizadas', value: 'Finalizada' },
];
const SORT_OPTIONS = [
  { label: 'Más recientes', value: 'newest' }, { label: 'Más antiguas', value: 'oldest' },
  { label: 'Nombre A–Z', value: 'name_asc' }, { label: 'Nombre Z–A', value: 'name_desc' },
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
  const [showSortOptions, setShowSortOptions] = useState(false);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [filters, setFilters] = useState({ status: 'all', court: '', startDate: '', endDate: '' });
  const [appliedFilters, setAppliedFilters] = useState(filters);
  const activeSortLabel = SORT_OPTIONS.find((option) => option.value === sortBy)?.label || 'Más recientes';

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

  const chooseQuickStatus = (status) => {
    const next = { ...filters, status };
    setFilters(next);
    setAppliedFilters(next);
  };
  const applyFilters = () => { setAppliedFilters({ ...filters }); setShowFilters(false); };
  const clearFilters = () => {
    const next = { status: 'all', court: '', startDate: '', endDate: '' };
    setFilters(next); setAppliedFilters(next); setQuery(''); setDebouncedQuery('');
  };
  const loadMore = () => { if (!loading && !fetchingMore && page < totalPages) void loadCases(false, page + 1); };

  if (loading && cases.length === 0) return <LoadingState title="Cargando causas" message="Estamos reuniendo los expedientes y su información principal." />;
  if (error && cases.length === 0) return <ErrorState title="No pudimos cargar las causas" message={error} onRetry={() => void loadCases(false, 1)} />;

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
            <TextInput accessibilityLabel="Buscar causas" onChangeText={setQuery} placeholder="Buscar por carátula, juzgado o descripción..." placeholderTextColor={colors.textMuted} returnKeyType="search" style={styles.searchInput} value={query} />
            {query ? <Pressable accessibilityLabel="Borrar búsqueda" onPress={() => setQuery('')}><MaterialCommunityIcons color={colors.textMuted} name="close-circle" size={18} /></Pressable> : null}
          </View>
          <Pressable accessibilityRole="button" onPress={() => setShowFilters((open) => !open)} style={[styles.filterToggle, showFilters && styles.filterToggleActive]}>
            <MaterialCommunityIcons color={showFilters ? colors.primary : colors.textSecondary} name="filter-variant" size={18} />
            <Text style={[styles.filterToggleText, showFilters && styles.filterToggleTextActive]}>Filtros</Text>
          </Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickRow}>
          {QUICK_OPTIONS.map((option) => {
            const active = appliedFilters.status === option.value;
            return <Pressable key={option.value} onPress={() => chooseQuickStatus(option.value)} style={[styles.quickChip, active && styles.quickChipActive]}><Text style={[styles.quickChipText, active && styles.quickChipTextActive]}>{option.label}</Text></Pressable>;
          })}
          <View style={styles.sortWrap}>
            <Pressable accessibilityRole="button" accessibilityLabel={`Ordenar por: ${activeSortLabel}`} onPress={() => setShowSortOptions((open) => !open)} style={styles.sortButton}>
              <Text numberOfLines={1} style={styles.sortText}>{activeSortLabel}</Text><MaterialCommunityIcons color={colors.textSecondary} name="chevron-down" size={18} />
            </Pressable>
            {showSortOptions ? <View style={styles.sortMenu}>{SORT_OPTIONS.map((option) => <Pressable key={option.value} onPress={() => { setSortBy(option.value); setShowSortOptions(false); }} style={[styles.sortOption, sortBy === option.value && styles.sortOptionActive]}><Text style={[styles.sortOptionText, sortBy === option.value && styles.sortOptionTextActive]}>{option.label}</Text></Pressable>)}</View> : null}
          </View>
        </ScrollView>

        {showFilters ? <View style={styles.filterPanel}>
          <Text style={styles.filterLabel}>Estado</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statusOptions}>
            {STATUS_OPTIONS.map((option) => <Pressable key={option.value} onPress={() => { const next = { ...filters, status: option.value }; setFilters(next); setAppliedFilters(next); }} style={[styles.statusChip, filters.status === option.value && styles.statusChipActive]}><Text style={[styles.statusChipText, filters.status === option.value && styles.statusChipTextActive]}>{option.label}</Text></Pressable>)}
          </ScrollView>
          <Text style={styles.filterLabel}>Juzgado</Text>
          <TextInput onChangeText={(court) => setFilters((current) => ({ ...current, court }))} placeholder="Buscar juzgado..." placeholderTextColor={colors.textMuted} style={styles.filterInput} value={filters.court} />
          <View style={styles.dateRow}>
            <View style={styles.dateField}><Text style={styles.filterLabel}>Desde (AAAA-MM-DD)</Text><TextInput onChangeText={(startDate) => setFilters((current) => ({ ...current, startDate }))} placeholder="Ej.: 2026-01-01" placeholderTextColor={colors.textMuted} style={styles.filterInput} value={filters.startDate} /></View>
            <View style={styles.dateField}><Text style={styles.filterLabel}>Hasta (AAAA-MM-DD)</Text><TextInput onChangeText={(endDate) => setFilters((current) => ({ ...current, endDate }))} placeholder="Ej.: 2026-12-31" placeholderTextColor={colors.textMuted} style={styles.filterInput} value={filters.endDate} /></View>
          </View>
          <View style={styles.filterActions}><Pressable onPress={clearFilters} style={styles.clearButton}><Text style={styles.clearButtonText}>Limpiar</Text></Pressable><Pressable onPress={applyFilters} style={styles.applyButton}><Text style={styles.applyButtonText}>Aplicar filtros</Text></Pressable></View>
        </View> : null}
        <View style={styles.resultsRow}><Text style={styles.resultsText}>{totalItems === 1 ? '1 causa encontrada' : `${totalItems} causas encontradas`}</Text><View style={styles.separator} /></View>
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
        ListEmptyComponent={!loading ? <EmptyState actionLabel="Nueva causa" icon="briefcase-search-outline" message="No se encontraron causas con la búsqueda o los filtros seleccionados." onAction={() => navigation.navigate('NewCase')} title="Sin resultados" /> : null}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
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
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  searchBox: { flex: 1, minWidth: 0, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 13, borderRadius: 18, backgroundColor: colors.inputBackground, borderWidth: 1, borderColor: colors.borderSoft },
  searchInput: { flex: 1, minWidth: 0, color: colors.text, fontSize: 14, paddingVertical: 10, outlineStyle: 'none' },
  filterToggle: { minHeight: 48, paddingHorizontal: 15, borderRadius: 18, flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderColor: colors.borderSoft, backgroundColor: colors.card },
  filterToggleActive: { borderColor: colors.primary, backgroundColor: colors.accentSoft },
  filterToggleText: { color: colors.textSecondary, fontSize: 14, fontWeight: '600' },
  filterToggleTextActive: { color: colors.primary },
  quickRow: { alignItems: 'center', gap: layout.isPhone ? 6 : 10, paddingVertical: 1 },
  quickChip: { minHeight: 38, paddingHorizontal: 14, borderRadius: 14, justifyContent: 'center' },
  quickChipActive: { backgroundColor: colors.primary },
  quickChipText: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
  quickChipTextActive: { color: colors.textOnPrimary },
  sortWrap: { marginLeft: 'auto', position: 'relative', zIndex: 5 },
  sortButton: { minHeight: 38, maxWidth: 150, flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 5 },
  sortText: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
  sortMenu: { position: 'absolute', zIndex: 10, top: 40, right: 0, minWidth: 150, padding: 5, borderRadius: 12, borderWidth: 1, borderColor: colors.borderSoft, backgroundColor: colors.card, shadowColor: colors.shadow, shadowOpacity: 0.18, shadowRadius: 10, elevation: 6 },
  sortOption: { paddingVertical: 10, paddingHorizontal: 10, borderRadius: 8 },
  sortOptionActive: { backgroundColor: colors.accentSoft },
  sortOptionText: { color: colors.textSecondary, fontSize: 13 },
  sortOptionTextActive: { color: colors.primary, fontWeight: '700' },
  filterPanel: { padding: 15, gap: 11, borderRadius: 17, borderWidth: 1, borderColor: colors.borderSoft, backgroundColor: colors.card },
  filterLabel: { color: colors.textSecondary, fontSize: 11, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase' },
  statusOptions: { gap: 7, paddingVertical: 2 },
  statusChip: { paddingHorizontal: 11, paddingVertical: 7, borderRadius: 12, borderWidth: 1, borderColor: colors.borderSoft, backgroundColor: colors.background },
  statusChipActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  statusChipText: { color: colors.textSecondary, fontSize: 12 },
  statusChipTextActive: { color: colors.textOnPrimary, fontWeight: '700' },
  filterInput: { minHeight: 43, borderRadius: 12, borderWidth: 1, borderColor: colors.borderSoft, backgroundColor: colors.inputBackground, paddingHorizontal: 12, color: colors.text, fontSize: 14, outlineStyle: 'none' },
  dateRow: { flexDirection: layout.isPhone ? 'column' : 'row', gap: 10 },
  dateField: { flex: 1, gap: 7 },
  filterActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8, borderTopWidth: 1, borderTopColor: colors.borderSoft, paddingTop: 10, marginTop: 2 },
  clearButton: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 12 },
  clearButtonText: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
  applyButton: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 15, borderRadius: 12, backgroundColor: colors.primary },
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
