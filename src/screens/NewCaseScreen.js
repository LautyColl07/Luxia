import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { useStudyContext } from '../context/StudyContext';
import { useAppTheme } from '../context/ThemeContext';
import { createCase } from '../services/api';
import { useResponsiveLayout } from '../theme/layout';
import { showSuccessAndGoBack } from '../utils/formFeedback';
import { normalizeStatusLabel } from '../utils/status';

const STATUS_OPTIONS = ['Activa', 'Pendiente', 'En proceso', 'Archivada'];

export default function NewCaseScreen({ navigation }) {
  const { colors } = useAppTheme();
  const { legalStudies, activeLegalStudy } = useStudyContext();
  const layout = useResponsiveLayout();
  const styles = useMemo(() => createStyles(colors, layout), [colors, layout]);
  const hasStudy = legalStudies.length > 0;
  const studyId = activeLegalStudy?.id || legalStudies[0]?.id || null;
  const [form, setForm] = useState({
    title: '',
    description: '',
    court: '',
    status: 'Activa',
  });
  const [scope, setScope] = useState('PRIVATE');
  const [submitting, setSubmitting] = useState(false);

  const updateField = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const handleSubmit = async () => {
    if (!form.title.trim()) {
      Alert.alert('Informacion incompleta', 'Ingresa la caratula o el nombre de la causa para continuar.');
      return;
    }

    try {
      setSubmitting(true);
      const payload = {
        title: form.title.trim(),
        description: form.description.trim(),
        court: form.court.trim(),
        status: form.status,
        scope,
        ...(scope === 'LEGAL_STUDY' && studyId ? { legalStudyId: studyId } : {}),
      };

      console.log('[NewCaseScreen] Payload creando causa:', JSON.stringify(payload, null, 2));
      await createCase(payload);

      showSuccessAndGoBack(navigation, 'Causa cargada', 'La causa se guardo correctamente.');
    } catch (error) {
      console.error('[NewCaseScreen] Error creando causa:', error);
      console.error('[NewCaseScreen] Error backend:', error?.response || error?.data || error?.message);
      Alert.alert(
        'No pudimos registrar la causa',
        error instanceof Error ? error.message : 'Intenta nuevamente.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      style={styles.screen}
    >
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

      {/* ── Scope Selector ── */}
      <View style={styles.scopeSection}>
        <Text style={styles.scopeSectionTitle}>¿Dónde deseas guardar esta causa?</Text>
        <Text style={styles.scopeSectionHint}>
          Elegí si el expediente pertenece a tu ámbito personal o al estudio jurídico.
        </Text>
        <View style={styles.scopeCards}>
          <Pressable
            onPress={() => setScope('PRIVATE')}
            style={[
              styles.scopeCard,
              scope === 'PRIVATE' && styles.scopeCardActive,
            ]}
          >
            <View style={[
              styles.scopeIconCircle,
              scope === 'PRIVATE' && styles.scopeIconCircleActive,
            ]}>
              <MaterialCommunityIcons
                name="account-outline"
                size={24}
                color={scope === 'PRIVATE' ? colors.textOnPrimary : colors.textSecondary}
              />
            </View>
            <Text style={[
              styles.scopeCardTitle,
              scope === 'PRIVATE' && styles.scopeCardTitleActive,
            ]}>Causa Personal</Text>
            <Text style={[
              styles.scopeCardDesc,
              scope === 'PRIVATE' && styles.scopeCardDescActive,
            ]}>Solo visible para vos</Text>
            {scope === 'PRIVATE' && (
              <View style={styles.scopeCheckBadge}>
                <MaterialCommunityIcons name="check-bold" size={14} color={colors.textOnPrimary} />
              </View>
            )}
          </Pressable>

          <Pressable
            disabled={!hasStudy}
            onPress={() => setScope('LEGAL_STUDY')}
            style={[
              styles.scopeCard,
              scope === 'LEGAL_STUDY' && styles.scopeCardActive,
              !hasStudy && { opacity: 0.45 },
            ]}
          >
            <View style={[
              styles.scopeIconCircle,
              scope === 'LEGAL_STUDY' && styles.scopeIconCircleActive,
            ]}>
              <MaterialCommunityIcons
                name="office-building-outline"
                size={24}
                color={scope === 'LEGAL_STUDY' ? colors.textOnPrimary : colors.textSecondary}
              />
            </View>
            <Text style={[
              styles.scopeCardTitle,
              scope === 'LEGAL_STUDY' && styles.scopeCardTitleActive,
            ]}>Causa del Estudio</Text>
            <Text style={[
              styles.scopeCardDesc,
              scope === 'LEGAL_STUDY' && styles.scopeCardDescActive,
            ]}>{hasStudy ? 'Visible para el equipo' : 'No perteneces a un estudio'}</Text>
            {scope === 'LEGAL_STUDY' && (
              <View style={styles.scopeCheckBadge}>
                <MaterialCommunityIcons name="check-bold" size={14} color={colors.textOnPrimary} />
              </View>
            )}
          </Pressable>
        </View>
      </View>

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
  scopeSection: {
    gap: 10,
    marginTop: 6,
  },
  scopeSectionTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  scopeSectionHint: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  scopeCards: {
    flexDirection: layout.isCompact ? 'column' : 'row',
    gap: 12,
    marginTop: 4,
  },
  scopeCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 18,
    alignItems: 'center',
    gap: 10,
    borderWidth: 1.5,
    borderColor: colors.borderSoft,
    position: 'relative',
    overflow: 'hidden',
  },
  scopeCardActive: {
    borderColor: colors.primary,
    backgroundColor: colors.accentSoft || `${colors.primary}15`,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 5,
  },
  scopeIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  scopeIconCircleActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  scopeCardTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  scopeCardTitleActive: {
    color: colors.primary,
  },
  scopeCardDesc: {
    color: colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 16,
  },
  scopeCardDescActive: {
    color: colors.textSecondary,
  },
  scopeCheckBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
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
