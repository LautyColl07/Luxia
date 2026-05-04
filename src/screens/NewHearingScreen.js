import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import LoadingState from '../components/LoadingState';
import { useAppTheme } from '../context/ThemeContext';
import { createHearing, getCases } from '../services/api';
import {
  formatDateTextInput,
  formatDateTimeInput,
  formatTimeTextInput,
  parseMaskedDateToIso,
} from '../utils/date';
import { showSuccessAndGoBack } from '../utils/formFeedback';

const MODALITY_OPTIONS = ['Presencial', 'Virtual', 'Hibrida'];
const TIME_PRESETS = ['09:00', '11:15', '15:00', '17:30'];

export default function NewHearingScreen({ navigation, route }) {
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
    date: '',
    time: '',
    modality: 'Presencial',
    location: '',
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
      console.error('[NewHearingScreen] Error cargando causas:', error);
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
  const isValidTime = /^([01]\d|2[0-3]):([0-5]\d)$/.test(form.time.trim());

  const updateField = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const handleDateChange = (value) => updateField('date', formatDateTextInput(value));
  const handleTimeChange = (value) => updateField('time', formatTimeTextInput(value));

  const handleSubmit = async () => {
    if (!form.title.trim() || !form.caseId || !form.date.trim() || !form.time.trim()) {
      Alert.alert(
        'Informacion incompleta',
        'Completa el titulo, la causa, la fecha y el horario para registrar la audiencia.'
      );
      return;
    }

    if (!isValidDate) {
      Alert.alert('Fecha invalida', 'Ingresa la fecha con el formato dd/mm/aaaa.');
      return;
    }

    if (!isValidTime) {
      Alert.alert('Horario invalido', 'Ingresa el horario con el formato HH:mm.');
      return;
    }

    const normalizedDateTime = formatDateTimeInput(form.date.trim(), form.time.trim());

    if (!normalizedDateTime) {
      Alert.alert('Fecha u horario invalidos', 'Revisa los datos e intenta nuevamente.');
      return;
    }

    try {
      setSubmitting(true);
      const apiDate = parseMaskedDateToIso(form.date.trim());

      await createHearing({
        title: form.title.trim(),
        caseId: form.caseId,
        date: apiDate,
        fecha: apiDate,
        time: form.time.trim(),
        fechaHora: normalizedDateTime,
        modality: form.modality,
        location: form.location.trim(),
      });

      showSuccessAndGoBack(navigation, 'Audiencia cargada', 'La audiencia se guardo correctamente.');
    } catch (error) {
      console.error('[NewHearingScreen] Error creando audiencia:', error);
      Alert.alert(
        'No pudimos registrar la audiencia',
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
        message="Estamos recuperando las causas disponibles para vincular la audiencia."
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
        message="Todavia no hay causas disponibles para vincular una audiencia."
        onAction={() => navigation.navigate('NewCase')}
        title="Sin causas registradas"
      />
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} style={styles.screen}>
      <Text style={styles.title}>Registrar audiencia</Text>
      <Text style={styles.subtitle}>
        Programa una audiencia y vinculala con la causa correspondiente.
      </Text>

      <Field label="Titulo de la audiencia" styles={styles}>
        <TextInput
          onChangeText={(value) => updateField('title', value)}
          placeholder="Ej. Audiencia preliminar"
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

      <View style={styles.dualRow}>
        <Field label="Fecha" styles={styles}>
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

        <Field label="Horario" styles={styles}>
          <TextInput
            keyboardType="number-pad"
            maxLength={5}
            onChangeText={handleTimeChange}
            placeholder="HH:mm"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            value={form.time}
          />
        </Field>
      </View>

      <View style={styles.assistRow}>
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

        <View style={styles.assistBlock}>
          <Text style={styles.assistLabel}>Horarios sugeridos</Text>
          <View style={styles.assistChips}>
            {TIME_PRESETS.map((preset) => (
              <Pressable
                key={preset}
                onPress={() => updateField('time', preset)}
                style={[styles.assistChip, form.time === preset && styles.assistChipActive]}
              >
                <Text style={[styles.assistChipText, form.time === preset && styles.assistChipTextActive]}>
                  {preset}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>

      <Field label="Modalidad" styles={styles}>
        <View style={styles.optionRow}>
          {MODALITY_OPTIONS.map((option) => (
            <Pressable
              key={option}
              onPress={() => updateField('modality', option)}
              style={[styles.optionChip, form.modality === option && styles.optionChipActive]}
            >
              <Text style={[styles.optionChipText, form.modality === option && styles.optionChipTextActive]}>
                {option}
              </Text>
            </Pressable>
          ))}
        </View>
      </Field>

      <Field label="Sala o enlace institucional" styles={styles}>
        <TextInput
          onChangeText={(value) => updateField('location', value)}
          placeholder="Ej. Sala 3 o enlace de videoconferencia"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          value={form.location}
        />
      </Field>

      {selectedCase ? (
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Resumen</Text>
          <Text style={styles.summaryText}>Causa: {selectedCase?.title}</Text>
          <Text style={styles.summaryText}>Juzgado: {selectedCase?.court || 'Juzgado a confirmar'}</Text>
          <Text style={styles.summaryText}>
            Fecha y hora: {form.date || 'Pendiente'}{form.time ? ` · ${form.time} hs` : ''}
          </Text>
          <Text style={styles.summaryText}>
            Modalidad: {form.modality}
            {form.location ? ` · ${form.location}` : ''}
          </Text>
        </View>
      ) : null}

      <Pressable
        disabled={submitting}
        onPress={handleSubmit}
        style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
      >
        <Text style={styles.submitButtonText}>
          {submitting ? 'Guardando cambios...' : 'Guardar audiencia'}
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
  dualRow: {
    flexDirection: 'row',
    gap: 12,
  },
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  assistRow: {
    gap: 14,
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
