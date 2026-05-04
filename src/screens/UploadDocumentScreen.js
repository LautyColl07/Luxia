import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import LoadingState from '../components/LoadingState';
import { useAppTheme } from '../context/ThemeContext';
import { getHearings, uploadDocument } from '../services/api';
import { formatDateTime } from '../utils/date';
import { showSuccessAndGoBack } from '../utils/formFeedback';

const DOCUMENT_TYPES = ['Demanda', 'Escrito', 'Prueba', 'Anexo'];

export default function UploadDocumentScreen({ navigation }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [hearings, setHearings] = useState([]);
  const [loadingHearings, setLoadingHearings] = useState(true);
  const [hearingsError, setHearingsError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [selectedFile, setSelectedFile] = useState('');
  const [form, setForm] = useState({
    hearingId: '',
    fileName: '',
    documentType: 'Escrito',
  });

  useEffect(() => {
    void loadHearings();
  }, []);

  async function loadHearings() {
    try {
      setLoadingHearings(true);
      setHearingsError('');
      const items = await getHearings();
      setHearings(Array.isArray(items) ? items : []);
    } catch (error) {
      console.error('[UploadDocumentScreen] Error cargando audiencias:', error);
      setHearings([]);
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

  const handleSelectFile = () => {
    const fileLabel = `documento_${Date.now()}.pdf`;
    setSelectedFile(fileLabel);
    if (!form.fileName) {
      updateField('fileName', fileLabel);
    }
    Alert.alert('Archivo seleccionado', `${fileLabel} quedo listo para registrarse.`);
  };

  const handleUpload = async () => {
    if (!form.hearingId || !form.fileName.trim()) {
      Alert.alert(
        'Informacion incompleta',
        'Selecciona una audiencia y define el nombre del archivo para continuar.'
      );
      return;
    }

    try {
      setSubmitting(true);
      await uploadDocument({
        hearingId: form.hearingId,
        fileName: form.fileName.trim(),
        documentType: form.documentType,
        localUri: selectedFile || 'archivo_simulado.pdf',
      });

      showSuccessAndGoBack(
        navigation,
        'Documento cargado',
        'El documento se vinculo correctamente con la audiencia.'
      );
    } catch (error) {
      console.error('[UploadDocumentScreen] Error subiendo documento:', error);
      Alert.alert(
        'No pudimos registrar el documento',
        error instanceof Error ? error.message : 'Intenta nuevamente.'
      );
    } finally {
      setSubmitting(false);
    }
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
        onAction={() => navigation.navigate('NewHearing')}
        title="Sin audiencias registradas"
      />
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} style={styles.screen}>
      <Text style={styles.title}>Subir documento</Text>
      <Text style={styles.subtitle}>
        Registra un documento y vinculalo con la audiencia correspondiente.
      </Text>

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

      <Field label="Nombre del archivo" styles={styles}>
        <TextInput
          onChangeText={(value) => updateField('fileName', value)}
          placeholder="Ej. contestacion_demanda.pdf"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          value={form.fileName}
        />
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

      <Pressable onPress={handleSelectFile} style={styles.secondaryButton}>
        <Text style={styles.secondaryButtonText}>Seleccionar archivo</Text>
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
            Archivo: {selectedFile || form.fileName || 'Pendiente de seleccion'}
          </Text>
        </View>
      ) : null}

      <Pressable
        disabled={submitting}
        onPress={handleUpload}
        style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
      >
        <Text style={styles.submitButtonText}>
          {submitting ? 'Guardando cambios...' : 'Guardar documento'}
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
    borderRadius: 20,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryButtonText: {
    color: colors.primary,
    fontSize: 15,
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
