import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import HearingTimelineCard from '../components/HearingTimelineCard';
import LoadingState from '../components/LoadingState';
import LuxAssistantButton from '../components/LuxAssistantButton';
import LuxAssistantModal from '../components/LuxAssistantModal';
import MetricCard from '../components/MetricCard';
import QuickActionButton from '../components/QuickActionButton';
import { useAuth } from '../context/AuthContext';
import { useAppTheme } from '../context/ThemeContext';
import { getDashboardResumen, getNotifications } from '../services/api';

export default function DashboardScreen({ navigation }) {
  const { colors } = useAppTheme();
  const { currentUser, isAuthReady } = useAuth();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [dashboard, setDashboard] = useState(null);
  const [notificationCount, setNotificationCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [isLuxVisible, setIsLuxVisible] = useState(false);

  const loadDashboard = useCallback(async (isRefresh = false) => {
    if (!isAuthReady) {
      return;
    }

    if (!currentUser) {
      setDashboard(null);
      setNotificationCount(0);
      setError('No hay una sesión activa. Iniciá sesión nuevamente.');
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError('');
      const [resumen, notifications] = await Promise.all([
        getDashboardResumen(),
        getNotifications(),
      ]);
      setDashboard(resumen);
      setNotificationCount(notifications.filter((item) => !item?.read).length);
    } catch (loadError) {
      console.error('[DashboardScreen] Error cargando metricas:', loadError);
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'No pudimos cargar la informacion del panel inicial.'
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentUser, isAuthReady]);

  useFocusEffect(
    useCallback(() => {
      if (!isAuthReady) {
        return undefined;
      }

      void loadDashboard();
      return undefined;
    }, [isAuthReady, loadDashboard])
  );

  const handleRefresh = useCallback(() => {
    void loadDashboard(true);
  }, [loadDashboard]);

  const handleNotificationsPress = useCallback(() => {
    navigation.navigate('Mas');
  }, [navigation]);

  const handleOpenCalendar = useCallback(() => {
    navigation.navigate('Calendario');
  }, [navigation]);

  const handleOpenCases = useCallback(() => {
    navigation.navigate('Causas');
  }, [navigation]);

  const handleOpenDocuments = useCallback(() => {
    navigation.navigate('Documentos');
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

  const handleCreateTask = useCallback(() => {
    navigation.navigate('NewTask');
  }, [navigation]);

  const handleOpenHearing = useCallback(
    (hearing) => {
      if (hearing?.caseId) {
        navigation.navigate('CaseDetail', { caseId: hearing.caseId });
        return;
      }

      navigation.navigate('Calendario');
    },
    [navigation]
  );

  const handleOpenLux = useCallback(() => {
    setIsLuxVisible(true);
  }, []);

  const handleCloseLux = useCallback(() => {
    setIsLuxVisible(false);
  }, []);

  const data = dashboard ?? null;
  const metricas = data?.metricas || {
    causasActivas: 0,
    audienciasHoy: 0,
    documentos: 0,
    tareasPendientes: 0,
  };
  const proximasAudiencias = data?.proximasAudiencias || [];
  const nombreUsuario = data?.usuario?.nombre || 'Usuario';
  const luxContext = useMemo(
    () => ({
      screen: 'dashboard',
    }),
    []
  );

  const metricCards = [
    {
      label: 'Causas activas',
      value: metricas?.causasActivas ?? 0,
      icon: 'briefcase-variant-outline',
      accentColor: colors.primary,
      onPress: handleOpenCases,
    },
    {
      label: 'Audiencias de hoy',
      value: metricas?.audienciasHoy ?? 0,
      icon: 'calendar-clock',
      accentColor: colors.success,
      onPress: handleOpenCalendar,
    },
    {
      label: 'Documentos registrados',
      value: metricas?.documentos ?? 0,
      icon: 'file-document-outline',
      accentColor: colors.warning,
      onPress: handleOpenDocuments,
    },
    {
      label: 'Tareas pendientes',
      value: metricas?.tareasPendientes ?? 0,
      icon: 'clipboard-text-clock-outline',
      accentColor: colors.danger,
      onPress: handleCreateTask,
    },
  ];

  if (loading && !dashboard) {
    return (
      <LoadingState
        title="Cargando panel principal"
        message="Estamos actualizando tus causas, audiencias y documentos."
      />
    );
  }

  if (error && !dashboard) {
    return (
      <ErrorState
        title="No pudimos cargar el panel principal"
        message={error}
        onRetry={loadDashboard}
      />
    );
  }

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            onRefresh={handleRefresh}
            refreshing={refreshing}
            tintColor={colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
        style={styles.screen}
      >
        <View style={styles.hero}>
          <View style={styles.heroShapeLarge} />
          <View style={styles.heroShapeSmall} />

          <View style={styles.heroTopRow}>
            <Text style={styles.brand}>LUXIA</Text>

            <Pressable onPress={handleNotificationsPress} style={styles.notificationButton}>
              <MaterialCommunityIcons color={colors.textOnPrimary} name="bell-outline" size={24} />
              {notificationCount > 0 ? (
                <View style={styles.notificationBadge}>
                  <Text style={styles.notificationBadgeText}>{notificationCount}</Text>
                </View>
              ) : null}
            </Pressable>
          </View>

          <Text style={styles.greeting}>Hola, {nombreUsuario}</Text>
          <Text style={styles.subtitle}>
            Gestiona tus causas, audiencias y documentos desde un solo lugar.
          </Text>
        </View>

        <View style={styles.metricGrid}>
          {metricCards.map((item) => (
            <View key={item.label} style={styles.metricCell}>
              <MetricCard {...item} />
            </View>
          ))}
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionEyebrow}>PROXIMAS AUDIENCIAS</Text>
          <Pressable onPress={handleOpenCalendar}>
            <Text style={styles.sectionLink}>Ver calendario</Text>
          </Pressable>
        </View>

        {proximasAudiencias.length ? (
          proximasAudiencias.map((hearing, index) => {
            console.log('[Dashboard] audiencia recibida:', JSON.stringify(hearing, null, 2));

            return (
              <HearingTimelineCard
                hearing={hearing}
                isLast={index === proximasAudiencias.length - 1}
                key={hearing?.id ?? `${hearing?.title}-${index}`}
                onPressAction={() => handleOpenHearing(hearing)}
              />
            );
          })
        ) : (
          <EmptyState
            actionLabel="Programar audiencia"
            icon="calendar-blank"
            message="No hay audiencias programadas para los proximos dias."
            onAction={handleCreateHearing}
            title="Agenda sin actividad proxima"
          />
        )}

        <View style={[styles.sectionHeader, styles.quickActionsHeader]}>
          <Text style={styles.sectionEyebrow}>ACCIONES PRINCIPALES</Text>
        </View>

        <View style={styles.quickActionsGrid}>
          <QuickActionButton
            icon="plus-box-outline"
            onPress={handleCreateCase}
            subtitle="Registra un nuevo expediente con sus datos principales."
            title="Nueva causa"
          />
          <QuickActionButton
            icon="tray-arrow-up"
            onPress={handleUploadDocument}
            subtitle="Incorpora escritos, anexos o prueba documental."
            title="Subir documento"
          />
          <QuickActionButton
            icon="calendar-plus"
            fullWidth
            onPress={handleCreateHearing}
            subtitle="Agenda una audiencia y vinculala a una causa."
            title="Registrar audiencia"
          />
          <QuickActionButton
            icon="clipboard-plus-outline"
            fullWidth
            onPress={handleCreateTask}
            subtitle="Registra una tarea o actividad y asociala a una causa."
            title="Registrar tarea"
          />
        </View>

        {error ? (
          <View style={styles.inlineAlert}>
            <MaterialCommunityIcons color={colors.danger} name="alert-outline" size={18} />
            <Text style={styles.inlineAlertText}>{error}</Text>
          </View>
        ) : null}
      </ScrollView>

      <LuxAssistantButton onPress={handleOpenLux} />
      <LuxAssistantModal context={luxContext} onClose={handleCloseLux} visible={isLuxVisible} />
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingBottom: 34,
  },
  hero: {
    backgroundColor: colors.primaryDeep,
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
    color: colors.textOnPrimary,
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
    backgroundColor: colors.warning,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  notificationBadgeText: {
    color: colors.textOnPrimary,
    fontSize: 10,
    fontWeight: '700',
  },
  greeting: {
    color: colors.textOnPrimary,
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
    aspectRatio: 1.05,
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
    backgroundColor: colors.dangerSoft,
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
