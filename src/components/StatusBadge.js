import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '../context/ThemeContext';
import { getStatusTone, normalizeStatusLabel } from '../utils/status';

export default function StatusBadge({ status, style, textStyle }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(), []);
  const toneStyles = useMemo(
    () => ({
      success: {
        backgroundColor: colors.successSoft,
        textColor: colors.success,
      },
      warning: {
        backgroundColor: colors.warningSoft,
        textColor: colors.warning,
      },
      danger: {
        backgroundColor: colors.dangerSoft,
        textColor: colors.danger,
      },
      neutral: {
        backgroundColor: colors.neutralSoft,
        textColor: colors.textSecondary,
      },
      default: {
        backgroundColor: colors.accentSoft,
        textColor: colors.primary,
      },
    }),
    [colors]
  );
  const label = normalizeStatusLabel(status);
  const tone = toneStyles[getStatusTone(status)] || toneStyles.default;

  return (
    <View style={[styles.badge, { backgroundColor: tone.backgroundColor }, style]}>
      <Text style={[styles.text, { color: tone.textColor }, textStyle]}>{label}</Text>
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  badge: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 12,
    fontWeight: '700',
  },
});
