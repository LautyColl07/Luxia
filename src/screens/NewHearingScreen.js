import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import ActionFeedbackModal from '../components/ActionFeedbackModal';
import DatePickerModal from '../components/DatePickerModal';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import LoadingState from '../components/LoadingState';
import { useStudyContext } from '../context/StudyContext';
import { useAppTheme } from '../context/ThemeContext';
import { createHearing, getAllCases } from '../services/api';
import { useResponsiveLayout } from '../theme/layout';
import {
  formatDateTextInput,
  formatDateTimeInput,
  parseMaskedDateToIso,
} from '../utils/date';

const MODALITY_OPTIONS = ['Presencial', 'Virtual', 'Mixta', 'Telefonica'];
const TIME_PRESETS = ['09:00', '11:15', '15:00', '17:30'];

export default function NewHearingScreen({ navigation, route }) {
  const { colors } = useAppTheme();
  const { activeContextKey } = useStudyContext();
  const layout = useResponsiveLayout();
  const styles = useMemo(() => createStyles(colors, layout), [colors, layout]);
  const initialCaseId = route?.params?.caseId ? String(route.params.caseId) : '';
  const [cases, setCases] = useState([]);
  const [loadingCases, setLoadingCases] = useState(true);
  const [casesError, setCasesError] = useState('');
  const requestSequenceRef = useRef(0);
  const [submitting, setSubmitting] = useState(false);
  const [successFeedback, setSuccessFeedback] = useState(null);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const [draftTime, setDraftTime] = useState({ hour: '09', minute: '00' });
  const [form, setForm] = useState({
    title: '',
    caseId: initialCaseId,
    date: '',
    time: '',
    modality: '',
    room: '',
    videoConferenceUrl: '',
    phoneNumber: '',
  });

  const loadCases = useCallback(async () => {
    const requestId = ++requestSequenceRef.current;
    try {
      setLoadingCases(true);
      setCases([]);
      setCasesError('');
      const items = await getAllCases();
      if (requestSequenceRef.current !== requestId) return;
      setCases(items);
      setForm((current) => current.caseId && !items.some((item) => String(item?.id) === current.caseId)
        ? { ...current, caseId: '' } : current);
    } catch (error) {
      if (requestSequenceRef.current !== requestId) return;
      console.error('[NewHearingScreen] No se pudieron cargar las causas.');
      setCases([]);
      setCasesError(
        error instanceof Error ? error.message : 'No pudimos cargar las causas disponibles.'
      );
    } finally {
      if (requestSequenceRef.current === requestId) setLoadingCases(false);
    }
  }, [activeContextKey]);

  useFocusEffect(
    useCallback(() => {
      void loadCases();
      return () => { requestSequenceRef.current += 1; };
    }, [loadCases])
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
  const isValidDate = /^\d{2}\/\d{2}\/\d{4}$/.test(form.date.trim()) && Boolean(parseMaskedDateToIso(form.date.trim()));
  const isValidTime = /^([01]\d|2[0-3]):([0-5]\d)$/.test(form.time.trim());

  const updateField = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const openTimePicker = () => {
    const [hour, minute] = (form.time || '09:00').split(':');
    setDraftTime({ hour, minute });
    setTimePickerOpen(true);
  };

  const handleSubmit = async () => {
    if (['Presencial', 'Mixta'].includes(form.modality) && !form.room.trim()) {
      Alert.alert('Falta la sala', 'Ingresá el nombre de la sala para esta modalidad.');
      return;
    }
    if (['Virtual', 'Mixta'].includes(form.modality) && !/^https?:\/\//i.test(form.videoConferenceUrl.trim())) {
      Alert.alert('Enlace inválido', 'Ingresá el enlace de videoconferencia comenzando con http:// o https://.');
      return;
    }
    if (form.modality === 'Telefonica' && !form.phoneNumber.trim()) {
      Alert.alert('Falta el teléfono', 'Ingresá el número de teléfono de la audiencia.');
      return;
    }
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
        modality: form.modality || null,
        modalidad: form.modality || null,
        room: form.room.trim(),
        videoConferenceUrl: form.videoConferenceUrl.trim(),
        phoneNumber: form.phoneNumber.trim(),
      });

      setSuccessFeedback({
        title: 'Audiencia creada',
        message: `La audiencia “${form.title.trim()}” se guardó correctamente.`,
      });
    } catch (error) {
      console.error('[NewHearingScreen] No se pudo crear la audiencia.');
      Alert.alert(
        'No pudimos registrar la audiencia',
        error instanceof Error ? error.message : 'Intenta nuevamente.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const closeSuccessFeedback = () => {
    setSuccessFeedback(null);
    navigation.goBack();
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
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      style={styles.screen}
    >
      <View style={styles.heroCard}>
        <View style={styles.heroIcon}>
          <MaterialCommunityIcons color={colors.primary} name="calendar-plus-outline" size={26} />
        </View>
        <View style={styles.heroCopy}>
          <Text style={styles.title}>Nueva audiencia</Text>
          <Text style={styles.subtitle}>
            Completá los datos y vinculá la audiencia con una causa.
          </Text>
        </View>
      </View>

      <Field label="Título de la audiencia" styles={styles}>
        <TextInput
          onChangeText={(value) => updateField('title', value)}
          placeholder="Ej. Audiencia preliminar"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          value={form.title}
        />
      </Field>

      <Field label="Causa vinculada" hint="Elegí una causa para asociar esta audiencia." styles={styles}>
        <View style={styles.selectorList}>
          {cases.map((item) => {
            const selected = String(item?.id) === form.caseId;
            return (
              <Pressable
                key={item?.id}
                onPress={() => updateField('caseId', String(item?.id))}
                style={[styles.selectorCard, selected && styles.selectorCardActive]}
              >
                <View style={styles.selectorContent}>
                  <Text style={[styles.selectorTitle, selected && styles.selectorTitleActive]}>
                    {item?.title || 'Causa sin titulo'}
                  </Text>
                  <Text style={[styles.selectorMeta, selected && styles.selectorMetaActive]}>
                    {item?.court || 'Juzgado a confirmar'}
                  </Text>
                </View>
                <View style={[styles.selectorCheck, selected && styles.selectorCheckActive]}>
                  {selected ? <MaterialCommunityIcons color={colors.textOnPrimary} name="check" size={16} /> : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      </Field>

      <View style={styles.dualRow}>
        <Field containerStyle={styles.dualField} label="Fecha" styles={styles}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Elegir fecha${form.date ? `, ${form.date}` : ''}`} onPress={() => setDatePickerOpen(true)} style={styles.pickerInput}>
            <MaterialCommunityIcons color={colors.textSecondary} name="calendar-month-outline" size={19} />
            <Text style={[styles.pickerText, !form.date && styles.pickerPlaceholder]}>{form.date || 'dd/mm/aaaa'}</Text>
            <MaterialCommunityIcons color={colors.textMuted} name="chevron-down" size={18} />
          </Pressable>
        </Field>

        <Field containerStyle={styles.dualField} label="Horario" styles={styles}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Elegir horario${form.time ? `, ${form.time}` : ''}`} onPress={openTimePicker} style={styles.pickerInput}>
            <MaterialCommunityIcons color={colors.textSecondary} name="clock-outline" size={19} />
            <Text style={[styles.pickerText, !form.time && styles.pickerPlaceholder]}>{form.time || 'HH:mm'}</Text>
            <MaterialCommunityIcons color={colors.textMuted} name="chevron-down" size={18} />
          </Pressable>
        </Field>
      </View>

      <View style={styles.assistRow}>
        <View style={styles.assistBlock}>
          <Text style={styles.assistLabel}>Fechas rápidas</Text>
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

      {['Presencial', 'Mixta'].includes(form.modality) ? <Field label="Sala" styles={styles}>
        <TextInput onChangeText={(value) => updateField('room', value)} placeholder="Nombre de la sala" placeholderTextColor={colors.textMuted} style={styles.input} value={form.room} />
      </Field> : null}
      {['Virtual', 'Mixta'].includes(form.modality) ? <Field label="Enlace de videoconferencia" styles={styles}>
        <TextInput autoCapitalize="none" keyboardType="url" onChangeText={(value) => updateField('videoConferenceUrl', value)} placeholder="https://..." placeholderTextColor={colors.textMuted} style={styles.input} value={form.videoConferenceUrl} />
      </Field> : null}
      {form.modality === 'Telefonica' ? <Field label="Número de teléfono" styles={styles}>
        <TextInput keyboardType="phone-pad" onChangeText={(value) => updateField('phoneNumber', value)} placeholder="+54..." placeholderTextColor={colors.textMuted} style={styles.input} value={form.phoneNumber} />
      </Field> : null}

      {selectedCase ? (
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Resumen de la audiencia</Text>
          <Text style={styles.summaryText}>Causa: {selectedCase?.title}</Text>
          <Text style={styles.summaryText}>Juzgado: {selectedCase?.court || 'Juzgado a confirmar'}</Text>
          <Text style={styles.summaryText}>
            Fecha y hora: {form.date || 'Pendiente'}{form.time ? ` · ${form.time} hs` : ''}
          </Text>
          <Text style={styles.summaryText}>
            Modalidad: {form.modality || 'Sin modalidad'}
          </Text>
          {form.modality === 'Presencial' || form.modality === 'Mixta' ? <Text style={styles.summaryText}>Sala: {form.room || 'Sin informar'}</Text> : null}
          {form.modality === 'Virtual' || form.modality === 'Mixta' ? <Text style={styles.summaryText}>Enlace de videoconferencia: {form.videoConferenceUrl || 'Sin informar'}</Text> : null}
          {form.modality === 'Telefonica' ? <Text style={styles.summaryText}>Número de teléfono: {form.phoneNumber || 'Sin informar'}</Text> : null}
        </View>
      ) : null}

      <Pressable
        disabled={submitting}
        onPress={handleSubmit}
        style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
      >
        {submitting ? <ActivityIndicator color={colors.textOnPrimary} size="small" /> : null}
        <Text style={styles.submitButtonText}>
          {submitting ? 'Guardando cambios...' : 'Guardar audiencia'}
        </Text>
      </Pressable>

      <ActionFeedbackModal
        actionLabel="Volver al calendario"
        message={successFeedback?.message}
        onClose={closeSuccessFeedback}
        title={successFeedback?.title}
        visible={Boolean(successFeedback)}
      />
      <DatePickerModal
        visible={datePickerOpen}
        selectedValue={form.date ? parseMaskedDateToIso(form.date) : ''}
        confirmSelection
        colors={colors}
        onClose={() => setDatePickerOpen(false)}
        onSelect={(value) => {
          if (value) {
            const [year, month, day] = value.split('-');
            updateField('date', `${day}/${month}/${year}`);
          }
          setDatePickerOpen(false);
        }}
      />
      <TimePickerModal
        visible={timePickerOpen}
        value={draftTime}
        colors={colors}
        onChange={setDraftTime}
        onClose={() => setTimePickerOpen(false)}
        onConfirm={() => {
          updateField('time', `${draftTime.hour}:${draftTime.minute}`);
          setTimePickerOpen(false);
        }}
      />
    </ScrollView>
  );
}

function Field({ children, containerStyle, hint, label, styles }) {
  return (
    <View style={[styles.field, containerStyle]}>
      <Text style={styles.label}>{label}</Text>
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
      {children}
    </View>
  );
}

export function TimePickerModal({ visible, value, colors, onChange, onClose, onConfirm }) {
  const styles = useMemo(() => createTimePickerStyles(colors), [colors]);
  return <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
    <View style={styles.backdrop}>
      <Pressable accessibilityRole="button" accessibilityLabel="Cerrar selector de horario" onPress={onClose} style={StyleSheet.absoluteFill} />
      <View accessibilityViewIsModal style={styles.dialog}>
        <Text style={styles.title}>Elegir horario</Text>
        <Text style={styles.preview}>{value.hour}:{value.minute}</Text>
        <View style={styles.columns}>
          <View style={styles.column}><Text style={styles.columnLabel}>Hora</Text><ScrollView style={styles.options} nestedScrollEnabled showsVerticalScrollIndicator>{Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')).map((hour) => <Pressable accessibilityRole="button" accessibilityState={{ selected: value.hour === hour }} key={hour} onPress={() => onChange((current) => ({ ...current, hour }))} style={[styles.option, value.hour === hour && styles.optionActive]}><Text style={[styles.optionText, value.hour === hour && styles.optionTextActive]}>{hour}</Text></Pressable>)}</ScrollView></View>
          <View style={styles.column}><Text style={styles.columnLabel}>Minuto</Text><ScrollView style={styles.options} nestedScrollEnabled showsVerticalScrollIndicator>{Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0')).map((minute) => <Pressable accessibilityRole="button" accessibilityState={{ selected: value.minute === minute }} key={minute} onPress={() => onChange((current) => ({ ...current, minute }))} style={[styles.option, value.minute === minute && styles.optionActive]}><Text style={[styles.optionText, value.minute === minute && styles.optionTextActive]}>{minute}</Text></Pressable>)}</ScrollView></View>
        </View>
        <View style={styles.actions}><Pressable onPress={onClose} style={styles.cancel}><Text style={styles.cancelText}>Cancelar</Text></Pressable><Pressable onPress={onConfirm} style={styles.confirm}><Text style={styles.confirmText}>Confirmar</Text></Pressable></View>
      </View>
    </View>
  </Modal>;
}

const createTimePickerStyles = (colors) => StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 16, backgroundColor: 'rgba(0, 0, 0, 0.58)' },
  dialog: { width: '100%', maxWidth: 360, maxHeight: '85%', padding: 18, borderRadius: 20, borderWidth: 1, borderColor: colors.borderSoft, backgroundColor: colors.card },
  title: { color: colors.text, fontSize: 18, fontWeight: '700', textAlign: 'center' },
  preview: { color: colors.primary, fontSize: 32, fontWeight: '800', textAlign: 'center', marginVertical: 12 },
  columns: { flexDirection: 'row', gap: 12, height: 260 },
  column: { flex: 1, minWidth: 0 },
  columnLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: '700', textAlign: 'center', marginBottom: 6 },
  options: { flex: 1, borderRadius: 12, backgroundColor: colors.backgroundAlt },
  option: { minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 10, marginHorizontal: 4, marginVertical: 2 },
  optionActive: { backgroundColor: colors.primary },
  optionText: { color: colors.textSecondary, fontSize: 15 },
  optionTextActive: { color: colors.textOnPrimary, fontWeight: '700' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 14, borderTopWidth: 1, borderTopColor: colors.borderSoft, paddingTop: 12 },
  cancel: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 12 },
  cancelText: { color: colors.textSecondary, fontSize: 14, fontWeight: '600' },
  confirm: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 12, backgroundColor: colors.primary },
  confirmText: { color: colors.textOnPrimary, fontSize: 14, fontWeight: '700' },
});

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
  heroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.card,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: 18,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 3,
  },
  heroIcon: {
    width: 52,
    height: 52,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
  },
  heroCopy: {
    flex: 1,
    gap: 5,
  },
  field: {
    gap: 10,
  },
  label: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  fieldHint: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    marginTop: -4,
  },
  input: {
    minHeight: 50,
    backgroundColor: colors.inputBackground,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: colors.text,
    fontSize: 15,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 2,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  pickerInput: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: colors.inputBackground,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  pickerText: { flex: 1, color: colors.text, fontSize: 15 },
  pickerPlaceholder: { color: colors.textMuted },
  selectorList: {
    gap: 10,
  },
  selectorCard: {
    backgroundColor: colors.card,
    borderRadius: 22,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  selectorCardActive: {
    borderColor: colors.primary,
    backgroundColor: colors.accentSoft,
  },
  selectorContent: {
    flex: 1,
  },
  selectorCheck: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.backgroundAlt,
  },
  selectorCheckActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
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
    flexDirection: layout.isCompact ? 'column' : 'row',
    gap: 12,
  },
  dualField: layout.isCompact
    ? {}
    : {
        flex: 1,
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
    minHeight: 52,
    borderRadius: 16,
    paddingVertical: 14,
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
