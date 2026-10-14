import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppTheme } from '../../context/ThemeContext';

// A single anchored menu is shared by document actions and future toolbar options.
export default function DocumentPopover({ label, icon, children, triggerStyle, textStyle, options, message }) {
  const { colors } = useAppTheme();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const trigger = useRef(null);
  const closeButton = useRef(null);
  const [anchor, setAnchor] = useState(null);
  const styles = useMemo(() => createStyles(colors), [colors]);
  const close = () => {
    setAnchor(null);
    trigger.current?.focus?.();
  };

  useEffect(() => {
    if (!anchor || Platform.OS !== 'web') return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    closeButton.current?.focus?.();
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [anchor]);

  const menuWidth = Math.min(280, width - 24);
  const maxHeight = Math.max(80, height - insets.top - insets.bottom - 24);
  const estimatedHeight = Math.min(maxHeight, 64 + (message ? 72 : 0) + options.length * 44);
  const left = Math.max(12, Math.min((anchor?.x || 0) + (anchor?.width || 0) - menuWidth, width - menuWidth - 12));
  const below = (anchor?.y || 0) + (anchor?.height || 0) + 6;
  const top = below + estimatedHeight <= height - insets.bottom - 12
    ? below : Math.max(insets.top + 12, (anchor?.y || 0) - estimatedHeight - 6);

  return (
    <>
      <Pressable
        ref={trigger}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ expanded: Boolean(anchor) }}
        aria-expanded={Boolean(anchor)}
        aria-haspopup="menu"
        onPress={() => trigger.current?.measureInWindow((x, y, measuredWidth, measuredHeight) => {
          setAnchor({ x, y, width: measuredWidth, height: measuredHeight });
        })}
        style={({ pressed, focused, hovered }) => [
          styles.trigger, triggerStyle,
          hovered && styles.hovered, focused && styles.focused, pressed && styles.pressed,
        ]}
      >
        {icon ? <MaterialCommunityIcons name={icon} size={19} color={colors.textSecondary} /> : null}
        {children || (textStyle ? <Text style={textStyle}>{label}</Text> : null)}
      </Pressable>
      <Modal transparent visible={Boolean(anchor)} animationType="none" onRequestClose={close}>
        <View style={styles.overlay}>
          <Pressable accessibilityRole="button" accessibilityLabel="Cerrar menú" onPress={close} style={StyleSheet.absoluteFill} />
          <View accessibilityViewIsModal accessibilityLabel={label} onAccessibilityEscape={close}
            style={[styles.menu, { width: menuWidth, maxHeight, left, top }]}>
            <View style={styles.menuHeader}>
              <Text numberOfLines={2} style={styles.menuTitle}>{label}</Text>
              <Pressable ref={closeButton} accessibilityRole="button" accessibilityLabel="Cerrar menú"
                onPress={close} style={styles.close}>
                <MaterialCommunityIcons name="close" size={19} color={colors.textSecondary} />
              </Pressable>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
              {message ? <Text style={styles.message}>{message}</Text> : null}
              {options.map((option) => (
                <Pressable key={option.value} accessibilityRole="button"
                  accessibilityLabel={option.label} accessibilityState={{ disabled: Boolean(option.disabled) }}
                  aria-disabled={Boolean(option.disabled)}
                  disabled={option.disabled}
                  onPress={() => { close(); option.onPress?.(); }}
                  style={({ pressed, focused, hovered }) => [
                    styles.option, option.disabled && styles.disabled,
                    hovered && styles.hovered, focused && styles.focused, pressed && styles.pressed,
                  ]}>
                  {option.icon ? <MaterialCommunityIcons name={option.icon} size={18} color={option.destructive ? colors.danger : colors.textSecondary} /> : null}
                  <Text style={[styles.optionText, option.destructive && { color: colors.danger }]}>{option.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const createStyles = (colors) => StyleSheet.create({
  trigger: { minHeight: 44, minWidth: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: 'transparent', borderRadius: 10, ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}) },
  hovered: { backgroundColor: colors.accentSoft },
  focused: { borderColor: colors.focusRing },
  pressed: { opacity: 0.72 },
  overlay: { flex: 1 },
  menu: { position: 'absolute', backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 14, padding: 8, elevation: 8, shadowColor: colors.shadow, shadowOpacity: 0.15, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
  menuHeader: { flexDirection: 'row', alignItems: 'center', paddingLeft: 8, gap: 8 },
  menuTitle: { flex: 1, color: colors.text, fontSize: 13, fontWeight: '700' },
  close: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  message: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, paddingHorizontal: 8, paddingBottom: 8 },
  option: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, borderWidth: 1, borderColor: 'transparent', borderRadius: 8 },
  optionText: { color: colors.text, fontSize: 13, flexShrink: 1 },
  disabled: { opacity: 0.6 },
});
