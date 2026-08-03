import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import ActivityCard from '../components/ActivityCard';
import ActivityFilterChips from '../components/ActivityFilterChips';
import EmptyActivityState from '../components/EmptyActivityState';
import ErrorState from '../components/ErrorState';
import LoadingState from '../components/LoadingState';
import { useAuth } from '../context/AuthContext';
import { useAppTheme } from '../context/ThemeContext';
import { getActivityHistory } from '../services/activityService';
import { useResponsiveLayout } from '../theme/layout';

const FILTERS = [
  { key: 'all', label: 'Todas' },
  { key: 'cases', label: 'Causas' },
  { key: 'hearings', label: 'Audiencias' },
  { key: 'tasks', label: 'Tareas' },
  { key: 'documents', label: 'Documentos' },
  { key: 'lux', label: 'LUX' },
];

const FILTER_TYPE_MAP = {
  cases: ['case'],
  hearings: ['hearing'],
  tasks: ['task'],
  documents: ['document', 'transcript'],
  lux: ['lux'],
};

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getStartOfWeek(date) {
  const currentDay = date.getDay();
  const diff = currentDay === 0 ? -6 : 1 - currentDay;
  const start = startOfDay(date);
  start.setDate(start.getDate() + diff);
  return start;
}

function resolveDateGroup(dateValue, referenceDate = new Date()) {
  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return 'older';
  }

  const todayStart = startOfDay(referenceDate);
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const weekStart = getStartOfWeek(referenceDate);

  if (date >= todayStart) {
    return 'today';
  }

  if (date >= yesterdayStart) {
    return 'yesterday';
  }

  if (date >= weekStart) {
    return 'week';
  }

  return 'older';
}

function groupActivitiesByDate(items) {
  const buckets = {
    today: [],
    yesterday: [],
    week: [],
    older: [],
  };

  items.forEach((activity) => {
    buckets[resolveDateGroup(activity.createdAt)].push(activity);
  });

  return [
    { key: 'today', title: 'Hoy', items: buckets.today },
    { key: 'yesterday', title: 'Ayer', items: buckets.yesterday },
    { key: 'week', title: 'Esta semana', items: buckets.week },
    { key: 'older', title: 'Anteriores', items: buckets.older },
  ].filter((group) => group.items.length > 0);
}

