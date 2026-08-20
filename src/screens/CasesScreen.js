import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View, ActivityIndicator, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import LoadingState from '../components/LoadingState';
import StatusBadge from '../components/StatusBadge';
import { useAuth } from '../context/AuthContext';
import { useStudyContext } from '../context/StudyContext';
import { useAppTheme } from '../context/ThemeContext';
import { getCases } from '../services/api';
import { useResponsiveLayout } from '../theme/layout';
import { formatDate } from '../utils/date';

const STATUS_OPTIONS = [
  { label: 'Todos', value: 'all' },
  { label: 'Activa', value: 'Activa' },
  { label: 'Pendiente', value: 'Pendiente' },
  { label: 'En proceso', value: 'En proceso' },
  { label: 'Finalizada', value: 'Finalizada' },
  { label: 'Archivada', value: 'Archivada' },
];

export default function CasesScreen({ navigation }) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const layout = useResponsiveLayout();
  const { authStatus, currentUser, isAuthReady } = useAuth();
  const { activeContext, activeContextKey, legalStudies, activeLegalStudy, selectPersonalContext, selectStudyContext } = useStudyContext();
  const styles = useMemo(
    () => createStyles(colors, layout, insets.top),
    [colors, insets.top, layout]
  );
  const listColumns = layout.isDesktop ? 2 : 1;
  const hasStudy = legalStudies.length > 0;

  const [context, setContext] = useState('private');
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchingMore, setFetchingMore] = useState(false);
  const [error, setError] = useState('');

  // Animated value for the segmented control indicator
  const segmentAnim = useRef(new Animated.Value(0)).current;

  // Pagination & Filter State
  const [page, setPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    status: 'all',
    court: '',
    startDate: '',
    endDate: '',
  });

  useEffect(() => {
    setContext(activeContext?.type === 'study' ? 'studio' : 'private');
  }, [activeContextKey, activeContext?.type]);

  const handleContextChange = useCallback((nextContext) => {
    setContext(nextContext);
    Animated.spring(segmentAnim, {
      toValue: nextContext === 'private' ? 0 : 1,
      useNativeDriver: false,
      friction: 8,
      tension: 70,
    }).start();

    // Sync the global API work context so scope/legalStudyId are sent correctly
    if (nextContext === 'studio') {
      const study = activeLegalStudy || legalStudies[0];
      if (study) {
        selectStudyContext(study);
      }
    } else {
      selectPersonalContext();
    }
  }, [segmentAnim, activeLegalStudy, legalStudies, selectStudyContext, selectPersonalContext]);

  const loadCases = useCallback(async (isRefresh = false, fetchPage = 1, currentFilters = filters) => {
    if (!isAuthReady || authStatus !== 'authenticated' || !currentUser) {
      return;
    }

    try {
      if (isRefresh) {
        setRefreshing(true);
      } else if (fetchPage === 1) {
        setLoading(true);
      } else {
        setFetchingMore(true);
      }

      setError('');
      
      const response = await getCases(context, {
        ...currentFilters,
        page: fetchPage,
        limit: 20
      });
      
      const newItems = response.items || [];
      
      if (fetchPage === 1) {
        setCases(newItems);
      } else {
        setCases(prev => [...prev, ...newItems]);
      }
      
      setPage(fetchPage);
      setTotalItems(response.total || newItems.length);
      setTotalPages(response.totalPages || 1);
      
    } catch (loadError) {
      console.error('[CasesScreen] No se pudieron cargar las causas.', {
        name: loadError?.name || 'Error',
        message: loadError?.message || String(loadError),
        status: loadError?.status || 0,
        response: loadError?.data || loadError?.response || null,
        authStatus,
        isAuthReady,
        hasCurrentUser: Boolean(currentUser),
      });
      if (fetchPage === 1) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : 'No pudimos cargar las causas registradas.'
        );
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
      setFetchingMore(false);
    }
  }, [activeContextKey, authStatus, context, currentUser, isAuthReady]);

  useFocusEffect(
    useCallback(() => {
      if (!isAuthReady || authStatus !== 'authenticated' || !currentUser) {
        return undefined;
      }

      void loadCases(false, 1, filters);
      return undefined;
    }, [authStatus, currentUser, filters, isAuthReady, loadCases])
  );

  const handleApplyFilters = () => {
    loadCases(false, 1, filters);
  };

  const handleClearFilters = () => {
    const clearedFilters = { status: 'all', court: '', startDate: '', endDate: '' };
    setFilters(clearedFilters);
    loadCases(false, 1, clearedFilters);
  };

  const loadMore = () => {
    if (!loading && !fetchingMore && page < totalPages) {
      loadCases(false, page + 1, filters);
    }
  };

  if (loading && !cases.length) {
    return (
      <LoadingState
        title="Cargando causas"
        message="Estamos reuniendo los expedientes y su informacion principal."
      />
    );
  }

  if (error && !cases.length) {
    return (
      <ErrorState
        title="No pudimos cargar las causas"
        message={error}
        onRetry={() => loadCases(false, 1, filters)}
      />
    );
  }

  const renderFilterSection = () => {
    if (!showFilters) return null;
    
    return (
      <View style={styles.filterContainer}>
        <View style={styles.filterRow}>
          <View style={styles.filterGroup}>
            <Text style={styles.filterLabel}>Estado</Text>
            <View style={styles.statusOptions}>
              {STATUS_OPTIONS.map((opt) => (
                <Pressable
                  key={opt.value}
                  onPress={() => setFilters({ ...filters, status: opt.value })}
                  style={[
                    styles.statusChip,
                    filters.status === opt.value && styles.statusChipActive
                  ]}
                >
                  <Text style={[
                    styles.statusChipText,
                    filters.status === opt.value && styles.statusChipTextActive
                  ]}>{opt.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>

        <View style={styles.filterRow}>
          <View style={styles.filterGroup}>
            <Text style={styles.filterLabel}>Juzgado</Text>
            <TextInput
              style={styles.filterInput}
              placeholder="Buscar juzgado..."
              placeholderTextColor={colors.textMuted}
              value={filters.court}
              onChangeText={(text) => setFilters({ ...filters, court: text })}
            />
          </View>
        </View>

        <View style={styles.filterRow}>
          <View style={[styles.filterGroup, { flex: 1 }]}>
            <Text style={styles.filterLabel}>Desde (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.filterInput}
              placeholder="Ej: 2024-01-01"
              placeholderTextColor={colors.textMuted}
              value={filters.startDate}
              onChangeText={(text) => setFilters({ ...filters, startDate: text })}
            />
          </View>
          <View style={[styles.filterGroup, { flex: 1 }]}>
            <Text style={styles.filterLabel}>Hasta (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.filterInput}
              placeholder="Ej: 2024-12-31"
              placeholderTextColor={colors.textMuted}
              value={filters.endDate}
              onChangeText={(text) => setFilters({ ...filters, endDate: text })}
            />
          </View>
        </View>

        <View style={styles.filterActions}>
          <Pressable onPress={handleClearFilters} style={styles.clearButton}>
            <Text style={styles.clearButtonText}>Limpiar</Text>
          </Pressable>
          <Pressable onPress={handleApplyFilters} style={styles.applyButton}>
            <Text style={styles.applyButtonText}>Aplicar filtros</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>Causas</Text>
            <Text style={styles.subtitle}>
              Consulta el estado de tus expedientes, su juzgado interviniente y las fechas relevantes.
            </Text>
          </View>
        </View>

        <View style={styles.headerActions}>
          <Pressable onPress={() => navigation.navigate('NewCase')} style={styles.primaryButton}>
            <MaterialCommunityIcons color={colors.textOnPrimary} name="plus" size={18} />
            <Text style={styles.primaryButtonText}>Nueva causa</Text>
          </Pressable>
          
          <Pressable 
            onPress={() => setShowFilters(!showFilters)} 
            style={[styles.filterToggleButton, showFilters && styles.filterToggleButtonActive]}
          >
            <MaterialCommunityIcons 
              color={showFilters ? colors.primary : colors.textSecondary} 
              name="filter-variant" 
              size={18} 
            />
            <Text style={[styles.filterToggleText, showFilters && styles.filterToggleTextActive]}>
              Filtros
            </Text>
          </Pressable>
        </View>

        {/* ── Segmented Context Control ── */}
        {hasStudy && (
        <View style={styles.segmentedWrapper}>
          <View style={styles.segmentedTrack}>
            <Animated.View
              style={[
                styles.segmentedIndicator,
                {
                  left: segmentAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0%', '50%'],
                  }),
                },
              ]}
            />
            <Pressable
              onPress={() => handleContextChange('private')}
              style={styles.segmentedButton}
            >
              <MaterialCommunityIcons
                name="briefcase-outline"
                size={16}
                color={context === 'private' ? colors.textOnPrimary : colors.textSecondary}
                style={{ marginRight: 6 }}
              />
              <Text
                style={[
                  styles.segmentedLabel,
                  context === 'private' && styles.segmentedLabelActive,
                ]}
              >
                Mis Causas
              </Text>
            </Pressable>
            <Pressable
              onPress={() => handleContextChange('studio')}
              style={styles.segmentedButton}
            >
              <MaterialCommunityIcons
                name="office-building-outline"
                size={16}
                color={context === 'studio' ? colors.textOnPrimary : colors.textSecondary}
                style={{ marginRight: 6 }}
              />
              <Text
                style={[
                  styles.segmentedLabel,
                  context === 'studio' && styles.segmentedLabelActive,
                ]}
              >
                Causas de mi Estudio
              </Text>
            </Pressable>
          </View>
        </View>
        )}

        {renderFilterSection()}
        
        <View style={styles.resultsSummary}>
          <Text style={styles.resultsText}>
            {totalItems === 1 ? '1 causa encontrada' : `${totalItems} causas encontradas`}
          </Text>
        </View>
      </View>

      <FlatList
        key={`cases-${listColumns}`}
        numColumns={listColumns}
        columnWrapperStyle={listColumns > 1 ? styles.columnRow : undefined}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        data={cases}
        keyExtractor={(item) => String(item?.id)}
        refreshControl={
          <RefreshControl
            onRefresh={() => void loadCases(true, 1, filters)}
            refreshing={refreshing}
            tintColor={colors.primary}
          />
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          fetchingMore ? (
            <ActivityIndicator style={{ padding: 20 }} color={colors.primary} />
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => navigation.navigate('CaseDetail', { caseId: item?.id })}
            style={styles.card}
          >
            <View style={styles.cardTopRow}>
              <Text style={styles.cardTitle}>{item?.title || 'Causa sin titulo'}</Text>
              <StatusBadge status={item?.status} />
            </View>

            <Text style={styles.description}>
              {item?.description || 'Sin informacion adicional registrada.'}
            </Text>

            <View style={styles.metaRow}>
              <MaterialCommunityIcons color={colors.textSecondary} name="scale-balance" size={16} />
              <Text style={styles.metaText}>{item?.court || 'Juzgado a confirmar'}</Text>
            </View>

            <View style={styles.metaRow}>
              <MaterialCommunityIcons color={colors.textSecondary} name="calendar-outline" size={16} />
              <Text style={styles.metaText}>Fecha de alta: {formatDate(item?.createdAt)}</Text>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          !loading && (
            <EmptyState
              actionLabel="Nueva causa"
              icon="briefcase-search-outline"
              message="No se encontraron causas con los filtros seleccionados."
              onAction={() => navigation.navigate('NewCase')}
              title="Sin resultados"
            />
          )
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const createStyles = (colors, layout, topInset) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    width: '100%',
    maxWidth: layout.contentMaxWidth,
    alignSelf: 'center',
    paddingTop: layout.isWebDesktop ? 30 : Math.max(topInset + 20, layout.topSpacing),
    paddingHorizontal: layout.gutter,
    paddingBottom: 8,
    gap: 16,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerCopy: {
    flex: 1,
    gap: 6,
  },
  title: {
    color: colors.text,
    fontSize: layout.isWebDesktop ? 30 : 28,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    maxWidth: layout.copyMaxWidth,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: layout.isWebDesktop ? 14 : 18,
    minHeight: layout.isWebDesktop ? 52 : undefined,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  primaryButtonText: {
    color: colors.textOnPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  filterToggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: layout.isWebDesktop ? 14 : 18,
    minHeight: layout.isWebDesktop ? 52 : undefined,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  filterToggleButtonActive: {
    borderColor: colors.primary,
    backgroundColor: colors.accentSoft,
  },
  filterToggleText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  filterToggleTextActive: {
    color: colors.primary,
  },
  filterContainer: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    gap: 16,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  filterRow: {
    flexDirection: layout.isPhone ? 'column' : 'row',
    gap: 12,
  },
  filterGroup: {
    flex: 1,
    gap: 8,
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  filterInput: {
    minHeight: 46,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    color: colors.text,
    fontSize: 14,
  },
  statusOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statusChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  statusChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  statusChipText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  statusChipTextActive: {
    color: colors.textOnPrimary,
    fontWeight: '600',
  },
  filterActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
  clearButton: {
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  clearButtonText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  applyButton: {
    minHeight: 44,
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    justifyContent: 'center',
  },
  applyButtonText: {
    color: colors.textOnPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  segmentedWrapper: {
    marginTop: 4,
  },
  segmentedTrack: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    position: 'relative',
    overflow: 'hidden',
  },
  segmentedIndicator: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    width: '50%',
    backgroundColor: colors.primary,
    borderRadius: 13,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  segmentedButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    paddingHorizontal: 8,
    borderRadius: 13,
    zIndex: 1,
    minHeight: 48,
  },
  segmentedLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    textAlign: 'center',
  },
  segmentedLabelActive: {
    color: colors.textOnPrimary,
    fontWeight: '700',
  },
  resultsSummary: {
    paddingVertical: 8,
  },
  resultsText: {
    fontSize: 13,
    color: colors.textMuted,
    fontWeight: '500',
  },
  listContent: {
    width: '100%',
    maxWidth: layout.contentMaxWidth,
    alignSelf: 'center',
    paddingHorizontal: layout.gutter,
    paddingBottom: 28,
    gap: 12,
  },
  columnRow: {
    gap: 12,
  },
  card: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: layout.isWebDesktop ? 16 : 24,
    padding: 18,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: layout.isWebDesktop ? 0.08 : 0.14,
    shadowRadius: 18,
    elevation: 4,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  cardTopRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  cardTitle: {
    flex: 1,
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  description: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 12,
    marginBottom: 14,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    marginTop: 6,
  },
  metaText: {
    color: colors.textSecondary,
    fontSize: 13,
    flex: 1,
  },
});
