import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View, ActivityIndicator, Platform } from 'react-native';

import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import LoadingState from '../components/LoadingState';
import StatusBadge from '../components/StatusBadge';
import StudyContextSelector from '../components/StudyContextSelector';
import { useStudyContext } from '../context/StudyContext';
import { useAppTheme } from '../context/ThemeContext';
import { getCases } from '../services/api';
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
  const { activeContextKey } = useStudyContext();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchingMore, setFetchingMore] = useState(false);
  const [error, setError] = useState('');

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

  const loadCases = useCallback(async (isRefresh = false, fetchPage = 1, currentFilters = filters) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else if (fetchPage === 1) {
        setLoading(true);
      } else {
        setFetchingMore(true);
      }

      setError('');
      
      const response = await getCases({
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
      console.error('[CasesScreen] Error cargando causas:', loadError);
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
  }, [activeContextKey]);

  useFocusEffect(
    useCallback(() => {
      void loadCases(false, 1, filters);
    }, [loadCases, filters])
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

          <StudyContextSelector />
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
        
        {renderFilterSection()}
        
        <View style={styles.resultsSummary}>
          <Text style={styles.resultsText}>
            {totalItems === 1 ? '1 causa encontrada' : `${totalItems} causas encontradas`}
          </Text>
        </View>
      </View>

      <FlatList
        contentContainerStyle={styles.listContent}
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

const createStyles = (colors) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingTop: 62,
    paddingHorizontal: 22,
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
    fontSize: 28,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    maxWidth: '88%',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: 18,
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
    borderRadius: 18,
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
    flexDirection: 'row',
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
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: 12,
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
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  clearButtonText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  applyButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
  },
  applyButtonText: {
    color: colors.textOnPrimary,
    fontSize: 14,
    fontWeight: '600',
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
    paddingHorizontal: 18,
    paddingBottom: 28,
    gap: 12,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 24,
    padding: 18,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.14,
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
