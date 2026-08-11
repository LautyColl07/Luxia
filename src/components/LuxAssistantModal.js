import { ExternalLink, SendHorizontal, Sparkles, X } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppTheme } from '../context/ThemeContext';
import { sendGeneralLuxMessage, sendLegalLuxQuery } from '../services/api';
import { isAllowedOfficialUrl, openOfficialLegalUrl, normalizeLegalResponse } from '../utils/legalAssistant';

const LUX_FALLBACK_REPLY = 'No pude conectarme con LUX en este momento.';
const STREAM_WORD_INTERVAL_MS = 30;
export const CHAT_MODE = { GENERAL: 'GENERAL', LEGAL: 'LEGAL' };
const GENERAL_WELCOME = 'Hola, soy LUX. Puedo ayudarte a consultar información de causas, audiencias, documentos y transcripciones.';
const LEGAL_WELCOME = 'Hola, soy LUX. Puedo ayudarte a consultar normativa, analizar cuestiones jurídicas y trabajar con legislación argentina.';

function createInitialMessage(mode) {
  return {
    id: 'lux-welcome',
    role: 'assistant',
    text: 'Hola, soy LUX. Puedo ayudarte a consultar información de causas, audiencias, documentos y transcripciones.',
  };
}

function createMessage(role, text) {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    role,
    text,
  };
}

function splitIntoStreamChunks(text) {
  return String(text || '')
    .split(/(\s+)/)
    .filter((chunk) => chunk.length > 0);
}

