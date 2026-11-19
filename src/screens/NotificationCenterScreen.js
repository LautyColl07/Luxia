import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { formatDate, formatTime, getHearingDayMessage } from '../utils/date';

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
  const [center, setCenter] = useState({ pendingTasks: [], notifications: [], notificationCount: 0, evaluatedAt: null });
  const [centerContextKey, setCenterContextKey] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [pendingExpanded, setPendingExpanded] = useState(true);
  const [overdueExpanded, setOverdueExpanded] = useState(false);
  const [upcomingExpanded, setUpcomingExpanded] = useState(true);
  const loadSequenceRef = useRef(0);
  const navigationIntentSequenceRef = useRef(0);
  const isFocusedRef = useRef(false);
  const requestContextKey = `${currentUser?.uid || 'anonymous'}:${activeContextKey || activeContext.legalStudyId || activeContext.type}`;
  const hasCurrentContextData = centerContextKey === requestContextKey;
  const visibleCenter = hasCurrentContextData ? center : { pendingTasks: [], notifications: [], notificationCount: 0, evaluatedAt: null };

  useEffect(() => {
    setPendingExpanded(true);
    setOverdueExpanded(false);
    setUpcomingExpanded(true);
  }, [requestContextKey]);

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
      const pendingTasks = Array.isArray(result?.pendingTasks) ? result.pendingTasks : [];
      const notifications = Array.isArray(result?.notifications) ? result.notifications : [];
      setCenter({
        pendingTasks,
        notifications,
        notificationCount: Number.isInteger(result?.notificationCount)
          ? result.notificationCount
          : pendingTasks.length + notifications.length,
        evaluatedAt: result?.evaluatedAt || new Date().toISOString(),
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
      setPendingExpanded(true);
      setOverdueExpanded(false);
      setUpcomingExpanded(true);
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

  const openHearingInCase = useCallback((notification) => {
    if (notification?.caseId == null) return;
    navigationIntentSequenceRef.current += 1;
    navigation.navigate('CaseDetail', {
      caseId: notification.caseId,
      hearingId: notification.hearingId,
      notificationIntentId: `notification-hearing:${notification.hearingId}:${navigationIntentSequenceRef.current}`,
    });
  }, [navigation]);

  const sortTasksByDueDate = (first, second) => {
    const firstDue = first.dueDate ? new Date(first.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
    const secondDue = second.dueDate ? new Date(second.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
    return firstDue - secondDue || String(first.id).localeCompare(String(second.id), undefined, { numeric: true });
  };
  const overdueTasks = visibleCenter.pendingTasks.filter((task) => task.isOverdue === true).sort(sortTasksByDueDate);
  const upcomingTasks = visibleCenter.pendingTasks.filter((task) => task.isOverdue !== true).sort(sortTasksByDueDate);

  if (error && !visibleCenter.pendingTasks.length && !visibleCenter.notifications.length) {
    return <ErrorState title="No pudimos cargar las notificaciones" message={error} onRetry={() => void loadCenter()} />;
  }

  if ((loading || !hasCurrentContextData) && !visibleCenter.pendingTasks.length && !visibleCenter.notifications.length) {
    return <LoadingState title="Cargando notificaciones" message="Estamos revisando tus tareas y próximas audiencias." />;
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
        <Text accessibilityLabel={`${visibleCenter.notificationCount} notificaciones en total`} style={styles.totalCount}>
          {visibleCenter.notificationCount} en total
        </Text>
      </View>

      {error ? (
        <Pressable accessibilityRole="button" onPress={() => void loadCenter(true)} style={styles.errorBanner}>
          <MaterialCommunityIcons color={colors.danger} name="alert-circle-outline" size={20} />
          <Text style={styles.errorText}>{error} · Reintentar</Text>
        </Pressable>
      ) : null}

      <View style={styles.section}>
        <NotificationSectionToggle
          count={visibleCenter.pendingTasks.length}
          expanded={pendingExpanded}
          icon="checkbox-marked-circle-auto-outline"
          label="Tareas pendientes"
          onPress={() => setPendingExpanded((expanded) => !expanded)}
          styles={styles}
          tint={colors.primary}
        />
        {pendingExpanded && upcomingTasks.length ? (
          <View style={styles.list}>
            {upcomingTasks.map((task) => <TaskRow key={task.id} task={task} colors={colors} styles={styles} onPress={() => openTaskInCalendar(task)} />)}
          </View>
        ) : pendingExpanded ? (
          <EmptyState title="No hay tareas próximas a vencer" message="Las tareas vencidas aparecen en la lista desplegable de abajo." icon="check-all" />
        ) : null}
      </View>

      {overdueTasks.length ? (
        <View style={styles.section}>
          <NotificationSectionToggle
            count={overdueTasks.length}
            expanded={overdueExpanded}
            icon="alert-circle-outline"
            label="Tareas vencidas"
            onPress={() => setOverdueExpanded((expanded) => !expanded)}
            styles={styles}
            tint={colors.danger}
          />
          {overdueExpanded ? (
            <View style={styles.list}>
              {overdueTasks.map((task) => <TaskRow key={task.id} task={task} overdue colors={colors} styles={styles} onPress={() => openTaskInCalendar(task)} />)}
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={styles.section}>
        <NotificationSectionToggle
          count={visibleCenter.notifications.length}
          expanded={upcomingExpanded}
          icon="bell-ring-outline"
          label="Próximas audiencias"
          onPress={() => setUpcomingExpanded((expanded) => !expanded)}
          styles={styles}
          tint={colors.gold}
        />
        {upcomingExpanded && visibleCenter.notifications.length ? (
          <View style={styles.list}>
            {visibleCenter.notifications.map((notification) => (
              <Pressable
                accessibilityLabel={`Abrir ${notification.title || 'audiencia'}, ${notification.caseTitle || 'causa'}, ${formatDate(notification.date)} a las ${formatTime(notification.date)}`}
                accessibilityRole="button"
                key={notification.id}
                onPress={() => openHearingInCase(notification)}
                style={({ focused, pressed }) => [styles.notificationRow, focused && styles.focused, pressed && styles.pressed]}
              >
                <View style={styles.hearingIcon}>
                  <MaterialCommunityIcons color={colors.gold} name="gavel" size={20} />
                </View>
                <View style={styles.itemCopy}>
                  <Text style={styles.hearingMessage}>{getHearingDayMessage(notification.title || 'Audiencia próxima', notification.date, visibleCenter.evaluatedAt)}</Text>
                  <Text style={styles.itemMeta}>{notification.caseTitle || 'Causa'}</Text>
                  <Text style={styles.itemMeta}>{formatDate(notification.date)} · {formatTime(notification.date)}</Text>
                </View>
                <MaterialCommunityIcons color={colors.textMuted} name="chevron-right" size={20} />
              </Pressable>
            ))}
          </View>
        ) : upcomingExpanded ? (
          <EmptyState title="No hay próximas audiencias" message="Las audiencias de los próximos siete días aparecerán acá." icon="bell-check-outline" />
        ) : null}
      </View>
    </ScrollView>
  );
}

export function NotificationSectionToggle({ count, expanded, icon, label, onPress, styles, tint }) {
  return (
    <Pressable
      accessibilityLabel={(expanded ? 'Ocultar ' : 'Mostrar ') + label + ', ' + count + ' elementos'}
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      onPress={onPress}
      style={({ focused, pressed }) => [styles.sectionHeading, styles.sectionToggle, focused && styles.toggleFocused, pressed && styles.pressed]}
    >
      <View style={styles.sectionIcon}>
        <MaterialCommunityIcons color={tint} name={icon} size={20} />
      </View>
      <Text style={styles.sectionTitle}>{label}</Text>
      <Text style={styles.count}>{count}</Text>
      <MaterialCommunityIcons color={tint} name={expanded ? 'chevron-up' : 'chevron-down'} size={20} />
    </Pressable>
  );
}

function TaskRow({ task, overdue = false, colors, styles, onPress }) {
  const calendarDate = getTaskCalendarDate(task);
  const title = task.title || 'Tarea pendiente';
  const dueDateText = task.dueDate
    ? `${overdue ? 'Venció el' : 'Vence el'} ${formatDate(task.dueDate)}`
    : (!task.scheduledAt ? 'Sin fecha' : null);
  const scheduledAtDiffers = task.scheduledAt && (
    !task.dueDate || new Date(task.scheduledAt).getTime() !== new Date(task.dueDate).getTime()
  );
  const row = (
    <>
      <View style={[styles.taskIcon, overdue && styles.overdueIcon]}>
        <MaterialCommunityIcons color={overdue ? colors.danger : colors.primary} name={overdue ? 'calendar-alert' : 'calendar-arrow-right'} size={20} />
      </View>
      <View style={styles.itemCopy}>
        <Text style={styles.itemTitle}>{title}</Text>
        {dueDateText ? <Text style={overdue ? styles.overdueText : styles.dueDateText}>{dueDateText}</Text> : null}
        {scheduledAtDiffers ? <Text style={styles.itemMeta}>Agendada {formatDate(task.scheduledAt)} · {formatTime(task.scheduledAt)}</Text> : null}
      </View>
      {calendarDate ? <MaterialCommunityIcons color={colors.textMuted} name="chevron-right" size={20} /> : null}
    </>
  );

  if (!calendarDate) return <View style={styles.taskRow}>{row}</View>;
  return (
    <Pressable
      accessibilityLabel={`Abrir calendario para ${title}${task.dueDate ? `, ${overdue ? 'venció' : 'vence'} ${formatDate(task.dueDate)}` : ', sin fecha'}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ focused, pressed }) => [styles.taskRow, focused && styles.focused, pressed && styles.pressed]}
    >
      {row}
    </Pressable>
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
  totalCount: { color: colors.primary, fontSize: 13, fontWeight: '700', marginTop: 6 },
  section: {
    padding: layout.isPhone ? 15 : 20,
    gap: 14,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.card,
  },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sectionToggle: { minHeight: 44, borderWidth: 2, borderColor: 'transparent', borderRadius: 14, padding: 2 },
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
  overdueIcon: { backgroundColor: colors.dangerSoft },
  hearingIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.warningSoft },
  itemCopy: { flex: 1, gap: 3 },
  itemTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
  itemMeta: { color: colors.textSecondary, fontSize: 12 },
  dueDateText: { color: colors.text, fontSize: 12, fontWeight: '700' },
  overdueText: { color: colors.danger, fontSize: 12, fontWeight: '700' },
  hearingMessage: { color: colors.text, fontSize: 14, fontWeight: '800' },
  focused: { borderColor: colors.focusRing },
  toggleFocused: { borderWidth: 2, borderColor: colors.focusRing, borderRadius: 14 },
  pressed: { opacity: 0.78 },
  errorBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 14, backgroundColor: colors.dangerSoft },
  errorText: { flex: 1, color: colors.danger, fontSize: 13, fontWeight: '600' },
});
