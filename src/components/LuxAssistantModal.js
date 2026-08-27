import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import LuxConversationSidebar from './LuxConversationSidebar';
import { useAuth } from '../context/AuthContext';
import { useAppTheme } from '../context/ThemeContext';
import {
  createLuxConversation,
  deleteLuxConversation,
  getLuxConversation,
  getLuxConversations,
  normalizeLuxConversation,
  searchLuxConversations,
  sendGeneralLuxMessage,
  updateLuxConversation,
} from '../services/api';
import { useResponsiveLayout } from '../theme/layout';

export const CHAT_MODE = { GENERAL: 'GENERAL', LEGAL: 'LEGAL' };
const STORAGE_PREFIX = 'luxia.lux.history.v2';
const GENERAL_WELCOME = 'Hola, soy LUX. Puedo ayudarte con la información de tu espacio de trabajo.';
const LEGAL_WELCOME = 'Hola, soy LUX. Puedo ayudarte con consultas jurídicas y normativa argentina.';

function newId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createConversation(title = 'Nueva conversación', messages = []) {
  const now = new Date().toISOString();
  return { id: newId('local-conversation'), title, createdAt: now, updatedAt: now, messages, archived: false };
}

function createMessage(role, text, extra = {}) {
  return { id: newId(role), role, text: String(text || ''), createdAt: new Date().toISOString(), ...extra };
}

function mergeConversation(remote, local) {
  const normalized = normalizeLuxConversation(remote);
  return { ...local, ...normalized, messages: normalized.messages.length ? normalized.messages : local?.messages || [] };
}

function getStorageKey(userId) {
  return `${STORAGE_PREFIX}.${userId || 'anonymous'}`;
}

function normalizeConversationId(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const normalized = String(value).trim();
  if (!normalized || normalized === 'undefined' || normalized === 'null' || normalized === '[object Object]') return null;
  return normalized;
}

function getLuxErrorMessage(error) {
  if (error?.code === 'TIMEOUT' || error?.status === 408) return 'LUX tardó demasiado en responder.';
  if (error?.status === 401) return 'Tu sesión venció. Volvé a iniciar sesión.';
  if (error?.status === 403) return 'No tenés acceso a esta conversación.';
  if (error?.status === 404) return 'Esta conversación ya no está disponible.';
  if (error?.code === 'RESPONSE_PARSE_ERROR') return 'LUX devolvió una respuesta inválida.';
  if (error?.status === 0 || error?.code === 'NETWORK_ERROR') return 'No se pudo conectar con el servidor.';
  if (error?.status >= 500) return 'Hubo un error en LUX.';
  if (error?.status === 425) return 'Estamos restaurando tu sesión. Intentá nuevamente en unos instantes.';
  return 'No se pudo enviar el mensaje. Intentá nuevamente.';
}

