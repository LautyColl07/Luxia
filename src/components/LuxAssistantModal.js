import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Keyboard,
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
import { useIsFocused } from '@react-navigation/native';

import LuxConversationSidebar from './LuxConversationSidebar';
import LuxVoiceControls from './LuxVoiceControls';
import LuxMessageContent from './LuxMessageContent';
import { useLuxVoice } from '../voice/useLuxVoice';
import { reconcileVoiceMessages } from '../voice/voicePolicy';
import { useStudyContext } from '../context/StudyContext';
import { useAuth } from '../context/AuthContext';
import { useAppTheme } from '../context/ThemeContext';
import {
  normalizeLuxConversation,
  normalizeLuxMessage,
  sendGeneralLuxMessage,
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
  if (error?.status === 404 && error?.endpoint === '/lux/chat') {
    return 'LUX no está disponible: el backend no publicó la ruta /lux/chat.';
  }
  if (error?.status === 404) return 'Esta conversación ya no está disponible.';
  if (error?.code === 'RESPONSE_PARSE_ERROR') return 'LUX devolvió una respuesta inválida.';
  if (error?.status === 0 || error?.code === 'NETWORK_ERROR') return 'No se pudo conectar con el servidor.';
  if (error?.status >= 500) {
    return `LUX devolvió HTTP ${error.status}. El problema corresponde al backend.`;
  }
  if (error?.status === 425) return 'Estamos restaurando tu sesión. Intentá nuevamente en unos instantes.';
  return 'No se pudo enviar el mensaje. Intentá nuevamente.';
}

