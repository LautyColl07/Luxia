import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { useAuth } from '../context/AuthContext';
import { useAppTheme } from '../context/ThemeContext';
import { createLuxMemory, deleteLuxMemory, getLuxMemory, normalizeLuxMemory, updateLuxMemory } from '../services/api';
import { useResponsiveLayout } from '../theme/layout';

export const MEMORY_TOGGLE_BACKEND_SUPPORTED = false;

function memoryKey(userId) { return `luxia.lux.memory.v1.${userId || 'anonymous'}`; }

export default function LuxMemoryScreen() {
  const { colors } = useAppTheme();
  const { currentUser } = useAuth();
  const layout = useResponsiveLayout();
  const styles = useMemo(() => createStyles(colors, layout), [colors, layout]);
  const [memories, setMemories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [adding, setAdding] = useState(false);
  const [addValue, setAddValue] = useState('');
  const key = memoryKey(currentUser?.uid);

  const persist = useCallback(async (items) => {
    try { await AsyncStorage.setItem(key, JSON.stringify({ memories: items })); } catch { /* optional cache */ }
  }, [key]);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    let local = [];
    try {
      const saved = JSON.parse((await AsyncStorage.getItem(key)) || '{}');
      local = Array.isArray(saved.memories) ? saved.memories.map(normalizeLuxMemory) : [];
    } catch { local = []; }
    setMemories(local);
    try {
      const remote = await getLuxMemory();
      setMemories(remote);
      void persist(remote);
    } catch {
      if (!local.length) setError('No pudimos cargar tu memoria. Revisá tu conexión.');
    } finally { setLoading(false); }
  }, [key, persist]);

  useEffect(() => { void load(); }, [load]);

  const saveEdit = useCallback(async () => {
    const text = editValue.trim();
    if (!editing || !text) return;
    const next = memories.map((item) => item.id === editing.id ? { ...item, text } : item);
    setMemories(next); setEditing(null); void persist(next);
    try { await updateLuxMemory(editing.id, { text }); } catch { /* local value remains available */ }
  }, [editValue, editing, memories, persist]);

  const saveNewMemory = useCallback(async () => {
    const text = addValue.trim();
    if (!text) return;
    try {
      const created = await createLuxMemory(text);
      const next = [...memories, created];
      setMemories(next); void persist(next); setAdding(false); setAddValue(''); setError('');
    } catch {
      setError('No pudimos guardar el recuerdo.');
    }
  }, [addValue, memories, persist]);

  const removeMemory = useCallback(async (item) => {
    const next = memories.filter((memory) => memory.id !== item.id);
    setMemories(next); void persist(next);
    try { await deleteLuxMemory(item.id); } catch { /* local delete remains applied */ }
  }, [memories, persist]);

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} style={styles.screen}>
      <View style={styles.heading}><View style={styles.headingIcon}><MaterialCommunityIcons color={colors.gold} name="brain" size={23} /></View><View style={styles.headingCopy}><Text style={styles.eyebrow}>PREFERENCIAS DE LUX</Text><Text style={styles.title}>Memoria de LUX</Text><Text style={styles.description}>LUX puede recordar algunas preferencias para adaptar sus respuestas.</Text></View></View>

      <View style={styles.toggleCard}><View style={styles.toggleCopy}><Text style={styles.toggleTitle}>Usar memoria</Text><Text style={styles.toggleDescription}>El control persistente estará disponible cuando el backend lo soporte.</Text></View><Switch accessibilityLabel="Usar memoria (no disponible todavía)" disabled={!MEMORY_TOGGLE_BACKEND_SUPPORTED} thumbColor={colors.white} trackColor={{ false: colors.mutedIcon, true: colors.primary }} value={false} /></View>

      <View style={styles.sectionHeader}><View><Text style={styles.sectionTitle}>Recuerdos</Text><Text style={styles.sectionDescription}>Solo se guardan preferencias explícitas y podés eliminarlas.</Text></View><View style={styles.sectionActions}>{loading ? <ActivityIndicator color={colors.primary} /> : null}<Pressable accessibilityRole="button" onPress={() => { setAddValue(''); setAdding(true); }} style={styles.addButton}><Text style={styles.addButtonText}>Agregar</Text></Pressable></View></View>
      {memories.map((item) => <View key={item.id} style={styles.memoryCard}><View style={styles.memoryBullet}><MaterialCommunityIcons color={colors.gold} name="circle-small" size={25} /></View><Text style={styles.memoryText}>{item.text}</Text><View style={styles.memoryActions}><Pressable accessibilityLabel={`Editar recuerdo: ${item.text}`} onPress={() => { setEditing(item); setEditValue(item.text); }} style={styles.iconButton}><MaterialCommunityIcons color={colors.primary} name="pencil-outline" size={19} /></Pressable><Pressable accessibilityLabel={`Eliminar recuerdo: ${item.text}`} onPress={() => removeMemory(item)} style={styles.iconButton}><MaterialCommunityIcons color={colors.danger} name="trash-can-outline" size={19} /></Pressable></View></View>)}
      {!loading && !memories.length ? <View style={styles.empty}><MaterialCommunityIcons color={colors.textMuted} name="brain-off-outline" size={25} /><Text style={styles.emptyTitle}>No hay recuerdos guardados</Text><Text style={styles.emptyText}>Cuando guardes una preferencia explícita, aparecerá acá.</Text></View> : null}
      {error ? <View style={styles.alert}><MaterialCommunityIcons color={colors.danger} name="alert-outline" size={18} /><Text style={styles.alertText}>{error}</Text></View> : null}

      <Modal animationType="fade" transparent visible={Boolean(editing)} onRequestClose={() => setEditing(null)}><View style={styles.modalOverlay}><View style={styles.dialog}><Text style={styles.dialogTitle}>Editar recuerdo</Text><TextInput autoFocus multiline onChangeText={setEditValue} style={styles.editInput} value={editValue} /><View style={styles.dialogActions}><Pressable onPress={() => setEditing(null)} style={styles.secondaryButton}><Text style={styles.secondaryText}>Cancelar</Text></Pressable><Pressable onPress={saveEdit} style={styles.primaryButton}><Text style={styles.primaryText}>Guardar</Text></Pressable></View></View></View></Modal>
      <Modal animationType="fade" transparent visible={adding} onRequestClose={() => setAdding(false)}><View style={styles.modalOverlay}><View style={styles.dialog}><Text style={styles.dialogTitle}>Agregar recuerdo</Text><TextInput autoFocus multiline onChangeText={setAddValue} placeholder="Ej.: Preferís que la conclusión aparezca primero." placeholderTextColor={colors.textMuted} style={styles.editInput} value={addValue} /><View style={styles.dialogActions}><Pressable onPress={() => setAdding(false)} style={styles.secondaryButton}><Text style={styles.secondaryText}>Cancelar</Text></Pressable><Pressable onPress={saveNewMemory} style={styles.primaryButton}><Text style={styles.primaryText}>Guardar</Text></Pressable></View></View></View></Modal>
    </ScrollView>
  );
}

