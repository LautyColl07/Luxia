import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '../context/ThemeContext';

const ICON_BY_TYPE = {
  case: 'briefcase-outline',
  hearing: 'gavel',
  task: 'clipboard-check-outline',
  document: 'file-document-outline',
  lux: 'robot-outline',
  transcript: 'text-box-check-outline',
};

function formatDateTime(value) {
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

function getAccentStyles(colors, type) {
  if (type === 'hearing') {
    return {
      iconBackground: colors.successSoft,
      iconColor: colors.success,
    };
  }

  if (type === 'task') {
    return {
      iconBackground: colors.warningSoft,
      iconColor: colors.warning,
    };
  }

  if (type === 'lux') {
    return {
      iconBackground: colors.warningSoft,
      iconColor: colors.warning,
    };
  }

  return {
    iconBackground: colors.accentSoft,
    iconColor: colors.primary,
  };
}

export default function ActivityCard({ activity }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const iconName = ICON_BY_TYPE[activity?.type] || ICON_BY_TYPE.case;
  const accentStyles = getAccentStyles(colors, activity?.type);

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <View style={[styles.iconWrapper, { backgroundColor: accentStyles.iconBackground }]}>
          <MaterialCommunityIcons color={accentStyles.iconColor} name={iconName} size={20} />
        </View>

        <View style={styles.copy}>
          <Text style={styles.title}>{activity?.title || 'Movimiento registrado'}</Text>
          <Text style={styles.description}>
            {activity?.description || 'Se registro un nuevo movimiento en el estudio.'}
          </Text>
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
          <View style={styles.referenceSpacer} />
        )}

        <Text style={styles.timestamp}>{formatDateTime(activity?.createdAt)}</Text>
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
    gap: 16,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 4,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  iconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 15,
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
    gap: 12,
  },
  referencePill: {
    flex: 1,
    backgroundColor: colors.backgroundAlt,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  referenceText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
  },
  referenceSpacer: {
    flex: 1,
  },
  timestamp: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'right',
  },
});
