import { SendHorizontal, Sparkles, X } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppTheme } from '../context/ThemeContext';
import { sendLuxMessage } from '../services/api';

const LUX_FALLBACK_REPLY = 'No pude conectarme con LUX en este momento.';
const STREAM_WORD_INTERVAL_MS = 30;

function createInitialMessage() {
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

export default function LuxAssistantModal({ context = {}, onClose, visible }) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.bottom), [colors, insets.bottom]);
  const listRef = useRef(null);
  const cursorIntervalRef = useRef(null);
  const streamIntervalRef = useRef(null);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState(() => [createInitialMessage()]);
  const [isSending, setIsSending] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [showStreamingCursor, setShowStreamingCursor] = useState(true);
  const [streamedText, setStreamedText] = useState('');

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
            setMessages((currentMessages) =>
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
          setMessages((currentMessages) =>
            currentMessages.map((message) =>
              message.id === messageId ? { ...message, isStreaming: true, text: accumulated } : message
            )
          );
          index += 1;
          scrollToEnd();
        }, STREAM_WORD_INTERVAL_MS);
      }),
    [scrollToEnd]
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
    setMessages((currentMessages) => [
      ...currentMessages,
      createMessage('user', text),
      assistantMessage,
    ]);
    scrollToEnd();

    try {
      const response = await sendLuxMessage(text, {
        screen: 'dashboard',
        ...context,
      });
      const reply = response?.reply || LUX_FALLBACK_REPLY;

      await streamAssistantReply(reply, assistantMessage.id);
    } catch (error) {
      console.error('[LUX] Error enviando mensaje:', error);
      await streamAssistantReply(LUX_FALLBACK_REPLY, assistantMessage.id);
    } finally {
      setIsSending(false);
      scrollToEnd();
    }
  }, [context, input, isSending, isStreaming, scrollToEnd, streamAssistantReply]);

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
          </View>
        </View>
      );
    },
    [showStreamingCursor, styles]
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
          <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
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
              placeholder="Escribe tu consulta"
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
          </TouchableWithoutFeedback>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const createStyles = (colors, bottomInset) => StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(7, 28, 51, 0.42)',
  },
  sheet: {
    flex: 1,
    maxHeight: '82%',
    minHeight: 480,
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
  },
  handle: {
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
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
