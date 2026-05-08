import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '../context/ThemeContext';

export default function OptionSheetSelector({
  label,
  valueLabel,
  options = [],
  onChange,
  placeholder = 'Seleccionar',
  helperText,
  disabled = false,
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [visible, setVisible] = useState(false);

  const selectedLabel = valueLabel || placeholder;

  return (
    <View style={styles.wrapper}>
      {label ? <Text style={styles.label}>{label}</Text> : null}

      <Pressable
        disabled={disabled}
        onPress={() => setVisible(true)}
        style={[styles.trigger, disabled && styles.triggerDisabled]}
      >
        <Text numberOfLines={1} style={[styles.triggerText, !valueLabel && styles.placeholderText]}>
          {selectedLabel}
        </Text>
        <MaterialCommunityIcons color={colors.textSecondary} name="chevron-down" size={20} />
      </Pressable>

      {helperText ? <Text style={styles.helperText}>{helperText}</Text> : null}

      <Modal animationType="fade" onRequestClose={() => setVisible(false)} transparent visible={visible}>
        <View style={styles.backdrop}>
          <Pressable onPress={() => setVisible(false)} style={StyleSheet.absoluteFill} />

          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{label || 'Seleccionar'}</Text>
              <Pressable onPress={() => setVisible(false)} style={styles.closeButton}>
                <MaterialCommunityIcons color={colors.textSecondary} name="close" size={20} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.optionList}>
                {options.map((option) => {
                  const selected = option.selected;

                  return (
                    <Pressable
                      disabled={option.disabled}
                      key={option.key || String(option.value)}
                      onPress={() => {
                        if (option.disabled) {
                          return;
                        }

                        onChange?.(option.value, option);
                        setVisible(false);
                      }}
                      style={[
                        styles.optionCard,
                        selected && styles.optionCardSelected,
                        option.disabled && styles.optionCardDisabled,
                      ]}
                    >
                      <View style={styles.optionCopy}>
                        <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>
                          {option.label}
                        </Text>
                        {option.description ? (
                          <Text
                            style={[styles.optionDescription, selected && styles.optionDescriptionSelected]}
                          >
                            {option.description}
                          </Text>
                        ) : null}
                      </View>

                      {selected ? (
                        <MaterialCommunityIcons color={colors.primary} name="check-circle" size={20} />
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    wrapper: {
      gap: 8,
    },
    label: {
      color: colors.text,
      fontSize: 14,
      fontWeight: '700',
    },
    trigger: {
      minHeight: 54,
      borderRadius: 18,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.borderSoft,
      paddingHorizontal: 16,
      paddingVertical: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    triggerDisabled: {
      opacity: 0.58,
    },
    triggerText: {
      flex: 1,
      color: colors.text,
      fontSize: 14,
      fontWeight: '600',
    },
    placeholderText: {
      color: colors.textMuted,
      fontWeight: '500',
    },
    helperText: {
      color: colors.textSecondary,
      fontSize: 12,
      lineHeight: 18,
    },
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.28)',
      justifyContent: 'flex-end',
      padding: 18,
    },
    sheet: {
      maxHeight: '78%',
      backgroundColor: colors.card,
      borderRadius: 28,
      padding: 18,
      borderWidth: 1,
      borderColor: colors.borderSoft,
    },
    sheetHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 14,
    },
    sheetTitle: {
      color: colors.text,
      fontSize: 18,
      fontWeight: '700',
      flex: 1,
    },
    closeButton: {
      width: 36,
      height: 36,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.backgroundAlt,
    },
    optionList: {
      gap: 10,
      paddingBottom: 4,
    },
    optionCard: {
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.borderSoft,
      padding: 16,
      backgroundColor: colors.backgroundAlt,
      flexDirection: 'row',
      gap: 12,
      alignItems: 'flex-start',
      justifyContent: 'space-between',
    },
    optionCardSelected: {
      borderColor: colors.primary,
      backgroundColor: colors.accentSoft,
    },
    optionCardDisabled: {
      opacity: 0.55,
    },
    optionCopy: {
      flex: 1,
    },
    optionLabel: {
      color: colors.text,
      fontSize: 15,
      fontWeight: '700',
    },
    optionLabelSelected: {
      color: colors.primary,
    },
    optionDescription: {
      color: colors.textSecondary,
      fontSize: 13,
      lineHeight: 19,
      marginTop: 5,
    },
    optionDescriptionSelected: {
      color: colors.primary,
    },
  });