function createConversationId() {
  return `legal-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function LuxAssistantModal({ context = {}, onClose, visible }) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.bottom), [colors, insets.bottom]);
  const listRef = useRef(null);
  const cursorIntervalRef = useRef(null);
  const streamIntervalRef = useRef(null);
  const legalConversationIdRef = useRef(createConversationId());
  const [input, setInput] = useState('');
  const [chatMode, setChatMode] = useState(CHAT_MODE.LEGAL);
  const [messagesByMode, setMessagesByMode] = useState(() => ({
    [CHAT_MODE.GENERAL]: [{ ...createInitialMessage(CHAT_MODE.GENERAL), text: GENERAL_WELCOME }],
    [CHAT_MODE.LEGAL]: [{ ...createInitialMessage(CHAT_MODE.LEGAL), id: 'legal-welcome', text: LEGAL_WELCOME }],
  }));
  const [isSending, setIsSending] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [showStreamingCursor, setShowStreamingCursor] = useState(true);
  const [streamedText, setStreamedText] = useState('');
  const messages = messagesByMode[chatMode];
  const updateMessages = useCallback((updater) => {
    setMessagesByMode((current) => ({ ...current, [chatMode]: updater(current[chatMode]) }));
  }, [chatMode]);
  const selectMode = useCallback((nextMode) => {
    if (!isSending && !isStreaming) {
      setChatMode(nextMode);
      setInput('');
    }
  }, [isSending, isStreaming]);

  const startNewLegalConversation = useCallback(() => {
    if (isSending || isStreaming) return;
    legalConversationIdRef.current = createConversationId();
    setMessagesByMode((current) => ({
      ...current,
      [CHAT_MODE.LEGAL]: [{ ...createInitialMessage(CHAT_MODE.LEGAL), id: `legal-welcome-${Date.now()}`, text: LEGAL_WELCOME }],
    }));
  }, [isSending, isStreaming]);

  useEffect(() => {
    if (!visible) {
      setInput('');
      setIsSending(false);
      setIsStreaming(false);
      setStreamedText('');
      if (streamIntervalRef.current) {
        clearInterval(streamIntervalRef.current);
        streamIntervalRef.current = null;
      }
      if (cursorIntervalRef.current) {
        clearInterval(cursorIntervalRef.current);
        cursorIntervalRef.current = null;
      }
    }
  }, [visible]);

  useEffect(() => {
    if (!isStreaming) {
      setShowStreamingCursor(true);
      if (cursorIntervalRef.current) {
        clearInterval(cursorIntervalRef.current);
        cursorIntervalRef.current = null;
      }
      return;
    }

    cursorIntervalRef.current = setInterval(() => {
      setShowStreamingCursor((current) => !current);
    }, 520);

    return () => {
      if (cursorIntervalRef.current) {
        clearInterval(cursorIntervalRef.current);
        cursorIntervalRef.current = null;
      }
    };
  }, [isStreaming]);

  useEffect(
    () => () => {
      if (streamIntervalRef.current) {
        clearInterval(streamIntervalRef.current);
      }
      if (cursorIntervalRef.current) {
        clearInterval(cursorIntervalRef.current);
      }
    },
    []
  );

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd?.({ animated: true });
    });
  }, []);

  const streamAssistantReply = useCallback(
    (reply, messageId) =>
      new Promise((resolve) => {
        const finalReply = reply || LUX_FALLBACK_REPLY;
        const chunks = splitIntoStreamChunks(finalReply);
        let index = 0;
        let accumulated = '';

        setIsStreaming(true);
        setStreamedText('');

        if (streamIntervalRef.current) {
          clearInterval(streamIntervalRef.current);
        }

        streamIntervalRef.current = setInterval(() => {
          const nextChunk = chunks[index];

          if (nextChunk === undefined) {
            clearInterval(streamIntervalRef.current);
            streamIntervalRef.current = null;
            updateMessages((currentMessages) =>
              currentMessages.map((message) =>
                message.id === messageId
                  ? { ...message, isStreaming: false, text: finalReply }
                  : message
              )
            );
            setStreamedText(finalReply);
            setIsStreaming(false);
            scrollToEnd();
            resolve();
            return;
          }

          accumulated += nextChunk;
          setStreamedText(accumulated);
            updateMessages((currentMessages) =>
            currentMessages.map((message) =>
              message.id === messageId ? { ...message, isStreaming: true, text: accumulated } : message
            )
          );
          index += 1;
          scrollToEnd();
        }, STREAM_WORD_INTERVAL_MS);
      }),
    [scrollToEnd, updateMessages]
  );

  const handleSend = useCallback(async () => {
    const text = input.trim();

    if (!text || isSending || isStreaming) {
      return;
    }

    const assistantMessage = {
      ...createMessage('assistant', ''),
      isStreaming: true,
    };

    setInput('');
    setIsSending(true);
    setStreamedText('');
    updateMessages((currentMessages) => [
      ...currentMessages,
      createMessage('user', text),
      assistantMessage,
    ]);
    scrollToEnd();

    try {
      let response;
      if (chatMode === CHAT_MODE.LEGAL) {
        const body = { question: text, conversationId: legalConversationIdRef.current };
        console.log('[LUX MODE]', chatMode);
        console.log('[LUX ENDPOINT]', '/api/v1/lux/legal/query');
        console.log('[LUX BODY KEYS]', Object.keys(body).join(','));
        response = normalizeLegalResponse(await sendLegalLuxQuery(body));
      }
      if (chatMode === CHAT_MODE.GENERAL) {
        console.log('[LUX MODE]', chatMode);
        console.log('[LUX ENDPOINT]', '/api/v1/lux/chat');
        response = await sendGeneralLuxMessage(text, context);
      }
      if (chatMode === CHAT_MODE.LEGAL && response.conversationId) {
        legalConversationIdRef.current = response.conversationId;
      }
      const reply = response?.answer || response?.reply || LUX_FALLBACK_REPLY;

      await streamAssistantReply(reply, assistantMessage.id);
      if (chatMode === CHAT_MODE.LEGAL) {
        updateMessages((currentMessages) => currentMessages.map((message) =>
          message.id === assistantMessage.id ? { ...message, legal: response } : message
        ));
      }
    } catch (error) {
      const messagesByStatus = { 400: 'La consulta jurídica no es válida.', 401: 'Tu sesión venció. Iniciá sesión nuevamente.', 404: 'La consulta jurídica todavía no está disponible.', 422: 'No hay evidencia suficiente para responder esa consulta.', 429: 'Alcanzaste el límite de consultas. Intentá más tarde.', 503: 'El servicio jurídico no está disponible ahora.' };
      const reply = chatMode === CHAT_MODE.LEGAL ? (messagesByStatus[error?.status] || (error?.status === 0 ? 'No pudimos conectarnos. Revisá tu conexión.' : 'No pudimos completar la consulta jurídica.')) : LUX_FALLBACK_REPLY;
      await streamAssistantReply(reply, assistantMessage.id);
    } finally {
      setIsSending(false);
      scrollToEnd();
    }
  }, [chatMode, context, input, isSending, isStreaming, scrollToEnd, streamAssistantReply, updateMessages]);

  const renderMessage = useCallback(
    ({ item }) => {
      const isUser = item.role === 'user';
      const showCursor = item.role === 'assistant' && item.isStreaming && showStreamingCursor;

      return (
        <View style={[styles.messageRow, isUser ? styles.userMessageRow : styles.assistantMessageRow]}>
          <View style={[styles.messageBubble, isUser ? styles.userBubble : styles.assistantBubble]}>
            <Text style={[styles.messageText, isUser ? styles.userMessageText : styles.assistantMessageText]}>
              {item.text}
              {showCursor ? <Text style={styles.streamingCursor}>|</Text> : null}
            </Text>
            {item.legal && !item.isStreaming ? <LegalDetails legal={item.legal} styles={styles} /> : null}
          </View>

          <View accessibilityRole="tablist" style={styles.modeSelector}>
            {[{ key: CHAT_MODE.GENERAL, label: 'Chat actual' }, { key: CHAT_MODE.LEGAL, label: 'Consulta jurídica' }].map((option) => (
              <Pressable accessibilityRole="tab" accessibilityState={{ selected: chatMode === option.key }} key={option.key} onPress={() => selectMode(option.key)} style={[styles.modeOption, chatMode === option.key && styles.modeOptionSelected]}>
                <Text style={[styles.modeOptionText, chatMode === option.key && styles.modeOptionTextSelected]}>{option.label}</Text>
              </Pressable>
            ))}
          </View>
          {chatMode === CHAT_MODE.LEGAL ? (
            <Pressable disabled={isSending || isStreaming} onPress={startNewLegalConversation}>
              <Text style={styles.newConversationText}>Nueva conversación</Text>
            </Pressable>
          ) : null}
        </View>
      );
    },
    [chatMode, selectMode, showStreamingCursor, startNewLegalConversation, styles]
  );

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
        style={{ flex: 1 }}
      >
        <View style={styles.overlay}>
          <Pressable onPress={onClose} style={styles.backdrop} />
        <View style={styles.sheet}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <View style={styles.headerIcon}>
              <Sparkles color="#C9B38C" size={22} strokeWidth={2} />
            </View>
            <View style={styles.headerText}>
              <Text style={styles.title}>LUX</Text>
              <Text style={styles.subtitle}>Asistente inteligente de Luxia</Text>
            </View>
            <Pressable
              accessibilityLabel="Cerrar LUX"
              accessibilityRole="button"
              onPress={onClose}
              style={({ pressed }) => [styles.closeButton, pressed && styles.pressedButton]}
            >
              <X color={colors.textSecondary} size={21} strokeWidth={2.2} />
            </Pressable>
          </View>

          <View style={styles.messagesContainer}>
            <FlatList
              contentContainerStyle={styles.messagesContent}
              data={messages}
              keyExtractor={(item) => item.id}
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
              keyboardShouldPersistTaps="handled"
              onContentSizeChange={scrollToEnd}
              onLayout={scrollToEnd}
              ref={listRef}
              renderItem={renderMessage}
              showsVerticalScrollIndicator={false}
              style={styles.messagesList}
            />
          </View>

          {isSending && !isStreaming ? (
            <View style={styles.thinkingRow}>
              {isStreaming && streamedText ? null : <ActivityIndicator color={colors.primary} size="small" />}
              <Text style={styles.thinkingText}>LUX está pensando...</Text>
            </View>
          ) : null}

          {isStreaming ? (
            <View style={styles.thinkingRow}>
              <Text style={styles.thinkingText}>LUX esta escribiendo...</Text>
            </View>
          ) : null}

          <View style={styles.inputContainer}>
            <TextInput
              multiline
              onChangeText={setInput}
              onSubmitEditing={Platform.OS === 'web' ? handleSend : undefined}
              placeholder={chatMode === CHAT_MODE.LEGAL ? 'Escribe tu consulta jurídica' : 'Escribe tu consulta'}
              placeholderTextColor={colors.textMuted}
              returnKeyType="send"
              style={styles.input}
              value={input}
            />
            <Pressable
              accessibilityLabel="Enviar mensaje a LUX"
              accessibilityRole="button"
              disabled={!input.trim() || isSending || isStreaming}
              onPress={handleSend}
              style={({ pressed }) => [
                styles.sendButton,
                (!input.trim() || isSending || isStreaming) && styles.sendButtonDisabled,
                pressed && input.trim() && !isSending && !isStreaming ? styles.pressedButton : null,
              ]}
            >
              <SendHorizontal color="#FFFFFF" size={20} strokeWidth={2.2} />
            </Pressable>
          </View>
        </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function LegalDetails({ legal, styles }) {
  return (
    <View style={styles.legalDetails}>
      {legal.insufficientEvidence ? <Text style={styles.insufficientEvidence}>No hay evidencia suficiente para responder con seguridad.</Text> : null}
      {legal.citations.map((citation, index) => {
        const officialUrl = isAllowedOfficialUrl(citation.officialUrl) ? citation.officialUrl : null;
        return (
          <View key={`${citation.source || 'fuente'}-${index}`} style={styles.citation}>
            <Text style={styles.citationLabel}>{citation.summaryOnly ? 'Análisis oficial' : 'Fuente oficial'}</Text>
            {citation.source ? <Text style={styles.citationText}>{citation.source}</Text> : null}
            {citation.sourceType ? <Text style={styles.citationMeta}>{citation.sourceType}</Text> : null}
            {citation.provision || citation.officialNumber ? <Text style={styles.citationText}>{[citation.officialNumber, citation.provision].filter(Boolean).join(' · ')}</Text> : null}
            {citation.court || citation.caseName ? <Text style={styles.citationMeta}>{[citation.court, citation.caseName].filter(Boolean).join(' · ')}</Text> : null}
            {citation.excerpt ? <Text style={styles.citationExcerpt}>{citation.excerpt}</Text> : null}
            {officialUrl ? <Pressable accessibilityRole="link" onPress={() => openOfficialLegalUrl(officialUrl)} style={styles.sourceLink}><ExternalLink color={styles.sourceLinkText.color} size={14} /><Text style={styles.sourceLinkText}>Abrir fuente oficial</Text></Pressable> : null}
          </View>
        );
      })}
    </View>
  );
}

const createStyles = (colors, bottomInset) => StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    ...(Platform.OS === 'web' ? {
      justifyContent: 'center',
      paddingHorizontal: 24,
    } : {}),
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(7, 28, 51, 0.42)',
  },
  sheet: {
    flex: 1,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    maxHeight: '88%',
    minHeight: 280,
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 10,
    paddingHorizontal: 18,
    paddingBottom: Math.max(bottomInset, 14) + 8,
    shadowColor: '#071C33',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 20,
    ...(Platform.OS === 'web' ? {
      width: '100%',
      maxWidth: 960,
      maxHeight: '90%',
      borderRadius: 24,
      paddingHorizontal: 24,
    } : {}),
  },
  handle: {
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: 14,
    ...(Platform.OS === 'web' ? { display: 'none' } : {}),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  modeSelector: { flexDirection: 'row', gap: 8, paddingVertical: 10 },
  modeOption: { flex: 1, alignItems: 'center', borderRadius: 14, borderWidth: 1, borderColor: colors.border, paddingVertical: 9 },
  modeOptionSelected: { backgroundColor: colors.primaryDeep, borderColor: colors.primaryDeep },
  modeOptionText: { color: colors.textSecondary, fontSize: 12, fontWeight: '700' },
  modeOptionTextSelected: { color: '#FFFFFF' },
  newConversationText: { color: colors.primary, fontSize: 12, fontWeight: '700', paddingBottom: 8 },
  headerIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryDeep,
    marginRight: 12,
  },
  headerText: {
    flex: 1,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.neutralSoft,
  },
  pressedButton: {
    opacity: 0.78,
  },
  messagesContainer: {
    flex: 1,
  },
  messagesList: {
    flex: 1,
  },
  messagesContent: {
    paddingTop: 16,
    paddingBottom: 18,
    gap: 10,
  },
  messageRow: {
    width: '100%',
    flexDirection: 'row',
  },
  assistantMessageRow: {
    justifyContent: 'flex-start',
  },
  userMessageRow: {
    justifyContent: 'flex-end',
  },
  messageBubble: {
    maxWidth: '84%',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  assistantBubble: {
    backgroundColor: colors.accentSoft,
    borderTopLeftRadius: 6,
  },
  userBubble: {
    backgroundColor: colors.primary,
    borderTopRightRadius: 6,
  },
  messageText: {
    fontSize: 14,
    lineHeight: 20,
  },
  legalDetails: { marginTop: 10, gap: 8 },
  insufficientEvidence: { color: colors.danger, fontSize: 12, lineHeight: 17, fontWeight: '700' },
  citation: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8, gap: 3 },
  citationLabel: { color: colors.primaryDeep, fontSize: 11, fontWeight: '800' },
  citationText: { color: colors.text, fontSize: 12, lineHeight: 16, fontWeight: '700' },
  citationMeta: { color: colors.textSecondary, fontSize: 11, lineHeight: 15 },
  citationExcerpt: { color: colors.textSecondary, fontSize: 11, lineHeight: 15, fontStyle: 'italic' },
  sourceLink: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingTop: 3 },
  sourceLinkText: { color: colors.primary, fontSize: 12, fontWeight: '800' },
  assistantMessageText: {
    color: colors.text,
  },
  userMessageText: {
    color: colors.textOnPrimary,
  },
  thinkingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  thinkingText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  streamingCursor: {
    color: colors.primary,
    fontWeight: '900',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 12 : 8,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
  input: {
    flex: 1,
    minHeight: 46,
    maxHeight: 112,
    borderRadius: 18,
    backgroundColor: colors.inputBackground,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
  },
  sendButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryDeep,
  },
  sendButtonDisabled: {
    backgroundColor: colors.textMuted,
    opacity: 0.55,
  },
});