const createStyles = (colors, layout) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { width: '100%', maxWidth: 860, alignSelf: 'center', padding: layout.gutter, paddingBottom: 40 },
  heading: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, marginBottom: 24, paddingTop: 5 },
  headingIcon: { width: 47, height: 47, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primaryDeep },
  headingCopy: { flex: 1 },
  eyebrow: { color: colors.gold, fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  title: { color: colors.text, fontSize: 26, fontWeight: '800', marginTop: 4 },
  description: { color: colors.textSecondary, fontSize: 14, lineHeight: 21, marginTop: 7 },
  toggleCard: { borderRadius: 17, borderWidth: 1, borderColor: colors.borderSoft, padding: 17, backgroundColor: colors.card, flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 28 },
  toggleCopy: { flex: 1 },
  toggleTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  toggleDescription: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 4 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 11 },
  sectionActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  addButton: { minHeight: 36, borderRadius: 10, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  addButtonText: { color: colors.textOnPrimary, fontSize: 12, fontWeight: '800' },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
  sectionDescription: { color: colors.textSecondary, fontSize: 12, marginTop: 4 },
  memoryCard: { minHeight: 69, borderRadius: 15, borderWidth: 1, borderColor: colors.borderSoft, paddingVertical: 11, paddingLeft: 11, paddingRight: 8, backgroundColor: colors.card, flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 8 },
  memoryBullet: { width: 25, alignItems: 'center' },
  memoryText: { color: colors.text, flex: 1, fontSize: 14, lineHeight: 20 },
  memoryActions: { flexDirection: 'row', gap: 2 },
  iconButton: { width: 40, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', borderRadius: 16, borderWidth: 1, borderColor: colors.borderSoft, padding: 24, backgroundColor: colors.card },
  emptyTitle: { color: colors.text, fontWeight: '800', marginTop: 10 },
  emptyText: { color: colors.textSecondary, fontSize: 13, marginTop: 5, textAlign: 'center' },
  alert: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 12, backgroundColor: colors.dangerSoft, marginTop: 14 },
  alertText: { color: colors.danger, flex: 1, fontSize: 13 },
  modalOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, backgroundColor: 'rgba(7, 28, 51, 0.48)' },
  dialog: { width: '100%', maxWidth: 430, borderRadius: 19, padding: 21, backgroundColor: colors.card },
  dialogTitle: { color: colors.text, fontSize: 18, fontWeight: '800', marginBottom: 14 },
  editInput: { minHeight: 82, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, color: colors.text, backgroundColor: colors.backgroundAlt, textAlignVertical: 'top', marginBottom: 15 },
  dialogActions: { flexDirection: 'row', gap: 10 },
  secondaryButton: { flex: 1, minHeight: 45, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.backgroundAlt },
  secondaryText: { color: colors.textSecondary, fontWeight: '700' },
  primaryButton: { flex: 1, minHeight: 45, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  primaryText: { color: '#FFFFFF', fontWeight: '800' },
});
