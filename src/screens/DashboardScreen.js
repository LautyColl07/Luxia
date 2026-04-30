import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import HearingTimelineCard from '../components/HearingTimelineCard';
import LoadingState from '../components/LoadingState';
import MetricCard from '../components/MetricCard';
import QuickActionButton from '../components/QuickActionButton';
import colors from '../constants/colors';
import { getDashboardResumen, getNotifications } from '../services/api';

export default function DashboardScreen({ navigation }) {
  const [dashboard, setDashboard] = useState(null);
  const [notificationCount, setNotificationCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadDashboard = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError('');
      const [resumen, notifications] = await Promise.all([getDashboardResumen(), getNotifications()]);
      setDashboard(resumen);
      setNotificationCount(notifications.filter((item) => !item.read).length);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadDashboard();
    }, [loadDashboard])
  );

  const handleRefresh = useCallback(() => {
    void loadDashboard(true);
  }, [loadDashboard]);

  const handleNotificationsPress = useCallback(() => {
    navigation.navigate('Más');
  }, [navigation]);

  const handleOpenCalendar = useCallback(() => {
    navigation.navigate('Calendario');
  }, [navigation]);

  const handleCreateCase = useCallback(() => {
    navigation.navigate('NewCase');
  }, [navigation]);

  const handleUploadDocument = useCallback(() => {
    navigation.navigate('UploadDocument');
  }, [navigation]);

  const handleCreateHearing = useCallback(() => {
    navigation.navigate('NewHearing');
  }, [navigation]);

  const handleOpenHearing = useCallback((hearing) => {
    if (hearing?.caseId) {
      navigation.navigate('CaseDetail', { caseId: hearing.caseId });
      return;
    }

    navigation.navigate('Calendario');
  }, [navigation]);

  if (loading && !dashboard) {
    return <LoadingState />;
  }

  if (error && !dashboard) {
    return <ErrorState message={error} onRetry={loadDashboard} />;
  }

  const metricCards = [
    {
      label: 'Causas activas',
      value: dashboard.metricas.causasActivas,
      icon: 'briefcase-variant-outline',
      accentColor: colors.primary,
    },
    {
      label: 'Audiencias de hoy',
      value: dashboard.metricas.audienciasHoy,
      icon: 'calendar-clock',
      accentColor: colors.success,
    },
    {
      label: 'Documentos',
      value: dashboard.metricas.documentos,
      icon: 'file-document-outline',
      accentColor: colors.warning,
    },
    {
      label: 'Tareas pendientes',
      value: dashboard.metricas.tareasPendientes,
      icon: 'clipboard-text-clock-outline',
      accentColor: colors.danger,
    },
  ];

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl onRefresh={handleRefresh} refreshing={refreshing} tintColor={colors.primary} />}
      showsVerticalScrollIndicator={false}
      style={styles.screen}
    >
      <View style={styles.hero}>
        <View style={styles.heroShapeLarge} />
        <View style={styles.heroShapeSmall} />

        <View style={styles.heroTopRow}>
          <Text style={styles.brand}>LUXIA</Text>

          <Pressable onPress={handleNotificationsPress} style={styles.notificationButton}>
            <MaterialCommunityIcons color={colors.card} name="bell-outline" size={24} />
            {notificationCount > 0 ? (
              <View style={styles.notificationBadge}>
                <Text style={styles.notificationBadgeText}>{notificationCount}</Text>
              </View>
            ) : null}
          </Pressable>
        </View>

        <Text style={styles.greeting}>Hola, {dashboard.usuario.nombre} 👋</Text>
        <Text style={styles.subtitle}>Resumen de tus juicios y próximas tareas</Text>
      </View>

      <View style={styles.metricGrid}>
        {metricCards.map((item) => (
          <View key={item.label} style={styles.metricCell}>
            <MetricCard {...item} />
          </View>
        ))}
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionEyebrow}>PRÓXIMAS AUDIENCIAS</Text>
        <Pressable onPress={handleOpenCalendar}>
          <Text style={styles.sectionLink}>Ver calendario →</Text>
        </Pressable>
      </View>

      {dashboard.proximasAudiencias.length ? (
        dashboard.proximasAudiencias.map((hearing, index) => (
          <HearingTimelineCard
            hearing={hearing}
            isLast={index === dashboard.proximasAudiencias.length - 1}
            key={hearing.id}
            onPressAction={() => handleOpenHearing(hearing)}
          />
        ))
      ) : (
        <EmptyState
          icon="calendar-blank"
          message="Todavía no hay audiencias futuras cargadas. Cuando existan, las vas a ver acá mismo."
          title="Sin audiencias próximas"
        />
      )}

      <View style={[styles.sectionHeader, styles.quickActionsHeader]}>
        <Text style={styles.sectionEyebrow}>ACCIONES RÁPIDAS</Text>
      </View>

      <View style={styles.quickActionsGrid}>
        <QuickActionButton
          icon="plus-box-outline"
          onPress={handleCreateCase}
          subtitle="Alta rápida de expediente"
          title="Nueva Causa"
        />
        <QuickActionButton
          icon="tray-arrow-up"
          onPress={handleUploadDocument}
          subtitle="Adjuntar pieza procesal"
          title="Subir Documento"
        />
        <QuickActionButton
          icon="calendar-plus"
          onPress={handleCreateHearing}
          subtitle="Agenda una audiencia"
          title="Programar Audiencia"
        />
      </View>

      {error ? (
        <View style={styles.inlineAlert}>
          <MaterialCommunityIcons color={colors.danger} name="alert-outline" size={18} />
          <Text style={styles.inlineAlertText}>{error}</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingBottom: 34,
  },
  hero: {
    backgroundColor: colors.primary,
    borderBottomLeftRadius: 34,
    borderBottomRightRadius: 34,
    paddingTop: 62,
    paddingHorizontal: 22,
    paddingBottom: 28,
    overflow: 'hidden',
  },
  heroShapeLarge: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(255,255,255,0.05)',
    top: -40,
    right: -70,
  },
  heroShapeSmall: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.07)',
    bottom: -20,
    left: -30,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: {
    color: colors.card,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 1.6,
  },
  notificationButton: {
    width: 48,
    height: 48,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#F0A500',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  notificationBadgeText: {
    color: colors.card,
    fontSize: 10,
    fontWeight: '700',
  },
  greeting: {
    color: colors.card,
    fontSize: 30,
    fontWeight: '700',
    marginTop: 28,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
    maxWidth: '82%',
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 18,
    marginTop: -18,
  },
  metricCell: {
    width: '50%',
    padding: 6,
  },
  sectionHeader: {
    paddingHorizontal: 22,
    marginTop: 24,
    marginBottom: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionEyebrow: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  sectionLink: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  quickActionsHeader: {
    marginBottom: 12,
  },
  quickActionsGrid: {
    paddingHorizontal: 18,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  inlineAlert: {
    marginTop: 18,
    marginHorizontal: 22,
    backgroundColor: '#FCEBEC',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  inlineAlertText: {
    color: colors.danger,
    fontSize: 13,
    flex: 1,
  },
});
