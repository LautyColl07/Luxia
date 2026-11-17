import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

export default function DatePickerModal({ visible, selectedValue = '', minDate = '', maxDate = '', confirmSelection = false, colors, onClose, onSelect }) {
  const today = new Date();
  const [month, setMonth] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const [draftValue, setDraftValue] = useState(selectedValue);
  const styles = useMemo(() => createStyles(colors), [colors]);

  useEffect(() => {
    if (!visible) return;
    const selected = parseIsoDate(selectedValue) || new Date();
    setMonth({ year: selected.getFullYear(), month: selected.getMonth() });
    setDraftValue(selectedValue);
  }, [visible, selectedValue]);

  const first = new Date(month.year, month.month, 1);
  const offset = (first.getDay() + 6) % 7;
  const days = new Date(month.year, month.month + 1, 0).getDate();
  const cells = [...Array(offset).fill(null), ...Array.from({ length: days }, (_, index) => index + 1)];
  while (cells.length % 7) cells.push(null);
  const monthLabel = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' }).format(first);
  const moveMonth = (delta) => {
    const next = new Date(month.year, month.month + delta, 1);
    setMonth({ year: next.getFullYear(), month: next.getMonth() });
  };

  return <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
    <View style={styles.backdrop}>
      <Pressable accessibilityRole="button" accessibilityLabel="Cerrar calendario" onPress={onClose} style={StyleSheet.absoluteFill} />
      <View accessibilityViewIsModal style={styles.dialog}>
        <View style={styles.header}>
          <Text style={styles.title}>Elegir fecha</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Cerrar calendario" onPress={onClose} style={styles.closeButton}><MaterialCommunityIcons color={colors.textSecondary} name="close" size={20} /></Pressable>
        </View>
        <View style={styles.monthRow}>
          <Pressable accessibilityRole="button" accessibilityLabel="Mes anterior" onPress={() => moveMonth(-1)} style={styles.monthButton}><MaterialCommunityIcons color={colors.text} name="chevron-left" size={23} /></Pressable>
          <Text style={styles.monthLabel}>{monthLabel}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Mes siguiente" onPress={() => moveMonth(1)} style={styles.monthButton}><MaterialCommunityIcons color={colors.text} name="chevron-right" size={23} /></Pressable>
        </View>
        <View style={styles.grid}>
          {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((day, index) => <Text key={`${day}-${index}`} style={styles.weekday}>{day}</Text>)}
          {cells.map((day, index) => {
            if (!day) return <View key={`empty-${index}`} style={styles.dayCell} />;
            const value = `${month.year}-${String(month.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const selected = value === (confirmSelection ? draftValue : selectedValue);
            const disabled = Boolean((minDate && value < minDate) || (maxDate && value > maxDate));
            return <Pressable accessibilityRole="button" accessibilityLabel={value} accessibilityState={{ selected, disabled }} disabled={disabled} key={value} onPress={() => confirmSelection ? setDraftValue(value) : onSelect(value)} style={[styles.dayCell, selected && styles.selectedDay, disabled && styles.disabledDay]}>
              <Text style={[styles.dayText, selected && styles.selectedDayText, disabled && styles.disabledDayText]}>{day}</Text>
            </Pressable>;
          })}
        </View>
        <View style={styles.footer}>
          <Pressable onPress={onClose} style={styles.cancelButton}><Text style={styles.cancelText}>Cancelar</Text></Pressable>
          {confirmSelection ? <Pressable disabled={!draftValue} onPress={() => onSelect(draftValue)} style={styles.confirmButton}><Text style={styles.confirmText}>Confirmar</Text></Pressable> : null}
        </View>
      </View>
    </View>
  </Modal>;
}

function parseIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

const createStyles = (colors) => StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 16, backgroundColor: 'rgba(0, 0, 0, 0.58)' },
  dialog: { width: '100%', maxWidth: 380, padding: 18, borderRadius: 20, borderWidth: 1, borderColor: colors.borderSoft, backgroundColor: colors.card, shadowColor: colors.shadow, shadowOpacity: 0.2, shadowRadius: 20, elevation: 10 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: colors.text, fontSize: 18, fontWeight: '700' },
  closeButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, marginBottom: 12 },
  monthButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: colors.backgroundAlt },
  monthLabel: { color: colors.text, fontSize: 15, fontWeight: '700', textTransform: 'capitalize' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  weekday: { width: `${100 / 7}%`, height: 36, textAlign: 'center', textAlignVertical: 'center', color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  dayCell: { width: `${100 / 7}%`, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  dayText: { color: colors.text, fontSize: 14 },
  selectedDay: { backgroundColor: colors.primary },
  selectedDayText: { color: colors.textOnPrimary, fontWeight: '700' },
  disabledDay: { opacity: 0.3 },
  disabledDayText: { color: colors.textMuted },
  footer: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.borderSoft },
  cancelButton: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 12 },
  cancelText: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
  confirmButton: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 10, backgroundColor: colors.primary },
  confirmText: { color: colors.textOnPrimary, fontSize: 13, fontWeight: '700' },
});