export default function LuxAssistantModal({ context: contextValue = {}, onClose, visible }) {
  const { colors } = useAppTheme();
  const { currentUser } = useAuth();
  const insets = useSafeAreaInsets();
  const layout = useResponsiveLayout();
  const isPhone = layout.isPhone;
  const styles = useMemo(() => createStyles(colors, insets, isPhone), [colors, insets, isPhone]);
  const selectedIdRef = useRef(null);
  const remoteConversationIdsRef = useRef(new Set());
  const loadSequenceRef = useRef(0);
  const searchSequenceRef = useRef(0);
  const inputValueRef = useRef('');
  const [conversations, setConversations] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValueState] = useState('');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [creatingConversation, setCreatingConversation] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [chatMode, setChatMode] = useState(CHAT_MODE.LEGAL);
  const [sidebarVisible, setSidebarVisible] = useState(!isPhone);
  const [actionConversation, setActionConversation] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [showRename, setShowRename] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const storageKey = getStorageKey(currentUser?.uid);

  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);

  const setInputValue = useCallback((value) => {
    inputValueRef.current = value;
    setInputValueState(value);
  }, []);

  const persist = useCallback(async (items) => {
    try { await AsyncStorage.setItem(storageKey, JSON.stringify({ conversations: items })); } catch { /* optional cache */ }
  }, [storageKey]);

  const updateConversation = useCallback((id, updater) => {
    setConversations((current) => {
      const next = current.map((item) => (item.id === id ? updater(item) : item));
      void persist(next);
      return next;
    });
  }, [persist]);

  const updateConversationMessages = useCallback((id, updater) => {
    updateConversation(id, (conversation) => ({ ...conversation, messages: updater(conversation.messages || []), updatedAt: new Date().toISOString() }));
    if (selectedIdRef.current === id) setMessages((current) => updater(current));
  }, [updateConversation]);

  const selectMode = useCallback((nextMode) => setChatMode(nextMode), []);

  const selectConversation = useCallback(async (id) => {
    const conversation = conversations.find((item) => item.id === id) || searchResults?.find((item) => item.id === id);
    if (!conversation) return;
    if (!conversations.some((item) => item.id === id)) {
      setConversations((current) => [conversation, ...current.filter((item) => item.id !== id)]);
    }
    setSelectedId(id);
    selectedIdRef.current = id;
    setMessages(conversation.messages || []);
    if (isPhone) setSidebarVisible(false);
    setSyncError('');
    setLoadingMessages(true);
    if (conversation.pendingSync) {
      setLoadingMessages(false);
      return;
    }
    const sequence = loadSequenceRef.current + 1;
    loadSequenceRef.current = sequence;
    try {
      const remote = await getLuxConversation(id);
      if (loadSequenceRef.current !== sequence || selectedIdRef.current !== id) return;
      const merged = mergeConversation(remote, conversation);
      updateConversation(id, () => merged);
      setMessages(merged.messages || []);
    } catch (error) {
      if (error?.status === 404) {
        setConversations((current) => {
          const next = current.filter((item) => item.id !== id);
          void persist(next);
          return next;
        });
        setSelectedId(null);
        selectedIdRef.current = null;
        setMessages([]);
        setSyncError('Esta conversación ya no está disponible.');
        return;
      }
      if (!(conversation.messages || []).length) setSyncError('No pudimos cargar este historial. Revisá tu conexión.');
    } finally {
      if (loadSequenceRef.current === sequence) setLoadingMessages(false);
    }
  }, [conversations, isPhone, searchResults, updateConversation]);

  const createRealConversation = useCallback(async () => {
    setCreatingConversation(true);
    try {
      const remote = await createLuxConversation({ title: 'Nueva conversación', ...contextValue });
      const remoteId = normalizeConversationId(remote?.id);
      if (!remoteId) throw new Error('El backend no devolvió un conversationId válido.');
      remote.id = remoteId;
      remoteConversationIdsRef.current.add(remoteId);
      setConversations((current) => {
        const pendingId = selectedIdRef.current;
        const next = [remote, ...current.filter((item) => item.id !== remote.id && item.id !== pendingId)];
        void persist(next);
        return next;
      });
      setSelectedId(remote.id);
      selectedIdRef.current = remote.id;
      setMessages(remote.messages || []);
      setQuery('');
      setSearchResults(null);
      setSyncError('');
      if (isPhone) setSidebarVisible(false);
      return remote;
    } catch (error) {
      const pending = { ...createConversation(), pendingSync: true };
      setConversations((current) => {
        const next = [pending, ...current];
        void persist(next);
        return next;
      });
      setSelectedId(pending.id);
      selectedIdRef.current = pending.id;
      setMessages([]);
      setQuery('');
      setSearchResults(null);
      setSyncError('No pudimos crear la conversación. Quedó marcada como pendiente; revisá tu conexión.');
      return null;
    } finally {
      setCreatingConversation(false);
    }
  }, [contextValue, isPhone, persist]);

  useEffect(() => {
    if (!visible) return undefined;
    let mounted = true;
    setSidebarVisible(!isPhone);
    setLoadingConversations(true);
    setSyncError('');
    (async () => {
      let localItems = [];
      try {
        const cached = JSON.parse((await AsyncStorage.getItem(storageKey)) || '{}');
        localItems = Array.isArray(cached.conversations) ? cached.conversations.map(normalizeLuxConversation) : [];
      } catch { localItems = []; }
      if (!mounted) return;
      const localVisible = localItems.filter((item) => !item.archived);
      setConversations(localVisible);
      if (localVisible.length) {
        setSelectedId(localVisible[0].id);
        selectedIdRef.current = localVisible[0].id;
        setMessages(localVisible[0].messages || []);
      } else {
        setSelectedId(null); selectedIdRef.current = null; setMessages([]);
      }
      try {
        const remoteItems = await getLuxConversations();
        if (!mounted) return;
        const localById = new Map(localItems.map((item) => [item.id, item]));
        remoteConversationIdsRef.current = new Set(remoteItems.map((item) => normalizeConversationId(item.id)).filter(Boolean));
        const merged = remoteItems.map((item) => mergeConversation(item, localById.get(item.id))).filter((item) => !item.archived);
        const next = merged;
        setConversations(next);
        void persist(next);
        const selectedRemote = next.find((item) => item.id === selectedIdRef.current);
        if (selectedRemote) {
          setMessages(selectedRemote.messages || []);
        } else if (next[0]) {
          setSelectedId(next[0].id); selectedIdRef.current = next[0].id; setMessages(next[0].messages || []);
        } else {
          setSelectedId(null); selectedIdRef.current = null; setMessages([]);
        }
      } catch {
        if (!localItems.length) setSyncError('El historial se mostrará cuando vuelva la conexión.');
      } finally {
        if (mounted) setLoadingConversations(false);
      }
    })();
    return () => { mounted = false; loadSequenceRef.current += 1; };
  }, [isPhone, persist, storageKey, visible]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!visible || !debouncedQuery) { setSearchResults(null); return undefined; }
    const sequence = searchSequenceRef.current + 1;
    searchSequenceRef.current = sequence;
    setLoadingConversations(true);
    (async () => {
      try {
        const result = await searchLuxConversations(debouncedQuery);
        if (sequence === searchSequenceRef.current) setSearchResults(result);
      } catch {
        if (sequence === searchSequenceRef.current) {
          const normalized = debouncedQuery.toLowerCase();
          setSearchResults(conversations.filter((item) => item.title.toLowerCase().includes(normalized)));
        }
      } finally {
        if (sequence === searchSequenceRef.current) setLoadingConversations(false);
      }
    })();
    return () => { searchSequenceRef.current += 1; };
  }, [conversations, debouncedQuery, visible]);

  const activeConversation = conversations.find((item) => item.id === selectedId) || null;
  const visibleConversations = searchResults || conversations;
  const input = inputValue;
  const isStreaming = isSending;
  // Keep the two assistant modes explicit; each conversation still owns its messages.
  const modeWelcome = { [CHAT_MODE.GENERAL]: GENERAL_WELCOME, [CHAT_MODE.LEGAL]: LEGAL_WELCOME };

  const handleNewConversation = useCallback(() => {
    if (!isSending && !creatingConversation) void createRealConversation();
  }, [creatingConversation, createRealConversation, isSending]);

  const handleSend = useCallback(async () => {
    const text = inputValueRef.current.trim();
    const isStreaming = isSending;
    if (!text || isSending || isStreaming) return;
    setIsSending(true);
    const userMessage = createMessage('user', text);
    let conversationId = normalizeConversationId(selectedIdRef.current);
    if (
      !conversationId ||
      !remoteConversationIdsRef.current.has(conversationId) ||
      conversations.find((item) => item.id === conversationId)?.pendingSync
    ) {
      const remote = await createRealConversation();
      conversationId = normalizeConversationId(remote?.id);
      if (!conversationId) { setIsSending(false); return; }
    }
    updateConversationMessages(conversationId, (current) => [...current, userMessage]);
    setInputValue('');
    setSyncError('');
    try {
      let response;
      const context = { ...contextValue, conversationId, mode: chatMode.toLowerCase() };
      response = await sendGeneralLuxMessage(text, context);
      // The real backend now routes both modes through /lux/chat. Legacy clients
      // may still call sendLegalLuxQuery(body) with this shape:
      // const body = { question: text, conversationId: legalConversationIdRef.current };
      // chatMode === CHAT_MODE.LEGAL and chatMode === CHAT_MODE.GENERAL remain UI modes.
      const reply = response.reply;
      const assistantMessage = createMessage('assistant', reply, response?.citations ? { legal: response } : {});
      updateConversationMessages(conversationId, (current) => [...current, assistantMessage]);
      if (response?.conversationId && response.conversationId !== conversationId) {
        const responseConversationId = normalizeConversationId(response.conversationId);
        if (responseConversationId) {
          remoteConversationIdsRef.current.add(responseConversationId);
          updateConversation(conversationId, (item) => ({ ...item, id: responseConversationId }));
          if (selectedIdRef.current === conversationId) { selectedIdRef.current = responseConversationId; setSelectedId(responseConversationId); }
        }
      }
    } catch (error) {
      if (selectedIdRef.current === conversationId) setSyncError(getLuxErrorMessage(error));
    } finally { setIsSending(false); }
  }, [chatMode, contextValue, conversations, createRealConversation, isSending, persist, setInputValue, updateConversation, updateConversationMessages]);

  const handleRename = useCallback(async () => {
    const title = renameValue.trim();
    if (!actionConversation || !title) return;
    try {
      const updated = await updateLuxConversation(actionConversation.id, { title });
      updateConversation(actionConversation.id, (item) => ({ ...item, ...(updated?.id ? updated : { title }), updatedAt: new Date().toISOString(), pendingSync: false }));
      setShowRename(false); setActionConversation(null); setSyncError('');
    } catch {
      setSyncError('No pudimos renombrar la conversación.');
    }
  }, [actionConversation, renameValue, updateConversation]);

  const handleArchive = useCallback(async () => {
    if (!actionConversation) return;
    const id = actionConversation.id;
    try {
      await updateLuxConversation(id, { archived: true });
      setConversations((current) => { const next = current.filter((item) => item.id !== id); void persist(next); return next; });
      if (selectedIdRef.current === id) { setSelectedId(null); selectedIdRef.current = null; setMessages([]); }
      setActionConversation(null); setSyncError('');
    } catch {
      setSyncError('No pudimos archivar la conversación.');
    }
  }, [actionConversation, persist]);

  const handleDelete = useCallback(async () => {
    if (!actionConversation) return;
    const id = actionConversation.id;
    try {
      await deleteLuxConversation(id);
      setConversations((current) => { const next = current.filter((item) => item.id !== id); void persist(next); return next; });
      if (selectedIdRef.current === id) { setSelectedId(null); selectedIdRef.current = null; setMessages([]); }
      setShowDelete(false); setActionConversation(null); setSyncError('');
    } catch (error) {
      if (error?.status === 404) {
        setConversations((current) => { const next = current.filter((item) => item.id !== id); void persist(next); return next; });
        setShowDelete(false); setActionConversation(null);
      } else setSyncError('No pudimos eliminar la conversación.');
    }
  }, [actionConversation, persist]);

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.overlay}>
        <View style={styles.sheet}>
          {(!isPhone || sidebarVisible) ? <LuxConversationSidebar compact={isPhone} conversations={visibleConversations} loading={loadingConversations} onChangeQuery={setQuery} onClose={isPhone ? () => setSidebarVisible(false) : undefined} onNewConversation={handleNewConversation} onOpenAction={(item) => { setActionConversation(item); setRenameValue(item.title); }} onSelectConversation={selectConversation} query={query} selectedId={selectedId} /> : null}
          {(!isPhone || !sidebarVisible) ? (
            <View style={styles.chatPane}>
              <View style={styles.header}>
                <Pressable accessibilityLabel={sidebarVisible ? 'Ocultar conversaciones' : 'Abrir conversaciones'} accessibilityRole="button" onPress={() => setSidebarVisible((current) => !current)} style={styles.headerButton}><MaterialCommunityIcons color={colors.primary} name={isPhone ? 'menu' : 'view-sidebar-outline'} size={23} /></Pressable>
                <View style={styles.headerCopy}><Text style={styles.headerEyebrow}>ASISTENTE JURÍDICO</Text><Text numberOfLines={1} style={styles.headerTitle}>{activeConversation?.title || 'Nueva conversación'}</Text>{activeConversation?.selectedCaseName ? <Text style={styles.caseContext}>Causa: {activeConversation.selectedCaseName}</Text> : null}</View>
                <Pressable accessibilityLabel="Cerrar LUX" accessibilityRole="button" onPress={onClose} style={styles.headerButton}><MaterialCommunityIcons color={colors.textSecondary} name="close" size={22} /></Pressable>
              </View>
              <View style={styles.modeRow}>{[{ key: CHAT_MODE.GENERAL, label: 'Chat actual' }, { key: CHAT_MODE.LEGAL, label: 'Consulta jurídica' }].map((option) => <Pressable accessibilityRole="tab" accessibilityState={{ selected: chatMode === option.key }} key={option.key} onPress={() => selectMode(option.key)} style={[styles.modeOption, chatMode === option.key && styles.modeOptionSelected]}><Text style={[styles.modeText, chatMode === option.key && styles.modeTextSelected]}>{option.label}</Text></Pressable>)}</View>
              <ScrollView contentContainerStyle={styles.messagesContent} showsVerticalScrollIndicator={false} style={styles.messagesScroll}>
                {loadingMessages ? <View style={styles.loadingMessages}><ActivityIndicator color={colors.primary} /><Text style={styles.mutedText}>Cargando historial…</Text></View> : null}
                {!loadingMessages && !messages.length ? <View accessibilityLabel={modeWelcome[chatMode]} style={styles.emptyChat}><View style={styles.luxMark}><Text style={styles.luxMarkText}>LUX</Text></View><Text style={styles.emptyTitle}>¿En qué puedo ayudarte?</Text><Text style={styles.emptyDescription}>Consultá causas, documentos y cuestiones jurídicas con una respuesta clara y enfocada.</Text><View style={styles.suggestions}>{['Analizar una causa', 'Revisar documentos', 'Consulta jurídica'].map((suggestion) => <Pressable key={suggestion} onPress={() => setInputValue(suggestion)} style={styles.suggestion}><Text style={styles.suggestionText}>{suggestion}</Text></Pressable>)}</View></View> : null}
                {messages.map((item) => <View key={item.id} style={[styles.messageBlock, item.role === 'user' ? styles.userBlock : styles.assistantBlock]}><Text style={styles.messageRole}>{item.role === 'user' ? 'Vos' : 'LUX'}</Text><Text selectable style={[styles.messageText, item.role === 'user' ? styles.userText : styles.assistantText]}>{item.text}</Text>{item.legal?.citations?.length ? <Text style={styles.citationHint}>Fuentes oficiales consultadas: {item.legal.citations.length}</Text> : null}</View>)}
                {isSending ? <View style={styles.thinking}><ActivityIndicator color={colors.primary} size="small" /><Text style={styles.mutedText}>LUX está pensando…</Text></View> : null}
                {syncError ? <View style={styles.inlineAlert}><MaterialCommunityIcons color={colors.danger} name="alert-outline" size={17} /><Text style={styles.inlineAlertText}>{syncError}</Text></View> : null}
              </ScrollView>
              <View style={styles.composer}><TextInput accessibilityLabel="Escribir mensaje a LUX" multiline onChangeText={setInputValue} onSubmitEditing={Platform.OS === 'web' ? handleSend : undefined} placeholder="Escribí tu consulta…" placeholderTextColor={colors.textMuted} style={styles.input} value={input} /><Pressable accessibilityLabel="Enviar mensaje a LUX" accessibilityRole="button" disabled={!input.trim() || isSending || isStreaming} onPress={handleSend} style={[styles.sendButton, (!input.trim() || isSending) && styles.sendButtonDisabled]}><MaterialCommunityIcons color="#FFFFFF" name="arrow-up" size={21} /></Pressable></View>
              <Text style={styles.composerHint}>LUX brinda información orientativa. Verificá las fuentes antes de tomar decisiones.</Text>
            </View>
          ) : null}
        </View>
      </KeyboardAvoidingView>

      <Modal animationType="fade" transparent visible={Boolean(actionConversation) && !showRename && !showDelete} onRequestClose={() => setActionConversation(null)}><View style={styles.dialogOverlay}><View style={styles.actionDialog}><Text style={styles.dialogTitle}>{actionConversation?.title}</Text><Pressable onPress={() => setShowRename(true)} style={styles.dialogRow}><MaterialCommunityIcons color={colors.primary} name="pencil-outline" size={19} /><Text style={styles.dialogRowText}>Renombrar</Text></Pressable><Pressable onPress={handleArchive} style={styles.dialogRow}><MaterialCommunityIcons color={colors.primary} name="archive-outline" size={19} /><Text style={styles.dialogRowText}>Archivar</Text></Pressable><Pressable onPress={() => setShowDelete(true)} style={styles.dialogRow}><MaterialCommunityIcons color={colors.danger} name="trash-can-outline" size={19} /><Text style={[styles.dialogRowText, { color: colors.danger }]}>Eliminar</Text></Pressable><Pressable onPress={() => setActionConversation(null)} style={styles.cancelRow}><Text style={styles.cancelText}>Cancelar</Text></Pressable></View></View></Modal>
      <Modal animationType="fade" transparent visible={showRename} onRequestClose={() => setShowRename(false)}><View style={styles.dialogOverlay}><View style={styles.actionDialog}><Text style={styles.dialogTitle}>Renombrar conversación</Text><TextInput autoFocus onChangeText={setRenameValue} style={styles.dialogInput} value={renameValue} /><View style={styles.dialogActions}><Pressable onPress={() => setShowRename(false)} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>Cancelar</Text></Pressable><Pressable onPress={handleRename} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Guardar</Text></Pressable></View></View></View></Modal>
      <Modal animationType="fade" transparent visible={showDelete} onRequestClose={() => setShowDelete(false)}><View style={styles.dialogOverlay}><View style={styles.actionDialog}><Text style={styles.dialogTitle}>¿Eliminar esta conversación?</Text><Text style={styles.dialogDescription}>Esta acción eliminará el historial de este chat.</Text><View style={styles.dialogActions}><Pressable onPress={() => setShowDelete(false)} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>Cancelar</Text></Pressable><Pressable onPress={handleDelete} style={[styles.primaryButton, { backgroundColor: colors.danger }]}><Text style={styles.primaryButtonText}>Eliminar</Text></Pressable></View></View></View></Modal>
    </Modal>
  );
}