export default function LuxAssistantModal({ context: contextValue = {}, onClose, visible }) {
  const { colors } = useAppTheme();
  const { currentUser } = useAuth();
  const { activeContextKey } = useStudyContext();
  const focused = useIsFocused();
  const insets = useSafeAreaInsets();
  const layout = useResponsiveLayout();
  const isPhone = layout.isPhone;
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const keyboardVisible = keyboardHeight > 0;
  const compactHeight = isPhone && layout.height - keyboardHeight < 480;
  const styles = useMemo(() => createStyles(colors, insets, isPhone, keyboardVisible, compactHeight), [colors, insets, isPhone, keyboardVisible, compactHeight]);
  const selectedIdRef = useRef(null);
  const loadSequenceRef = useRef(0);
  const searchSequenceRef = useRef(0);
  const inputValueRef = useRef('');
  const sendLockRef = useRef(false);
  const textRequestRef = useRef(null);
  const voiceStartRef = useRef(false);
  const messagesScrollRef = useRef(null);
  const openAnimation = useRef(new Animated.Value(0)).current;
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
  const [voiceControlsVisible, setVoiceControlsVisible] = useState(false);
  const storageKey = `${getStorageKey(currentUser?.uid)}${activeContextKey === 'personal' ? '' : `.${activeContextKey}`}`;

  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (event) => setKeyboardHeight(event.endCoordinates.height));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      messagesScrollRef.current?.scrollToEnd({ animated: true });
    });
  }, []);

  useEffect(() => {
    if (!visible) {
      openAnimation.setValue(0);
      return undefined;
    }

    openAnimation.setValue(0);
    const animation = Animated.spring(openAnimation, {
      damping: 18,
      mass: 0.8,
      stiffness: 210,
      toValue: 1,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [openAnimation, visible]);

  useEffect(() => {
    if (!visible) return undefined;
    const firstScroll = setTimeout(scrollToBottom, 50);
    const secondScroll = setTimeout(scrollToBottom, 220);
    return () => {
      clearTimeout(firstScroll);
      clearTimeout(secondScroll);
    };
  }, [isSending, messages, scrollToBottom, selectedId, visible]);

  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);

  const setInputValue = useCallback((value) => {
    inputValueRef.current = value;
    setInputValueState(value);
  }, []);

  const persist = useCallback(async (items) => {
    try {
      const cached = items.map((item) => ({ ...item, messages: (item.messages || []).filter((message) => !message.optimistic) }));
      await AsyncStorage.setItem(storageKey, JSON.stringify({ conversations: cached }));
    } catch { /* optional cache */ }
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
    setLoadingMessages(false);
    /* Local conversation history is authoritative; the deployed backend has no conversation route. */
    /*
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
    */
  }, [conversations, isPhone, searchResults]);

  const createRealConversation = useCallback(async () => {
    setCreatingConversation(true);
    const local = {
      ...createConversation(),
      selectedCaseId: contextValue.caseId ?? contextValue.selectedCaseId ?? null,
      selectedCaseName: contextValue.caseName ?? contextValue.selectedCaseName ?? null,
    };
    setConversations((current) => {
      const pendingId = selectedIdRef.current;
      const next = [local, ...current.filter((item) => item.id !== pendingId)];
      void persist(next);
      return next;
    });
    setSelectedId(local.id);
    selectedIdRef.current = local.id;
    setMessages([]);
    setQuery('');
    setSearchResults(null);
    setSyncError('');
    if (isPhone) setSidebarVisible(false);
    setCreatingConversation(false);
    return local;
    /*
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
    */
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
      /* The deployed backend does not expose conversation persistence routes. */
      /*
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
      */
      setLoadingConversations(false);
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
    const normalizedQuery = debouncedQuery.toLowerCase();
    setSearchResults(conversations.filter((item) => item.title.toLowerCase().includes(normalizedQuery)));
    setLoadingConversations(false);
    return () => { searchSequenceRef.current += 1; };
    /*
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
    */
  }, [conversations, debouncedQuery, visible]);

  const activeConversation = conversations.find((item) => item.id === selectedId) || null;
  const caseId = contextValue.caseId ?? contextValue.selectedCaseId ?? activeConversation?.selectedCaseId ?? null;
  const voiceScope = useMemo(() => selectedId ? {
    localConversationId: selectedId,
    conversationId: activeConversation?.backendConversationId || (selectedId.startsWith('local-conversation-') ? null : selectedId),
    caseId,
  } : null, [selectedId, activeConversation?.backendConversationId, caseId]);
  const voice = useLuxVoice({
    visible: visible && focused,
    userKey: currentUser?.uid || 'anonymous',
    contextKey: activeContextKey,
    scope: voiceScope,
    onPending: (id, scope) => updateConversationMessages(scope.localConversationId, (current) => current.some((item) => item.clientRequestId === id) ? current : [...current, createMessage('user', 'Enviando nota de voz…', { id: `voice-${id}`, clientRequestId: id, optimistic: true })]),
    onSettled: (id, scope) => updateConversationMessages(scope.localConversationId, (current) => current.filter((item) => item.id !== `voice-${id}`)),
    onTurn: (result, id, scope) => {
      const user = { ...result.userMessage, text: result.userMessage.text || result.transcript,
        voiceMode: voice.controller.state.conversation ? 'conversation' : 'message',
        audio: result.userMessage.audio || { durationMs: voice.controller.state.draft?.durationMs } };
      const assistant = { ...result.assistantMessage, speech: result.speech };
      updateConversationMessages(scope.localConversationId, (current) => reconcileVoiceMessages(current, id, [user, assistant]));
      updateConversation(scope.localConversationId, (item) => ({ ...item, backendConversationId: result.conversationId,
        selectedCaseId: scope.caseId, title: item.title === 'Nueva conversación' ? result.transcript.slice(0, 55) || item.title : item.title }));
    },
    onSpeech: (message, speech, scope) => updateConversationMessages(scope.localConversationId, (current) => current.map((item) => item.id === message.id ? { ...item, speech } : item)),
  });
  const startVoice = useCallback(async (conversation) => {
    const state = voice.controller.state;
    if (voiceStartRef.current || sendLockRef.current || voice.controller.busy || state.draft) return;
    setVoiceControlsVisible(true);
    Keyboard.dismiss();
    voiceStartRef.current = true;
    try {
      const local = selectedIdRef.current ? null : await createRealConversation();
      const localConversationId = selectedIdRef.current || local?.id;
      if (!localConversationId || !visible || !focused) return;
      await voice.controller.begin({ localConversationId,
        conversationId: activeConversation?.backendConversationId || (localConversationId.startsWith('local-conversation-') ? null : localConversationId), caseId }, conversation);
    } finally { voiceStartRef.current = false; }
  }, [voice.controller, createRealConversation, activeConversation?.backendConversationId, caseId, visible, focused]);
  const closeVoiceControls = useCallback(() => {
    setVoiceControlsVisible(false);
    void voice.controller.close();
  }, [voice.controller]);
  const openVoiceControls = useCallback(() => {
    setVoiceControlsVisible(true);
    Keyboard.dismiss();
    if (!voice.controller.busy && !voice.controller.state.draft && !voice.controller.state.conversation) void startVoice(false);
  }, [startVoice, voice.controller]);
  const closeLux = useCallback(() => { textRequestRef.current?.abort(); void voice.controller.close(); onClose(); }, [onClose, voice.controller]);
  useEffect(() => {
    // Scope changes also invalidate written responses so they cannot enter a new chat.
    textRequestRef.current?.abort();
    setIsSending(false);
    sendLockRef.current = false;
    setVoiceControlsVisible(false);
    if (!visible || !focused) setKeyboardHeight(0);
  }, [activeContextKey, caseId, visible, focused]);
  useEffect(() => () => { textRequestRef.current?.abort(); }, []);
  const visibleConversations = searchResults || conversations;
  const input = inputValue;
  const isStreaming = isSending;
  const showVoiceControls = voiceControlsVisible || voice.state.conversation || !!voice.state.draft || voice.state.starting || ['listening', 'processing', 'speaking', 'error'].includes(voice.state.status);
  const voicePanelMaxHeight = compactHeight ? 112 : Math.max(112, Math.min(keyboardVisible ? 132 : 252, (layout.height - keyboardHeight) * 0.36));
  const microphoneDisabled = isSending || loadingConversations || creatingConversation;
  const callDisabled = microphoneDisabled || voice.controller.busy || !!voice.state.draft || !voice.state.capabilities?.enabled ||
    !voice.state.capabilities?.transcriptionAvailable;
  // Keep the two assistant modes explicit; each conversation still owns its messages.
  const modeWelcome = { [CHAT_MODE.GENERAL]: GENERAL_WELCOME, [CHAT_MODE.LEGAL]: LEGAL_WELCOME };

  const handleNewConversation = useCallback(() => {
    if (!isSending && !creatingConversation) { void voice.controller.close(); void createRealConversation(); }
  }, [creatingConversation, createRealConversation, isSending, voice.controller]);

  const handleSend = useCallback(async () => {
    const text = inputValueRef.current.trim();
    const isStreaming = isSending;
    if (!text || isSending || isStreaming || sendLockRef.current || voice.controller.busy ||
        (voice.controller.state.conversation && !voice.controller.state.microphonePaused)) return;
    sendLockRef.current = true;
    const controller = new AbortController();
    textRequestRef.current = controller;
    setIsSending(true);
    const userMessage = createMessage('user', text);
    let conversationId = normalizeConversationId(selectedIdRef.current);
    if (!conversationId) {
      const remote = await createRealConversation();
      conversationId = normalizeConversationId(remote?.id);
      if (!conversationId) { setIsSending(false); sendLockRef.current = false; return; }
    }
    updateConversationMessages(conversationId, (current) => [...current, userMessage]);
    setInputValue('');
    setSyncError('');
    try {
      let response;
      const context = { ...contextValue, caseId, conversationId: activeConversation?.backendConversationId || conversationId, mode: chatMode.toLowerCase() };
      response = await sendGeneralLuxMessage(text, context, { signal: controller.signal });
      if (controller.signal.aborted) return;
      // The real backend now routes both modes through /lux/chat. Legacy clients
      // may still call sendLegalLuxQuery(body) with this shape:
      // const body = { question: text, conversationId: legalConversationIdRef.current };
      // chatMode === CHAT_MODE.LEGAL and chatMode === CHAT_MODE.GENERAL remain UI modes.
      const reply = response.reply;
      const assistantMessage = response.assistantMessage ? { ...normalizeLuxMessage(response.assistantMessage), persisted: true }
        : createMessage('assistant', reply, { ...(response.messageId ? { id: String(response.messageId), persisted: true } : {}), citations: response.citations || [], documents: response.documents || [], ...(response?.citations ? { legal: response } : {}) });
      updateConversationMessages(conversationId, (current) => [...current, assistantMessage]);
      if (response?.conversationId && response.conversationId !== activeConversation?.backendConversationId) {
        const responseConversationId = normalizeConversationId(response.conversationId);
        if (responseConversationId) {
          updateConversation(conversationId, (item) => ({ ...item, backendConversationId: responseConversationId }));
        }
      }
      const shouldRead = voice.controller.state.conversation ? !voice.controller.state.muted : voice.controller.autoRead;
      if (shouldRead && assistantMessage.persisted && selectedIdRef.current === conversationId) {
        voice.controller.scope = { localConversationId: conversationId, conversationId: response.conversationId || context.conversationId, caseId };
        void voice.controller.generateSpeech(assistantMessage);
      }
    } catch (error) {
      if (!controller.signal.aborted && selectedIdRef.current === conversationId) setSyncError(getLuxErrorMessage(error));
    } finally { if (textRequestRef.current === controller) { textRequestRef.current = null; setIsSending(false); sendLockRef.current = false; } }
  }, [chatMode, contextValue, createRealConversation, isSending, setInputValue, updateConversation, updateConversationMessages, voice.controller, activeConversation?.backendConversationId, caseId]);

  const handleRename = useCallback(async () => {
    const title = renameValue.trim();
    if (!actionConversation || !title) return;
    try {
      updateConversation(actionConversation.id, (item) => ({ ...item, title, updatedAt: new Date().toISOString() }));
      setShowRename(false); setActionConversation(null); setSyncError('');
    } catch {
      setSyncError('No pudimos renombrar la conversación.');
    }
  }, [actionConversation, renameValue, updateConversation]);

  const handleArchive = useCallback(async () => {
    if (!actionConversation) return;
    const id = actionConversation.id;
    try {
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
    <Modal animationType="none" onRequestClose={closeLux} transparent visible={visible && focused}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined} style={styles.overlay}>
        <Animated.View
          style={[
            styles.sheet,
            {
              opacity: openAnimation,
              transform: [
                {
                  translateY: openAnimation.interpolate({
                    inputRange: [0, 1],
                    outputRange: [isPhone ? 180 : 220, 0],
                  }),
                },
                {
                  scale: openAnimation.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.92, 1],
                  }),
                },
              ],
            },
          ]}
        >
          {(!isPhone || sidebarVisible) ? <LuxConversationSidebar compact={isPhone} conversations={visibleConversations} loading={loadingConversations} onChangeQuery={setQuery} onClose={isPhone ? () => setSidebarVisible(false) : undefined} onNewConversation={handleNewConversation} onOpenAction={(item) => { setActionConversation(item); setRenameValue(item.title); }} onSelectConversation={selectConversation} query={query} selectedId={selectedId} /> : null}
          {(!isPhone || !sidebarVisible) ? (
            <View style={styles.chatPane}>
              <View style={styles.header}>
                <Pressable accessibilityLabel={sidebarVisible ? 'Ocultar conversaciones' : 'Abrir conversaciones'} accessibilityRole="button" onPress={() => setSidebarVisible((current) => !current)} style={styles.headerButton}><MaterialCommunityIcons color={colors.primary} name="menu" size={23} /></Pressable>
                <View style={styles.headerCopy}><Text style={styles.headerEyebrow}>ASISTENTE JURÍDICO</Text><Text numberOfLines={1} style={styles.headerTitle}>{activeConversation?.title || 'Nueva conversación'}</Text>{activeConversation?.selectedCaseName ? <Text style={styles.caseContext}>Causa: {activeConversation.selectedCaseName}</Text> : null}</View>
                <Pressable accessibilityLabel="Cerrar LUX" accessibilityRole="button" onPress={closeLux} style={styles.headerButton}><MaterialCommunityIcons color={colors.textSecondary} name="close" size={22} /></Pressable>
              </View>
              <View style={styles.modeRow}>{[{ key: CHAT_MODE.GENERAL, label: 'Chat actual' }, { key: CHAT_MODE.LEGAL, label: 'Consulta jurídica' }].map((option) => <Pressable accessibilityRole="tab" accessibilityState={{ selected: chatMode === option.key }} key={option.key} onPress={() => selectMode(option.key)} style={[styles.modeOption, chatMode === option.key && styles.modeOptionSelected]}><Text style={[styles.modeText, chatMode === option.key && styles.modeTextSelected]}>{option.label}</Text></Pressable>)}</View>
              <ScrollView
                contentContainerStyle={styles.messagesContent}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                persistentScrollbar
                ref={messagesScrollRef}
                showsVerticalScrollIndicator
                style={styles.messagesScroll}
              >
                {loadingMessages ? <View style={styles.loadingMessages}><ActivityIndicator color={colors.primary} /><Text style={styles.mutedText}>Cargando historial…</Text></View> : null}
                {!loadingMessages && !messages.length ? <View accessibilityLabel={modeWelcome[chatMode]} style={styles.emptyChat}><View style={styles.luxMark}><Text style={styles.luxMarkText}>LUX</Text></View><Text style={styles.emptyTitle}>¿En qué puedo ayudarte?</Text><Text style={styles.emptyDescription}>Consultá causas, documentos y cuestiones jurídicas con una respuesta clara y enfocada.</Text><View style={styles.suggestions}>{['Analizar una causa', 'Revisar documentos', 'Consulta jurídica'].map((suggestion) => <Pressable key={suggestion} onPress={() => setInputValue(suggestion)} style={styles.suggestion}><Text style={styles.suggestionText}>{suggestion}</Text></Pressable>)}</View></View> : null}
                {messages.map((item) => <View key={item.id} testID={`lux-message-${item.id}`} style={[styles.messageBlock, item.role === 'user' ? styles.userBlock : styles.assistantBlock]}><Text style={styles.messageRole}>{item.role === 'user' ? 'Vos' : 'LUX'}</Text><View style={item.role === 'user' ? styles.userMessageContainer : undefined}><LuxMessageContent message={item} controller={voice.controller} state={voice.state} /></View></View>)}
                {isSending ? <View style={styles.thinking}><ActivityIndicator color={colors.primary} size="small" /><Text style={styles.mutedText}>LUX está pensando…</Text></View> : null}
                {syncError ? <View style={styles.inlineAlert}><MaterialCommunityIcons color={colors.danger} name="alert-outline" size={17} /><Text style={styles.inlineAlertText}>{syncError}</Text></View> : null}
              </ScrollView>
              <View style={styles.chatFooter}>
              {showVoiceControls ? <LuxVoiceControls voice={voice} disabled={isSending || loadingConversations || creatingConversation} onStart={(conversation) => { void startVoice(conversation); }} onClose={closeVoiceControls} maxHeight={voicePanelMaxHeight} caseName={contextValue.caseName || activeConversation?.selectedCaseName} /> : null}
              {!showVoiceControls ? <Pressable accessibilityRole="button" accessibilityLabel="Hablar con Lux" accessibilityState={{ disabled: callDisabled }}
                disabled={callDisabled} onPress={() => { void startVoice(true); }} style={[styles.callButton, callDisabled && { opacity: 0.45 }]}>
                <MaterialCommunityIcons name="phone-in-talk-outline" size={20} color={colors.primary} />
                <Text style={styles.callLabel}>Hablar con Lux</Text>
              </Pressable> : null}
              <View style={styles.composer}>
                <TextInput
                  accessibilityLabel="Escribir mensaje a LUX"
                  blurOnSubmit={Platform.OS !== 'web'}
                  multiline
                  onChangeText={setInputValue}
                  onKeyPress={(event) => {
                    if (Platform.OS === 'web' && event.nativeEvent?.key === 'Enter' && !event.nativeEvent?.shiftKey) {
                      event.preventDefault?.();
                      handleSend();
                    }
                  }}
                  onSubmitEditing={Platform.OS === 'web' ? undefined : handleSend}
                  placeholder="Escribí tu consulta…"
                  placeholderTextColor={colors.textMuted}
                  style={styles.input}
                  submitBehavior={Platform.OS === 'web' ? 'newline' : 'submit'}
                  value={input}
                />
                <Pressable accessibilityLabel={showVoiceControls ? 'Controles de voz' : 'Grabar nota de voz'} accessibilityRole="button" accessibilityState={{ disabled: microphoneDisabled, expanded: showVoiceControls }} disabled={microphoneDisabled} onPress={openVoiceControls} style={[styles.microphoneButton, showVoiceControls && styles.microphoneButtonActive, microphoneDisabled && { opacity: 0.4 }]}><MaterialCommunityIcons color={voice.state.microphoneActive ? colors.danger : colors.primary} name={voice.state.conversation ? 'phone-in-talk-outline' : 'microphone-outline'} size={24} /></Pressable>
                <Pressable accessibilityLabel="Enviar mensaje a LUX" accessibilityRole="button" disabled={!input.trim() || isSending || isStreaming || voice.controller.busy || (voice.state.conversation && !voice.state.microphonePaused)} onPress={handleSend} style={[styles.sendButton, (!input.trim() || isSending || voice.controller.busy || (voice.state.conversation && !voice.state.microphonePaused)) && styles.sendButtonDisabled]}><MaterialCommunityIcons color="#FFFFFF" name="arrow-up" size={21} /></Pressable>
              </View>
              {!keyboardVisible && !compactHeight ? <Text style={styles.composerHint}>{voice.state.conversation && !voice.state.microphonePaused ? 'Pausá el micrófono para enviar un mensaje escrito.' : 'LUX brinda información orientativa. Verificá las fuentes antes de tomar decisiones.'}</Text> : null}
              </View>
            </View>
          ) : null}
        </Animated.View>
      </KeyboardAvoidingView>

      <Modal animationType="fade" transparent visible={Boolean(actionConversation) && !showRename && !showDelete} onRequestClose={() => setActionConversation(null)}><View style={styles.dialogOverlay}><View style={styles.actionDialog}><Text style={styles.dialogTitle}>{actionConversation?.title}</Text><Pressable onPress={() => setShowRename(true)} style={styles.dialogRow}><MaterialCommunityIcons color={colors.primary} name="pencil-outline" size={19} /><Text style={styles.dialogRowText}>Renombrar</Text></Pressable><Pressable onPress={handleArchive} style={styles.dialogRow}><MaterialCommunityIcons color={colors.primary} name="archive-outline" size={19} /><Text style={styles.dialogRowText}>Archivar</Text></Pressable><Pressable onPress={() => setShowDelete(true)} style={styles.dialogRow}><MaterialCommunityIcons color={colors.danger} name="trash-can-outline" size={19} /><Text style={[styles.dialogRowText, { color: colors.danger }]}>Eliminar</Text></Pressable><Pressable onPress={() => setActionConversation(null)} style={styles.cancelRow}><Text style={styles.cancelText}>Cancelar</Text></Pressable></View></View></Modal>
      <Modal animationType="fade" transparent visible={showRename} onRequestClose={() => setShowRename(false)}><View style={styles.dialogOverlay}><View style={styles.actionDialog}><Text style={styles.dialogTitle}>Renombrar conversación</Text><TextInput autoFocus onChangeText={setRenameValue} style={styles.dialogInput} value={renameValue} /><View style={styles.dialogActions}><Pressable onPress={() => setShowRename(false)} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>Cancelar</Text></Pressable><Pressable onPress={handleRename} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Guardar</Text></Pressable></View></View></View></Modal>
      <Modal animationType="fade" transparent visible={showDelete} onRequestClose={() => setShowDelete(false)}><View style={styles.dialogOverlay}><View style={styles.actionDialog}><Text style={styles.dialogTitle}>¿Eliminar esta conversación?</Text><Text style={styles.dialogDescription}>Esta acción eliminará el historial de este chat.</Text><View style={styles.dialogActions}><Pressable onPress={() => setShowDelete(false)} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>Cancelar</Text></Pressable><Pressable onPress={handleDelete} style={[styles.primaryButton, { backgroundColor: colors.danger }]}><Text style={styles.primaryButtonText}>Eliminar</Text></Pressable></View></View></View></Modal>
    </Modal>
  );
}

