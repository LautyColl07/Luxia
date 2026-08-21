import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '../context/ThemeContext';

const ICONS_BY_TYPE = {
  case: 'briefcase-outline',
  hearing: 'gavel',
  task: 'clipboard-check-outline',
  document: 'file-document-outline',
  lux: 'robot-outline',
  transcript: 'text-box-check-outline',
};

function formatTimestamp(value) {
  const date = value ? new Date(value) : null;

  if (!date || Number.isNaN(date.getTime())) {
    return 'Sin fecha';
  }

  const dateLabel = new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);

  const timeLabel = new Intl.DateTimeFormat('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);

  return `${dateLabel} - ${timeLabel} hs`;
}

function buildTypeStyles(colors, type) {
  switch (type) {
    case 'hearing':
      return {
        iconColor: colors.success,
        iconBackground: colors.successSoft,
      };
    case 'task':
      return {
        iconColor: colors.warning,
        iconBackground: colors.warningSoft,
      };
    case 'document':
    case 'transcript':
      return {
        iconColor: colors.primary,
        iconBackground: colors.accentSoft,
      };
    case 'lux':
      return {
        iconColor: colors.warning,
        iconBackground: colors.warningSoft,
      };
    case 'case':
    default:
      return {
        iconColor: colors.primary,
        iconBackground: colors.accentSoft,
      };
  }
}

export default function ActivityCard({ activity }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const typeStyles = buildTypeStyles(colors, activity?.type);
  const iconName = ICONS_BY_TYPE[activity?.type] || ICONS_BY_TYPE.case;

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <View style={[styles.iconWrapper, { backgroundColor: typeStyles.iconBackground }]}>
          <MaterialCommunityIcons color={typeStyles.iconColor} name={iconName} size={20} />
        </View>

        <View style={styles.copy}>
          <Text style={styles.title}>{activity?.title}</Text>
          <Text style={styles.description}>{activity?.description}</Text>
        </View>
      </View>

      <View style={styles.footer}>
        {activity?.relatedEntityName ? (
          <View style={styles.referencePill}>
            <Text numberOfLines={1} style={styles.referenceText}>
              {activity.relatedEntityName}
            </Text>
          </View>
        ) : (
          <View />
        )}

        <Text style={styles.timestamp}>{formatTimestamp(activity?.createdAt)}</Text>
      </View>
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: 18,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.14,
    shadowRadius: 18,
    elevation: 4,
    gap: 16,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  iconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    flex: 1,
    gap: 6,
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  description: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 20,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  referencePill: {
    flex: 1,
    borderRadius: 999,
    backgroundColor: colors.backgroundAlt,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  referenceText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
  },
  timestamp: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'right',
  },
});
