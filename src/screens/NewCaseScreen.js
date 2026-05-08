import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import CaseVisibilitySelector from '../components/CaseVisibilitySelector';
import LegalStudySelector from '../components/LegalStudySelector';
import LoadingState from '../components/LoadingState';
import { useWorkContext } from '../context/WorkContextContext';
import { useAppTheme } from '../context/ThemeContext';
import {
  CASE_SCOPES,
  createCase,
  getCaseById,
  getLegalStudies,
  updateCase,
  WORK_CONTEXT_TYPES,
} from '../services/api';
import { showSuccessAndGoBack } from '../utils/formFeedback';
import { normalizeStatusLabel } from '../utils/status';

const STATUS_OPTIONS = ['Activa', 'Pendiente', 'En proceso', 'Archivada'];

export default function NewCaseScreen({ navigation, route }) {
  const { colors } = useAppTheme();
  const { activeContext } = useWorkContext();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const editingCaseId = route?.params?.caseId || null;
  const [form, setForm] = useState({
    title: '',
    description: '',
    court: '',
    status: 'Activa',
    scope: CASE_SCOPES.PRIVATE,
    legalStudyId: null,
  });
  const [legalStudies, setLegalStudies] = useState([]);
  const [loading, setLoading] = useState(Boolean(editingCaseId));
  const [loadingStudies, setLoadingStudies] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const shareableStudies = useMemo(
    () => legalStudies.filter((item) => item?.capabilities?.canCreateCase),
    [legalStudies]
  );

  useEffect(() => {
    void loadDependencies();
  }, [editingCaseId]);

  async function loadDependencies() {
    try {
      setLoadingStudies(true);
      const studies = await getLegalStudies();
      const editableStudies = Array.isArray(studies) ? studies : [];
      const defaultShareableStudyId =
        editableStudies.find((item) => item?.capabilities?.canCreateCase)?.id || null;
      const activeContextShareable =
        activeContext?.type === WORK_CONTEXT_TYPES.LEGAL_STUDY &&
        editableStudies.some(
          (item) =>
            String(item?.id) === String(activeContext?.legalStudyId) &&
            item?.capabilities?.canCreateCase
        );
      const eligibleStudyId = activeContextShareable
        ? activeContext?.legalStudyId || null
        : defaultShareableStudyId;

      setLegalStudies(editableStudies);

      if (!editingCaseId) {
        setForm((current) => ({
          ...current,
          scope:
            activeContext?.type === WORK_CONTEXT_TYPES.LEGAL_STUDY && eligibleStudyId
              ? CASE_SCOPES.LEGAL_STUDY
              : CASE_SCOPES.PRIVATE,
          legalStudyId: eligibleStudyId,
        }));
        return;
      }

      setLoading(true);
      const currentCase = await getCaseById(editingCaseId);
      setForm({
        title: currentCase?.title || '',
        description: currentCase?.description || '',
        court: currentCase?.court || '',
        status: currentCase?.status || 'Activa',
        scope: currentCase?.scope || CASE_SCOPES.PRIVATE,
        legalStudyId: currentCase?.legalStudyId || eligibleStudyId,
      });
    } catch (error) {
      console.error('[NewCaseScreen] Error cargando dependencias:', error);
      Alert.alert(
        'No pudimos preparar el formulario',
        error instanceof Error ? error.message : 'Intenta nuevamente.'
      );
      navigation.goBack();
    } finally {
      setLoading(false);
      setLoadingStudies(false);
    }
  }

  const updateField = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const handleSubmit = async () => {
    if (!form.title.trim()) {
      Alert.alert('Informacion incompleta', 'Ingresa la caratula o el nombre de la causa para continuar.');
      return;
    }

    if (form.scope === CASE_SCOPES.LEGAL_STUDY && !form.legalStudyId) {
      Alert.alert('Estudio requerido', 'Selecciona un Estudio Juridico para compartir la causa.');
      return;
    }

    try {
      setSubmitting(true);

      const payload = {
        title: form.title.trim(),
        description: form.description.trim(),
        court: form.court.trim(),
        status: form.status,
        scope: form.scope,
        legalStudyId: form.scope === CASE_SCOPES.LEGAL_STUDY ? form.legalStudyId : null,
      };

      if (editingCaseId) {
        await updateCase(editingCaseId, payload);
        showSuccessAndGoBack(navigation, 'Causa actualizada', 'La causa se actualizo correctamente.');
        return;
      }

      await createCase(payload);
      showSuccessAndGoBack(navigation, 'Causa cargada', 'La causa se guardo correctamente.');
    } catch (error) {
      console.error('[NewCaseScreen] Error guardando causa:', error);
      Alert.alert(
        editingCaseId ? 'No pudimos actualizar la causa' : 'No pudimos registrar la causa',
        error instanceof Error ? error.message : 'Intenta nuevamente.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || loadingStudies) {
    return (
      <LoadingState
        title={editingCaseId ? 'Cargando causa' : 'Preparando formulario'}
        message="Estamos cargando tus Estudios Juridicos y la configuracion disponible."
      />
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} style={styles.screen}>
      <Text style={styles.title}>{editingCaseId ? 'Editar causa' : 'Nueva causa'}</Text>
      <Text style={styles.subtitle}>
        Registra un expediente como causa particular o compartilo dentro de un Estudio Juridico.
      </Text>

      <CaseVisibilitySelector
        disabledShared={!shareableStudies.length}
        helperText={
          shareableStudies.length
            ? 'OWNER, ADMIN y MEMBER pueden crear causas compartidas.'
            : 'No perteneces a ningun Estudio Juridico con permisos de carga.'
        }
        onChange={(scope) =>
          setForm((current) => ({
            ...current,
            scope,
            legalStudyId:
              scope === CASE_SCOPES.LEGAL_STUDY
                ? current.legalStudyId || shareableStudies[0]?.id || null
                : null,
          }))
        }
        value={form.scope}
      />

      {form.scope === CASE_SCOPES.LEGAL_STUDY ? (
        <LegalStudySelector
          helperText="La causa sera visible para los miembros activos segun sus permisos."
          onChange={(value) => updateField('legalStudyId', value)}
          selectedLegalStudyId={form.legalStudyId}
          studies={shareableStudies}
        />
      ) : null}

      <Field label="Caratula o titulo" styles={styles}>
        <TextInput
          onChangeText={(value) => updateField('title', value)}
          placeholder="Ej. Gonzalez c/ Lopez"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          value={form.title}
        />
      </Field>

      <Field label="Descripcion" styles={styles}>
        <TextInput
          multiline
          numberOfLines={4}
          onChangeText={(value) => updateField('description', value)}
          placeholder="Resume el objeto del expediente o sus observaciones principales."
          placeholderTextColor={colors.textMuted}
          style={[styles.input, styles.textArea]}
          textAlignVertical="top"
          value={form.description}
        />
      </Field>

      <Field label="Juzgado o tribunal" styles={styles}>
        <TextInput
          onChangeText={(value) => updateField('court', value)}
          placeholder="Ej. Juzgado Civil N 12"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          value={form.court}
        />
      </Field>

      <Field label="Estado inicial" styles={styles}>
        <View style={styles.optionRow}>
          {STATUS_OPTIONS.map((option) => (
            <Pressable
              key={option}
              onPress={() => updateField('status', option)}
              style={[styles.optionChip, form.status === option && styles.optionChipActive]}
            >
              <Text style={[styles.optionChipText, form.status === option && styles.optionChipTextActive]}>
                {normalizeStatusLabel(option)}
              </Text>
            </Pressable>
          ))}
        </View>
      </Field>

      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>Resumen de visibilidad</Text>
        <Text style={styles.summaryText}>
          {form.scope === CASE_SCOPES.PRIVATE
            ? 'Solo vos podes ver esta causa.'
            : 'Esta causa pertenece al Estudio Juridico seleccionado.'}
        </Text>
      </View>

      <Pressable
        disabled={submitting}
        onPress={handleSubmit}
        style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
      >
        <Text style={styles.submitButtonText}>
          {submitting
            ? 'Guardando cambios...'
            : editingCaseId
              ? 'Guardar actualizacion'
              : 'Guardar causa'}
        </Text>
      </Pressable>
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

const createStyles = (colors) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      padding: 20,
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
    input: {
      backgroundColor: colors.inputBackground,
      borderRadius: 20,
      paddingHorizontal: 16,
      paddingVertical: 14,
      color: colors.text,
      fontSize: 15,
      borderWidth: 1,
      borderColor: colors.borderSoft,
    },
    textArea: {
      minHeight: 116,
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
    summaryCard: {
      backgroundColor: colors.card,
      borderRadius: 22,
      padding: 18,
      borderWidth: 1,
      borderColor: colors.borderSoft,
    },
    summaryTitle: {
      color: colors.text,
      fontSize: 15,
      fontWeight: '700',
      marginBottom: 8,
    },
    summaryText: {
      color: colors.textSecondary,
      fontSize: 13,
      lineHeight: 20,
    },
    submitButton: {
      marginTop: 8,
      backgroundColor: colors.primary,
      borderRadius: 20,
      paddingVertical: 16,
      alignItems: 'center',
    },
    submitButtonDisabled: {
      opacity: 0.7,
    },
    submitButtonText: {
      color: colors.textOnPrimary,
      fontSize: 15,
      fontWeight: '700',
    },
  });
