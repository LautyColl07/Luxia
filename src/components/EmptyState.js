import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '../context/ThemeContext';

export default function EmptyState({
  title,
  message,
  icon = 'inbox-outline',
  actionLabel,
  onAction,
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.card}>
      <View style={styles.iconWrapper}>
        <MaterialCommunityIcons color={colors.primary} name={icon} size={28} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          style={({ focused, hovered, pressed }) => [
            styles.button,
            hovered && styles.buttonHovered,
            focused && styles.buttonFocused,
            pressed && styles.buttonPressed,
          ]}
        >
          <Text style={styles.buttonText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  card: {
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    backgroundColor: colors.card,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 4,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  iconWrapper: {
    width: 56,
    height: 56,
    borderRadius: 20,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  message: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: 8,
  },
  button: {
    minHeight: 44,
    marginTop: 18,
    backgroundColor: colors.primary,
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 12,
    justifyContent: 'center',
  },
  buttonHovered: {
    backgroundColor: colors.primaryHover,
  },
  buttonFocused: {
    borderColor: colors.focusRing,
  },
  buttonPressed: {
    opacity: 0.86,
  },
  buttonText: {
    color: colors.textOnPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
});
