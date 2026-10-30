import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import HearingRecordingPanel from '../components/HearingRecordingPanel';
import LoadingState from '../components/LoadingState';
import StatusBadge from '../components/StatusBadge';
import { getCaseCourtType } from '../constants/caseCourtTypes';
import { useAuth } from '../context/AuthContext';
import { useStudyContext } from '../context/StudyContext';
import { useAppTheme } from '../context/ThemeContext';
import { getCaseById, moveCaseToStudy } from '../services/api';
import { useResponsiveLayout } from '../theme/layout';
import { formatDate, formatDateTime } from '../utils/date';

export default function CaseDetailScreen({ navigation, route }) {
  const { colors } = useAppTheme();
  const { activeContextKey, legalStudies, selectStudyContext } = useStudyContext();
  const { currentUser } = useAuth();
  const layout = useResponsiveLayout();
  const styles = useMemo(() => createStyles(colors, layout), [colors, layout]);
  const caseId = route?.params?.caseId;
  const [caseDetail, setCaseDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [moveError, setMoveError] = useState('');
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [moving, setMoving] = useState(false);
  const requestSequenceRef = useRef(0);

  const loadCase = useCallback(async () => {
    const requestId = ++requestSequenceRef.current;
    try {
      setLoading(true);
      setCaseDetail(null);
      setError('');
      const item = await getCaseById(caseId);
      if (requestSequenceRef.current !== requestId) return;
      setCaseDetail(item);
    } catch (loadError) {
      if (requestSequenceRef.current !== requestId) return;
      console.error('[CaseDetailScreen] No se pudo cargar la causa.');
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'No pudimos cargar el detalle de la causa.'
      );
    } finally {
      if (requestSequenceRef.current === requestId) setLoading(false);
    }
  }, [activeContextKey, caseId]);

  useFocusEffect(
    useCallback(() => {
      void loadCase();
      return () => { requestSequenceRef.current += 1; };
    }, [loadCase])
  );

  if (loading && !caseDetail) {
    return (
      <LoadingState
        title="Cargando detalle de la causa"
        message="Estamos reuniendo audiencias, documentos y tareas relacionadas."
      />
    );
  }

  if (error && !caseDetail) {
    return (
      <ErrorState
        title="No pudimos abrir esta causa"
        message={error}
        onRetry={loadCase}
      />
    );
  }

  const hearings = caseDetail?.hearings || [];
  const documents = caseDetail?.documents || [];
  const tasks = caseDetail?.tasks || [];
  const sourceStudy = legalStudies.find((study) => String(study.id) === String(caseDetail?.legalStudyId));
  const canMove = caseDetail?.canMoveToStudy ??
    (caseDetail?.ownerUserId === currentUser?.uid &&
      (caseDetail?.scope === 'PRIVATE' || ['OWNER', 'ADMIN'].includes(sourceStudy?.role)));
  const targetStudies = legalStudies.filter((study) =>
    String(study.id) !== String(caseDetail?.legalStudyId) && ['OWNER', 'ADMIN', 'MEMBER'].includes(study.role)
  );
  const courtType = getCaseCourtType(caseDetail?.courtType);
  const confirmMove = (study) => {
    const proceed = async () => {
      try {
        setMoving(true);
        setMoveError('');
        await moveCaseToStudy(caseId, study.id);
        selectStudyContext(study);
        setShowMoveModal(false);
        setCaseDetail(null);
        setLoading(true);
      } catch (moveFailure) {
        setMoveError(moveFailure instanceof Error ? moveFailure.message : 'No pudimos mover la causa.');
      } finally {
        setMoving(false);
      }
    };
    const message = caseDetail?.scope === 'LEGAL_STUDY'
      ? `La causa, sus audiencias y documentos pasarán a ${study.name}. Los integrantes del estudio anterior dejarán de verla.`
      : `La causa, sus audiencias y documentos serán visibles para los integrantes de ${study.name}.`;
    if (Platform.OS === 'web') {
      if (globalThis.confirm(message)) void proceed();
    } else {
      Alert.alert('Confirmar pertenencia', message, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Confirmar', onPress: () => void proceed() },
      ]);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} style={styles.screen}>
      <View style={styles.heroCard}>
        <View style={styles.heroHeader}>
          <View style={styles.heroCopy}>
            <Text style={styles.title}>{caseDetail?.title || 'Causa sin titulo'}</Text>
            <Text style={styles.description}>
              {caseDetail?.description || 'Sin informacion adicional registrada.'}
            </Text>
          </View>
          <StatusBadge status={caseDetail?.status} />
        </View>

        <View style={styles.metaRow}>
          <MaterialCommunityIcons color={colors.textSecondary} name="scale-balance" size={16} />
          <Text style={styles.metaText}>{caseDetail?.court || 'Juzgado a confirmar'}</Text>
        </View>

        {caseDetail?.courtType ? <View style={styles.metaRow}>
          <MaterialCommunityIcons color={courtType.color} name={courtType.icon} size={17} />
          <Text style={styles.metaText}>{courtType.label}</Text>
        </View> : null}

        <View style={styles.metaRow}>
          <MaterialCommunityIcons color={colors.textSecondary} name="calendar-outline" size={16} />
          <Text style={styles.metaText}>Fecha de alta: {formatDate(caseDetail?.createdAt)}</Text>
        </View>

        <Pressable
          onPress={() => navigation.navigate('NewHearing', { caseId: caseDetail?.id })}
          style={styles.primaryButton}
        >
          <Text style={styles.primaryButtonText}>Registrar audiencia</Text>
          <MaterialCommunityIcons color={colors.textOnPrimary} name="arrow-right" size={18} />
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => navigation.navigate('NewCase', { caseId: caseDetail?.id })} style={styles.editCaseButton}>
          <MaterialCommunityIcons color={colors.primary} name="pencil-outline" size={18} />
          <Text style={styles.editCaseButtonText}>Editar causa</Text>
        </Pressable>
        {canMove && targetStudies.length ? (
          <Pressable accessibilityRole="button" onPress={() => { setMoveError(''); setShowMoveModal(true); }} style={styles.moveButton}>
            <MaterialCommunityIcons color={colors.primary} name="account-group-outline" size={18} />
            <Text style={styles.moveButtonText}>{caseDetail?.scope === 'PRIVATE' ? 'Compartir con un estudio' : 'Mover a otro estudio'}</Text>
          </Pressable>
        ) : null}
      </View>
      <Modal transparent animationType="fade" visible={showMoveModal} onRequestClose={() => setShowMoveModal(false)}>
        <View style={styles.moveBackdrop}>
          <View style={styles.movePanel}>
            <Text style={styles.moveTitle}>Elegí el estudio de destino</Text>
            {targetStudies.map((study) => (
              <Pressable disabled={moving} key={study.id} onPress={() => confirmMove(study)} style={styles.moveOption}>
                <Text style={styles.moveOptionText}>{study.name}{legalStudies.filter((item) => item.name === study.name).length > 1 ? ` · ${String(study.id).slice(-6)}` : ''}</Text>
                <MaterialCommunityIcons color={colors.primary} name="chevron-right" size={20} />
              </Pressable>
            ))}
            {moveError ? <Text accessibilityRole="alert" style={styles.moveError}>{moveError}</Text> : null}
            <Pressable disabled={moving} onPress={() => setShowMoveModal(false)} style={styles.moveOption}>
              <Text style={styles.moveOptionText}>Cancelar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Section colors={colors} styles={styles} title="Audiencias">
        {hearings.length ? (
          hearings.map((hearing) => (
            <View key={hearing?.id} style={styles.sectionCard}>
              <View style={styles.sectionCardHeader}>
                <View style={styles.sectionCardCopy}>
                  <Text style={styles.sectionCardTitle}>{hearing?.title || 'Audiencia sin titulo'}</Text>
                  <Text style={styles.sectionCardSubtitle}>{formatDateTime(hearing?.date)}</Text>
                </View>
                <StatusBadge status={hearing?.status} />
              </View>
              <Text style={styles.sectionCardMeta}>
                {hearing?.modality || 'Modalidad a confirmar'}
                {hearing?.location ? ` · ${hearing.location}` : ''}
              </Text>
              <HearingRecordingPanel
                caseDetail={caseDetail}
                documents={documents}
                hearing={hearing}
                onDocumentsChanged={loadCase}
                onViewDocuments={() => navigation.navigate('MainTabs', { screen: 'Documentos' })}
              />
            </View>
          ))
        ) : (
          <EmptyState
            actionLabel="Registrar audiencia"
            icon="calendar-blank-outline"
            message="Todavia no hay audiencias vinculadas a esta causa."
            onAction={() => navigation.navigate('NewHearing', { caseId: caseDetail?.id })}
            title="Sin audiencias registradas"
          />
        )}
      </Section>

      <Section
        actionLabel="Subir documento"
        colors={colors}
        onAction={() => navigation.navigate('UploadDocument', { caseId: caseDetail?.id })}
        styles={styles}
        title="Documentos"
      >
        {documents.length ? (
          documents.map((document) => (
            <View key={document?.id} style={styles.sectionCard}>
              <Text style={styles.sectionCardTitle}>{document?.fileName || 'Documento sin nombre'}</Text>
              <Text style={styles.sectionCardSubtitle}>{document?.documentType || 'Documento'}</Text>
              <Text style={styles.sectionCardMeta}>
                Fecha de carga: {formatDate(document?.uploadedAt)}
              </Text>
            </View>
          ))
        ) : (
          <EmptyState
            actionLabel="Subir documento"
            icon="file-document-outline"
            message="Todavia no se cargaron documentos para esta causa."
            onAction={() => navigation.navigate('UploadDocument', { caseId: caseDetail?.id })}
            title="Sin documentos registrados"
          />
        )}
      </Section>

      <Section colors={colors} styles={styles} title="Tareas">
        {tasks.length ? (
          tasks.map((task) => (
            <View key={task?.id} style={styles.taskRow}>
              <View style={[styles.taskIcon, task?.completed ? styles.taskIconDone : styles.taskIconPending]}>
                <MaterialCommunityIcons
                  color={task?.completed ? colors.success : colors.primary}
                  name={task?.completed ? 'check' : 'clock-outline'}
                  size={18}
                />
              </View>
              <View style={styles.taskContent}>
                <Text style={styles.sectionCardTitle}>{task?.title || 'Tarea sin titulo'}</Text>
                <Text style={styles.sectionCardMeta}>
                  {task?.completed ? 'Finalizada' : 'Pendiente'}
                  {task?.dueDate ? ` · Vencimiento: ${formatDate(task.dueDate)}` : ''}
                </Text>
              </View>
            </View>
          ))
        ) : (
          <EmptyState
            icon="clipboard-check-outline"
            message="No hay tareas registradas para esta causa."
            title="Sin tareas pendientes"
          />
        )}
      </Section>

      {error ? (
        <View style={styles.inlineError}>
          <MaterialCommunityIcons color={colors.danger} name="alert-outline" size={18} />
          <Text style={styles.inlineErrorText}>{error}</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

function Section({ actionLabel, children, colors, onAction, styles, title }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {actionLabel && onAction ? (
          <Pressable onPress={onAction} style={styles.sectionAction}>
            <MaterialCommunityIcons color={colors.primary} name="plus" size={16} />
            <Text style={styles.sectionActionText}>{actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={styles.sectionContent}>{children}</View>
    </View>
  );
}

const createStyles = (colors, layout) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    width: '100%',
    maxWidth: layout.readingMaxWidth,
    alignSelf: 'center',
    padding: layout.gutter,
    gap: 22,
    paddingBottom: 34,
  },
  heroCard: {
    backgroundColor: colors.card,
    borderRadius: 28,
    padding: 22,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.14,
    shadowRadius: 18,
    elevation: 4,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  heroCopy: {
    flex: 1,
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
  },
  description: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 12,
    marginBottom: 14,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    marginTop: 6,
  },
  metaText: {
    color: colors.textSecondary,
    fontSize: 13,
    flex: 1,
  },
  primaryButton: {
    minHeight: 48,
    marginTop: 18,
    backgroundColor: colors.primary,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 13,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  primaryButtonText: {
    color: colors.textOnPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  editCaseButton: { minHeight: 44, marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 8 },
  editCaseButtonText: { color: colors.primary, fontSize: 14, fontWeight: '600' },
  moveButton: { minHeight: 44, marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  moveButtonText: { color: colors.primary, fontSize: 14, fontWeight: '600' },
  moveBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  movePanel: { width: '100%', maxWidth: 420, alignSelf: 'center', backgroundColor: colors.card, borderRadius: 18, padding: 18 },
  moveTitle: { color: colors.text, fontSize: 18, fontWeight: '700', marginBottom: 10 },
  moveOption: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
  moveOptionText: { color: colors.text, fontSize: 14, flex: 1 },
  moveError: { color: colors.danger, fontSize: 13, marginTop: 10 },
  section: {
    gap: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  sectionAction: {
    minHeight: 36,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: colors.accentSoft,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sectionActionText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  sectionContent: {
    gap: 12,
  },
  sectionCard: {
    backgroundColor: colors.card,
    borderRadius: 22,
    padding: 18,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 3,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  sectionCardHeader: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  sectionCardCopy: {
    flex: 1,
  },
  sectionCardTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  sectionCardSubtitle: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 6,
  },
  sectionCardMeta: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 6,
    lineHeight: 20,
  },
  taskRow: {
    backgroundColor: colors.card,
    borderRadius: 22,
    padding: 16,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 3,
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  taskIcon: {
    width: 42,
    height: 42,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  taskIconPending: {
    backgroundColor: colors.accentSoft,
  },
  taskIconDone: {
    backgroundColor: colors.successSoft,
  },
  taskContent: {
    flex: 1,
  },
  inlineError: {
    backgroundColor: colors.dangerSoft,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  inlineErrorText: {
    color: colors.danger,
    fontSize: 13,
    flex: 1,
  },
});
