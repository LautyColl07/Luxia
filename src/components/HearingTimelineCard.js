import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '../context/ThemeContext';
import { useResponsiveLayout } from '../theme/layout';
import { formatShortDate, formatTime, isSameDay, isToday } from '../utils/date';

export default function HearingTimelineCard({
  hearing,
  isLast = false,
  showAction = true,
  onPressAction,
}) {
  const { colors } = useAppTheme();
  const layout = useResponsiveLayout();
  const styles = useMemo(() => createStyles(colors, layout), [colors, layout]);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const today = isToday(hearing?.date);
  const day = isSameDay(hearing?.date, tomorrow) ? 'Mañana' : formatShortDate(hearing?.date);
  const tags = [hearing?.court, hearing?.location, hearing?.modality].filter(Boolean);
  const canNavigate = showAction && Boolean(onPressAction);

  return (
    <Pressable
      accessibilityLabel={`${day}, ${formatTime(hearing?.date)}. ${hearing?.caseTitle || 'Causa sin referencia'}. ${hearing?.title || 'Audiencia'}`}
      accessibilityRole={canNavigate ? 'button' : undefined}
      disabled={!canNavigate}
      onPress={onPressAction}
      style={({ focused, hovered, pressed }) => [
        styles.row,
        hovered && { backgroundColor: colors.accentSoft },
        focused && { borderColor: colors.focusRing },
        pressed && { opacity: 0.75 },
      ]}
    >
      <View style={styles.timeline}>
        {!isLast ? <View style={styles.line} /> : null}
        <View style={[styles.point, { backgroundColor: today ? colors.info : colors.accentStrong }]} />
      </View>
      <View style={styles.date}>
        <Text style={[styles.day, today && { color: colors.info, fontWeight: '700' }]}>{day}</Text>
        <Text style={[styles.time, today && { color: colors.info }]}>{formatTime(hearing?.date)}</Text>
      </View>
      <View style={[styles.details, !isLast && styles.separator]}>
        <View style={styles.copy}>
          <Text style={styles.caseTitle}>{hearing?.caseTitle || 'Causa sin referencia'}</Text>
          <Text style={styles.title}>{hearing?.title || 'Audiencia sin título'}</Text>
          {tags.length ? (
            <View style={styles.tags}>
              {tags.map((tag, index) => (
                <View key={`${tag}-${index}`} style={styles.tag}>
                  <Text style={styles.tagText}>{tag}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
        {canNavigate ? <MaterialCommunityIcons color={colors.legendText} name="chevron-right" size={22} /> : null}
      </View>
    </Pressable>
  );
}

const createStyles = (colors, layout) => StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    minHeight: 88,
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: 8
  },
  timeline: {
    width: 22,
    alignItems: 'center'
  },
  point: {
    width: 14,
    height: 14,
    borderRadius: 7,
    marginTop: 15,
    zIndex: 1
  },
  line: {
    position: 'absolute',
    width: 2,
    top: 22,
    bottom: -22,
    backgroundColor: colors.info,
    opacity: 0.55
  },
  date: {
    width: layout.isCompact ? 63 : layout.isPhone ? 76 : 100,
    paddingTop: 13,
    paddingLeft: 8,
    paddingRight: 8
  },
  day: {
    color: colors.text,
    fontSize: layout.isCompact ? 12 : 14
  },
  time: {
    color: colors.legendText,
    fontSize: 11,
    marginTop: 5
  },
  details: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 13
  },
  separator: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft
  },
  copy: {
    flex: 1,
    minWidth: 0,
    borderLeftWidth: 1,
    borderLeftColor: colors.borderSoft,
    paddingLeft: layout.isCompact ? 10 : 16
  },
  caseTitle: {
    color: colors.text,
    fontSize: layout.isCompact ? 13 : 15,
    lineHeight: 20,
    fontWeight: '700'
  },
  title: {
    color: colors.legendText,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginTop: 6
  },
  tag: {
    backgroundColor: colors.accentSoft,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    maxWidth: '100%'
  },
  tagText: {
    color: colors.primary,
    fontSize: 10,
    lineHeight: 14
  }
});
