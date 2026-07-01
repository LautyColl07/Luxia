import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import LoadingState from '../components/LoadingState';
import { useStudyContext } from '../context/StudyContext';
import { useAppTheme } from '../context/ThemeContext';
import { createTask, getCases } from '../services/api';
import {
  formatDateTextInput,
  formatDateTimeInput,
  parseMaskedDateToIso,
} from '../utils/date';
import { showSuccessAndGoBack } from '../utils/formFeedback';

export default function NewTaskScreen({ navigation, route }) {
  const { colors } = useAppTheme();
  const { activeContextKey } = useStudyContext();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const initialCaseId = route?.params?.caseId ? String(route.params.caseId) : '';
  const [cases, setCases] = useState([]);
  const [loadingCases, setLoadingCases] = useState(true);
  const [casesError, setCasesError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    title: '',
    description: '',
    caseId: initialCaseId,
    date: '',
  });

  const loadCases = useCallback(async () => {
    try {
      setLoadingCases(true);
      setCasesError('');
      const response = await getCases();
      const items = response?.items || response || [];
      setCases(Array.isArray(items) ? items : []);
    } catch (error) {
      console.error('[NewTaskScreen] Error cargando causas:', error);
      setCases([]);
      setCasesError(
        error instanceof Error ? error.message : 'No pudimos cargar las causas disponibles.'
      );
    } finally {
      setLoadingCases(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadCases();
    }, [loadCases, activeContextKey])
  );

  const selectedCase = useMemo(
    () => cases.find((item) => String(item?.id) === form.caseId) || null,
    [cases, form.caseId]
  );

  const datePresets = useMemo(() => {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    const nextWeek = new Date(now);
    nextWeek.setDate(now.getDate() + 7);

    const toMaskedDate = (date) =>
      formatDateTextInput(
        `${String(date.getDate()).padStart(2, '0')}${String(date.getMonth() + 1).padStart(2, '0')}${date.getFullYear()}`
      );

    return [
      { label: 'Hoy', value: toMaskedDate(now) },
      { label: 'Mañana', value: toMaskedDate(tomorrow) },
      { label: 'Próxima semana', value: toMaskedDate(nextWeek) },
    ];
  }, []);

  const isValidDate = !form.date.trim() || (/^\d{2}\/\d{2}\/\d{4}$/.test(form.date.trim()) && Boolean(parseMaskedDateToIso(form.date.trim())));

  const updateField = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const handleDateChange = (value) => updateField('date', formatDateTextInput(value));

  const handleSubmit = async () => {
    if (!form.title.trim() || !form.caseId) {
      Alert.alert(
        'Información incompleta',
        'Completa el título de la tarea y selecciona una causa para guardarla.'
      );
      return;
    }

    if (!isValidDate) {
      Alert.alert('Fecha inválida', 'Ingresa la fecha de vencimiento con el formato dd/mm/aaaa.');
      return;
    }

    try {
      setSubmitting(true);
      const apiDate = form.date.trim() ? parseMaskedDateToIso(form.date.trim()) : null;

      await createTask({
        title: form.title.trim(),
        description: form.description.trim(),
        caseId: form.caseId,
        dueDate: apiDate,
        fechaVencimiento: apiDate,
      });

      showSuccessAndGoBack(navigation, 'Tarea creada', 'La tarea se guardó correctamente.');
    } catch (error) {
      console.error('[NewTaskScreen] Error creando tarea:', error);
      Alert.alert(
        'No pudimos registrar la tarea',
        error instanceof Error ? error.message : 'Intenta nuevamente.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingCases && !cases.length) {
    return (
      <LoadingState
        title="Cargando causas"
        message="Estamos recuperando las causas disponibles para vincular la tarea."
      />
    );
  }

  if (casesError && !cases.length) {
    return (
      <ErrorState
        title="No pudimos cargar las causas"
        message={casesError}
        onRetry={loadCases}
      />
    );
  }

  if (!cases.length) {
    return (
      <View style={[styles.screen, { justifyContent: 'center', padding: 20, gap: 14 }]}>
        <EmptyState
          actionLabel="Nueva causa"
          icon="briefcase-search-outline"
          message="Todavía no hay causas disponibles para vincular una tarea."
          onAction={() => navigation.navigate('NewCase')}
          title="Sin causas registradas"
        />
        <Pressable onPress={() => navigation.goBack()} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>Volver</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} style={styles.screen}>
      <Text style={styles.title}>Crear tarea</Text>
      <Text style={styles.subtitle}>
        Asigna una tarea pendiente o vencimiento a una de tus causas.
      </Text>

      <Field label="Título de la tarea" styles={styles}>
        <TextInput
          onChangeText={(value) => updateField('title', value)}
          placeholder="Ej. Revisar contestación de demanda"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          value={form.title}
        />
      </Field>

      <Field label="Descripción (opcional)" styles={styles}>
        <TextInput
          multiline
          numberOfLines={3}
          onChangeText={(value) => updateField('description', value)}
          placeholder="Detalles adicionales sobre la tarea..."
          placeholderTextColor={colors.textMuted}
          style={[styles.input, styles.textArea]}
          value={form.description}
        />
      </Field>

      <Field label="Causa vinculada" styles={styles}>
        <View style={styles.selectorList}>
          {cases.map((item) => {
            const selected = String(item?.id) === form.caseId;
            return (
              <Pressable
                key={item?.id}
                onPress={() => updateField('caseId', String(item?.id))}
                style={[styles.selectorCard, selected && styles.selectorCardActive]}
              >
                <Text style={[styles.selectorTitle, selected && styles.selectorTitleActive]}>
                  {item?.title || 'Causa sin título'}
                </Text>
                <Text style={[styles.selectorMeta, selected && styles.selectorMetaActive]}>
                  {item?.court || 'Juzgado a confirmar'}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Field>

      <Field label="Fecha de vencimiento (opcional - dd/mm/aaaa)" styles={styles}>
        <TextInput
          keyboardType="number-pad"
          maxLength={10}
          onChangeText={handleDateChange}
          placeholder="dd/mm/aaaa"
          placeholderTextColor={colors.textMuted}
          style={[styles.input, !isValidDate && styles.inputError]}
          value={form.date}
        />
        <View style={styles.presetRow}>
          {datePresets.map((preset) => (
            <Pressable
              key={preset.label}
              onPress={() => updateField('date', preset.value)}
              style={styles.presetChip}
            >
              <Text style={styles.presetChipText}>{preset.label}</Text>
            </Pressable>
          ))}
        </View>
      </Field>

      <View style={styles.actionButtonsRow}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.cancelButton}
        >
          <Text style={styles.cancelButtonText}>Cancelar</Text>
        </Pressable>
        <Pressable
          disabled={submitting}
          onPress={handleSubmit}
          style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
        >
          <Text style={styles.submitButtonText}>
            {submitting ? 'Guardando...' : 'Crear tarea'}
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function Field({ label, children, styles }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 48,
    gap: 20,
  },
  title: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginTop: -8,
  },
  field: {
    gap: 10,
  },
  label: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  input: {
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    paddingHorizontal: 16,
    color: colors.text,
    fontSize: 14,
  },
  inputError: {
    borderColor: colors.danger,
    backgroundColor: colors.dangerSoft,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
    paddingTop: 14,
  },
  selectorList: {
    gap: 10,
  },
  selectorCard: {
    backgroundColor: colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 4,
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
    fontSize: 12,
  },
  selectorMetaActive: {
    color: colors.primary,
    opacity: 0.8,
  },
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  presetChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  presetChipText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 10,
  },
  cancelButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  cancelButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  submitButton: {
    flex: 1.5,
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  submitButtonDisabled: {
    opacity: 0.55,
  },
  submitButtonText: {
    color: colors.textOnPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  secondaryButton: {
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  secondaryButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
});
