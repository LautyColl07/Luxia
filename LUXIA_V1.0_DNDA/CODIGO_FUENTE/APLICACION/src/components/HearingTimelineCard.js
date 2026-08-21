import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '../context/ThemeContext';
import { formatDateTime, formatShortDate, formatTime } from '../utils/date';
import StatusBadge from './StatusBadge';

export default function HearingTimelineCard({
  hearing,
  isLast = false,
  showAction = true,
  onPressAction,
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.row}>
      <View style={styles.timeline}>
        <View style={styles.point} />
        {!isLast && <View style={styles.line} />}
      </View>

      <View style={styles.content}>
        <View style={styles.dateBadge}>
          <Text style={styles.dateBadgeText}>{formatShortDate(hearing.date)}</Text>
          <Text style={styles.dateBadgeTime}>{formatTime(hearing.date)}</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.headerRow}>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>{hearing?.title || 'Audiencia sin titulo'}</Text>
              <Text style={styles.caseTitle}>{hearing?.caseTitle || 'Causa sin referencia'}</Text>
            </View>
            <StatusBadge status={hearing?.status} />
          </View>

          <View style={styles.metaRow}>
            <MaterialCommunityIcons color={colors.textSecondary} name="calendar-clock" size={16} />
            <Text style={styles.metaText}>{formatDateTime(hearing?.date)}</Text>
          </View>

          {hearing?.court ? (
            <View style={styles.metaRow}>
              <MaterialCommunityIcons color={colors.textSecondary} name="scale-balance" size={16} />
              <Text style={styles.metaText}>{hearing.court}</Text>
            </View>
          ) : null}

          {hearing?.modality ? (
            <View style={styles.metaRow}>
              <MaterialCommunityIcons color={colors.textSecondary} name="map-marker-outline" size={16} />
              <Text style={styles.metaText}>
                {hearing.modality}
                {hearing?.location ? ` · ${hearing.location}` : ''}
              </Text>
            </View>
          ) : null}

          {showAction ? (
            <Pressable onPress={onPressAction} style={styles.actionButton}>
              <Text style={styles.actionText}>Ver detalle de la audiencia</Text>
              <MaterialCommunityIcons color={colors.textOnPrimary} name="arrow-right" size={18} />
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  timeline: {
    width: 26,
    alignItems: 'center',
  },
  point: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.primary,
    marginTop: 14,
    zIndex: 2,
  },
  line: {
    flex: 1,
    width: 2,
    backgroundColor: colors.accent,
    marginTop: 6,
    marginBottom: -12,
  },
  content: {
    flex: 1,
    paddingBottom: 18,
  },
  dateBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.accentSoft,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  dateBadgeText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  dateBadgeTime: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    marginTop: 2,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 24,
    padding: 18,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 4,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  headerRow: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerCopy: {
    flex: 1,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  caseTitle: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 4,
    marginBottom: 12,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  metaText: {
    color: colors.textSecondary,
    fontSize: 13,
    flex: 1,
  },
  actionButton: {
    marginTop: 16,
    backgroundColor: colors.primary,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  actionText: {
    color: colors.textOnPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
});
