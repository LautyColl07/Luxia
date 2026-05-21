import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import LoadingState from '../components/LoadingState';
import { useAppTheme } from '../context/ThemeContext';
import { createTask, getCases } from '../services/api';
import {
  formatDateTextInput,
  parseMaskedDateToIso,
} from '../utils/date';
import { showSuccessAndGoBack } from '../utils/formFeedback';

const STATUS_OPTIONS = ['Pendiente', 'En proceso', 'Finalizada'];

export default function NewTaskScreen({ navigation, route }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const initialCaseId = route?.params?.caseId ? String(route.params.caseId) : '';
  const [cases, setCases] = useState([]);
  const [loadingCases, setLoadingCases] = useState(true);
  const [casesError, setCasesError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    title: '',
    caseId: initialCaseId,
    description: '',
    date: '',
    status: 'Pendiente',
  });

  useEffect(() => {
    void loadCases();
  }, []);

  async function loadCases() {
    try {
      setLoadingCases(true);
      setCasesError('');
      const items = await getCases();
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
  }

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
      { label: 'Manana', value: toMaskedDate(tomorrow) },
      { label: 'Proxima semana', value: toMaskedDate(nextWeek) },
    ];
  }, []);
  const isValidDate = /^\d{2}\/\d{2}\/\d{4}$/.test(form.date.trim()) && Boolean(parseMaskedDateToIso(form.date.trim()));

  const updateField = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const handleDateChange = (value) => updateField('date', formatDateTextInput(value));

  const handleSubmit = async () => {
    if (!form.title.trim() || !form.caseId || !form.description.trim() || !form.date.trim()) {
      Alert.alert(
        'Informacion incompleta',
        'Completa la tarea, la causa, la descripcion y la fecha para registrar la actividad.'
      );
      return;
    }

    if (!isValidDate) {
      Alert.alert('Fecha invalida', 'Ingresa la fecha con el formato dd/mm/aaaa.');
      return;
    }

    try {
      setSubmitting(true);
      const apiDate = parseMaskedDateToIso(form.date.trim());

      await createTask({
        title: form.title.trim(),
        caseId: form.caseId,
        description: form.description.trim(),
        dueDate: apiDate,
        fechaVencimiento: apiDate,
        status: form.status,
        completed: form.status === 'Finalizada',
      });

      showSuccessAndGoBack(navigation, 'Tarea cargada', 'La tarea se guardo correctamente.');
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
      <EmptyState
        actionLabel="Nueva causa"
        icon="briefcase-search-outline"
        message="Todavia no hay causas disponibles para vincular una tarea."
        onAction={() => navigation.navigate('NewCase')}
        title="Sin causas registradas"
      />
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} style={styles.screen}>
      <Text style={styles.title}>Registrar tarea</Text>
      <Text style={styles.subtitle}>
        Crea una actividad vinculada a una causa y haz seguimiento de su estado.
      </Text>

      <Field label="Tarea o actividad a realizar" styles={styles}>
        <TextInput
          onChangeText={(value) => updateField('title', value)}
          placeholder="Ej. Preparar escrito de contestacion"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          value={form.title}
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
                  {item?.title || 'Causa sin titulo'}
                </Text>
                <Text style={[styles.selectorMeta, selected && styles.selectorMetaActive]}>
                  {item?.court || 'Juzgado a confirmar'}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Field>

      <Field label="Descripcion o detalle de la tarea" styles={styles}>
        <TextInput
          multiline
          onChangeText={(value) => updateField('description', value)}
          placeholder="Describe el objetivo, entregable o pasos principales."
          placeholderTextColor={colors.textMuted}
          style={[styles.input, styles.textArea]}
          textAlignVertical="top"
          value={form.description}
        />
      </Field>

      <Field label="Fecha limite o fecha programada" styles={styles}>
        <TextInput
          keyboardType="number-pad"
          maxLength={10}
          onChangeText={handleDateChange}
          placeholder="dd/mm/aaaa"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          value={form.date}
        />
      </Field>

      <View style={styles.assistBlock}>
        <Text style={styles.assistLabel}>Fechas rapidas</Text>
        <View style={styles.assistChips}>
          {datePresets.map((preset) => (
            <Pressable
              key={preset.label}
              onPress={() => updateField('date', preset.value)}
              style={[styles.assistChip, form.date === preset.value && styles.assistChipActive]}
            >
              <Text style={[styles.assistChipText, form.date === preset.value && styles.assistChipTextActive]}>
                {preset.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <Field label="Estado de la tarea" styles={styles}>
        <View style={styles.optionRow}>
          {STATUS_OPTIONS.map((option) => (
            <Pressable
              key={option}
              onPress={() => updateField('status', option)}
              style={[styles.optionChip, form.status === option && styles.optionChipActive]}
            >
              <Text style={[styles.optionChipText, form.status === option && styles.optionChipTextActive]}>
                {option}
              </Text>
            </Pressable>
          ))}
        </View>
      </Field>

      {selectedCase ? (
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Resumen</Text>
          <Text style={styles.summaryText}>Causa: {selectedCase?.title}</Text>
          <Text style={styles.summaryText}>Juzgado: {selectedCase?.court || 'Juzgado a confirmar'}</Text>
          <Text style={styles.summaryText}>Fecha programada: {form.date || 'Pendiente'}</Text>
          <Text style={styles.summaryText}>Estado: {form.status}</Text>
        </View>
      ) : null}

      <Pressable
        disabled={submitting}
        onPress={handleSubmit}
        style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
      >
        <Text style={styles.submitButtonText}>
          {submitting ? 'Guardando cambios...' : 'Guardar tarea'}
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

const createStyles = (colors) => StyleSheet.create({
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
    flex: 1,
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
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 2,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  textArea: {
    minHeight: 120,
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
  assistBlock: {
    gap: 10,
  },
  assistLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  assistChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  assistChip: {
    backgroundColor: colors.backgroundAlt,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  assistChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  assistChipText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  assistChipTextActive: {
    color: colors.textOnPrimary,
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
