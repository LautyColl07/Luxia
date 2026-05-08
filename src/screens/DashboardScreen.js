import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import CaseScopeBadge from '../components/CaseScopeBadge';
import CreateLegalStudyModal from '../components/CreateLegalStudyModal';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import HearingTimelineCard from '../components/HearingTimelineCard';
import InviteMemberModal from '../components/InviteMemberModal';
import LoadingState from '../components/LoadingState';
import MetricCard from '../components/MetricCard';
import QuickActionButton from '../components/QuickActionButton';
import WorkContextSelector from '../components/WorkContextSelector';
import { useAuth } from '../context/AuthContext';
import { useWorkContext } from '../context/WorkContextContext';
import { useAppTheme } from '../context/ThemeContext';
import {
  createLegalStudy,
  getCases,
  getDashboardResumen,
  getLegalStudies,
  getNotifications,
  inviteLegalStudyMember,
  WORK_CONTEXT_TYPES,
} from '../services/api';
import { formatDate } from '../utils/date';

export default function DashboardScreen({ navigation }) {
  const { colors } = useAppTheme();
  const { currentUser, isAuthReady } = useAuth();
  const { activeContext, isReady: isWorkContextReady, setActiveContext } = useWorkContext();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [dashboard, setDashboard] = useState(null);
  const [legalStudies, setLegalStudies] = useState([]);
  const [allCases, setAllCases] = useState([]);
  const [privateCases, setPrivateCases] = useState([]);
  const [selectedStudyCases, setSelectedStudyCases] = useState([]);
  const [notificationCount, setNotificationCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [createStudyVisible, setCreateStudyVisible] = useState(false);
  const [inviteVisible, setInviteVisible] = useState(false);
  const [submittingStudy, setSubmittingStudy] = useState(false);
  const [submittingInvite, setSubmittingInvite] = useState(false);

  const selectedStudy = useMemo(() => {
    if (!legalStudies.length) {
      return null;
    }

    if (activeContext?.type === WORK_CONTEXT_TYPES.LEGAL_STUDY) {
      return legalStudies.find((item) => String(item?.id) === String(activeContext?.legalStudyId)) || null;
    }

    return legalStudies[0] || null;
  }, [activeContext, legalStudies]);

  const loadDashboard = useCallback(
    async (isRefresh = false, contextOverride = activeContext) => {
      if (!isAuthReady || !isWorkContextReady) {
        return;
      }

      if (!currentUser) {
        setDashboard(null);
        setLegalStudies([]);
        setAllCases([]);
        setPrivateCases([]);
        setSelectedStudyCases([]);
        setNotificationCount(0);
        setError('No hay una sesion activa. Inicia sesion nuevamente.');
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

        const studies = await getLegalStudies();
        const effectiveContext = contextOverride || activeContext;
        const selectedLegalStudyId =
          effectiveContext?.type === WORK_CONTEXT_TYPES.LEGAL_STUDY
            ? effectiveContext?.legalStudyId
            : studies[0]?.id || null;

        const [resumen, notifications, visibleCases, personalCases, studyCases] = await Promise.all([
          getDashboardResumen(),
          getNotifications().catch(() => []),
          getCases({ scope: 'all' }),
          getCases({ scope: 'private' }),
          selectedLegalStudyId ? getCases({ scope: 'legal_study', legalStudyId: selectedLegalStudyId }) : Promise.resolve([]),
        ]);

        if (
          effectiveContext?.type === WORK_CONTEXT_TYPES.LEGAL_STUDY &&
          selectedLegalStudyId &&
          !studies.some((item) => String(item?.id) === String(selectedLegalStudyId))
        ) {
          await setActiveContext({ type: WORK_CONTEXT_TYPES.PERSONAL });
        }

        setDashboard(resumen);
        setLegalStudies(Array.isArray(studies) ? studies : []);
        setAllCases(Array.isArray(visibleCases) ? visibleCases : []);
        setPrivateCases(Array.isArray(personalCases) ? personalCases : []);
        setSelectedStudyCases(Array.isArray(studyCases) ? studyCases : []);
        setNotificationCount(
          Array.isArray(notifications) ? notifications.filter((item) => !item?.read).length : 0
        );
      } catch (loadError) {
        console.error('[DashboardScreen] Error cargando dashboard juridico:', loadError);
        setError(
          loadError instanceof Error
            ? loadError.message
            : 'No pudimos cargar la informacion del espacio de trabajo.'
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [activeContext, currentUser, isAuthReady, isWorkContextReady, setActiveContext]
  );

  useFocusEffect(
    useCallback(() => {
      if (!isAuthReady || !isWorkContextReady) {
        return undefined;
      }

      void loadDashboard();
      return undefined;
    }, [isAuthReady, isWorkContextReady, loadDashboard])
  );

  const handleRefresh = useCallback(() => {
    void loadDashboard(true);
  }, [loadDashboard]);

  const handleCreateStudy = useCallback(
    async (values, reset) => {
      if (!values?.name) {
        return;
      }

      try {
        setSubmittingStudy(true);
        const createdStudy = await createLegalStudy(values);
        reset?.();
        setCreateStudyVisible(false);
        const nextContext = {
          type: WORK_CONTEXT_TYPES.LEGAL_STUDY,
          legalStudyId: createdStudy?.id,
        };
        await setActiveContext(nextContext);
        await loadDashboard(false, nextContext);
      } catch (submitError) {
        setError(
          submitError instanceof Error
            ? submitError.message
            : 'No pudimos crear el Estudio Juridico.'
        );
      } finally {
        setSubmittingStudy(false);
      }
    },
    [loadDashboard, setActiveContext]
  );

  const handleInviteMember = useCallback(
    async (values, reset) => {
      if (!selectedStudy?.id || !values?.email) {
        return;
      }

      try {
        setSubmittingInvite(true);
        await inviteLegalStudyMember(selectedStudy.id, values);
        reset?.();
        setInviteVisible(false);
        await loadDashboard();
      } catch (submitError) {
        setError(
          submitError instanceof Error
            ? submitError.message
            : 'No pudimos invitar al miembro.'
        );
      } finally {
        setSubmittingInvite(false);
      }
    },
    [loadDashboard, selectedStudy]
  );

  const handleContextChange = useCallback(
    async (nextContext) => {
      await setActiveContext(nextContext);
      await loadDashboard(false, nextContext);
    },
    [loadDashboard, setActiveContext]
  );

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

  const selectedStudySummary = selectedStudyCases.length;
  const latestCases = [...allCases]
    .sort((first, second) => new Date(second?.updatedAt || second?.createdAt || 0) - new Date(first?.updatedAt || first?.createdAt || 0))
    .slice(0, 4);
  const proximasAudiencias = dashboard?.proximasAudiencias || [];
  const nombreUsuario = dashboard?.usuario?.nombre || 'Usuario';
  const selectedStudyCanInvite = Boolean(selectedStudy?.capabilities?.canInvite);

  const metricCards = [
    {
      label: 'Causas personales',
      value: privateCases.length,
      icon: 'account-lock-outline',
      accentColor: colors.primary,
      onPress: async () => {
        await setActiveContext({ type: WORK_CONTEXT_TYPES.PERSONAL });
        navigation.navigate('Causas');
      },
    },
    {
      label: selectedStudy ? `Causas en ${selectedStudy.name}` : 'Causas del estudio',
      value: selectedStudySummary,
      icon: 'office-building-outline',
      accentColor: colors.success,
      onPress: async () => {
        if (selectedStudy?.id) {
          await setActiveContext({
            type: WORK_CONTEXT_TYPES.LEGAL_STUDY,
            legalStudyId: selectedStudy.id,
          });
        }
        navigation.navigate('Causas');
      },
    },
    {
      label: 'Total disponible',
      value: allCases.length,
      icon: 'briefcase-search-outline',
      accentColor: colors.warning,
      onPress: async () => {
        await setActiveContext({ type: WORK_CONTEXT_TYPES.ALL });
        navigation.navigate('Causas');
      },
    },
  ];

  if ((loading && !dashboard && !legalStudies.length) || !isWorkContextReady) {
    return (
      <LoadingState
        title="Cargando panel juridico"
        message="Estamos actualizando tu espacio personal y tus Estudios Juridicos."
      />
    );
  }

  if (error && !dashboard && !legalStudies.length) {
    return (
      <ErrorState
        title="No pudimos cargar el panel principal"
        message={error}
        onRetry={loadDashboard}
      />
    );
  }

  return (
    <>
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

            <Pressable onPress={() => navigation.navigate('Mas')} style={styles.notificationButton}>
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
            Trabaja con tus causas privadas o dentro de un Estudio Juridico colaborativo.
          </Text>

          <View style={styles.contextCard}>
            <WorkContextSelector
              activeContext={activeContext}
              onChange={handleContextChange}
              studies={legalStudies}
            />
          </View>
        </View>

        <View style={styles.metricGrid}>
          {metricCards.map((item) => (
            <View key={item.label} style={styles.metricCell}>
              <MetricCard {...item} />
            </View>
          ))}
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionEyebrow}>ULTIMAS CAUSAS</Text>
          <Pressable onPress={() => navigation.navigate('Causas')}>
            <Text style={styles.sectionLink}>Ver todas</Text>
          </Pressable>
        </View>

        <View style={styles.sectionBlock}>
          {latestCases.length ? (
            latestCases.map((item) => (
              <Pressable
                key={String(item?.id)}
                onPress={() => navigation.navigate('CaseDetail', { caseId: item?.id })}
                style={styles.caseCard}
              >
                <View style={styles.caseTopRow}>
                  <Text style={styles.caseTitle}>{item?.title || 'Causa sin titulo'}</Text>
                  <Text style={styles.caseDate}>Actualizada {formatDate(item?.updatedAt || item?.createdAt)}</Text>
                </View>
                <Text style={styles.caseDescription}>
                  {item?.description || 'Sin informacion adicional registrada.'}
                </Text>
                <CaseScopeBadge
                  isReadOnly={item?.permissions?.isReadOnly}
                  legalStudyName={item?.legalStudyName}
                  scope={item?.scope}
                />
              </Pressable>
            ))
          ) : (
            <EmptyState
              actionLabel="Crear causa"
              icon="briefcase-plus-outline"
              message="Todavia no tenes causas visibles en tu espacio actual."
              onAction={() => navigation.navigate('NewCase')}
              title="Sin causas para mostrar"
            />
          )}
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionEyebrow}>ESTUDIOS JURIDICOS</Text>
          <Pressable onPress={() => navigation.navigate('LegalStudies')}>
            <Text style={styles.sectionLink}>Gestionar</Text>
          </Pressable>
        </View>

        <View style={styles.sectionBlock}>
          {legalStudies.length ? (
            legalStudies.map((study) => (
              <View key={study.id} style={styles.studyCard}>
                <View style={styles.studyTopRow}>
                  <View style={styles.studyCopy}>
                    <Text style={styles.studyTitle}>{study.name}</Text>
                    <Text style={styles.studyDescription}>
                      {study.description || 'Workspace juridico listo para compartir causas y actividad.'}
                    </Text>
                  </View>
                  <View style={styles.studyRoleBadge}>
                    <Text style={styles.studyRoleText}>{study.currentUserRoleLabel || 'Miembro'}</Text>
                  </View>
                </View>

                <Text style={styles.studyMeta}>
                  {study.membersCount} miembros activos · {study.pendingMembersCount || 0} pendientes
                </Text>
              </View>
            ))
          ) : (
            <EmptyState
              actionLabel="Crear Estudio Juridico"
              icon="office-building-plus-outline"
              message="Todavia no perteneces a ningun Estudio Juridico. Crea uno para trabajar con otros miembros y compartir causas."
              onAction={() => setCreateStudyVisible(true)}
              title="Todavia no perteneces a ningun Estudio Juridico."
            />
          )}
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionEyebrow}>PROXIMAS AUDIENCIAS</Text>
          <Pressable onPress={() => navigation.navigate('Calendario')}>
            <Text style={styles.sectionLink}>Ver calendario</Text>
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
          <EmptyState
            actionLabel="Registrar audiencia"
            icon="calendar-blank"
            message="No hay audiencias programadas para los proximos dias."
            onAction={() => navigation.navigate('NewHearing')}
            title="Agenda sin actividad proxima"
          />
        )}

        <View style={[styles.sectionHeader, styles.quickActionsHeader]}>
          <Text style={styles.sectionEyebrow}>ACCIONES PRINCIPALES</Text>
        </View>

        <View style={styles.quickActionsGrid}>
          <QuickActionButton
            icon="plus-box-outline"
            onPress={() => navigation.navigate('NewCase')}
            subtitle="Registra una causa particular o compartida con Estudio Juridico."
            title="Crear causa"
          />
          <QuickActionButton
            icon="office-building-plus-outline"
            onPress={() => setCreateStudyVisible(true)}
            subtitle="Crea un nuevo workspace juridico profesional."
            title="Crear Estudio Juridico"
          />
          {selectedStudyCanInvite ? (
            <QuickActionButton
              fullWidth
              icon="account-plus-outline"
              onPress={() => setInviteVisible(true)}
              subtitle={`Invita miembros a ${selectedStudy?.name}.`}
              title="Invitar miembro"
            />
          ) : null}
        </View>

        {error ? (
          <View style={styles.inlineAlert}>
            <MaterialCommunityIcons color={colors.danger} name="alert-outline" size={18} />
            <Text style={styles.inlineAlertText}>{error}</Text>
          </View>
        ) : null}
      </ScrollView>

      <CreateLegalStudyModal
        onClose={() => setCreateStudyVisible(false)}
        onSubmit={handleCreateStudy}
        submitting={submittingStudy}
        visible={createStudyVisible}
      />

      <InviteMemberModal
        legalStudyName={selectedStudy?.name}
        onClose={() => setInviteVisible(false)}
        onSubmit={handleInviteMember}
        submitting={submittingInvite}
        visible={inviteVisible}
      />
    </>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
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
    },
    contextCard: {
      marginTop: 20,
      backgroundColor: 'rgba(255,255,255,0.12)',
      borderRadius: 24,
      padding: 14,
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
    sectionBlock: {
      paddingHorizontal: 18,
      gap: 12,
    },
    caseCard: {
      backgroundColor: colors.card,
      borderRadius: 24,
      padding: 18,
      borderWidth: 1,
      borderColor: colors.borderSoft,
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.12,
      shadowRadius: 18,
      elevation: 4,
    },
    caseTopRow: {
      gap: 10,
    },
    caseTitle: {
      color: colors.text,
      fontSize: 17,
      fontWeight: '700',
    },
    caseDate: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: '600',
    },
    caseDescription: {
      color: colors.textSecondary,
      fontSize: 14,
      lineHeight: 20,
      marginTop: 12,
    },
    studyCard: {
      backgroundColor: colors.card,
      borderRadius: 24,
      padding: 18,
      borderWidth: 1,
      borderColor: colors.borderSoft,
    },
    studyTopRow: {
      flexDirection: 'row',
      gap: 12,
      alignItems: 'flex-start',
      justifyContent: 'space-between',
    },
    studyCopy: {
      flex: 1,
    },
    studyTitle: {
      color: colors.text,
      fontSize: 17,
      fontWeight: '700',
    },
    studyDescription: {
      color: colors.textSecondary,
      fontSize: 14,
      lineHeight: 20,
      marginTop: 8,
    },
    studyRoleBadge: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 999,
      backgroundColor: colors.accentSoft,
      borderWidth: 1,
      borderColor: colors.accentStrong,
    },
    studyRoleText: {
      color: colors.primary,
      fontSize: 12,
      fontWeight: '700',
    },
    studyMeta: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: '600',
      marginTop: 12,
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