const createStyles = (colors, insets, isPhone, keyboardVisible, compactHeight) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(7, 28, 51, 0.5)', justifyContent: 'flex-end', padding: isPhone ? 0 : 22 },
  sheet: { flex: 1, width: '100%', maxWidth: 1240, maxHeight: isPhone ? '100%' : '74%', minHeight: isPhone ? 0 : 420, alignSelf: 'center', flexDirection: 'row', overflow: 'hidden', backgroundColor: colors.card, borderRadius: isPhone ? 0 : 22, paddingTop: isPhone ? insets.top : 0, paddingBottom: isPhone && !keyboardVisible ? Math.max(insets.bottom, 10) : 0 },
  chatPane: { flex: 1, minWidth: 0, minHeight: 0, backgroundColor: colors.background },
  header: { flexShrink: 0, minHeight: compactHeight ? 56 : isPhone ? 68 : 76, paddingHorizontal: isPhone ? 16 : 22, paddingVertical: compactHeight ? 6 : isPhone ? 10 : 14, borderBottomWidth: 1, borderBottomColor: colors.borderSoft, backgroundColor: colors.card, flexDirection: 'row', alignItems: 'center', gap: isPhone ? 8 : 12 },
  headerCopy: { flex: 1, minWidth: 0 },
  headerEyebrow: { color: colors.gold, fontSize: 10, fontWeight: '800', letterSpacing: 1.1 },
  headerTitle: { color: colors.text, fontSize: 18, fontWeight: '800', marginTop: 3 },
  caseContext: { color: colors.textSecondary, fontSize: 12, marginTop: 3 },
  headerButton: { width: isPhone ? 44 : 40, height: isPhone ? 44 : 40, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  modeRow: { flexShrink: 0, flexDirection: 'row', gap: 8, paddingHorizontal: isPhone ? 16 : 22, paddingTop: compactHeight ? 6 : 14 },
  modeOption: { borderBottomWidth: 2, borderBottomColor: 'transparent', paddingHorizontal: 4, paddingBottom: compactHeight ? 6 : 9, marginRight: 13 },
  modeOptionSelected: { borderBottomColor: colors.gold },
  modeText: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  modeTextSelected: { color: colors.primary },
  messagesScroll: { flex: 1, minHeight: compactHeight ? 32 : 80 },
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
  userMessageContainer: { backgroundColor: colors.primary, borderRadius: 16, borderBottomRightRadius: 5, paddingHorizontal: 15, paddingVertical: 11 },
  userText: { color: colors.textOnPrimary, backgroundColor: colors.primary, borderRadius: 16, borderBottomRightRadius: 5, paddingHorizontal: 15, paddingVertical: 11 },
  assistantText: { color: colors.text, paddingRight: 16 },
  citationHint: { color: colors.primary, fontSize: 11, fontWeight: '700', marginTop: 8 },
  thinking: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 18 },
  inlineAlert: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, padding: 11, backgroundColor: colors.dangerSoft },
  inlineAlertText: { color: colors.danger, flex: 1, fontSize: 12 },
  chatFooter: { flexShrink: 0, paddingHorizontal: isPhone ? 14 : 34, paddingTop: 6, paddingBottom: keyboardVisible || compactHeight ? 4 : 10 },
  composer: { flexShrink: 0, flexDirection: 'row', alignItems: 'flex-end', gap: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 17, padding: 8, backgroundColor: colors.card },
  callButton: { flexShrink: 0, flexDirection: 'row', alignSelf: 'flex-start', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 14, marginBottom: 8, borderRadius: 12, backgroundColor: colors.accentSoft },
  callLabel: { color: colors.primary, fontSize: 13, fontWeight: '700' },
  microphoneButton: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  microphoneButtonActive: { backgroundColor: colors.accentSoft },
  input: { flex: 1, minWidth: 0, minHeight: 42, maxHeight: 120, color: colors.text, fontSize: 15, lineHeight: 21, paddingHorizontal: 9, paddingTop: 10, paddingBottom: 8 },
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
