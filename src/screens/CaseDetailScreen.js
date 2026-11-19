import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import HearingRecordingPanel from '../components/HearingRecordingPanel';
import LoadingState from '../components/LoadingState';
import StatusBadge from '../components/StatusBadge';
import { getCaseCourtType } from '../constants/caseCourtTypes';
import { useAuth } from '../context/AuthContext';
import { useStudyContext } from '../context/StudyContext';
import { useAppTheme } from '../context/ThemeContext';
import { deleteCase, getCaseById, moveCaseToStudy } from '../services/api';
import { useResponsiveLayout } from '../theme/layout';
import { groupHearingsForDisplay, sortHearingsByDate } from '../utils/caseHearings';
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
  const [deleting, setDeleting] = useState(false);
  const [hearingSectionsExpanded, setHearingSectionsExpanded] = useState({
    inProgress: true,
    upcoming: true,
    recent: true,
  });
  const [hearingOrder, setHearingOrder] = useState({
    inProgress: 'newest',
    upcoming: 'oldest',
    recent: 'newest',
  });
  const [transcriptionExpandedByHearing, setTranscriptionExpandedByHearing] = useState({});
  const [activeHearingIds, setActiveHearingIds] = useState({});
  const [hearingListY, setHearingListY] = useState(null);
  const [hearingLayoutVersion, setHearingLayoutVersion] = useState(0);
  const [highlightedHearingId, setHighlightedHearingId] = useState(null);
  const [clockNow, setClockNow] = useState(() => Date.now());
  const requestSequenceRef = useRef(0);
  const scrollRef = useRef(null);
  const hearingLayoutsRef = useRef(new Map());
  const consumedHearingIntentRef = useRef(null);
  const hearingIdIntent = route?.params?.hearingId;
  const notificationIntentId = route?.params?.notificationIntentId;

  useEffect(() => {
    setHearingSectionsExpanded({ inProgress: true, upcoming: true, recent: true });
    setHearingOrder({ inProgress: 'newest', upcoming: 'oldest', recent: 'newest' });
    setTranscriptionExpandedByHearing({});
    setActiveHearingIds({});
    setHearingListY(null);
    hearingLayoutsRef.current.clear();
    setHighlightedHearingId(null);
    consumedHearingIntentRef.current = null;
  }, [caseId]);

  const loadCase = useCallback(async ({ preserveExisting = false } = {}) => {
    const requestId = ++requestSequenceRef.current;
    try {
      setLoading(true);
      if (!preserveExisting) setCaseDetail(null);
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

  const refreshCase = useCallback(() => loadCase({ preserveExisting: true }), [loadCase]);

  const groupedHearings = groupHearingsForDisplay(caseDetail?.hearings || [], clockNow);
  const hearingSections = [
    {
      key: 'inProgress',
      title: 'Audiencias en Curso',
      dateField: 'date',
      hearings: sortHearingsByDate(groupedHearings.inProgressHearings, 'date', hearingOrder.inProgress),
      emptyMessage: 'No hay audiencias en curso.',
    },
    {
      key: 'upcoming',
      title: 'Próximas Audiencias',
      dateField: 'date',
      hearings: sortHearingsByDate(
        [...groupedHearings.upcomingHearings, ...groupedHearings.undatedHearings],
        'date',
        hearingOrder.upcoming,
        true
      ),
      emptyMessage: 'No hay próximas audiencias programadas.',
    },
    {
      key: 'recent',
      title: 'Audiencias Recientes',
      dateField: 'completedAt',
      hearings: sortHearingsByDate(groupedHearings.recentHearings, 'completedAt', hearingOrder.recent),
      emptyMessage: 'Todavía no hay audiencias finalizadas.',
    },
  ];
  const handleHearingActivityChange = useCallback((hearingKey, active) => {
    setActiveHearingIds((current) => {
      if (Boolean(current[hearingKey]) === active) return current;
      const next = { ...current };
      if (active) next[hearingKey] = true;
      else delete next[hearingKey];
      return next;
    });
  }, []);
  const handleHearingLayout = useCallback((hearingKey, event) => {
    const y = event?.nativeEvent?.layout?.y;
    if (!Number.isFinite(y)) return;
    hearingLayoutsRef.current.set(hearingKey, y);
    setHearingLayoutVersion((version) => version + 1);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadCase();
      const timer = setInterval(() => setClockNow(Date.now()), 15000);
      return () => { clearInterval(timer); requestSequenceRef.current += 1; };
    }, [loadCase])
  );

  useEffect(() => {
    if (!caseDetail || hearingIdIntent == null) return;
    const intentKey = notificationIntentId || String(caseId) + ':' + String(hearingIdIntent);
    if (consumedHearingIntentRef.current === intentKey) return;

    const hearingKey = String(hearingIdIntent);
    const section = hearingSections.find((item) =>
      item.hearings.some((hearing) => String(hearing?.id ?? hearing?.hearingId ?? hearing?.audienciaId) === hearingKey)
    );
    if (!section) {
      consumedHearingIntentRef.current = intentKey;
      navigation.setParams({ hearingId: undefined, notificationIntentId: undefined });
      return;
    }

    if (hearingSectionsExpanded[section.key] === false) {
      setHearingSectionsExpanded((current) => ({ ...current, [section.key]: true }));
      return;
    }

    const cardY = hearingLayoutsRef.current.get(hearingKey);
    if (hearingListY == null || cardY == null) return;

    consumedHearingIntentRef.current = intentKey;
    setHighlightedHearingId(hearingIdIntent);
    scrollRef.current?.scrollTo({ y: Math.max(0, hearingListY + cardY - 24), animated: true });
    navigation.setParams({ hearingId: undefined, notificationIntentId: undefined });
  }, [
    caseDetail,
    caseId,
    hearingIdIntent,
    hearingLayoutVersion,
    hearingListY,
    hearingSections,
    hearingSectionsExpanded,
    navigation,
    notificationIntentId,
  ]);

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

  const documents = caseDetail?.documents || [];
  const tasks = caseDetail?.tasks || [];
  const sourceStudy = legalStudies.find((study) => String(study.id) === String(caseDetail?.legalStudyId));
  const canMove = caseDetail?.canMoveToStudy ??
    (caseDetail?.ownerUserId === currentUser?.uid &&
      (caseDetail?.scope === 'PRIVATE' || ['OWNER', 'ADMIN'].includes(sourceStudy?.role)));
  const targetStudies = legalStudies.filter((study) =>
    String(study.id) !== String(caseDetail?.legalStudyId) && study.role === 'ADMIN'
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

  const performDelete = async () => {
    if (deleting || caseDetail?.canDeleteCase !== true) return;
    try {
      setDeleting(true);
      await deleteCase(caseId);
      setCaseDetail(null);
      navigation.goBack();
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : 'No pudimos eliminar la causa.';
      if (Platform.OS === 'web') globalThis.alert(message);
      else Alert.alert('No pudimos eliminar la causa', message);
    } finally {
      setDeleting(false);
    }
  };

  const confirmDelete = () => {
    if (deleting || caseDetail?.canDeleteCase !== true) return;
    const message = 'La causa dejará de aparecer en el estudio. Sus documentos se conservarán.';
    if (Platform.OS === 'web') {
      if (globalThis.confirm(`Eliminar causa\n\n${message}`)) void performDelete();
      return;
    }
    Alert.alert('Eliminar causa', message, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: () => void performDelete() },
    ]);
  };

  return (
    <ScrollView ref={scrollRef} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} style={styles.screen}>
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

        {caseDetail?.canEditCase === true ? <Pressable
          onPress={() => navigation.navigate('NewHearing', { caseId: caseDetail?.id })}
          style={styles.primaryButton}
        >
          <Text style={styles.primaryButtonText}>Registrar audiencia</Text>
          <MaterialCommunityIcons color={colors.textOnPrimary} name="arrow-right" size={18} />
        </Pressable> : null}
        {caseDetail?.canEditCase === true ? <Pressable accessibilityRole="button" onPress={() => navigation.navigate('NewCase', { caseId: caseDetail?.id })} style={styles.editCaseButton}>
          <MaterialCommunityIcons color={colors.primary} name="pencil-outline" size={18} />
          <Text style={styles.editCaseButtonText}>Editar causa</Text>
        </Pressable> : null}
        {canMove && targetStudies.length ? (
          <Pressable accessibilityRole="button" onPress={() => { setMoveError(''); setShowMoveModal(true); }} style={styles.moveButton}>
            <MaterialCommunityIcons color={colors.primary} name="account-group-outline" size={18} />
            <Text style={styles.moveButtonText}>{caseDetail?.scope === 'PRIVATE' ? 'Compartir con un estudio' : 'Mover a otro estudio'}</Text>
          </Pressable>
        ) : null}
        {caseDetail?.canDeleteCase === true ? <Pressable accessibilityRole="button" disabled={deleting} onPress={confirmDelete} style={styles.deleteCaseButton}>
          <MaterialCommunityIcons color={colors.danger} name="delete-outline" size={18} />
          <Text style={styles.deleteCaseButtonText}>{deleting ? 'Eliminando…' : 'Eliminar causa'}</Text>
        </Pressable> : null}
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

      {/* Keep cards as keyed siblings so time-based group changes preserve recorder state. */}
      <View
        onLayout={(event) => {
          const y = event?.nativeEvent?.layout?.y;
          if (Number.isFinite(y)) setHearingListY(y);
        }}
        style={styles.hearingSections}
      >
        {hearingSections.flatMap((section) => {
          const expanded = hearingSectionsExpanded[section.key] !== false;
          const elements = [
            <HearingSectionHeader
              key={'section-' + section.key}
              title={section.title}
              count={section.hearings.length}
              emptyMessage={section.emptyMessage}
              expanded={expanded}
              onToggleExpanded={() => setHearingSectionsExpanded((current) => ({
                ...current,
                [section.key]: !expanded,
              }))}
              order={hearingOrder[section.key]}
              onToggleOrder={() => setHearingOrder((current) => ({
                ...current,
                [section.key]: current[section.key] === 'newest' ? 'oldest' : 'newest',
              }))}
              isEmpty={section.hearings.length === 0}
              canCreateHearing={section.key === 'upcoming' && caseDetail?.canEditCase !== false}
              onCreateHearing={() => navigation.navigate('NewHearing', { caseId: caseDetail?.id })}
              colors={colors}
              styles={styles}
            />,
          ];
          for (const hearing of section.hearings) {
            const hearingKey = String(hearing?.id ?? hearing?.hearingId ?? hearing?.audienciaId);
            const defaultTranscriptionExpanded = section.key === 'inProgress';
            const transcriptionExpanded = transcriptionExpandedByHearing[hearingKey] ?? defaultTranscriptionExpanded;
            const isVisible = expanded || Boolean(activeHearingIds[hearingKey]);
            elements.push(
              <HearingCard
                key={'hearing-' + hearingKey}
                hearing={hearing}
                sectionKey={section.key}
                caseDetail={caseDetail}
                documents={documents}
                navigation={navigation}
                styles={styles}
                colors={colors}
                transcriptionExpanded={transcriptionExpanded}
                onToggleTranscription={() => setTranscriptionExpandedByHearing((current) => ({
                  ...current,
                  [hearingKey]: !transcriptionExpanded,
                }))}
                onActivityChange={handleHearingActivityChange}
                onLayout={(event) => handleHearingLayout(hearingKey, event)}
                onDocumentsChanged={refreshCase}
                highlighted={String(highlightedHearingId) === hearingKey}
                visible={isVisible}
              />
            );
          }
          return elements;
        })}
      </View>

      <Section
        actionLabel={caseDetail?.canUploadDocument !== false ? 'Subir documento' : undefined}
        colors={colors}
        onAction={caseDetail?.canUploadDocument !== false ? () => navigation.navigate('UploadDocument', { caseId: caseDetail?.id }) : undefined}
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
            actionLabel={caseDetail?.canUploadDocument !== false ? 'Subir documento' : undefined}
            icon="file-document-outline"
            message="Todavia no se cargaron documentos para esta causa."
            onAction={caseDetail?.canUploadDocument !== false ? () => navigation.navigate('UploadDocument', { caseId: caseDetail?.id }) : undefined}
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

export function HearingSectionHeader({
  title,
  count,
  emptyMessage,
  expanded,
  onToggleExpanded,
  order,
  onToggleOrder,
  isEmpty,
  canCreateHearing,
  onCreateHearing,
  colors,
  styles,
}) {
  const orderLabel = order === 'newest' ? 'Más recientes primero' : 'Más antiguas primero';
  const nextOrderLabel = order === 'newest' ? 'más antiguas primero' : 'más recientes primero';

  return (
    <View style={styles.section}>
      <View style={styles.hearingSectionHeader}>
        <Text accessibilityRole="header" style={styles.hearingSectionTitle}>{title}</Text>
        <View style={styles.hearingSectionActions}>
          <Pressable
            accessibilityLabel={'Orden de ' + title + ': ' + orderLabel + '. Cambiar a ' + nextOrderLabel}
            accessibilityRole="button"
            accessibilityState={{ selected: true }}
            onPress={onToggleOrder}
            style={({ focused, hovered, pressed }) => [
              styles.sectionAction,
              focused && styles.sectionActionFocused,
              hovered && { backgroundColor: colors.accent },
              pressed && { opacity: 0.75 },
            ]}
          >
            <MaterialCommunityIcons color={colors.primary} name="sort" size={16} />
            <Text style={styles.sectionActionText}>{orderLabel}</Text>
          </Pressable>
          <Pressable
            accessibilityLabel={(expanded ? 'Ocultar ' : 'Mostrar ') + title + ', ' + count + ' audiencias'}
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            onPress={onToggleExpanded}
            style={({ focused, hovered, pressed }) => [
              styles.sectionAction,
              focused && styles.sectionActionFocused,
              hovered && { backgroundColor: colors.accent },
              pressed && { opacity: 0.75 },
            ]}
          >
            <MaterialCommunityIcons color={colors.primary} name={expanded ? 'chevron-up' : 'chevron-down'} size={18} />
            <Text style={styles.sectionActionText}>{expanded ? 'Ocultar' : 'Mostrar'} · {count}</Text>
          </Pressable>
        </View>
      </View>
      {expanded && isEmpty ? (
        <EmptyState
          actionLabel={canCreateHearing ? 'Registrar audiencia' : undefined}
          icon="calendar-blank-outline"
          message={emptyMessage}
          onAction={canCreateHearing ? onCreateHearing : undefined}
          title={title === 'Próximas Audiencias' ? 'Sin próximas audiencias' : 'Sin audiencias'}
        />
      ) : null}
    </View>
  );
}

function HearingCard({
  hearing,
  sectionKey,
  caseDetail,
  documents,
  navigation,
  styles,
  colors,
  transcriptionExpanded,
  onToggleTranscription,
  onActivityChange,
  onLayout,
  onDocumentsChanged,
  highlighted,
  visible,
}) {
  const openVideoConference = (url) => {
    const value = String(url || '').trim();
    if (!/^https?:\/\/[^\s]+$/i.test(value)) {
      Alert.alert('Enlace inválido', 'Esta audiencia no tiene un enlace de videoconferencia válido.');
      return;
    }

    Linking.openURL(value).catch(() => {
      Alert.alert('No se pudo abrir el enlace', 'Revisá el enlace de videoconferencia e intentá nuevamente.');
    });
  };

  const isUndated = !Number.isFinite(Date.parse(hearing?.date));
  const isCompletedRecent = sectionKey === 'recent' && Boolean(hearing?.completedAt);
  const status = sectionKey === 'inProgress'
    ? 'En Curso'
    : isCompletedRecent
      ? 'Finalizada'
      : isUndated
        ? 'Sin fecha'
        : hearing?.status;
  const hearingKey = String(hearing?.id ?? hearing?.hearingId ?? hearing?.audienciaId);

  return (
    <View onLayout={onLayout} style={[styles.sectionCard, highlighted && styles.hearingHighlight, !visible && styles.hiddenHearingCard]}>
      <View style={styles.sectionCardHeader}>
        <View style={styles.sectionCardCopy}>
          <Text style={styles.sectionCardTitle}>{hearing?.title || 'Audiencia sin titulo'}</Text>
          <Text style={styles.sectionCardSubtitle}>
            {isUndated ? 'Sin fecha' : formatDateTime(hearing?.date)}
          </Text>
        </View>
        <StatusBadge
          status={status}
          style={isCompletedRecent && styles.completedHearingBadge}
          textStyle={isCompletedRecent && styles.completedHearingBadgeText}
        />
      </View>
      <Text style={styles.sectionCardMeta}>{hearing?.modality || 'Modalidad a confirmar'}</Text>
      {['Presencial', 'Mixta'].includes(hearing?.modality) ? (
        <Text style={styles.hearingInfo}>
          <Text style={styles.hearingInfoLabel}>Sala: </Text>{hearing?.room || hearing?.location || 'Sin informar'}
        </Text>
      ) : null}
      {['Virtual', 'Mixta'].includes(hearing?.modality) ? (
        hearing?.videoConferenceUrl ? (
          <Pressable
            accessibilityLabel={'Abrir videoconferencia: ' + hearing.videoConferenceUrl}
            accessibilityRole="link"
            onPress={() => openVideoConference(hearing.videoConferenceUrl)}
            style={styles.hearingLinkRow}
          >
            <Text style={styles.hearingLinkLabel}>Enlace de videoconferencia: </Text>
            <Text style={styles.hearingLink}>{hearing.videoConferenceUrl}</Text>
            <MaterialCommunityIcons color={colors.primary} name="open-in-new" size={16} style={styles.hearingLinkIcon} />
          </Pressable>
        ) : (
          <Text style={styles.hearingInfo}>
            <Text style={styles.hearingInfoLabel}>Enlace de videoconferencia: </Text>Sin informar
          </Text>
        )
      ) : null}
      {hearing?.modality === 'Telefonica' ? (
        <Text style={styles.hearingInfo}>
          <Text style={styles.hearingInfoLabel}>Número de teléfono: </Text>{hearing?.phoneNumber || 'Sin informar'}
        </Text>
      ) : null}
      <HearingRecordingPanel
        caseDetail={caseDetail}
        documents={documents}
        hearing={hearing}
        canTranscribe={caseDetail?.canTranscribe !== false}
        transcriptionExpanded={transcriptionExpanded}
        onToggleTranscription={onToggleTranscription}
        onActivityChange={onActivityChange}
        onDocumentsChanged={onDocumentsChanged}
        onViewDocuments={() => navigation.navigate('MainTabs', { screen: 'Documentos' })}
      />
    </View>
  );
}

function Section({ actionLabel, children, colors, headerAction, onAction, onLayout, styles, title }) {
  return (
    <View onLayout={onLayout} style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {actionLabel && onAction ? (
          <Pressable onPress={onAction} style={styles.sectionAction}>
            <MaterialCommunityIcons color={colors.primary} name="plus" size={16} />
            <Text style={styles.sectionActionText}>{actionLabel}</Text>
          </Pressable>
        ) : null}
        {headerAction}
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
  deleteCaseButton: { minHeight: 44, marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  deleteCaseButtonText: { color: colors.danger, fontSize: 14, fontWeight: '600' },
  moveBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  movePanel: { width: '100%', maxWidth: 420, alignSelf: 'center', backgroundColor: colors.card, borderRadius: 18, padding: 18 },
  moveTitle: { color: colors.text, fontSize: 18, fontWeight: '700', marginBottom: 10 },
  moveOption: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
  moveOptionText: { color: colors.text, fontSize: 14, flex: 1 },
  moveError: { color: colors.danger, fontSize: 13, marginTop: 10 },
  hearingSections: {
    gap: 12,
  },
  section: {
    gap: 12,
  },
  hearingSectionHeader: {
    flexDirection: layout.isPhone ? 'column' : 'row',
    alignItems: layout.isPhone ? 'stretch' : 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  hearingSectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    flexShrink: 1,
  },
  hearingSectionActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: layout.isPhone ? 'space-between' : 'flex-end',
    flexWrap: 'wrap',
    gap: 6,
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
    borderWidth: 1,
    borderColor: 'transparent',
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
  sectionActionFocused: {
    borderWidth: 2,
    borderColor: colors.focusRing,
  },
  completedHearingBadge: {
    backgroundColor: colors.completedHearingBackground,
  },
  completedHearingBadgeText: {
    color: colors.completedHearingText,
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
  hiddenHearingCard: {
    display: 'none',
  },
  hearingHighlight: {
    borderColor: colors.focusRing,
    backgroundColor: colors.accentSoft,
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
  hearingInfo: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
    marginTop: 8,
    lineHeight: 22,
  },
  hearingInfoLabel: {
    color: colors.text,
    fontWeight: '800',
  },
  hearingLinkRow: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginTop: 8,
    minHeight: 24,
  },
  hearingLinkLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 22,
  },
  hearingLink: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 22,
    textDecorationLine: 'underline',
    flexShrink: 1,
  },
  hearingLinkIcon: {
    marginLeft: 5,
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
