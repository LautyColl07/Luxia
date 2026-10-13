import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Image, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import CaseScopeSelector from '../components/CaseScopeSelector';
import ErrorState from '../components/ErrorState';
import HearingTimelineCard from '../components/HearingTimelineCard';
import LoadingState from '../components/LoadingState';
import LuxAssistantBanner from '../components/LuxAssistantBanner';
import LuxAssistantModal from '../components/LuxAssistantModal';
import MetricCard from '../components/MetricCard';
import QuickActionButton from '../components/QuickActionButton';

import { useAuth } from '../context/AuthContext';
import { useStudyContext } from '../context/StudyContext';
import { useAppTheme } from '../context/ThemeContext';
import { getDashboardBootstrap } from '../services/api';
import { useResponsiveLayout } from '../theme/layout';
import { getUserDisplayName, getUserInitials } from '../utils/userDisplay';

export default function DashboardScreen({ navigation }) {
  const { colors, isDark } = useAppTheme();
  const insets = useSafeAreaInsets();
  const layout = useResponsiveLayout();
  const isFocused = useIsFocused();
  const { authStatus, currentUser, isAuthReady } = useAuth();
  const { activeContext, activeContextKey, legalStudies, refreshLegalStudies, selectPersonalContext, selectStudyContext, isHydrated } = useStudyContext();
  const styles = useMemo(
    () => createStyles(colors, layout, insets.top, isDark),
    [colors, insets.top, isDark, layout]
  );
  const [dashboard, setDashboard] = useState(null);
  const [notificationCount, setNotificationCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [isLuxVisible, setIsLuxVisible] = useState(false);
  const [studyPickerVisible, setStudyPickerVisible] = useState(false);
  const activeLoadRef = useRef(null);
  const activeLoadKeyRef = useRef(null);
  const loadSequenceRef = useRef(0);
  const isFocusedRef = useRef(false);

  const loadDashboard = useCallback(async (isRefresh = false) => {
    if (!isAuthReady || !isHydrated || authStatus === 'initializing') {
      return;
    }

    if (!currentUser || authStatus === 'unauthenticated') {
      setDashboard(null);
      setNotificationCount(0);
      setError('No hay una sesión activa. Iniciá sesión nuevamente.');
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (authStatus !== 'authenticated') {
      setLoading(false);
      setRefreshing(false);
      setError('No pudimos conectarnos. Revisá tu conexión e intentá nuevamente.');
      return;
    }

    if (activeLoadRef.current && activeLoadKeyRef.current === activeContextKey) {
      return activeLoadRef.current;
    }

    const loadId = loadSequenceRef.current + 1;
    loadSequenceRef.current = loadId;

    const loadPromise = (async () => {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
        setDashboard(null);
      }

      setError('');
      const { resumen, notificationCount: unreadCount } = await getDashboardBootstrap({
        force: isRefresh,
      });

      if (!isFocusedRef.current || loadSequenceRef.current !== loadId) {
        return;
      }

      setDashboard(resumen);
      setNotificationCount(unreadCount);
    })();

    activeLoadRef.current = loadPromise;
    activeLoadKeyRef.current = activeContextKey;

    try {
      await loadPromise;
    } catch (loadError) {
      if (isFocusedRef.current && loadSequenceRef.current === loadId) {
        if (__DEV__) {
          console.warn('[DashboardScreen] No se pudieron actualizar las metricas.');
        }
        setError(
          loadError && (loadError.status === 401 || loadError.status === 403)
            ? 'Tu sesión expiró. Iniciá sesión nuevamente.'
            : 'No pudimos conectarnos. Revisá tu conexión e intentá nuevamente.'
        );
      }
    } finally {
      if (activeLoadRef.current === loadPromise) {
        activeLoadRef.current = null;
        activeLoadKeyRef.current = null;
      }

      if (isFocusedRef.current && loadSequenceRef.current === loadId) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [activeContextKey, authStatus, currentUser?.uid, isAuthReady, isHydrated]);

  useFocusEffect(
    useCallback(() => {
      if (!isAuthReady || !isHydrated || authStatus === 'initializing') {
        return undefined;
      }

      isFocusedRef.current = true;
      void loadDashboard();
      return () => {
        isFocusedRef.current = false;
      };
    }, [authStatus, isAuthReady, isHydrated, loadDashboard])
  );

  const handleRefresh = useCallback(() => {
    void refreshLegalStudies();
    void loadDashboard(true);
  }, [loadDashboard, refreshLegalStudies]);

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

  const handleOpenActivityHistory = useCallback(() => {
    navigation.navigate('ActivityHistory');
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
  const nombreUsuario = getUserDisplayName(data?.usuario, currentUser);
  const userInitials = getUserInitials(data?.usuario, currentUser);
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
      accentColor: colors.info,
      onPress: handleOpenCases,
    },
    {
      label: 'Audiencias de hoy',
      value: metricas?.audienciasHoy ?? 0,
      icon: 'calendar-clock',
      accentColor: colors.warning,
      onPress: handleOpenCalendar,
    },
    {
      label: 'Documentos registrados',
      value: metricas?.documentos ?? 0,
      icon: 'file-document-outline',
      accentColor: colors.success,
      onPress: handleOpenDocuments,
    },
    {
      label: 'Tareas pendientes',
      value: metricas?.tareasPendientes ?? 0,
      icon: 'check-circle-outline',
      accentColor: colors.danger,
      onPress: handleOpenCalendar,
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
      {isFocused && !layout.isWebDesktop ? <StatusBar style="light" /> : null}
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl onRefresh={handleRefresh} refreshing={refreshing} tintColor={colors.primary} />
        }
        showsVerticalScrollIndicator={false}
        style={styles.screen}
      >
        <View style={styles.hero}>
          <View style={styles.heroTopRow}>
            <Text accessibilityLabel="LuxIA" style={styles.brand}>
              LUX<Text style={styles.brandAccent}>IA</Text>
            </Text>
            <View style={styles.heroActions}>
              <Pressable
                accessibilityLabel={notificationCount > 0 ? `Notificaciones: ${notificationCount} sin leer` : 'Notificaciones'}
                accessibilityRole="button"
                onPress={handleNotificationsPress}
                style={({ focused, pressed }) => [
                  styles.notificationButton,
                  focused && styles.heroButtonFocused,
                  pressed && styles.pressed,
                ]}
              >
                <MaterialCommunityIcons color={colors.textOnPrimary} name="bell-outline" size={24} />
                {notificationCount > 0 ? (
                  <View style={styles.notificationBadge}>
                    <Text style={styles.notificationBadgeText}>{notificationCount}</Text>
                  </View>
                ) : null}
              </Pressable>
              <Pressable
                accessibilityLabel="Ver mi perfil"
                accessibilityRole="button"
                onPress={handleNotificationsPress}
                style={({ focused, pressed }) => [
                  styles.avatar,
                  focused && styles.heroButtonFocused,
                  pressed && styles.pressed,
                ]}
              >
                {currentUser?.photoURL ? (
                  <Image source={{ uri: currentUser.photoURL }} style={styles.avatarImage} />
                ) : <Text style={styles.avatarText}>{userInitials}</Text>}
              </Pressable>
            </View>
          </View>
          <Text style={styles.greeting}>Hola, {nombreUsuario}</Text>
          <View style={styles.contextSelector}>
            <CaseScopeSelector
              value={activeContext.type}
              studyAvailable={legalStudies.length > 0}
              onValueChange={(nextScope) => {
                if (nextScope === 'personal') selectPersonalContext();
                else if (legalStudies.length) selectStudyContext(
                  legalStudies.find((study) => String(study.id) === String(activeContext.legalStudyId)) || legalStudies[0]
                );
              }}
            />
          </View>
          {activeContext.type === 'study' && legalStudies.length > 1 ? (
            <Pressable accessibilityRole="button" onPress={() => setStudyPickerVisible(true)} style={styles.studyPickerTrigger}>
              <Text style={styles.studyPickerTriggerText}>{activeContext.name}{legalStudies.filter((study) => study.name === activeContext.name).length > 1 ? ` · ${String(activeContext.legalStudyId).slice(-6)}` : ''}</Text>
              <MaterialCommunityIcons color={colors.textOnPrimary} name="chevron-down" size={17} />
            </Pressable>
          ) : null}
        </View>

        <View style={styles.body}>
          <View style={styles.metricGrid}>
            {metricCards.map((item, index) => (
              <View key={item.label} style={[styles.metricCell, index > 0 && styles.metricDivider]}>
                <MetricCard {...item} />
              </View>
            ))}
          </View>

          <LuxAssistantBanner isActive={isFocused && !isLuxVisible} onPress={handleOpenLux} />

          <View style={styles.hearingsSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Próximas audiencias</Text>
              <Pressable
                accessibilityRole="button"
                onPress={handleOpenCalendar}
                style={({ focused, pressed }) => [styles.calendarLink, focused && styles.focused, pressed && styles.pressed]}
              >
                <Text style={styles.sectionLink}>Ver calendario</Text>
                <MaterialCommunityIcons color={colors.info} name="arrow-right" size={17} />
              </Pressable>
            </View>
            {proximasAudiencias.length ? (
              proximasAudiencias.map((hearing, index) => (
                <HearingTimelineCard
                  hearing={hearing}
                  isLast={index === proximasAudiencias.length - 1}
                  key={hearing?.id ?? `${hearing?.title}-${index}`}
                  onPressAction={() => handleOpenHearing(hearing)}
                />
              ))
            ) : (
              <View style={styles.emptySection}>
                <Text style={styles.emptyText}>No hay audiencias programadas próximamente</Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={handleCreateHearing}
                  style={({ focused, pressed }) => [styles.emptyAction, focused && styles.focused, pressed && styles.pressed]}
                >
                  <MaterialCommunityIcons color={colors.primary} name="calendar-plus" size={17} />
                  <Text style={styles.emptyActionText}>Programar audiencia</Text>
                </Pressable>
              </View>
            )}
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={handleOpenActivityHistory}
            style={({ focused, hovered, pressed }) => [
              styles.activityShortcut,
              hovered && styles.hovered,
              focused && styles.focused,
              pressed && styles.pressed,
            ]}
          >
            <MaterialCommunityIcons color={colors.primary} name="history" size={20} />
            <Text style={styles.activityShortcutTitle}>Historial de actividad</Text>
            <MaterialCommunityIcons color={colors.textMuted} name="chevron-right" size={20} />
          </Pressable>

          <Text style={styles.actionsHeading}>Acciones principales</Text>
          <View style={styles.quickActionsGrid}>
            {[
              { icon: 'plus-box-outline', title: 'Nueva causa', onPress: handleCreateCase },
              { icon: 'tray-arrow-up', title: 'Subir documento', onPress: handleUploadDocument },
              { icon: 'calendar-plus', title: 'Registrar audiencia', onPress: handleCreateHearing },
            ].map((action) => (
              <QuickActionButton compact key={action.title} {...action} />
            ))}
          </View>
          {error ? (
            <View accessibilityRole="alert" style={styles.inlineAlert}>
              <MaterialCommunityIcons color={colors.danger} name="alert-outline" size={18} />
              <Text style={styles.inlineAlertText}>{error}</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>
      <LuxAssistantModal context={luxContext} onClose={handleCloseLux} visible={isLuxVisible} />
      <Modal transparent animationType="fade" visible={studyPickerVisible} onRequestClose={() => setStudyPickerVisible(false)}>
        <Pressable style={styles.studyPickerBackdrop} onPress={() => setStudyPickerVisible(false)}>
          <View style={styles.studyPickerPanel}>
            <Text style={styles.studyPickerTitle}>Elegí un estudio</Text>
            {legalStudies.map((study) => (
              <Pressable
                accessibilityRole="button"
                key={study.id}
                onPress={() => { selectStudyContext(study); setStudyPickerVisible(false); }}
                style={styles.studyPickerOption}
              >
                <Text style={styles.studyPickerOptionText}>{study.name}{legalStudies.filter((item) => item.name === study.name).length > 1 ? ` · ${String(study.id).slice(-6)}` : ''}</Text>
                {String(activeContext.legalStudyId) === String(study.id) ? <MaterialCommunityIcons color={colors.primary} name="check" size={18} /> : null}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const createStyles = (colors, layout, topInset, isDark) => StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background
  },
  screen: {
    flex: 1,
    backgroundColor: colors.background
  },
  content: {
    width: '100%',
    maxWidth: 1080,
    alignSelf: 'center',
    paddingBottom: 28
  },
  hero: {
    backgroundColor: colors.primaryDeep,
    paddingTop: Math.max(topInset + 16, 24),
    paddingHorizontal: layout.isPhone ? layout.gutter + 6 : 28,
    paddingBottom: 18,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    ...(layout.isWebDesktop ? {
      marginHorizontal: layout.gutter,
      marginTop: 20,
      borderRadius: 20,
      paddingTop: 24,
      paddingBottom: 24
    } : {})
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12
  },
  brand: {
    color: colors.textOnPrimary,
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: 1.8
  },
  brandAccent: {
    color: colors.gold
  },
  heroActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  notificationButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: isDark ? colors.accentStrong : 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)'
  },
  heroButtonFocused: {
    borderColor: colors.focusRing
  },
  notificationBadge: {
    position: 'absolute',
    top: 1,
    right: 0,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4
  },
  notificationBadgeText: {
    color: colors.primaryDeep,
    fontSize: 10,
    fontWeight: '700'
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.sidebarMark,
    overflow: 'hidden'
  },
  avatarText: {
    color: colors.textOnPrimary,
    fontSize: 14,
    fontWeight: '700'
  },
  avatarImage: {
    width: '100%',
    height: '100%'
  },
  greeting: {
    color: colors.textOnPrimary,
    fontSize: layout.isCompact ? 26 : 29,
    fontWeight: '700',
    letterSpacing: -0.5,
    marginTop: 20
  },
  contextSelector: {
    marginTop: layout.isPhone ? 38 : 26,
    alignItems: 'center'
  },
  studyPickerTrigger: {
    alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 4,
    minHeight: 32, paddingHorizontal: 10, marginTop: 4
  },
  studyPickerTriggerText: { color: colors.textOnPrimary, fontSize: 12, fontWeight: '600' },
  studyPickerBackdrop: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.48)', padding: 24
  },
  studyPickerPanel: { width: '100%', maxWidth: 360, borderRadius: 16, backgroundColor: colors.card, padding: 18 },
  studyPickerTitle: { color: colors.text, fontSize: 18, fontWeight: '700', marginBottom: 8 },
  studyPickerOption: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
  studyPickerOptionText: { color: colors.text, fontSize: 14 },
  body: {
    paddingHorizontal: layout.gutter,
    gap: 14
  },
  metricGrid: {
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingVertical: 18
  },
  metricCell: {
    flex: 1,
    minWidth: 0
  },
  metricDivider: {
    borderLeftWidth: 1,
    borderLeftColor: colors.borderSoft
  },
  hearingsSection: {
    backgroundColor: colors.card,
    borderRadius: 16,
    paddingHorizontal: layout.isCompact ? 10 : 14,
    paddingBottom: 6
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    columnGap: 6,
    paddingTop: 5,
    paddingBottom: 2
  },
  sectionTitle: {
    color: colors.text,
    fontSize: layout.isCompact ? 17 : 19,
    fontWeight: '700',
    letterSpacing: -0.4
  },
  calendarLink: {
    flexDirection: 'row',
    gap: 5,
    alignItems: 'center',
    minHeight: 44,
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: 8,
    paddingHorizontal: 2
  },
  sectionLink: {
    color: colors.info,
    fontSize: layout.isCompact ? 11 : 12
  },
  emptySection: {
    alignItems: 'flex-start',
    paddingVertical: 16,
    gap: 10
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 20
  },
  emptyAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 22,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: 'transparent'
  },
  emptyActionText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '600'
  },
  activityShortcut: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 48,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: 12
  },
  activityShortcutTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
    flex: 1
  },
  actionsHeading: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4
  },
  quickActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  hovered: {
    backgroundColor: colors.accentSoft
  },
  focused: {
    borderColor: colors.focusRing
  },
  pressed: {
    opacity: 0.75
  },
  inlineAlert: {
    backgroundColor: colors.dangerSoft,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center'
  },
  inlineAlertText: {
    color: colors.danger,
    fontSize: 13,
    flex: 1
  }
});
