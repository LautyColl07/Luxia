import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { LEGAL_STUDY_ROLES } from '../services/api';
import { useAppTheme } from '../context/ThemeContext';
import OptionSheetSelector from './OptionSheetSelector';

const ROLE_OPTIONS = [
  {
    value: LEGAL_STUDY_ROLES.MEMBER,
    label: 'Member',
    description: 'Puede crear causas compartidas y colaborar activamente.',
  },
  {
    value: LEGAL_STUDY_ROLES.VIEWER,
    label: 'Viewer',
    description: 'Solo lectura sobre causas, audiencias y documentos.',
  },
  {
    value: LEGAL_STUDY_ROLES.ADMIN,
    label: 'Admin',
    description: 'Puede invitar miembros y administrar causas del estudio.',
  },
];

export default function InviteMemberModal({
  visible,
  onClose,
  onSubmit,
  submitting = false,
  legalStudyName,
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [form, setForm] = useState({
    email: '',
    role: LEGAL_STUDY_ROLES.MEMBER,
  });

  const selectedRole = ROLE_OPTIONS.find((item) => item.value === form.role);

  const handleClose = () => {
    if (submitting) {
      return;
    }

    setForm({ email: '', role: LEGAL_STUDY_ROLES.MEMBER });
    onClose?.();
  };

  const handleSubmit = () => {
    onSubmit?.(
      {
        email: form.email.trim(),
        role: form.role,
      },
      () => {
        setForm({ email: '', role: LEGAL_STUDY_ROLES.MEMBER });
      }
    );
  };

  return (
    <Modal animationType="fade" onRequestClose={handleClose} transparent visible={visible}>
      <View style={styles.backdrop}>
        <Pressable onPress={handleClose} style={StyleSheet.absoluteFill} />

        <View style={styles.modalCard}>
          <View style={styles.header}>
            <Text style={styles.title}>Invitar miembro</Text>
            <Pressable onPress={handleClose} style={styles.iconButton}>
              <MaterialCommunityIcons color={colors.textSecondary} name="close" size={20} />
            </Pressable>
          </View>

          <Text style={styles.subtitle}>
            {legalStudyName
              ? `Agrega un miembro a ${legalStudyName}.`
              : 'Agrega o invita un nuevo miembro al Estudio Juridico.'}
          </Text>

          <View style={styles.field}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              autoCapitalize="none"
              keyboardType="email-address"
              onChangeText={(value) => setForm((current) => ({ ...current, email: value }))}
              placeholder="usuario@email.com"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              value={form.email}
            />
          </View>

          <OptionSheetSelector
            label="Rol"
            onChange={(role) => setForm((current) => ({ ...current, role }))}
            options={ROLE_OPTIONS.map((item) => ({
              ...item,
              selected: item.value === form.role,
            }))}
            valueLabel={selectedRole?.label || 'Member'}
          />

          <View style={styles.actions}>
            <Pressable onPress={handleClose} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Cancelar</Text>
            </Pressable>

            <Pressable disabled={submitting} onPress={handleSubmit} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>
                {submitting ? 'Enviando...' : 'Invitar miembro'}
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
