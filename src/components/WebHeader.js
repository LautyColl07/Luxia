import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '../context/ThemeContext';

const SECTION_LABELS = {
  Inicio: 'Panel principal',
  Causas: 'Expedientes y seguimiento',
  Calendario: 'Agenda judicial',
  Documentos: 'Repositorio documental',
  Mas: 'Preferencias y actividad',
};

export default function WebHeader({ activeRoute = 'Inicio' }) {
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  const sectionLabel = SECTION_LABELS[activeRoute] || 'Espacio de trabajo';

  return (
    <View style={styles.header}>
      <View style={styles.breadcrumbs}>
        <Text style={styles.breadcrumbMuted}>LuxIA</Text>
        <MaterialCommunityIcons color={colors.textMuted} name="chevron-right" size={16} />
        <Text style={styles.breadcrumbCurrent}>{sectionLabel}</Text>
      </View>
      <View style={styles.statusPill}>
        <View style={styles.statusDot} />
        <Text style={styles.statusText}>Modo escritorio</Text>
      </View>
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  header: {
    minHeight: 70,
    paddingHorizontal: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
    backgroundColor: colors.background,
  },
  breadcrumbs: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  breadcrumbMuted: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  breadcrumbCurrent: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: colors.successSoft,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.success,
  },
  statusText: {
    color: colors.success,
    fontSize: 11,
    fontWeight: '700',
  },
});
