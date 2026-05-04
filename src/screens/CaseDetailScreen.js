import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import LoadingState from '../components/LoadingState';
import StatusBadge from '../components/StatusBadge';
import { useAppTheme } from '../context/ThemeContext';
import { getCaseById } from '../services/api';
import { formatDate, formatDateTime } from '../utils/date';

export default function CaseDetailScreen({ navigation, route }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const caseId = route?.params?.caseId;
  const [caseDetail, setCaseDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadCase = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const item = await getCaseById(caseId);
      setCaseDetail(item);
    } catch (loadError) {
      console.error('[CaseDetailScreen] Error cargando causa:', loadError);
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'No pudimos cargar el detalle de la causa.'
      );
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useFocusEffect(
    useCallback(() => {
      void loadCase();
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
      </View>

      <Section styles={styles} title="Audiencias">
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

      <Section styles={styles} title="Documentos">
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
            onAction={() => navigation.navigate('UploadDocument')}
            title="Sin documentos registrados"
          />
        )}
      </Section>

      <Section styles={styles} title="Tareas">
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

function Section({ children, styles, title }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionContent}>{children}</View>
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 20,
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
    marginTop: 18,
    backgroundColor: colors.primary,
    borderRadius: 18,
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
  section: {
    gap: 12,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
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
