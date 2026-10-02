import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '../context/ThemeContext';

export default function ActionFeedbackModal({
  visible,
  title,
  message,
  actionLabel = 'Continuar',
  onClose,
}) {
  const { colors } = useAppTheme();

  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      transparent
      visible={visible}
    >
      <View style={styles.overlay}>
        <Pressable onPress={onClose} style={StyleSheet.absoluteFill} />
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.borderSoft }]}>
          <View style={[styles.iconWrapper, { backgroundColor: colors.successSoft }]}>
            <MaterialCommunityIcons color={colors.success} name="check" size={30} />
          </View>
          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
          <Text style={[styles.message, { color: colors.textSecondary }]}>{message}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: colors.primary },
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={[styles.buttonText, { color: colors.textOnPrimary }]}>{actionLabel}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(7, 21, 37, 0.48)',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    alignItems: 'center',
    borderRadius: 24,
    borderWidth: 1,
    padding: 26,
    shadowColor: '#071525',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.22,
    shadowRadius: 28,
    elevation: 10,
  },
  iconWrapper: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
    textAlign: 'center',
  },
  button: {
    minHeight: 48,
    minWidth: 150,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    marginTop: 22,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  buttonPressed: {
    opacity: 0.82,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '800',
  },
});
