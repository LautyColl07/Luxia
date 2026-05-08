import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import CreateLegalStudyModal from '../components/CreateLegalStudyModal';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import InviteMemberModal from '../components/InviteMemberModal';
import LoadingState from '../components/LoadingState';
import { useAppTheme } from '../context/ThemeContext';
import {
  createLegalStudy,
  getLegalStudies,
  getLegalStudyMembers,
  LEGAL_STUDY_ROLES,
  MEMBER_STATUSES,
  inviteLegalStudyMember,
  removeLegalStudyMember,
  updateLegalStudyMember,
} from '../services/api';

const MANAGEABLE_ROLES = [
  LEGAL_STUDY_ROLES.ADMIN,
  LEGAL_STUDY_ROLES.MEMBER,
  LEGAL_STUDY_ROLES.VIEWER,
];

export default function LegalStudiesScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [legalStudies, setLegalStudies] = useState([]);
  const [membersByStudyId, setMembersByStudyId] = useState({});
  const [expandedStudyId, setExpandedStudyId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [inviteModalVisible, setInviteModalVisible] = useState(false);
  const [submittingCreate, setSubmittingCreate] = useState(false);
  const [submittingInvite, setSubmittingInvite] = useState(false);
  const [targetStudy, setTargetStudy] = useState(null);

  const loadLegalStudies = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError('');
      const studies = await getLegalStudies();
      setLegalStudies(Array.isArray(studies) ? studies : []);
    } catch (loadError) {
      console.error('[LegalStudiesScreen] Error cargando estudios:', loadError);
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'No pudimos cargar los Estudios Juridicos.'
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadLegalStudies();
      return undefined;
    }, [loadLegalStudies])
  );

  const loadMembers = useCallback(async (study) => {
    try {
      const members = await getLegalStudyMembers(study.id);
      setMembersByStudyId((current) => ({
        ...current,
        [study.id]: Array.isArray(members) ? members : [],
      }));
      setExpandedStudyId(study.id);
    } catch (membersError) {
      setError(
        membersError instanceof Error
          ? membersError.message
          : 'No pudimos cargar los miembros del estudio.'
      );
    }
  }, []);

  const handleCreateStudy = useCallback(
    async (values, reset) => {
      if (!values?.name) {
        return;
      }

      try {
        setSubmittingCreate(true);
        await createLegalStudy(values);
        reset?.();
        setCreateModalVisible(false);
        await loadLegalStudies();
      } catch (submitError) {
        setError(
          submitError instanceof Error
            ? submitError.message
            : 'No pudimos crear el Estudio Juridico.'
        );
      } finally {
        setSubmittingCreate(false);
      }
    },
    [loadLegalStudies]
  );

  const handleInviteMember = useCallback(
    async (values, reset) => {
      if (!targetStudy?.id || !values?.email) {
        return;
      }

      try {
        setSubmittingInvite(true);
        await inviteLegalStudyMember(targetStudy.id, values);
        reset?.();
        setInviteModalVisible(false);
        await loadMembers(targetStudy);
        await loadLegalStudies();
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
    [loadLegalStudies, loadMembers, targetStudy]
  );

  const handleChangeRole = useCallback(
    (study, member) => {
      Alert.alert('Cambiar rol', `Selecciona el nuevo rol para ${member?.user?.name || 'este miembro'}.`, [
        { text: 'Cancelar', style: 'cancel' },
        ...MANAGEABLE_ROLES.map((role) => ({
          text: role,
          onPress: async () => {
            try {
              await updateLegalStudyMember(study.id, member.id, { role });
              await loadMembers(study);
              await loadLegalStudies();
            } catch (updateError) {
              setError(
                updateError instanceof Error
                  ? updateError.message
                  : 'No pudimos cambiar el rol.'
              );
            }
          },
        })),
      ]);
    },
    [loadLegalStudies, loadMembers]
  );

  const handleRemoveMember = useCallback(
    (study, member) => {
      Alert.alert(
        'Remover miembro',
        `Vas a remover a ${member?.user?.name || 'este miembro'} del Estudio Juridico.`,
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Remover',
            style: 'destructive',
            onPress: async () => {
              try {
                await removeLegalStudyMember(study.id, member.id);
                await loadMembers(study);
                await loadLegalStudies();
              } catch (removeError) {
                setError(
                  removeError instanceof Error
                    ? removeError.message
                    : 'No pudimos remover al miembro.'
                );
              }
            },
          },
        ]
      );
    },
    [loadLegalStudies, loadMembers]
  );

  if (loading && !legalStudies.length) {
    return (
      <LoadingState
        title="Cargando Estudios Juridicos"
        message="Estamos reuniendo tus workspaces, miembros y permisos disponibles."
      />
    );
  }

  if (error && !legalStudies.length) {
    return (
      <ErrorState
        title="No pudimos cargar los Estudios Juridicos"
        message={error}
        onRetry={loadLegalStudies}
      />
    );
  }

  return (
    <>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            onRefresh={() => void loadLegalStudies(true)}
            refreshing={refreshing}
            tintColor={colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
        style={styles.screen}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Estudios Juridicos</Text>
          <Text style={styles.subtitle}>
            Crea workspaces juridicos, invita miembros y gestiona roles profesionales.
          </Text>
        </View>

        <Pressable onPress={() => setCreateModalVisible(true)} style={styles.primaryButton}>
          <MaterialCommunityIcons color={colors.textOnPrimary} name="office-building-plus-outline" size={18} />
          <Text style={styles.primaryButtonText}>Crear Estudio Juridico</Text>
        </Pressable>

        {legalStudies.length ? (
          legalStudies.map((study) => {
            const members = membersByStudyId[study.id] || [];
            const isExpanded = expandedStudyId === study.id;

            return (
              <View key={study.id} style={styles.studyCard}>
                <View style={styles.studyTopRow}>
                  <View style={styles.studyCopy}>
                    <Text style={styles.studyTitle}>{study.name}</Text>
                    <Text style={styles.studyDescription}>
                      {study.description || 'Sin descripcion registrada.'}
                    </Text>
                  </View>

                  <View style={styles.rolePill}>
                    <Text style={styles.rolePillText}>{study.currentUserRoleLabel || 'Miembro'}</Text>
                  </View>
                </View>

                <Text style={styles.metaText}>
                  {study.membersCount} miembros activos · {study.pendingMembersCount || 0} pendientes
                </Text>

                <View style={styles.actionsRow}>
                  <Pressable
                    onPress={() => (isExpanded ? setExpandedStudyId(null) : void loadMembers(study))}
                    style={styles.secondaryAction}
                  >
                    <Text style={styles.secondaryActionText}>
                      {isExpanded ? 'Ocultar miembros' : 'Ver miembros'}
                    </Text>
                  </Pressable>

                  {study.capabilities?.canInvite ? (
                    <Pressable
                      onPress={() => {
                        setTargetStudy(study);
                        setInviteModalVisible(true);
                      }}
                      style={styles.secondaryAction}
                    >
                      <Text style={styles.secondaryActionText}>Invitar miembro</Text>
                    </Pressable>
                  ) : null}
                </View>

                {isExpanded ? (
                  <View style={styles.membersSection}>
                    {members.length ? (
                      members.map((member) => (
                        <View key={member.id} style={styles.memberCard}>
                          <View style={styles.memberTopRow}>
                            <View style={styles.memberCopy}>
                              <Text style={styles.memberName}>{member?.user?.name || 'Miembro'}</Text>
                              <Text style={styles.memberEmail}>{member?.user?.email || 'Sin email'}</Text>
                            </View>
                            <View style={styles.memberBadges}>
                              <View style={styles.memberRoleBadge}>
                                <Text style={styles.memberRoleText}>{member.roleLabel}</Text>
                              </View>
                              <View
                                style={[
                                  styles.memberStatusBadge,
                                  member.status === MEMBER_STATUSES.PENDING && styles.memberStatusPending,
                                  member.status === MEMBER_STATUSES.REMOVED && styles.memberStatusRemoved,
                                ]}
                              >
                                <Text style={styles.memberStatusText}>{member.statusLabel}</Text>
                              </View>
                            </View>
                          </View>

                          {study.capabilities?.canManage && member.role !== LEGAL_STUDY_ROLES.OWNER ? (
                            <View style={styles.memberActionsRow}>
                              <Pressable
                                onPress={() => handleChangeRole(study, member)}
                                style={styles.memberAction}
                              >
                                <Text style={styles.memberActionText}>Cambiar rol</Text>
                              </Pressable>
                              <Pressable
                                onPress={() => handleRemoveMember(study, member)}
                                style={styles.memberDangerAction}
                              >
                                <Text style={styles.memberDangerActionText}>Remover</Text>
                              </Pressable>
                            </View>
                          ) : null}
                        </View>
                      ))
                    ) : (
                      <EmptyState
                        icon="account-group-outline"
                        message="Todavia no hay miembros cargados en este Estudio Juridico."
                        title="Sin miembros para mostrar"
                      />
                    )}
                  </View>
                ) : null}
              </View>
            );
          })
        ) : (
          <EmptyState
            actionLabel="Crear Estudio Juridico"
            icon="office-building-plus-outline"
            message="Crea un espacio colaborativo para compartir causas, audiencias, documentos y analisis."
            onAction={() => setCreateModalVisible(true)}
            title="Todavia no perteneces a ningun Estudio Juridico."
          />
        )}

        {error ? (
          <View style={styles.inlineAlert}>
            <MaterialCommunityIcons color={colors.danger} name="alert-outline" size={18} />
            <Text style={styles.inlineAlertText}>{error}</Text>
          </View>
        ) : null}
      </ScrollView>

      <CreateLegalStudyModal
        onClose={() => setCreateModalVisible(false)}
        onSubmit={handleCreateStudy}
        submitting={submittingCreate}
        visible={createModalVisible}
      />

      <InviteMemberModal
        legalStudyName={targetStudy?.name}
        onClose={() => setInviteModalVisible(false)}
        onSubmit={handleInviteMember}
        submitting={submittingInvite}
        visible={inviteModalVisible}
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
      padding: 20,
      gap: 16,
      paddingBottom: 34,
    },
    header: {
      gap: 8,
    },
    title: {
      color: colors.text,
      fontSize: 28,
      fontWeight: '700',
    },
    subtitle: {
      color: colors.textSecondary,
      fontSize: 14,
      lineHeight: 20,
    },
    primaryButton: {
      backgroundColor: colors.primary,
      borderRadius: 18,
      paddingHorizontal: 18,
      paddingVertical: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      alignSelf: 'flex-start',
    },
    primaryButtonText: {
      color: colors.textOnPrimary,
      fontSize: 14,
      fontWeight: '700',
    },
    studyCard: {
      backgroundColor: colors.card,
      borderRadius: 24,
      padding: 18,
      borderWidth: 1,
      borderColor: colors.borderSoft,
      gap: 12,
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
      fontSize: 18,
      fontWeight: '700',
    },
    studyDescription: {
      color: colors.textSecondary,
      fontSize: 14,
      lineHeight: 20,
      marginTop: 6,
    },
    rolePill: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: colors.accentSoft,
      borderWidth: 1,
      borderColor: colors.accentStrong,
    },
    rolePillText: {
      color: colors.primary,
      fontSize: 12,
      fontWeight: '700',
    },
    metaText: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: '600',
    },
    actionsRow: {
      flexDirection: 'row',
      gap: 10,
      flexWrap: 'wrap',
    },
    secondaryAction: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 14,
      backgroundColor: colors.backgroundAlt,
      borderWidth: 1,
      borderColor: colors.borderSoft,
    },
    secondaryActionText: {
      color: colors.text,
      fontSize: 13,
      fontWeight: '700',
    },
    membersSection: {
      gap: 10,
      marginTop: 4,
    },
    memberCard: {
      borderRadius: 18,
      padding: 14,
      backgroundColor: colors.backgroundAlt,
      borderWidth: 1,
      borderColor: colors.borderSoft,
      gap: 10,
    },
    memberTopRow: {
      flexDirection: 'row',
      gap: 12,
      justifyContent: 'space-between',
      alignItems: 'flex-start',
    },
    memberCopy: {
      flex: 1,
    },
    memberName: {
      color: colors.text,
      fontSize: 15,
      fontWeight: '700',
    },
    memberEmail: {
      color: colors.textSecondary,
      fontSize: 13,
      marginTop: 4,
    },
    memberBadges: {
      alignItems: 'flex-end',
      gap: 8,
    },
    memberRoleBadge: {
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: 999,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.borderSoft,
    },
    memberRoleText: {
      color: colors.text,
      fontSize: 12,
      fontWeight: '700',
    },
    memberStatusBadge: {
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: 999,
      backgroundColor: colors.successSoft,
      borderWidth: 1,
      borderColor: colors.success,
    },
    memberStatusPending: {
      backgroundColor: colors.warningSoft,
      borderColor: colors.warning,
    },
    memberStatusRemoved: {
      backgroundColor: colors.dangerSoft,
      borderColor: colors.danger,
    },
    memberStatusText: {
      color: colors.text,
      fontSize: 12,
      fontWeight: '700',
    },
    memberActionsRow: {
      flexDirection: 'row',
      gap: 10,
      flexWrap: 'wrap',
    },
    memberAction: {
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.borderSoft,
    },
    memberActionText: {
      color: colors.text,
      fontSize: 13,
      fontWeight: '700',
    },
    memberDangerAction: {
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: colors.dangerSoft,
      borderWidth: 1,
      borderColor: colors.danger,
    },
    memberDangerActionText: {
      color: colors.danger,
      fontSize: 13,
      fontWeight: '700',
    },
    inlineAlert: {
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
