import * as DocumentPicker from 'expo-document-picker';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import LoadingState from '../components/LoadingState';
import { useStudyContext } from '../context/StudyContext';
import { useAppTheme } from '../context/ThemeContext';
import { getCaseById, getHearings, uploadDocument } from '../services/api';
import { useResponsiveLayout } from '../theme/layout';
import { formatDateTime } from '../utils/date';

const DOCUMENT_TYPES = ['Demanda', 'Escrito', 'Prueba', 'Anexo'];

const DOCUMENT_PICKER_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
];

export default function UploadDocumentScreen({ navigation, route }) {
  const { colors } = useAppTheme();
  const { activeContextKey } = useStudyContext();
  const layout = useResponsiveLayout();
  const styles = useMemo(() => createStyles(colors, layout), [colors, layout]);
  const caseId = route?.params?.caseId ? String(route.params.caseId) : '';
  const [hearings, setHearings] = useState([]);
  const [caseDetail, setCaseDetail] = useState(null);
  const [loadingHearings, setLoadingHearings] = useState(true);
  const [hearingsError, setHearingsError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [completed, setCompleted] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const submittingRef = useRef(false);
  const allowLeaveRef = useRef(false);
  const abortControllerRef = useRef(null);
  const [form, setForm] = useState({
    hearingId: '',
    documentType: 'Escrito',
  });

  useEffect(() => {
    void loadHearings();
  }, [activeContextKey, caseId]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (event) => {
      if (!submittingRef.current || allowLeaveRef.current) {
        return;
      }

      event.preventDefault();
      Alert.alert(
        'Carga en curso',
        'El documento todavía se está subiendo. ¿Querés cancelar y volver?',
        [
          { text: 'Seguir subiendo', style: 'cancel' },
          {
            text: 'Cancelar y volver',
            style: 'destructive',
            onPress: () => {
              allowLeaveRef.current = true;
              abortControllerRef.current?.abort();
              setFeedback({ tone: 'info', message: 'Carga cancelada' });
              Alert.alert('Carga cancelada', 'No se elimino ningun documento.', [
                { text: 'Volver', onPress: () => navigation.dispatch(event.data.action) },
              ]);
            },
          },
        ]
      );
    });

    return unsubscribe;
  }, [navigation]);

  async function loadHearings() {
    try {
      setLoadingHearings(true);
      setHearingsError('');
      if (caseId) {
        const currentCase = await getCaseById(caseId);
        setCaseDetail(currentCase);
        setHearings(Array.isArray(currentCase?.hearings) ? currentCase.hearings : []);
      } else {
        const items = await getHearings();
        setHearings(Array.isArray(items) ? items : []);
      }
    } catch (error) {
      console.error('[UploadDocumentScreen] No se pudieron cargar las audiencias.');
      setHearings([]);
      setCaseDetail(null);
      setHearingsError(
        error instanceof Error ? error.message : 'No pudimos cargar las audiencias disponibles.'
      );
    } finally {
      setLoadingHearings(false);
    }
  }

  const selectedHearing = useMemo(
    () => hearings.find((item) => String(item?.id) === form.hearingId) || null,
    [hearings, form.hearingId]
  );

  const updateField = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const handleSelectFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
        type: DOCUMENT_PICKER_TYPES,
      });

      if (result.canceled) {
        setFeedback({ tone: 'info', message: 'Carga cancelada' });
        return;
      }

      const asset = result.assets?.[0] || null;

      if (!asset?.uri) {
        Alert.alert('Archivo invalido', 'No pudimos leer el archivo seleccionado.');
        return;
      }

      setSelectedAsset(asset);
      setCompleted(false);
      setFeedback({
        tone: 'info',
        message: `Archivo seleccionado: ${asset.name || 'Documento'}`,
      });
    } catch (error) {
      console.error('[UploadDocumentScreen] No se pudo seleccionar el archivo.');
      setFeedback({ tone: 'error', message: 'No se pudo seleccionar el archivo. Intenta nuevamente.' });
    }
  };

  const handleUpload = async () => {
    if (submittingRef.current) {
      return;
    }

    if (!form.hearingId || !selectedAsset?.uri) {
      Alert.alert(
        'Informacion incompleta',
        'Selecciona una audiencia y un archivo para continuar.'
      );
      return;
    }

    try {
      submittingRef.current = true;
      setSubmitting(true);
      setCompleted(false);
      setFeedback({ tone: 'info', message: 'Carga iniciada' });
      abortControllerRef.current = new AbortController();
      await uploadDocument({
        caseId: caseId || selectedHearing?.caseId,
        hearingId: form.hearingId,
        documentType: form.documentType,
        asset: selectedAsset,
        signal: abortControllerRef.current.signal,
      });

      setCompleted(true);
      setFeedback({ tone: 'success', message: 'Documento agregado al caso correctamente' });
    } catch (error) {
      if (error?.status === 499) {
        return;
      }

      console.error('[UploadDocumentScreen] No se pudo subir el documento.');
      setCompleted(false);
      setFeedback({
        tone: 'error',
        message: `No se pudo agregar el documento. ${error instanceof Error ? error.message : 'Intenta nuevamente.'}`,
      });
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
      abortControllerRef.current = null;
    }
  };

  const returnToCase = () => {
    const targetCaseId = caseId || selectedHearing?.caseId;
    const state = navigation.getState?.();
    const previousRoute = state?.routes?.[Math.max(0, (state?.index || 0) - 1)];
    const previousCaseId = previousRoute?.params?.caseId;

    if (targetCaseId && previousRoute?.name === 'CaseDetail' && String(previousCaseId) === String(targetCaseId)) {
      navigation.goBack();
      return;
    }

    if (targetCaseId) {
      navigation.replace('CaseDetail', { caseId: targetCaseId });
      return;
    }

    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    navigation.replace('MainTabs');
  };

  if (loadingHearings && !hearings.length) {
    return (
      <LoadingState
        title="Cargando audiencias"
        message="Estamos recuperando las audiencias disponibles para asociar el documento."
      />
    );
  }

  if (hearingsError && !hearings.length) {
    return (
      <ErrorState
        title="No pudimos cargar las audiencias"
        message={hearingsError}
        onRetry={loadHearings}
      />
    );
  }

  if (!hearings.length) {
    return (
      <EmptyState
        actionLabel="Registrar audiencia"
        icon="calendar-blank-outline"
        message="Todavia no hay audiencias disponibles para vincular documentos."
        onAction={() => navigation.navigate('NewHearing', caseId ? { caseId } : undefined)}
        title="Sin audiencias registradas"
      />
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} style={styles.screen}>
      <Text style={styles.title}>Subir documento</Text>
      <Text style={styles.subtitle}>
        {caseDetail?.title
          ? `Agrega un documento a ${caseDetail.title} y vinculalo con una audiencia.`
          : 'Registra un documento y vinculalo con la audiencia correspondiente.'}
      </Text>

      {feedback ? (
        <View style={[styles.feedback, styles[`feedback${feedback.tone}`] || styles.feedbackinfo]}>
          <Text style={styles.feedbackText}>{feedback.message}</Text>
          {feedback.tone === 'error' ? (
            <Pressable disabled={submitting} onPress={handleUpload} style={styles.retryButton}>
              <Text style={styles.retryButtonText}>Reintentar</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <Field label="Audiencia vinculada" styles={styles}>
        <View style={styles.selectorList}>
          {hearings.map((item) => {
            const selected = String(item?.id) === form.hearingId;
            return (
              <Pressable
                key={item?.id}
                onPress={() => updateField('hearingId', String(item?.id))}
                style={[styles.selectorCard, selected && styles.selectorCardActive]}
              >
                <Text style={[styles.selectorTitle, selected && styles.selectorTitleActive]}>
                  {item?.title || 'Audiencia sin titulo'}
                </Text>
                <Text style={[styles.selectorMeta, selected && styles.selectorMetaActive]}>
                  {item?.caseTitle || 'Causa sin referencia'}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Field>

      <Field label="Tipo de documento" styles={styles}>
        <View style={styles.optionRow}>
          {DOCUMENT_TYPES.map((option) => (
            <Pressable
              key={option}
              onPress={() => updateField('documentType', option)}
              style={[styles.optionChip, form.documentType === option && styles.optionChipActive]}
            >
              <Text style={[styles.optionChipText, form.documentType === option && styles.optionChipTextActive]}>
                {option}
              </Text>
            </Pressable>
          ))}
        </View>
      </Field>

      <Pressable
        disabled={submitting}
        onPress={handleSelectFile}
        style={[styles.secondaryButton, submitting && styles.buttonDisabled]}
      >
        <Text style={styles.secondaryButtonText}>
          {selectedAsset?.name ? 'Cambiar archivo' : 'Seleccionar archivo'}
        </Text>
      </Pressable>

      {selectedHearing ? (
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Resumen del documento</Text>
          <Text style={styles.summaryText}>Audiencia: {selectedHearing?.title}</Text>
          <Text style={styles.summaryText}>Causa: {selectedHearing?.caseTitle}</Text>
          <Text style={styles.summaryText}>
            Fecha: {formatDateTime(selectedHearing?.date)}
          </Text>
          <Text style={styles.summaryText}>
            Archivo: {selectedAsset?.name || 'Pendiente de seleccion'}
          </Text>
        </View>
      ) : null}

      <Pressable
        disabled={submitting}
        onPress={handleUpload}
        style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
      >
        {submitting ? <ActivityIndicator color={colors.textOnPrimary} size="small" /> : null}
        <Text style={styles.submitButtonText}>
          {submitting ? 'Subiendo documento…' : 'Guardar documento'}
        </Text>
      </Pressable>

      {completed ? (
        <Pressable onPress={returnToCase} style={styles.returnButton}>
          <Text style={styles.returnButtonText}>Volver al caso</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

function Field({ children, label, styles }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
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
    maxWidth: layout.formMaxWidth,
    alignSelf: 'center',
    padding: layout.gutter,
    gap: 18,
    paddingBottom: 34,
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
  field: {
    gap: 10,
  },
  label: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  selectorList: {
    gap: 10,
  },
  selectorCard: {
    backgroundColor: colors.card,
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  selectorCardActive: {
    borderColor: colors.primary,
    backgroundColor: colors.accentSoft,
  },
  selectorTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  selectorTitleActive: {
    color: colors.primary,
  },
  selectorMeta: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 6,
  },
  selectorMetaActive: {
    color: colors.primary,
  },
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  optionChip: {
    backgroundColor: colors.card,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  optionChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  optionChipText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '700',
  },
  optionChipTextActive: {
    color: colors.textOnPrimary,
  },
  secondaryButton: {
    backgroundColor: colors.card,
    minHeight: 52,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryButtonText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  feedback: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  feedbackinfo: {
    backgroundColor: colors.accentSoft,
  },
  feedbacksuccess: {
    backgroundColor: colors.successSoft,
  },
  feedbackerror: {
    backgroundColor: colors.dangerSoft,
  },
  feedbackText: {
    color: colors.text,
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
  },
  retryButton: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: colors.card,
  },
  retryButtonText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  summaryCard: {
    backgroundColor: colors.card,
    borderRadius: 22,
    padding: 18,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 2,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  summaryTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 10,
  },
  summaryText: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 20,
  },
  submitButton: {
    backgroundColor: colors.primary,
    minHeight: 52,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    color: colors.textOnPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  returnButton: {
    backgroundColor: colors.card,
    minHeight: 52,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  returnButtonText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '700',
  },
});
