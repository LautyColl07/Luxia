import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import CalendarFilters from '../components/CalendarFilters';
import { FilterChip, FilterField, FilterSection } from '../components/FilterControls';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import LoadingState from '../components/LoadingState';
import DatePickerModal from '../components/DatePickerModal';
import StudyMembersDropdown from '../components/StudyMembersDropdown';
import { TimePickerModal } from './NewHearingScreen';
import { CASE_COURT_TYPES } from '../constants/caseCourtTypes';
import { useAuth } from '../context/AuthContext';
import { useStudyContext } from '../context/StudyContext';
import { useAppTheme } from '../context/ThemeContext';
import { createCalendarTask, getAllCases, getCaseById, getHearings, getStudyMembers, getTasks, setHearingCompleted, setTaskCompleted } from '../services/api';
import { useResponsiveLayout } from '../theme/layout';
import {
  addMonths,
  buildCalendarEvents,
  filterCalendarEvents,
  formatAgendaDate,
  formatMonthYear,
  getDateKey,
  getMonthMatrix,
  getWeekdayLabels,
  groupEventsByDate,
  isSameDay,
  isSameMonth,
  startOfDay,
} from '../utils/calendar';
import { formatTime } from '../utils/date';

const DEFAULT_FILTERS = { hearings: true, tasks: true, court: 'all' };
const EMPTY_MEMBERS = [];

