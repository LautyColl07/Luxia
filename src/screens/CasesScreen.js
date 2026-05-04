import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import LoadingState from '../components/LoadingState';
import StatusBadge from '../components/StatusBadge';
import { useAppTheme } from '../context/ThemeContext';
import { getCases } from '../services/api';
import { formatDate } from '../utils/date';

export default function CasesScreen({ navigation }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadCases = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError('');
      const items = await getCases();
      setCases(Array.isArray(items) ? items : []);
    } catch (loadError) {
      console.error('[CasesScreen] Error cargando causas:', loadError);
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'No pudimos cargar las causas registradas.'
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadCases();
    }, [loadCases])
  );

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
        onRetry={loadCases}
      />
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Causas</Text>
          <Text style={styles.subtitle}>
            Consulta el estado de tus expedientes, su juzgado interviniente y las fechas relevantes.
          </Text>
        </View>

        <Pressable onPress={() => navigation.navigate('NewCase')} style={styles.primaryButton}>
          <MaterialCommunityIcons color={colors.textOnPrimary} name="plus" size={18} />
          <Text style={styles.primaryButtonText}>Nueva causa</Text>
        </Pressable>
      </View>

      <FlatList
        contentContainerStyle={styles.listContent}
        data={cases}
        keyExtractor={(item) => String(item?.id)}
        refreshControl={
          <RefreshControl
            onRefresh={() => void loadCases(true)}
            refreshing={refreshing}
            tintColor={colors.primary}
          />
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
          <EmptyState
            actionLabel="Nueva causa"
            icon="briefcase-search-outline"
            message="Todavia no tenes causas registradas."
            onAction={() => navigation.navigate('NewCase')}
            title="Sin causas registradas"
          />
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
    paddingBottom: 18,
    gap: 16,
  },
  headerCopy: {
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
  primaryButton: {
    alignSelf: 'flex-start',
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
