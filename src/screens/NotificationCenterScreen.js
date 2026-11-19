import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import LoadingState from '../components/LoadingState';
import { useAuth } from '../context/AuthContext';
import { useStudyContext } from '../context/StudyContext';
import { useAppTheme } from '../context/ThemeContext';
import { getNotificationCenter } from '../services/api';
import { useResponsiveLayout } from '../theme/layout';
import { getTaskCalendarDate } from '../utils/calendar';
import { formatDate, formatTime } from '../utils/date';

function getErrorMessage(error) {
  if (error?.status === 401 || error?.status === 403) {
    return 'Tu sesión expiró. Iniciá sesión nuevamente.';
  }
  return 'No pudimos cargar las notificaciones. Revisá tu conexión e intentá nuevamente.';
}

export default function NotificationCenterScreen({ navigation }) {
  const { colors } = useAppTheme();
  const { authStatus, currentUser, isAuthReady } = useAuth();
  const { activeContext, activeContextKey, isHydrated } = useStudyContext();
  const layout = useResponsiveLayout();
  const styles = useMemo(() => createStyles(colors, layout), [colors, layout]);
  const [center, setCenter] = useState({ pendingTasks: [], notifications: [] });
  const [centerContextKey, setCenterContextKey] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const loadSequenceRef = useRef(0);
  const navigationIntentSequenceRef = useRef(0);
  const isFocusedRef = useRef(false);
  const requestContextKey = `${currentUser?.uid || 'anonymous'}:${activeContextKey || activeContext.legalStudyId || activeContext.type}`;
  const hasCurrentContextData = centerContextKey === requestContextKey;
  const visibleCenter = hasCurrentContextData ? center : { pendingTasks: [], notifications: [] };

  const loadCenter = useCallback(async (isRefresh = false) => {
    if (!isAuthReady || !isHydrated || authStatus !== 'authenticated' || !currentUser) return;

    const requestId = ++loadSequenceRef.current;
    setError('');
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const result = await getNotificationCenter({
        force: true,
        context: activeContext,
      });
      if (!isFocusedRef.current || loadSequenceRef.current !== requestId) return;
      setCenter({
        pendingTasks: Array.isArray(result?.pendingTasks) ? result.pendingTasks : [],
        notifications: Array.isArray(result?.notifications) ? result.notifications : [],
      });
      setCenterContextKey(requestContextKey);
    } catch (loadError) {
      if (isFocusedRef.current && loadSequenceRef.current === requestId) {
        setError(getErrorMessage(loadError));
      }
    } finally {
      if (isFocusedRef.current && loadSequenceRef.current === requestId) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [activeContext, activeContextKey, authStatus, currentUser?.uid, isAuthReady, isHydrated, requestContextKey]);

  useFocusEffect(
    useCallback(() => {
      isFocusedRef.current = true;
      void loadCenter();
      return () => {
        isFocusedRef.current = false;
        loadSequenceRef.current += 1;
      };
    }, [loadCenter])
  );

  const handleRefresh = useCallback(() => {
    void loadCenter(true);
  }, [loadCenter]);

  const openTaskInCalendar = useCallback((task) => {
    const calendarDate = getTaskCalendarDate(task);
    if (!calendarDate) return;
    const date = new Date(calendarDate);
    if (Number.isNaN(date.getTime())) return;

    navigationIntentSequenceRef.current += 1;
    const intentId = `notification-task:${task.id}:${navigationIntentSequenceRef.current}`;
    navigation.navigate('MainTabs', {
      screen: 'Calendario',
      params: {
        selectedDate: date.toISOString(),
        selectedTaskId: task.id,
        notificationIntentId: intentId,
      },
    });
  }, [navigation]);

  if ((loading || !hasCurrentContextData) && !visibleCenter.pendingTasks.length && !visibleCenter.notifications.length) {
    return <LoadingState title="Cargando notificaciones" message="Estamos revisando tus tareas y próximas audiencias." />;
  }

  if (error && !visibleCenter.pendingTasks.length && !visibleCenter.notifications.length) {
    return <ErrorState title="No pudimos cargar las notificaciones" message={error} onRetry={() => void loadCenter()} />;
  }

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl onRefresh={handleRefresh} refreshing={refreshing} tintColor={colors.primary} />}
      showsVerticalScrollIndicator={false}
      style={styles.screen}
    >
      <View style={styles.heading}>
        <Text accessibilityRole="header" style={styles.title}>Notificaciones</Text>
        <Text style={styles.subtitle}>{activeContext.type === 'study' ? activeContext.name || 'Estudio jurídico' : 'Mis casos'}</Text>
      </View>

      {error ? (
        <Pressable accessibilityRole="button" onPress={() => void loadCenter(true)} style={styles.errorBanner}>
          <MaterialCommunityIcons color={colors.danger} name="alert-circle-outline" size={20} />
          <Text style={styles.errorText}>{error} · Reintentar</Text>
        </Pressable>
      ) : null}

      <View style={styles.section}>
        <View style={styles.sectionHeading}>
          <View style={styles.sectionIcon}>
            <MaterialCommunityIcons color={colors.primary} name="checkbox-marked-circle-auto-outline" size={20} />
          </View>
          <Text accessibilityRole="header" style={styles.sectionTitle}>Tareas pendientes</Text>
          <Text style={styles.count}>{visibleCenter.pendingTasks.length}</Text>
        </View>
        {visibleCenter.pendingTasks.length ? (
          <View style={styles.list}>
            {visibleCenter.pendingTasks.map((task) => {
              const calendarDate = getTaskCalendarDate(task);
              const taskCard = (
                <>
                  <View style={styles.taskIcon}>
                    <MaterialCommunityIcons color={colors.primary} name="calendar-arrow-right" size={20} />
                  </View>
                  <View style={styles.itemCopy}>
                    <Text style={styles.itemTitle}>{task.title || 'Tarea pendiente'}</Text>
                    <Text style={styles.itemMeta}>
                      {task.dueDate ? `Vence ${formatDate(task.dueDate)}` : 'Sin fecha de vencimiento'}
                    </Text>
                    {task.scheduledAt && task.dueDate && new Date(task.scheduledAt).getTime() !== new Date(task.dueDate).getTime() ? (
                      <Text style={styles.itemMeta}>Agendada {formatDate(task.scheduledAt)} · {formatTime(task.scheduledAt)}</Text>
                    ) : null}
                  </View>
                  {calendarDate ? <MaterialCommunityIcons color={colors.textMuted} name="chevron-right" size={20} /> : null}
                </>
              );

              return calendarDate ? (
                <Pressable
                  accessibilityLabel={`Abrir calendario para ${task.title || 'tarea pendiente'}, ${task.dueDate ? `vence ${formatDate(task.dueDate)}` : 'sin fecha de vencimiento'}`}
                  accessibilityRole="button"
                  key={task.id}
                  onPress={() => openTaskInCalendar(task)}
                  style={({ focused, pressed }) => [styles.taskRow, focused && styles.focused, pressed && styles.pressed]}
                >
                  {taskCard}
                </Pressable>
              ) : (
                <View key={task.id} style={styles.taskRow}>{taskCard}</View>
              );
            })}
          </View>
        ) : (
          <EmptyState title="No hay tareas pendientes" message="Las tareas pendientes de tu contexto aparecerán acá." icon="check-all" />
        )}
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeading}>
          <View style={styles.sectionIcon}>
            <MaterialCommunityIcons color={colors.gold} name="bell-ring-outline" size={20} />
          </View>
          <Text accessibilityRole="header" style={styles.sectionTitle}>Notificaciones</Text>
          <Text style={styles.count}>{visibleCenter.notifications.length}</Text>
        </View>
        {visibleCenter.notifications.length ? (
          <View style={styles.list}>
            {visibleCenter.notifications.map((notification) => (
              <View key={notification.id} style={styles.notificationRow}>
                <View style={styles.hearingIcon}>
                  <MaterialCommunityIcons color={colors.gold} name="gavel" size={20} />
                </View>
                <View style={styles.itemCopy}>
                  <Text style={styles.itemTitle}>{notification.title || 'Audiencia próxima'}</Text>
                  <Text style={styles.itemMeta}>{notification.caseTitle || 'Causa'}</Text>
                  <Text style={styles.itemMeta}>{formatDate(notification.date)} · {formatTime(notification.date)}</Text>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <EmptyState title="No hay avisos nuevos" message="Te avisaremos cuando tengas una audiencia dentro de los próximos siete días." icon="bell-check-outline" />
        )}
      </View>
    </ScrollView>
  );
}

const createStyles = (colors, layout) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: {
    width: '100%',
    maxWidth: layout.readingMaxWidth,
    alignSelf: 'center',
    paddingHorizontal: layout.gutter,
    paddingTop: 24,
    paddingBottom: 40,
    gap: 18,
  },
  heading: { gap: 4, marginBottom: 2 },
  title: { color: colors.text, fontSize: layout.isPhone ? 25 : 29, fontWeight: '800' },
  subtitle: { color: colors.textSecondary, fontSize: 14 },
  section: {
    padding: layout.isPhone ? 15 : 20,
    gap: 14,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.card,
  },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sectionIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
  },
  sectionTitle: { color: colors.text, flex: 1, fontSize: 17, fontWeight: '800' },
  count: {
    minWidth: 28,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    textAlign: 'center',
    overflow: 'hidden',
    color: colors.textSecondary,
    backgroundColor: colors.backgroundAlt,
    fontSize: 12,
    fontWeight: '700',
  },
  list: { gap: 8 },
  taskRow: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: 16,
    backgroundColor: colors.cardElevated,
  },
  notificationRow: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: 16,
    backgroundColor: colors.cardElevated,
  },
  taskIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentSoft },
  hearingIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.warningSoft },
  itemCopy: { flex: 1, gap: 3 },
  itemTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
  itemMeta: { color: colors.textSecondary, fontSize: 12 },
  focused: { borderColor: colors.focusRing },
  pressed: { opacity: 0.78 },
  errorBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 14, backgroundColor: colors.dangerSoft },
  errorText: { flex: 1, color: colors.danger, fontSize: 13, fontWeight: '600' },
});
