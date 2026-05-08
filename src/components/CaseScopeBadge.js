import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { CASE_SCOPES } from '../services/api';
import { useAppTheme } from '../context/ThemeContext';

export default function CaseScopeBadge({
  scope = CASE_SCOPES.PRIVATE,
  legalStudyName,
  isReadOnly = false,
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isStudyCase = scope === CASE_SCOPES.LEGAL_STUDY;

  return (
    <View style={styles.row}>
      <View style={[styles.badge, isStudyCase ? styles.studyBadge : styles.privateBadge]}>
        <Text style={[styles.badgeText, isStudyCase ? styles.studyText : styles.privateText]}>
          {isStudyCase ? 'Estudio Juridico' : 'Privada'}
        </Text>
      </View>

      {isStudyCase && legalStudyName ? (
        <View style={[styles.badge, styles.nameBadge]}>
          <Text numberOfLines={1} style={[styles.badgeText, styles.nameText]}>
            {legalStudyName}
          </Text>
        </View>
      ) : null}

      {isReadOnly ? (
        <View style={[styles.badge, styles.readOnlyBadge]}>
          <Text style={[styles.badgeText, styles.readOnlyText]}>Solo lectura</Text>
        </View>
      ) : null}
    </View>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 12,
    },
    badge: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 999,
      borderWidth: 1,
    },
    privateBadge: {
      backgroundColor: colors.neutralSoft,
      borderColor: colors.borderSoft,
    },
    studyBadge: {
      backgroundColor: colors.accentSoft,
      borderColor: colors.accentStrong,
    },
    readOnlyBadge: {
      backgroundColor: colors.warningSoft,
      borderColor: colors.warning,
    },
    nameBadge: {
      backgroundColor: colors.card,
      borderColor: colors.borderSoft,
    },
    badgeText: {
      fontSize: 12,
      fontWeight: '700',
    },
    privateText: {
      color: colors.textSecondary,
    },
    studyText: {
      color: colors.primary,
    },
    readOnlyText: {
      color: colors.warning,
    },
    nameText: {
      color: colors.text,
      maxWidth: 180,
    },
  });
