import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import LoadingState from '../components/LoadingState';
import { useAppTheme } from '../context/ThemeContext';
import { getCaseById, getCases, getHearings } from '../services/api';
import {
  addMonths,
  AREA_CONFIG,
  buildCalendarEvents,
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

const CATEGORY_OPTIONS = [
  { key: 'all', label: 'Todas' },
  ...Object.values(AREA_CONFIG)
    .filter((item) => item.key !== 'general')
    .map((item) => ({ key: item.key, label: item.label })),
];

export default function CalendarScreen({ navigation }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const today = useMemo(() => startOfDay(new Date()) || new Date(), []);
  const [calendarMonth, setCalendarMonth] = useState(today);
  const [selectedDate, setSelectedDate] = useState(today);
  const [selectedArea, setSelectedArea] = useState('all');
  const [showFilters, setShowFilters] = useState(false);
  const [showReviewed, setShowReviewed] = useState(true);
  const [favorites, setFavorites] = useState({});
  const [reviewed, setReviewed] = useState({});
  const [calendarData, setCalendarData] = useState({
    hearings: [],
    cases: [],
    caseDetails: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadCalendar = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      const [hearings, cases] = await Promise.all([getHearings(), getCases()]);
      const detailedCases = await Promise.all(
        (Array.isArray(cases) ? cases : []).map(async (caseItem) => {
          try {
            return await getCaseById(caseItem?.id);
          } catch (detailError) {
            console.error('[CalendarScreen] Error cargando detalle de causa:', detailError);
            return caseItem;
          }
        })
      );

      setCalendarData({
        hearings: Array.isArray(hearings) ? hearings : [],
        cases: Array.isArray(cases) ? cases : [],
        caseDetails: detailedCases.filter(Boolean),
      });
    } catch (loadError) {
      console.error('[CalendarScreen] Error cargando calendario:', loadError);
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'No pudimos cargar la agenda judicial.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadCalendar();
    }, [loadCalendar])
  );

  const allEvents = useMemo(() => buildCalendarEvents(calendarData), [calendarData]);
  const eventsByDate = useMemo(() => groupEventsByDate(allEvents), [allEvents]);
  const monthDays = useMemo(() => getMonthMatrix(calendarMonth), [calendarMonth]);
  const weekdayLabels = useMemo(() => getWeekdayLabels(), []);

  const selectedDayEvents = useMemo(() => {
    const dayKey = getDateKey(selectedDate);
    const dailyEvents = eventsByDate[dayKey] || [];

    return dailyEvents.filter((event) => {
      const matchesArea = selectedArea === 'all' || event?.area?.key === selectedArea;
      const isReviewed = reviewed[event.id];

      if (!showReviewed && isReviewed) {
        return false;
      }

      return matchesArea;
    });
  }, [eventsByDate, reviewed, selectedArea, selectedDate, showReviewed]);

  const visibleAreas = useMemo(() => {
    const areaMap = new Map();

    allEvents.forEach((event) => {
      if (event?.area?.key && !areaMap.has(event.area.key)) {
        areaMap.set(event.area.key, event.area);
      }
    });

    return Object.values(AREA_CONFIG)
      .filter((area) => area.key !== 'general')
      .filter((area) => areaMap.has(area.key));
  }, [allEvents]);

  const handleSelectDay = useCallback((day) => {
    setSelectedDate(day);

    if (!isSameMonth(day, calendarMonth)) {
      setCalendarMonth(new Date(day.getFullYear(), day.getMonth(), 1));
    }
  }, [calendarMonth]);

  const handleResetToday = useCallback(() => {
    setCalendarMonth(today);
    setSelectedDate(today);
    setSelectedArea('all');
    setShowFilters(false);
  }, [today]);

  const handleOpenEventMenu = useCallback((event) => {
    const buttons = [
      {
        text: event?.caseId ? 'Ver causa' : 'Cerrar',
        onPress: () => {
          if (event?.caseId) {
            navigation.navigate('CaseDetail', { caseId: event.caseId });
          }
        },
      },
      {
        text: event?.type === 'hearing' ? 'Ir a audiencias' : 'Abrir calendario',
        onPress: () => {
          if (event?.type === 'hearing' && event?.caseId) {
            navigation.navigate('CaseDetail', { caseId: event.caseId });
            return;
          }

          setSelectedDate(startOfDay(event?.date) || today);
        },
      },
      { text: 'Cancelar', style: 'cancel' },
    ];

    Alert.alert(event?.title || 'Evento', 'Selecciona una accion para continuar.', buttons);
  }, [navigation, today]);

  const toggleFavorite = useCallback((eventId) => {
    setFavorites((current) => ({ ...current, [eventId]: !current[eventId] }));
  }, []);

  const toggleReviewed = useCallback((eventId) => {
    setReviewed((current) => ({ ...current, [eventId]: !current[eventId] }));
  }, []);

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
          <Text style={styles.agendaTitle}>
            {formatAgendaDate(selectedDate).toUpperCase()}
          </Text>
        </View>

        <View style={styles.agendaActions}>
          <Pressable
            onPress={() => setShowFilters((current) => !current)}
            style={[styles.iconButton, showFilters && styles.iconButtonActive]}
          >
            <MaterialCommunityIcons
              color={showFilters ? colors.textOnPrimary : colors.primary}
              name="filter-variant"
              size={18}
            />
          </Pressable>
          <Pressable onPress={handleResetToday} style={styles.iconButton}>
            <MaterialCommunityIcons color={colors.primary} name="history" size={18} />
          </Pressable>
          <Pressable
            onPress={() => setShowReviewed((current) => !current)}
            style={[styles.iconButton, !showReviewed && styles.iconButtonActive]}
          >
            <MaterialCommunityIcons
              color={!showReviewed ? colors.textOnPrimary : colors.primary}
              name="format-list-bulleted"
              size={18}
            />
          </Pressable>
        </View>
      </View>

      {showFilters ? (
        <View style={styles.filterPanel}>
          {CATEGORY_OPTIONS.filter((item) => item.key === 'all' || visibleAreas.some((area) => area.key === item.key)).map((item) => (
            <Pressable
              key={item.key}
              onPress={() => setSelectedArea(item.key)}
              style={[
                styles.filterChip,
                selectedArea === item.key && styles.filterChipActive,
              ]}
            >
              <Text
                style={[
                  styles.filterChipText,
                  selectedArea === item.key && styles.filterChipTextActive,
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {selectedDayEvents.length ? (
        selectedDayEvents.map((event) => {
          const isFavorite = Boolean(favorites[event.id]);
          const isReviewed = Boolean(reviewed[event.id]);

          return (
            <View key={event.id} style={styles.eventCard}>
              <Pressable
                onPress={() => toggleReviewed(event.id)}
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
          actionLabel="Registrar audiencia"
          icon="calendar-remove-outline"
          message="No hay eventos registrados para la fecha seleccionada."
          onAction={() => navigation.navigate('NewHearing')}
          title="Agenda sin actividad"
        />
      )}
    </ScrollView>
  );
}

const createStyles = (colors) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.backgroundAlt,
  },
  content: {
    paddingTop: 28,
    paddingHorizontal: 16,
    paddingBottom: 34,
    gap: 16,
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
    width: 36,
    height: 36,
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
    minHeight: 42,
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  agendaHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
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
    flex: 1,
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  agendaActions: {
    flexDirection: 'row',
    gap: 8,
  },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
  },
  iconButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterPanel: {
    backgroundColor: colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.backgroundAlt,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterChipText: {
    color: colors.legendText,
    fontSize: 12,
    fontWeight: '700',
  },
  filterChipTextActive: {
    color: colors.textOnPrimary,
  },
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
  checkbox: {
    width: 18,
    height: 18,
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
