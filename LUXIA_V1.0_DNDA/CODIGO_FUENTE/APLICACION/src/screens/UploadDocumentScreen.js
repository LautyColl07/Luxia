import * as DocumentPicker from 'expo-document-picker';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import LoadingState from '../components/LoadingState';
import { useStudyContext } from '../context/StudyContext';
import { useAppTheme } from '../context/ThemeContext';
import { getHearings, uploadDocument } from '../services/api';
import { formatDateTime } from '../utils/date';
import { showSuccessAndGoBack } from '../utils/formFeedback';

const DOCUMENT_TYPES = ['Demanda', 'Escrito', 'Prueba', 'Anexo'];

export default function UploadDocumentScreen({ navigation }) {
  const { colors } = useAppTheme();
  const { activeContextKey } = useStudyContext();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [hearings, setHearings] = useState([]);
  const [loadingHearings, setLoadingHearings] = useState(true);
  const [hearingsError, setHearingsError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [form, setForm] = useState({
    hearingId: '',
    documentType: 'Escrito',
  });

  useEffect(() => {
    void loadHearings();
  }, [activeContextKey]);

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

  const handleSelectFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
        type: [
          'application/pdf',
          'image/*',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ],
      });

      if (result.canceled) {
        return;
      }

      const asset = result.assets?.[0] || null;

      if (!asset?.uri) {
        Alert.alert('Archivo invalido', 'No pudimos leer el archivo seleccionado.');
        return;
      }

      setSelectedAsset(asset);
      Alert.alert('Archivo seleccionado', `${asset.name || 'Documento'} quedo listo para subirse.`);
    } catch (error) {
      console.error('[UploadDocumentScreen] Error seleccionando archivo:', error);
      Alert.alert('No se pudo seleccionar el archivo', 'Intenta nuevamente.');
    }
  };

  const handleUpload = async () => {
    if (!form.hearingId || !selectedAsset?.uri) {
      Alert.alert(
        'Informacion incompleta',
        'Selecciona una audiencia y un archivo para continuar.'
      );
      return;
    }

    try {
      setSubmitting(true);
      await uploadDocument({
        hearingId: form.hearingId,
        documentType: form.documentType,
        asset: selectedAsset,
      });

      showSuccessAndGoBack(
        navigation,
        'Documento cargado',
        'El documento se vinculo correctamente con la audiencia.'
      );
    } catch (error) {
      console.error('[UploadDocumentScreen] Error subiendo documento:', error);
      Alert.alert(
        'No se pudo subir el documento.',
        error instanceof Error ? error.message : 'No se pudo subir el documento.'
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
        <Text style={styles.submitButtonText}>
          {submitting ? 'Subiendo...' : 'Guardar documento'}
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
