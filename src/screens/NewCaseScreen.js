import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { useAppTheme } from '../context/ThemeContext';
import { createCase } from '../services/api';
import { showSuccessAndGoBack } from '../utils/formFeedback';
import { normalizeStatusLabel } from '../utils/status';

const STATUS_OPTIONS = ['Activa', 'Pendiente', 'En proceso', 'Archivada'];

export default function NewCaseScreen({ navigation }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [form, setForm] = useState({
    title: '',
    description: '',
    court: '',
    status: 'Activa',
  });
  const [submitting, setSubmitting] = useState(false);

  const updateField = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const handleSubmit = async () => {
    if (!form.title.trim()) {
      Alert.alert('Informacion incompleta', 'Ingresa la caratula o el nombre de la causa para continuar.');
      return;
    }

    try {
      setSubmitting(true);
      await createCase({
        title: form.title.trim(),
        description: form.description.trim(),
        court: form.court.trim(),
        status: form.status,
      });

      showSuccessAndGoBack(navigation, 'Causa cargada', 'La causa se guardo correctamente.');
    } catch (error) {
      console.error('[NewCaseScreen] Error creando causa:', error);
      Alert.alert(
        'No pudimos registrar la causa',
        error instanceof Error ? error.message : 'Intenta nuevamente.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} style={styles.screen}>
      <Text style={styles.title}>Nueva causa</Text>
      <Text style={styles.subtitle}>
        Registra un expediente con su caratula, descripcion, juzgado y estado inicial.
      </Text>

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
          placeholder="Ej. Juzgado Civil N° 12"
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

      <Pressable
        disabled={submitting}
        onPress={handleSubmit}
        style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
      >
        <Text style={styles.submitButtonText}>{submitting ? 'Guardando cambios...' : 'Guardar causa'}</Text>
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