export default function ActivityHistoryScreen({ navigation }) {
  const { colors } = useAppTheme();
  const layout = useResponsiveLayout();
  const { authStatus, currentUser, isAuthReady } = useAuth();
  const styles = useMemo(() => createStyles(colors, layout), [colors, layout]);
  const [activities, setActivities] = useState([]);
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const activeLoadRef = useRef(null);
  const loadSequenceRef = useRef(0);
  const isFocusedRef = useRef(false);

  const loadActivity = useCallback(async (isRefresh = false) => {
    if (!isAuthReady || authStatus === 'initializing') {
      return;
    }

    if (!currentUser || authStatus === 'unauthenticated') {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (authStatus !== 'authenticated') {
      setLoading(false);
      setRefreshing(false);
      setError('No pudimos cargar el historial. Revisá tu conexión e intentá nuevamente.');
      return;
    }

    if (activeLoadRef.current) {
      return activeLoadRef.current;
    }

    const loadId = loadSequenceRef.current + 1;
    loadSequenceRef.current = loadId;
    const loadPromise = (async () => {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError('');
      const items = await getActivityHistory();

      if (!isFocusedRef.current || loadSequenceRef.current !== loadId) {
        return;
      }

      setActivities(Array.isArray(items) ? items : []);
    })();

    activeLoadRef.current = loadPromise;

    try {
      await loadPromise;
    } catch (loadError) {
      if (isFocusedRef.current && loadSequenceRef.current === loadId) {
        if (__DEV__) {
          console.warn('[ActivityHistoryScreen] No se pudo actualizar el historial.');
        }
        setError(
          loadError && (loadError.status === 401 || loadError.status === 403)
            ? 'Tu sesión expiró. Iniciá sesión nuevamente.'
            : 'No pudimos cargar el historial. Revisá tu conexión e intentá nuevamente.'
        );
      }
    } finally {
      if (activeLoadRef.current === loadPromise) {
        activeLoadRef.current = null;
      }

      if (isFocusedRef.current && loadSequenceRef.current === loadId) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [authStatus, currentUser?.uid, isAuthReady]);

  useFocusEffect(
    useCallback(() => {
      if (!isAuthReady || authStatus === 'initializing') {
        return undefined;
      }

      isFocusedRef.current = true;
      void loadActivity();
      return () => {
        isFocusedRef.current = false;
      };
    }, [authStatus, isAuthReady, loadActivity])
  );

  const filteredActivities = useMemo(() => {
    if (selectedFilter === 'all') {
      return activities;
    }

    const acceptedTypes = FILTER_TYPE_MAP[selectedFilter] || [];
    return activities.filter((activity) => acceptedTypes.includes(activity.type));
  }, [activities, selectedFilter]);

  const groupedActivities = useMemo(
    () => groupActivitiesByDate(filteredActivities),
    [filteredActivities]
  );

  const selectedFilterLabel =
    FILTERS.find((item) => item.key === selectedFilter)?.label || FILTERS[0].label;

  const handleRefresh = useCallback(() => {
    void loadActivity(true);
  }, [loadActivity]);

  const handleOpenMore = useCallback(() => {
    navigation.navigate('MainTabs', { screen: 'Mas' });
  }, [navigation]);

  if (loading && !activities.length) {
    return (
      <LoadingState
        title="Cargando historial"
        message="Estamos organizando los movimientos recientes del estudio."
      />
    );
  }

  if (error && !activities.length) {
    return (
      <ErrorState
        title="No pudimos cargar la actividad"
        message={error}
        onRetry={() => void loadActivity()}
      />
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          onRefresh={handleRefresh}
          refreshing={refreshing}
          tintColor={colors.primary}
        />
      }
      showsVerticalScrollIndicator={false}
      style={styles.screen}
    >
      <View style={styles.heroCard}>
        <View style={styles.heroTopRow}>
          <View style={styles.heroIcon}>
            <MaterialCommunityIcons color={colors.textOnPrimary} name="history" size={24} />
          </View>
          <Pressable onPress={handleOpenMore} style={styles.heroAction}>
            <Text style={styles.heroActionText}>Mas</Text>
            <MaterialCommunityIcons color={colors.textOnPrimary} name="chevron-right" size={18} />
          </Pressable>
        </View>

        <Text style={styles.title}>Historial de actividad</Text>
        <Text style={styles.subtitle}>Registro de movimientos recientes en tu estudio</Text>

        <View style={styles.heroMetaRow}>
          <View style={styles.heroBadge}>
            <Text style={styles.heroBadgeValue}>{filteredActivities.length}</Text>
            <Text style={styles.heroBadgeLabel}>movimientos</Text>
          </View>
          <View style={styles.heroBadge}>
            <Text style={styles.heroBadgeValue}>{selectedFilterLabel}</Text>
            <Text style={styles.heroBadgeLabel}>filtro activo</Text>
          </View>
        </View>
      </View>

      <View style={styles.filtersBlock}>
        <Text style={styles.filtersTitle}>Filtrar por categoria</Text>
        <ActivityFilterChips
          filters={FILTERS}
          onSelect={setSelectedFilter}
          selectedFilter={selectedFilter}
        />
      </View>

      {groupedActivities.length ? (
        groupedActivities.map((group) => (
          <View key={group.key} style={styles.groupBlock}>
            <Text style={styles.groupTitle}>{group.title}</Text>
            <View style={styles.groupList}>
              {group.items.map((activity) => (
                <ActivityCard activity={activity} key={activity.id} />
              ))}
            </View>
          </View>
        ))
      ) : (
        <EmptyActivityState />
      )}

      {error ? (
        <View style={styles.inlineAlert}>
          <MaterialCommunityIcons color={colors.danger} name="alert-outline" size={18} />
          <Text style={styles.inlineAlertText}>{error}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Reintentar carga del historial"
            onPress={() => void loadActivity(true)}
            style={styles.inlineRetryButton}
          >
            <Text style={styles.inlineRetryText}>Reintentar</Text>
          </Pressable>
        </View>
      ) : null}
    </ScrollView>
  );
}

const createStyles = (colors, layout) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    width: '100%',
    maxWidth: layout.readingMaxWidth,
    alignSelf: 'center',
    paddingTop: 22,
    paddingHorizontal: layout.gutter,
    paddingBottom: 34,
    gap: 18,
  },
  heroCard: {
    backgroundColor: colors.primaryDeep,
    borderRadius: 30,
    padding: 22,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.22,
    shadowRadius: 24,
    elevation: 7,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heroIcon: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  heroActionText: {
    color: colors.textOnPrimary,
    fontSize: 12,
    fontWeight: '700',
  },
  title: {
    color: colors.textOnPrimary,
    fontSize: 26,
    fontWeight: '700',
    marginTop: 18,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
    maxWidth: layout.copyMaxWidth,
  },
  heroMetaRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  heroBadge: {
    flex: 1,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    gap: 4,
  },
  heroBadgeValue: {
    color: colors.textOnPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  heroBadgeLabel: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 12,
    fontWeight: '600',
  },
  filtersBlock: {
    gap: 10,
  },
  filtersTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  groupBlock: {
    gap: 12,
  },
  groupTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  groupList: {
    gap: 12,
  },
  inlineAlert: {
    backgroundColor: colors.warningSoft,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inlineAlertText: {
    color: colors.warning,
    fontSize: 13,
    flex: 1,
  },
  inlineRetryButton: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  inlineRetryText: {
    color: colors.warning,
    fontSize: 13,
    fontWeight: '800',
  },
});
