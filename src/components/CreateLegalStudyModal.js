import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useAppTheme } from '../context/ThemeContext';

export default function CreateLegalStudyModal({
  visible,
  onClose,
  onSubmit,
  submitting = false,
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [form, setForm] = useState({ name: '', description: '' });

  const handleClose = () => {
    if (submitting) {
      return;
    }

    setForm({ name: '', description: '' });
    onClose?.();
  };

  const handleSubmit = () => {
    onSubmit?.(
      {
        name: form.name.trim(),
        description: form.description.trim(),
      },
      () => {
        setForm({ name: '', description: '' });
      }
    );
  };

  return (
    <Modal animationType="fade" onRequestClose={handleClose} transparent visible={visible}>
      <View style={styles.backdrop}>
        <Pressable onPress={handleClose} style={StyleSheet.absoluteFill} />

        <View style={styles.modalCard}>
          <View style={styles.header}>
            <Text style={styles.title}>Crear Estudio Juridico</Text>
            <Pressable onPress={handleClose} style={styles.iconButton}>
              <MaterialCommunityIcons color={colors.textSecondary} name="close" size={20} />
            </Pressable>
          </View>

          <Text style={styles.subtitle}>
            Crea un workspace juridico para compartir causas, documentos, audiencias y analisis.
          </Text>

          <View style={styles.field}>
            <Text style={styles.label}>Nombre del estudio</Text>
            <TextInput
              onChangeText={(value) => setForm((current) => ({ ...current, name: value }))}
              placeholder="Ej. Estudio Perez & Asociados"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              value={form.name}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Descripcion</Text>
            <TextInput
              multiline
              numberOfLines={4}
              onChangeText={(value) => setForm((current) => ({ ...current, description: value }))}
              placeholder="Especializacion, area de trabajo o breve descripcion del equipo."
              placeholderTextColor={colors.textMuted}
              style={[styles.input, styles.textArea]}
              textAlignVertical="top"
              value={form.description}
            />
          </View>

          <View style={styles.actions}>
            <Pressable onPress={handleClose} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Cancelar</Text>
            </Pressable>

            <Pressable disabled={submitting} onPress={handleSubmit} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>
                {submitting ? 'Creando...' : 'Crear Estudio Juridico'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.34)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
    },
    modalCard: {
      width: '100%',
      backgroundColor: colors.card,
      borderRadius: 28,
      padding: 22,
      borderWidth: 1,
      borderColor: colors.borderSoft,
      gap: 16,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 12,
    },
    title: {
      color: colors.text,
      fontSize: 22,
      fontWeight: '700',
      flex: 1,
    },
    iconButton: {
      width: 36,
      height: 36,
      borderRadius: 12,
      backgroundColor: colors.backgroundAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    subtitle: {
      color: colors.textSecondary,
      fontSize: 14,
      lineHeight: 21,
    },
    field: {
      gap: 8,
    },
    label: {
      color: colors.text,
      fontSize: 14,
      fontWeight: '700',
    },
    input: {
      backgroundColor: colors.inputBackground,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.borderSoft,
      paddingHorizontal: 16,
      paddingVertical: 14,
      color: colors.text,
      fontSize: 14,
    },
    textArea: {
      minHeight: 110,
    },
    actions: {
      flexDirection: 'row',
      gap: 12,
      justifyContent: 'flex-end',
    },
    secondaryButton: {
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderRadius: 18,
      backgroundColor: colors.backgroundAlt,
    },
    secondaryButtonText: {
      color: colors.text,
      fontSize: 14,
      fontWeight: '700',
    },
    primaryButton: {
      paddingHorizontal: 18,
      paddingVertical: 14,
      borderRadius: 18,
      backgroundColor: colors.primary,
    },
    primaryButtonText: {
      color: colors.textOnPrimary,
      fontSize: 14,
      fontWeight: '700',
    },
  });