export default function CalendarScreen({ navigation, route }) {
  const { colors } = useAppTheme();
  const { authStatus, currentUser, isAuthReady } = useAuth();
  const { activeContextKey, activeContext, activeLegalStudy, isHydrated } = useStudyContext();
  const canFilterByResponsible = activeContext.type === 'study' &&
    (activeLegalStudy?.capabilities?.canManageStudy === true || ['ADMIN', 'OWNER'].includes(activeLegalStudy?.role));
  const studyId = canFilterByResponsible ? activeContext.legalStudyId : null;
  const requestSequenceRef = useRef(0);
  const consumedCalendarIntentRef = useRef(null);
  const insets = useSafeAreaInsets();
  const layout = useResponsiveLayout();
  const styles = useMemo(
    () => createStyles(colors, layout, insets.top),
    [colors, insets.top, layout]
  );
  const today = useMemo(() => startOfDay(new Date()) || new Date(), []);
  const [calendarMonth, setCalendarMonth] = useState(today);
  const [selectedDate, setSelectedDate] = useState(today);
  const [showFilters, setShowFilters] = useState(false);
  const [showReviewed, setShowReviewed] = useState(true);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [responsibleFilter, setResponsibleFilter] = useState([]);
  const [dueDatePickerOpen, setDueDatePickerOpen] = useState(false);
  const [timePickerTarget, setTimePickerTarget] = useState(null);
  const [timeDraft, setTimeDraft] = useState({ hour: '09', minute: '00' });
  const [assignmentMode, setAssignmentMode] = useState('GROUP');
  const [favorites, setFavorites] = useState({});
  const [calendarData, setCalendarData] = useState({
    hearings: [],
    cases: [],
    caseDetails: [],
  });
  const [notificationTaskId, setNotificationTaskId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [menuEvent, setMenuEvent] = useState(null);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [taskStartTime, setTaskStartTime] = useState('09:00');
  const [taskEndTime, setTaskEndTime] = useState('09:30');
  const [taskDueDate, setTaskDueDate] = useState('');
  const [taskAllDay, setTaskAllDay] = useState(true);
  const [taskAssignees, setTaskAssignees] = useState([]);
  const [memberResult, setMemberResult] = useState(null);
  const [memberReload, setMemberReload] = useState(0);
  const currentMemberResult = studyId && memberResult?.studyId === studyId ? memberResult : null;
  const studyMembers = currentMemberResult?.members || EMPTY_MEMBERS;
  const reloadMembers = () => setMemberReload((count) => count + 1);
  const memberOptions = {
    members: studyMembers,
    loading: !currentMemberResult,
    error: currentMemberResult?.error,
    onRetry: reloadMembers,
  };

  useEffect(() => {
    setResponsibleFilter([]);
    setTaskAssignees([]);
  }, [activeContextKey, studyId]);

  useEffect(() => {
    setFilters((current) => current.court === 'all' ? current : { ...current, court: 'all' });
  }, [activeContextKey]);

  useEffect(() => {
    if (!studyId) {
      setMemberResult(null);
      return;
    }

    let cancelled = false;
    setMemberResult(null);
    getStudyMembers(studyId).then((members) => {
      if (cancelled) return;
      const activeMembers = members.filter((member) => member.status === 'ACTIVE');
      setMemberResult({ studyId, members: activeMembers });
      const ids = new Set(activeMembers.map((member) => String(member.userId)));
      setResponsibleFilter((selected) => selected.filter((id) => ids.has(id)));
      setTaskAssignees((selected) => selected.filter((id) => ids.has(id)));
    }).catch(() => {
      if (!cancelled) setMemberResult({ studyId, error: true });
    });

    return () => { cancelled = true; };
  }, [studyId, memberReload]);
  useEffect(() => {
    const date = route?.params?.selectedDate ? startOfDay(route.params.selectedDate) : null;
    const intentId = route?.params?.notificationIntentId;
    if (intentId && consumedCalendarIntentRef.current === intentId) return;

    if (date) {
      setSelectedDate(date);
      setCalendarMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    }
    if (intentId) {
      consumedCalendarIntentRef.current = intentId;
      setNotificationTaskId(route?.params?.selectedTaskId ?? null);
      setFilters(DEFAULT_FILTERS);
      setResponsibleFilter([]);
      setShowReviewed(true);
      navigation.setParams({ selectedDate: undefined, selectedTaskId: undefined, notificationIntentId: undefined });
    }
  }, [navigation, route?.params?.notificationIntentId, route?.params?.selectedDate, route?.params?.selectedTaskId]);

  const loadCalendar = useCallback(async () => {
    if (!isAuthReady || !isHydrated || authStatus !== 'authenticated' || !currentUser) {
      return;
    }
    const requestId = ++requestSequenceRef.current;

    try {
      setLoading(true);
      setCalendarData({ hearings: [], cases: [], caseDetails: [] });
      setError('');

      const [hearingsResult, casesResult, tasksResult] = await Promise.allSettled([
        getHearings(),
        getAllCases(),
        getTasks(),
      ]);
      const hearings = hearingsResult.status === 'fulfilled' ? hearingsResult.value : [];
      const cases = casesResult.status === 'fulfilled' ? casesResult.value : [];
      const tasks = tasksResult.status === 'fulfilled' ? tasksResult.value : [];
      if (requestSequenceRef.current !== requestId) return;
      const failedResult = [hearingsResult, casesResult, tasksResult].find(
        (result) => result.status === 'rejected'
      );

      if (failedResult) {
        const failedError = failedResult.reason;
        console.error('[CalendarScreen] Una fuente del calendario no respondio.', {
          name: failedError?.name || 'Error',
          status: failedError?.status || 0,
        });
        setError(
          failedError instanceof Error
            ? failedError.message
            : 'No pudimos cargar una parte de la agenda judicial.'
        );
      }

      const detailedCases = await Promise.all(
        cases.map(async (caseItem) => {
          try {
            return await getCaseById(caseItem?.id);
          } catch (detailError) {
            console.error('[CalendarScreen] No se pudo cargar el detalle de la causa.');
            return caseItem;
          }
        })
      );

      if (requestSequenceRef.current !== requestId) return;
      setCalendarData({
        hearings: Array.isArray(hearings) ? hearings : [],
        tasks: Array.isArray(tasks) ? tasks : [],
        cases,
        caseDetails: detailedCases.filter(Boolean),
      });
    } catch (loadError) {
      if (requestSequenceRef.current !== requestId) return;
      console.error('[CalendarScreen] No se pudo cargar el calendario.');
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'No pudimos cargar la agenda judicial.'
      );
    } finally {
      if (requestSequenceRef.current === requestId) setLoading(false);
    }
  }, [activeContextKey, authStatus, currentUser?.uid, isAuthReady, isHydrated]);

  useFocusEffect(
    useCallback(() => {
      if (!isAuthReady || !isHydrated || authStatus !== 'authenticated' || !currentUser) {
        return undefined;
      }

      void loadCalendar();
      return () => { requestSequenceRef.current += 1; };
    }, [authStatus, currentUser?.uid, isAuthReady, isHydrated, loadCalendar])
  );

  const allEvents = useMemo(() => buildCalendarEvents(calendarData), [calendarData]);
  const courtTypes = useMemo(() => {
    const savedTypes = new Set(calendarData.cases.map((item) => item.courtType));
    return CASE_COURT_TYPES.filter(({ value }) => savedTypes.has(value));
  }, [calendarData.cases]);
  const court = courtTypes.some(({ value }) => value === filters.court) ? filters.court : 'all';
  const filteredEvents = useMemo(() => filterCalendarEvents(allEvents, {
    ...filters,
    court,
    showCompleted: showReviewed,
    responsibleIds: canFilterByResponsible ? responsibleFilter : [],
  }), [allEvents, canFilterByResponsible, court, filters, responsibleFilter, showReviewed]);
  const eventsByDate = useMemo(() => groupEventsByDate(filteredEvents), [filteredEvents]);
  const monthDays = useMemo(() => getMonthMatrix(calendarMonth), [calendarMonth]);
  const weekdayLabels = useMemo(() => getWeekdayLabels(), []);

  const dayKey = getDateKey(selectedDate);
  const selectedDayEvents = eventsByDate[dayKey] || [];
  const dayHasExcludedEvents = !selectedDayEvents.length && allEvents.some((event) => getDateKey(event.date) === dayKey);

  const visibleAreas = useMemo(() => {
    const areas = filteredEvents.map((event) => event.area);
    return [...new Map(areas.map((area) => [area.key, area])).values()];
  }, [filteredEvents]);

  const handleSelectDay = useCallback((day) => {
    setSelectedDate(day);
    setNotificationTaskId(null);

    if (!isSameMonth(day, calendarMonth)) {
      setCalendarMonth(new Date(day.getFullYear(), day.getMonth(), 1));
    }
  }, [calendarMonth]);

  const handleResetToday = useCallback(() => {
    setCalendarMonth(today);
    setSelectedDate(today);
  }, [today]);

  const handleOpenEventMenu = useCallback((event) => {
    setMenuEvent(event);
  }, []);

  const toggleFavorite = useCallback((eventId) => {
    setFavorites((current) => ({ ...current, [eventId]: !current[eventId] }));
  }, []);

  const toggleReviewed = useCallback(async (event) => {
    const completed = !event.completed;
    try {
      if (event.type === 'hearing') await setHearingCompleted(event.sourceId, completed);
      else await setTaskCompleted(event.sourceId, completed);
      await loadCalendar();
    } catch (error) {
      Alert.alert('No se pudo guardar', error?.message || 'Intentá nuevamente.');
    }
  }, [loadCalendar]);

  const saveTask = useCallback(async () => {
    if (!taskTitle.trim()) return Alert.alert('Falta el título', 'Ingresá el título de la tarea.');
    const datePart = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`;
    const validTime = (value) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
    if (!taskAllDay && (!validTime(taskStartTime) || !validTime(taskEndTime) || taskEndTime <= taskStartTime)) {
      return Alert.alert('Horario inválido', 'Ingresá un horario válido y posterior al inicio.');
    }
    try {
      const buildLocalDate = (date, time) => new Date(`${date}T${time}:00`).toISOString();
      const payload = {
        title: taskTitle.trim(), description: taskDescription.trim(), allDay: taskAllDay,
        scheduledAt: buildLocalDate(datePart, taskAllDay ? '12:00' : taskStartTime),
        ...(taskDueDate ? { dueDate: buildLocalDate(taskDueDate, '23:59') } : {}),
        ...(!taskAllDay ? { startsAt: buildLocalDate(datePart, taskStartTime), endsAt: buildLocalDate(datePart, taskEndTime) } : {}),
        timeZone: 'America/Argentina/Buenos_Aires',
        ...(activeContext?.type === 'study' ? { legalStudyId: activeContext.legalStudyId } : {}),
        ...(taskAssignees.length ? { assignedToIds: taskAssignees.map(Number), assignmentMode: taskAssignees.length > 1 ? assignmentMode : 'GROUP' } : {}),
      };
      await createCalendarTask(payload);
      setTaskModalOpen(false);
      setTaskTitle('');
      setTaskDescription('');
      setTaskDueDate(''); setTaskAssignees([]); setTaskAllDay(true);
      await loadCalendar();
    } catch (error) {
      Alert.alert('No se pudo guardar', error?.message || 'Intentá nuevamente.');
    }
  }, [activeContext, assignmentMode, loadCalendar, selectedDate, taskAllDay, taskAssignees, taskDescription, taskDueDate, taskEndTime, taskStartTime, taskTitle]);

  const openTaskModal = () => {
    setTaskModalOpen(true);
    if (currentMemberResult?.error) reloadMembers();
  };

  const clearFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setResponsibleFilter([]);
    setShowReviewed(true);
  };

  if (loading && !allEvents.length) {
    return (
      <LoadingState
        title="Cargando calendario"
        message="Estamos preparando tu agenda judicial y los vencimientos asociados."
      />
    );
  }

  if (error && !allEvents.length) {
    return (
      <ErrorState
        title="No pudimos cargar el calendario"
        message={error}
        onRetry={loadCalendar}
      />
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      style={styles.screen}
    >
      {error ? (
        <View style={styles.sourceWarning}>
          <MaterialCommunityIcons color={colors.danger} name="alert-outline" size={18} />
          <Text style={styles.sourceWarningText}>{error}</Text>
        </View>
      ) : null}
      <View style={styles.topBar}>
        <Text style={styles.topBarTitle}>Agenda</Text>
      </View>

      <View style={styles.calendarCard}>
        <View style={styles.calendarHeader}>
          <View style={styles.headerStripeOne} />
          <View style={styles.headerStripeTwo} />
          <View style={styles.headerIcon}>
            <MaterialCommunityIcons color={colors.textOnPrimary} name="calendar-month-outline" size={18} />
          </View>
          <Text style={styles.calendarHeaderTitle}>MI CALENDARIO</Text>
        </View>

        <View style={styles.monthSelector}>
          <Pressable
            hitSlop={8}
            onPress={() => setCalendarMonth((current) => addMonths(current, -1))}
            style={styles.monthButton}
          >
            <MaterialCommunityIcons color={colors.primary} name="chevron-left" size={22} />
          </Pressable>

          <Text style={styles.monthTitle}>
            {formatMonthYear(calendarMonth).replace(/^\w/, (letter) => letter.toUpperCase())}
          </Text>

          <Pressable
            hitSlop={8}
            onPress={() => setCalendarMonth((current) => addMonths(current, 1))}
            style={styles.monthButton}
          >
            <MaterialCommunityIcons color={colors.primary} name="chevron-right" size={22} />
          </Pressable>
        </View>

        <View style={styles.weekdaysRow}>
          {weekdayLabels.map((label) => (
            <Text key={label} style={styles.weekdayLabel}>
              {label}
            </Text>
          ))}
        </View>

        <View style={styles.daysGrid}>
          {monthDays.map((day) => {
            const dateKey = getDateKey(day);
            const dayEvents = eventsByDate[dateKey] || [];
            const isSelected = isSameDay(day, selectedDate);
            const isCurrentMonth = isSameMonth(day, calendarMonth);
            const dayAreas = Array.from(
              new Map(dayEvents.map((event) => [event?.area?.key, event?.area]).filter(([key]) => Boolean(key))).values()
            ).slice(0, 3);

            return (
              <Pressable
                key={dateKey}
                onPress={() => handleSelectDay(day)}
                style={[styles.dayCell, isSelected && styles.dayCellSelected]}
              >
                <Text
                  style={[
                    styles.dayNumber,
                    !isCurrentMonth && styles.dayNumberMuted,
                    isSelected && styles.dayNumberSelected,
                  ]}
                >
                  {day.getDate()}
                </Text>

                <View style={styles.dayDots}>
                  {dayAreas.map((area) => (
                    <View
                      key={`${dateKey}-${area.key}`}
                      style={[styles.dayDot, { backgroundColor: area.color, opacity: isSelected ? 0.9 : 1 }]}
                    />
                  ))}
                </View>
              </Pressable>
            );
          })}
        </View>

        {visibleAreas.length ? (
          <View style={styles.legendSection}>
            <Text style={styles.legendTitle}>LEYENDA</Text>
            {visibleAreas.map((area) => (
              <View key={area.key} style={styles.legendRow}>
                <View style={[styles.legendDot, { backgroundColor: area.color }]} />
                <Text style={styles.legendText}>{area.label}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>

      <View style={styles.agendaHeaderCard}>
        <View style={styles.agendaHeaderLeft}>
          <View style={styles.agendaIcon}>
            <MaterialCommunityIcons color={colors.primary} name="calendar-blank-outline" size={18} />
          </View>
          <Text accessibilityRole="header" style={styles.agendaTitle}>
            {formatAgendaDate(selectedDate)}
          </Text>
        </View>

        <View style={styles.agendaActions}>
          <AgendaAction label="Crear tarea" icon="plus" active onPress={openTaskModal} colors={colors} styles={styles} />
          <AgendaAction label="Filtros" icon="filter-variant" active={showFilters} expanded={showFilters} onPress={() => setShowFilters((current) => !current)} colors={colors} styles={styles} />
          <AgendaAction label="Ir a hoy" icon="history" onPress={handleResetToday} colors={colors} styles={styles} />
          <AgendaAction
            label={showReviewed ? 'Ocultar finalizados' : 'Mostrar finalizados'}
            icon={showReviewed ? 'eye-off-outline' : 'eye-outline'}
            onPress={() => setShowReviewed((current) => !current)}
            colors={colors}
            styles={styles}
          />
        </View>
      </View>

      {showFilters ? (
        <CalendarFilters
          key={activeContextKey}
          filters={{ ...filters, court }}
          courtTypes={courtTypes}
          onChange={(changes) => setFilters((current) => ({ ...current, ...changes }))}
          responsible={canFilterByResponsible ? {
            ...memberOptions,
            selected: responsibleFilter,
            onSelect: setResponsibleFilter,
          } : null}
        />
      ) : null}

      {selectedDayEvents.length ? (
        selectedDayEvents.map((event) => {
          const isFavorite = Boolean(favorites[event.id]);
          const isReviewed = event.completed;

          return (
            <View
              key={event.id}
              style={[
                styles.eventCard,
                event.type === 'task' && String(event.sourceId) === String(notificationTaskId) && styles.notificationTaskHighlighted,
              ]}
            >
              <Pressable
                onPress={() => toggleReviewed(event)}
                style={[styles.checkbox, isReviewed && styles.checkboxActive]}
              >
                {isReviewed ? (
                  <MaterialCommunityIcons color={colors.textOnPrimary} name="check" size={14} />
                ) : null}
              </Pressable>

              <View style={styles.timeColumn}>
                <Text style={styles.timeText}>{formatTime(event.date).replace(' hs', '')}</Text>
              </View>

              <View style={styles.eventContent}>
                <Text style={[styles.eventTitle, isReviewed && styles.eventTitleReviewed]}>
                  {event.title}
                </Text>
                <View style={styles.eventAreaRow}>
                  <View style={[styles.eventAreaDot, { backgroundColor: event?.area?.color || colors.primary }]} />
                  <Text style={styles.eventAreaText}>
                    {event?.area?.label || 'General'}
                  </Text>
                </View>
                <Text style={styles.eventMeta}>{event.caseTitle}</Text>
                <Text style={styles.eventMeta}>{event.court}</Text>
                {canFilterByResponsible ? <Text style={styles.eventMeta}>Responsables: {(event.responsibleUsers || []).map((user) => user.name).join(', ') || 'Sin asignar'}</Text> : null}
              </View>

              <View style={styles.eventActions}>
                <Pressable hitSlop={8} onPress={() => toggleFavorite(event.id)}>
                  <MaterialCommunityIcons
                    color={isFavorite ? '#E8B43A' : colors.mutedIcon}
                    name={isFavorite ? 'star' : 'star-outline'}
                    size={18}
                  />
                </Pressable>
                <Pressable hitSlop={8} onPress={() => handleOpenEventMenu(event)}>
                  <MaterialCommunityIcons color={colors.textSecondary} name="dots-vertical" size={18} />
                </Pressable>
              </View>
            </View>
          );
        })
      ) : (
        <EmptyState
          actionLabel={dayHasExcludedEvents ? 'Limpiar filtros' : 'Registrar audiencia'}
          icon="calendar-remove-outline"
          message={dayHasExcludedEvents ? 'Ningún evento de este día coincide con los filtros actuales.' : 'No hay eventos registrados para la fecha seleccionada.'}
          onAction={dayHasExcludedEvents ? clearFilters : () => navigation.navigate('NewHearing')}
          title={dayHasExcludedEvents ? 'Sin resultados' : 'Agenda sin actividad'}
        />
      )}
      <Modal transparent animationType="fade" visible={Boolean(menuEvent)} onRequestClose={() => setMenuEvent(null)}>
        <Pressable accessibilityRole="button" onPress={() => setMenuEvent(null)} style={styles.menuBackdrop}>
          <View accessibilityRole="menu" style={styles.eventMenu}>
            <Text style={styles.menuTitle}>{menuEvent?.title}</Text>
            {menuEvent?.caseId ? <Pressable accessibilityRole="menuitem" onPress={() => { const event = menuEvent; setMenuEvent(null); navigation.navigate('CaseDetail', { caseId: event.caseId }); }} style={styles.menuOption}><Text style={styles.menuOptionText}>Ver causa</Text></Pressable> : null}
            <Pressable accessibilityRole="menuitem" onPress={() => { const event = menuEvent; setMenuEvent(null); if (event?.type === 'hearing' && event?.caseId) { navigation.navigate('CaseDetail', { caseId: event.caseId, hearingId: event.sourceId }); return; } setSelectedDate(startOfDay(event?.date) || today); }} style={styles.menuOption}><Text style={styles.menuOptionText}>{menuEvent?.type === 'hearing' ? 'Ir a audiencias' : 'Abrir calendario'}</Text></Pressable>
            <Pressable accessibilityRole="menuitem" onPress={() => setMenuEvent(null)} style={styles.menuOption}><Text style={styles.menuOptionText}>Cancelar</Text></Pressable>
          </View>
        </Pressable>
      </Modal>
      <Modal transparent animationType="fade" visible={taskModalOpen} onRequestClose={() => setTaskModalOpen(false)}>
        <View style={styles.menuBackdrop}>
          <ScrollView nestedScrollEnabled contentContainerStyle={styles.taskModalContent} keyboardShouldPersistTaps="handled">
            <View style={styles.eventMenu}>
              <Text style={styles.menuTitle}>Nueva tarea · {formatAgendaDate(selectedDate)}</Text>
              <TextInput onChangeText={setTaskTitle} placeholder="Título" placeholderTextColor={colors.textMuted} style={styles.taskInput} value={taskTitle} />
              <TextInput multiline onChangeText={setTaskDescription} placeholder="Descripción" placeholderTextColor={colors.textMuted} style={[styles.taskInput, styles.taskDescription]} value={taskDescription} />
              <Pressable accessibilityRole="checkbox" aria-checked={taskAllDay} onPress={() => setTaskAllDay((value) => !value)} style={[styles.menuOption, styles.allDayControl]}>
                <View style={[styles.checkbox, styles.allDayCheckbox, taskAllDay && styles.checkboxActive]}>
                  {taskAllDay ? <MaterialCommunityIcons color={colors.textOnPrimary} name="check" size={14} /> : null}
                </View>
                <Text style={styles.menuOptionText}>Todo el día</Text>
              </Pressable>
              {!taskAllDay ? (
                <View style={styles.taskTimeRow}>
                  <Pressable accessibilityRole="button" onPress={() => { setTimeDraft({ hour: taskStartTime.slice(0, 2), minute: taskStartTime.slice(3, 5) }); setTimePickerTarget('start'); }} style={[styles.taskInput, styles.taskTimeField]}>
                    <Text style={styles.menuOptionText}>Inicio · {taskStartTime}</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" onPress={() => { setTimeDraft({ hour: taskEndTime.slice(0, 2), minute: taskEndTime.slice(3, 5) }); setTimePickerTarget('end'); }} style={[styles.taskInput, styles.taskTimeField]}>
                    <Text style={styles.menuOptionText}>Fin · {taskEndTime}</Text>
                  </Pressable>
                </View>
              ) : null}
              <FilterField
                label="Vencimiento"
                value={taskDueDate ? `Vencimiento · ${taskDueDate}` : 'Elegir vencimiento'}
                icon="clock-outline"
                expanded={dueDatePickerOpen}
                onPress={() => setDueDatePickerOpen(true)}
              />
              {canFilterByResponsible ? (
                <FilterSection label="Asignar responsables">
                  <StudyMembersDropdown
                    key={activeContextKey}
                    {...memberOptions}
                    label="Asignar responsables"
                    emptyLabel="Elegir integrantes"
                    selected={taskAssignees}
                    onSelect={setTaskAssignees}
                  />
                  {taskAssignees.length > 1 ? (
                    <View style={styles.assignmentModes}>
                      <FilterChip label="Individual" selected={assignmentMode === 'INDIVIDUAL'} onPress={() => setAssignmentMode('INDIVIDUAL')} />
                      <FilterChip label="En grupo" selected={assignmentMode === 'GROUP'} onPress={() => setAssignmentMode('GROUP')} />
                    </View>
                  ) : null}
                </FilterSection>
              ) : null}
              <View style={styles.taskModalActions}>
                <Pressable accessibilityRole="button" onPress={saveTask} style={[styles.menuOption, { backgroundColor: colors.primary }]}>
                  <Text style={styles.taskActionText}>Guardar tarea</Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={() => setTaskModalOpen(false)} style={[styles.menuOption, { backgroundColor: colors.danger }]}>
                  <Text style={styles.taskActionText}>Cancelar</Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>
      <DatePickerModal visible={dueDatePickerOpen} selectedValue={taskDueDate} colors={colors} onClose={() => setDueDatePickerOpen(false)} onSelect={(value) => { setTaskDueDate(value); setDueDatePickerOpen(false); }} />
      <TimePickerModal visible={Boolean(timePickerTarget)} value={timeDraft} colors={colors} onChange={setTimeDraft} onClose={() => setTimePickerTarget(null)} onConfirm={() => { const value = `${timeDraft.hour}:${timeDraft.minute}`; timePickerTarget === 'start' ? setTaskStartTime(value) : setTaskEndTime(value); setTimePickerTarget(null); }} />
    </ScrollView>
  );
}

function AgendaAction({ label, icon, active, expanded, onPress, colors, styles }) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      aria-expanded={expanded}
      onBlur={() => setFocused(false)}
      onFocus={() => setFocused(true)}
      onPress={onPress}
      style={({ pressed }) => [styles.actionTextButton, active && styles.actionActive, (focused || pressed) && styles.actionFocus]}
    >
      <MaterialCommunityIcons color={active ? colors.text : colors.textSecondary} name={icon} size={18} />
      <Text style={styles.actionText}>{label}</Text>
    </Pressable>
  );
}

const createStyles = (colors, layout, topInset) => StyleSheet.create({
  menuBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 24 },
  eventMenu: { width: '100%', maxWidth: 520, alignSelf: 'center', backgroundColor: colors.card, borderColor: colors.borderSoft, borderWidth: 1, borderRadius: 18, padding: 18, gap: 8 },
  menuTitle: { color: colors.text, fontSize: 18, fontWeight: '800', marginBottom: 4 },
  menuOption: { minHeight: 46, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 10, backgroundColor: colors.cardAlt },
  menuOptionText: { color: colors.text, fontSize: 15, fontWeight: '700' },
  taskModalContent: { flexGrow: 1, justifyContent: 'center' },
  taskInput: { minHeight: 46, color: colors.text, backgroundColor: colors.cardAlt, borderRadius: 10, borderWidth: 1, borderColor: colors.borderSoft, paddingHorizontal: 12 },
  taskDescription: { minHeight: 84, textAlignVertical: 'top', paddingTop: 12 },
  allDayControl: { flexDirection: 'row', justifyContent: 'flex-start', alignItems: 'center', gap: 10 },
  allDayCheckbox: { marginTop: 0 },
  taskTimeRow: { flexDirection: 'row', gap: 8 },
  taskTimeField: { flex: 1, minWidth: 0, justifyContent: 'center' },
  assignmentModes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  taskModalActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12, marginTop: 8 },
  taskActionText: { color: colors.textOnPrimary, fontSize: 15, fontWeight: '700' },
  screen: {
    flex: 1,
    backgroundColor: colors.backgroundAlt,
  },
  content: {
    width: '100%',
    maxWidth: layout.readingMaxWidth,
    alignSelf: 'center',
    paddingTop: Math.max(topInset + 16, layout.topSpacing),
    paddingHorizontal: layout.gutter,
    paddingBottom: 34,
    gap: 16,
  },
  sourceWarning: {
    backgroundColor: colors.dangerSoft,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sourceWarningText: {
    color: colors.danger,
    flex: 1,
    fontSize: 12,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  topBarTitle: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '800',
  },
  calendarCard: {
    backgroundColor: colors.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    overflow: 'hidden',
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.14,
    shadowRadius: 18,
    elevation: 4,
  },
  calendarHeader: {
    minHeight: 78,
    backgroundColor: colors.primaryDeep,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    overflow: 'hidden',
  },
  headerStripeOne: {
    position: 'absolute',
    top: -30,
    right: 10,
    width: 140,
    height: 140,
    backgroundColor: 'rgba(255,255,255,0.04)',
    transform: [{ rotate: '35deg' }],
  },
  headerStripeTwo: {
    position: 'absolute',
    top: -12,
    right: 44,
    width: 120,
    height: 120,
    backgroundColor: 'rgba(255,255,255,0.03)',
    transform: [{ rotate: '35deg' }],
  },
  headerIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarHeaderTitle: {
    color: colors.textOnPrimary,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.7,
  },
  monthSelector: {
    paddingHorizontal: 18,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  monthButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  weekdaysRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 8,
  },
  weekdayLabel: {
    flex: 1,
    color: colors.weekdayText,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  dayCell: {
    width: '14.2857%',
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    marginBottom: 8,
  },
  dayCellSelected: {
    backgroundColor: colors.primary,
  },
  dayNumber: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  dayNumberMuted: {
    color: colors.calendarMuted,
  },
  dayNumberSelected: {
    color: colors.textOnPrimary,
    fontWeight: '700',
  },
  dayDots: {
    flexDirection: 'row',
    gap: 3,
    minHeight: 7,
    marginTop: 2,
  },
  dayDot: {
    width: 5,
    height: 5,
    borderRadius: 999,
  },
  legendSection: {
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 18,
    gap: 9,
  },
  legendTitle: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '800',
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  legendText: {
    color: colors.legendText,
    fontSize: 13,
    fontWeight: '500',
  },
  agendaHeaderCard: {
    backgroundColor: colors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    paddingHorizontal: 14,
    paddingVertical: 14,
    alignItems: 'stretch',
    gap: 12,
  },
  agendaHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  agendaIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  agendaTitle: {
    flexShrink: 1,
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  agendaActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  actionTextButton: {
    minHeight: 44,
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: colors.background,
  },
  actionText: { flexShrink: 1, color: colors.text, fontSize: 13, fontWeight: '700' },
  actionActive: { backgroundColor: colors.accentStrong, borderColor: colors.primary },
  actionFocus: { borderColor: colors.focusRing },
  eventCard: {
    backgroundColor: colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    paddingHorizontal: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 14,
    elevation: 3,
  },
  notificationTaskHighlighted: {
    borderColor: colors.gold,
    borderWidth: 2,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 3,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
  },
  checkboxActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  timeColumn: {
    minWidth: 54,
    paddingTop: 2,
  },
  timeText: {
    color: colors.legendText,
    fontSize: 16,
    fontWeight: '500',
  },
  eventContent: {
    flex: 1,
    gap: 4,
  },
  eventTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 22,
  },
  eventTitleReviewed: {
    color: colors.textMuted,
    textDecorationLine: 'line-through',
  },
  eventAreaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  eventAreaDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  eventAreaText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  eventMeta: {
    color: colors.legendText,
    fontSize: 13,
    lineHeight: 18,
  },
  eventActions: {
    minHeight: 54,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 2,
  },
});