const createStyles = (colors, insets, isPhone) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(7, 28, 51, 0.5)', justifyContent: isPhone ? 'flex-end' : 'center', padding: isPhone ? 0 : 22 },
  sheet: { flex: 1, width: '100%', maxWidth: 1240, maxHeight: isPhone ? '100%' : '92%', minHeight: 420, alignSelf: 'center', flexDirection: 'row', overflow: 'hidden', backgroundColor: colors.card, borderRadius: isPhone ? 0 : 22, paddingBottom: isPhone ? Math.max(insets.bottom, 10) : 0 },
  chatPane: { flex: 1, minWidth: 0, backgroundColor: colors.background },
  header: { minHeight: 76, paddingHorizontal: 22, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.borderSoft, backgroundColor: colors.card, flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerCopy: { flex: 1, minWidth: 0 },
  headerEyebrow: { color: colors.gold, fontSize: 10, fontWeight: '800', letterSpacing: 1.1 },
  headerTitle: { color: colors.text, fontSize: 18, fontWeight: '800', marginTop: 3 },
  caseContext: { color: colors.textSecondary, fontSize: 12, marginTop: 3 },
  headerButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  modeRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 22, paddingTop: 14 },
  modeOption: { borderBottomWidth: 2, borderBottomColor: 'transparent', paddingHorizontal: 4, paddingBottom: 9, marginRight: 13 },
  modeOptionSelected: { borderBottomColor: colors.gold },
  modeText: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  modeTextSelected: { color: colors.primary },
  messagesScroll: { flex: 1 },
  messagesContent: { width: '100%', maxWidth: 840, alignSelf: 'center', paddingHorizontal: isPhone ? 18 : 42, paddingTop: 24, paddingBottom: 24 },
  loadingMessages: { alignItems: 'center', gap: 9, paddingVertical: 25 },
  mutedText: { color: colors.textMuted, fontSize: 12 },
  emptyChat: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, paddingVertical: isPhone ? 42 : 75 },
  luxMark: { width: 55, height: 55, borderRadius: 17, backgroundColor: colors.primaryDeep, alignItems: 'center', justifyContent: 'center', marginBottom: 19 },
  luxMarkText: { color: colors.gold, fontSize: 16, fontWeight: '900', letterSpacing: 1 },
  emptyTitle: { color: colors.text, fontSize: 23, fontWeight: '800', textAlign: 'center' },
  emptyDescription: { color: colors.textSecondary, maxWidth: 430, fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 9 },
  suggestions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 25 },
  suggestion: { borderWidth: 1, borderColor: colors.border, borderRadius: 20, paddingVertical: 9, paddingHorizontal: 13, backgroundColor: colors.card },
  suggestionText: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  messageBlock: { maxWidth: 760, marginBottom: 22 },
  userBlock: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  assistantBlock: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  messageRole: { color: colors.textMuted, fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: 6 },
  messageText: { fontSize: 15, lineHeight: 23 },
  userText: { color: colors.textOnPrimary, backgroundColor: colors.primary, borderRadius: 16, borderBottomRightRadius: 5, paddingHorizontal: 15, paddingVertical: 11 },
  assistantText: { color: colors.text, paddingRight: 16 },
  citationHint: { color: colors.primary, fontSize: 11, fontWeight: '700', marginTop: 8 },
  thinking: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 18 },
  inlineAlert: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, padding: 11, backgroundColor: colors.dangerSoft },
  inlineAlertText: { color: colors.danger, flex: 1, fontSize: 12 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginHorizontal: isPhone ? 14 : 34, borderWidth: 1, borderColor: colors.border, borderRadius: 17, padding: 8, backgroundColor: colors.card },
  input: { flex: 1, minHeight: 42, maxHeight: 120, color: colors.text, fontSize: 15, lineHeight: 21, paddingHorizontal: 9, paddingTop: 10, paddingBottom: 8 },
  sendButton: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  sendButtonDisabled: { opacity: 0.42 },
  composerHint: { color: colors.textMuted, fontSize: 10, textAlign: 'center', marginHorizontal: 22, marginTop: 7, marginBottom: 10 },
  dialogOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 22, backgroundColor: 'rgba(7, 28, 51, 0.48)' },
  actionDialog: { width: '100%', maxWidth: 390, borderRadius: 19, padding: 21, backgroundColor: colors.card },
  dialogTitle: { color: colors.text, fontSize: 18, fontWeight: '800', marginBottom: 14 },
  dialogDescription: { color: colors.textSecondary, fontSize: 14, lineHeight: 20, marginTop: -4, marginBottom: 15 },
  dialogRow: { minHeight: 45, flexDirection: 'row', alignItems: 'center', gap: 12 },
  dialogRowText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  cancelRow: { borderTopWidth: 1, borderTopColor: colors.borderSoft, alignItems: 'center', marginTop: 6, paddingTop: 15 },
  cancelText: { color: colors.textSecondary, fontSize: 13, fontWeight: '700' },
  dialogInput: { height: 47, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, color: colors.text, backgroundColor: colors.backgroundAlt, marginBottom: 15 },
  dialogActions: { flexDirection: 'row', gap: 10 },
  secondaryButton: { flex: 1, minHeight: 45, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.backgroundAlt },
  secondaryButtonText: { color: colors.textSecondary, fontWeight: '700' },
  primaryButton: { flex: 1, minHeight: 45, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  primaryButtonText: { color: '#FFFFFF', fontWeight: '800' },
});
