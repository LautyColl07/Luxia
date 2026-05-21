import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import LoadingState from '../components/LoadingState';
import { useAppTheme } from '../context/ThemeContext';
import { getCases, getTasks } from '../services/api';
import { formatDate } from '../utils/date';
import { normalizeStatusLabel } from '../utils/status';

function isPendingTask(task) {
  const normalizedStatus = normalizeStatusLabel(task?.status ?? task?.estado, 'Pendiente');
  return task?.completed !== true && task?.completada !== true && normalizedStatus !== 'Finalizada';
}

export default function TasksScreen({ navigation }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [tasks, setTasks] = useState([]);
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadTasks = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      const [taskItems, caseItems] = await Promise.all([getTasks(), getCases()]);
      setTasks(Array.isArray(taskItems) ? taskItems.filter((task) => isPendingTask(task)) : []);
      setCases(Array.isArray(caseItems) ? caseItems : []);
    } catch (loadError) {
      console.error('[TasksScreen] Error cargando tareas:', loadError);
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'No pudimos cargar las tareas pendientes.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadTasks();
    }, [loadTasks])
  );

  const caseMap = useMemo(
    () =>
      new Map(
        cases
          .filter((item) => item?.id !== undefined && item?.id !== null)
          .map((item) => [String(item.id), item])
      ),
    [cases]
  );

  const handleCreateTask = useCallback(() => {
    navigation.navigate('NewTask');
  }, [navigation]);

  if (loading && !tasks.length) {
    return (
      <LoadingState
        title="Cargando tareas"
        message="Estamos preparando el listado de actividades pendientes."
      />
    );
  }

  if (error && !tasks.length) {
    return (
      <ErrorState
        title="No pudimos cargar las tareas"
        message={error}
        onRetry={loadTasks}
      />
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} style={styles.screen}>
      <View style={styles.headerCard}>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Tareas pendientes</Text>
          <Text style={styles.subtitle}>
            Revisa las actividades activas y registra nuevas tareas vinculadas a tus causas.
          </Text>
        </View>

        {tasks.length ? (
          <Pressable onPress={handleCreateTask} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Registrar tarea</Text>
          </Pressable>
        ) : null}
      </View>

      {tasks.length ? (
        tasks.map((task) => {
          const relatedCase = caseMap.get(String(task?.caseId)) || {};
          const status = normalizeStatusLabel(task?.status ?? task?.estado, 'Pendiente');

          return (
            <View key={task?.id ?? task?.title} style={styles.taskCard}>
              <View style={styles.taskHeader}>
                <View style={styles.taskIcon}>
                  <MaterialCommunityIcons color={colors.primary} name="clipboard-text-outline" size={20} />
                </View>
                <View style={styles.taskHeaderCopy}>
                  <Text style={styles.taskTitle}>{task?.title || 'Tarea sin titulo'}</Text>
                  <Text style={styles.taskCase}>
                    {task?.caseTitle || relatedCase?.title || 'Causa sin referencia'}
                  </Text>
                </View>
              </View>

              {task?.description || task?.descripcion ? (
                <Text style={styles.taskDescription}>{task?.description || task?.descripcion}</Text>
              ) : null}

              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Fecha limite</Text>
                <Text style={styles.metaValue}>{formatDate(task?.dueDate || task?.fechaVencimiento)}</Text>
              </View>

              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Estado</Text>
                <Text style={styles.metaValue}>{status}</Text>
              </View>
            </View>
          );
        })
      ) : (
        <EmptyState
          actionLabel="Registrar tarea"
          icon="clipboard-check-outline"
          message="Todavia no hay tareas pendientes para mostrar."
          onAction={handleCreateTask}
          title="Sin tareas pendientes"
        />
      )}
    </ScrollView>
  );
}

const createStyles = (colors) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 20,
    gap: 16,
    paddingBottom: 34,
  },
  headerCard: {
    backgroundColor: colors.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: 20,
    gap: 14,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.14,
    shadowRadius: 18,
    elevation: 4,
  },
  headerCopy: {
    gap: 8,
  },
  title: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
  },
  primaryButton: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primary,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  primaryButtonText: {
    color: colors.textOnPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  taskCard: {
    backgroundColor: colors.card,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: 18,
    gap: 12,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 3,
  },
  taskHeader: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  taskIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  taskHeaderCopy: {
    flex: 1,
    gap: 4,
  },
  taskTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
  },
  taskCase: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  taskDescription: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  metaLabel: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  metaValue: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'right',
    flex: 1,
  },
});
