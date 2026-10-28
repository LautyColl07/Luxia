import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { auth } from '../config/firebase';
import { useAppTheme } from '../context/ThemeContext';
import { useResponsiveLayout } from '../theme/layout';
import {
  finishLiveTranscription,
  startLiveTranscription,
  uploadLiveTranscriptionChunk,
} from '../services/api';
import { createTranscriptionChunkQueue } from '../utils/transcriptionChunkQueue';
import { prepareAndStartRecorder, stopRecorderChunk } from '../utils/recorderLifecycle';

const CHUNK_SECONDS = 5;
const CHUNK_MILLIS = CHUNK_SECONDS * 1000;
const MAX_PENDING_CHUNKS = 3;

function releaseRecordingUri(uri) {
  if (typeof uri !== 'string' || !uri.startsWith('blob:')) return;
  if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
    URL.revokeObjectURL(uri);
  }
}

function formatSeconds(value) {
  const totalSeconds = Math.max(0, Math.floor(Number(value) || 0));
  return `${totalSeconds}s`;
}

function sortChunks(chunks) {
  return [...chunks].sort((first, second) => first.chunkIndex - second.chunkIndex);
}

function getApiErrorMessage(error) {
  if (error?.status === 401 || error?.status === 403) {
    return 'Sesión expirada o token inválido';
  }

  if (error?.status >= 500) {
    return (
      error?.data?.details ||
      error?.data?.error ||
      error?.data?.message ||
      error?.message ||
      'Error del servidor'
    );
  }

  return error instanceof Error ? error.message : 'Ocurrio un error inesperado.';
}

export default function LiveTranscriptionScreen({ route }) {
  const { colors } = useAppTheme();
  const layout = useResponsiveLayout();
  const styles = useMemo(() => createStyles(colors, layout), [colors, layout]);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 250);
  const routeParams = route?.params || {};
  const [sessionId, setSessionId] = useState(null);
  const [statusText, setStatusText] = useState('Preparando...');
  const [uploadStatusText, setUploadStatusText] = useState('Sin bloques pendientes');
  const [chunks, setChunks] = useState([]);
  const [finalText, setFinalText] = useState('');
  const [errors, setErrors] = useState([]);
  const [isStarting, setIsStarting] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [isQueueBlocked, setIsQueueBlocked] = useState(false);
  const isRecordingRef = useRef(false);
  const isStartingRef = useRef(false);
  const isFinishingRef = useRef(false);
  const startCancelledRef = useRef(false);
  const mountedRef = useRef(true);
  const recorderActiveRef = useRef(false);
  const sessionIdRef = useRef(null);
  const chunkIndexRef = useRef(0);
  const currentChunkRef = useRef(null);
  const elapsedSecondsRef = useRef(0);
  const loopPromiseRef = useRef(null);
  const stopCurrentChunkRef = useRef(null);
  const queueRef = useRef(null);

  const accumulatedText = useMemo(
    () => sortChunks(chunks).map((chunk) => chunk.text).filter(Boolean).join('\n'),
    [chunks]
  );
  const visibleText = finalText || accumulatedText;
  const activeChunkNumber = chunkIndexRef.current + 1;

  const upsertChunk = useCallback((chunk) => {
    if (!mountedRef.current) return;
    setChunks((current) => {
      const withoutDuplicate = current.filter((item) => item.chunkIndex !== chunk.chunkIndex);
      return sortChunks([...withoutDuplicate, chunk]);
    });
  }, []);

  const registerChunkError = useCallback((chunkIndex, error) => {
    console.warn('[LiveTranscription] No se pudo procesar un bloque de audio.');
    if (!mountedRef.current) return;
    setErrors((current) => [
      ...current,
      {
        id: `${chunkIndex}-${Date.now()}`,
        chunkIndex,
        message: getApiErrorMessage(error),
      },
    ]);
    setStatusText('Error de envío');
  }, []);

  if (!queueRef.current) {
    queueRef.current = createTranscriptionChunkQueue({
      limit: MAX_PENDING_CHUNKS,
      onSizeChange: (size) => {
        if (mountedRef.current) setPendingCount(size);
      },
      processTask: async (task) => {
        if (mountedRef.current) {
          setUploadStatusText(`Transcribiendo bloque ${task.chunkIndex + 1}...`);
        }
        const response = await uploadLiveTranscriptionChunk(task);
        upsertChunk({
          chunkIndex: response?.chunkIndex ?? task.chunkIndex,
          startTime: response?.startTime ?? task.startTime,
          endTime: response?.endTime ?? task.endTime,
          text: response?.text || '',
        });
        if (mountedRef.current) {
          setStatusText('Guardado');
          setUploadStatusText(`Guardado bloque ${task.chunkIndex + 1}`);
        }
        releaseRecordingUri(task.audioUri);
      },
    });
  }

  const waitForChunkEnd = useCallback(
    () =>
      new Promise((resolve) => {
        const timeoutId = setTimeout(() => {
          stopCurrentChunkRef.current = null;
          resolve();
        }, CHUNK_MILLIS);
        stopCurrentChunkRef.current = () => {
          clearTimeout(timeoutId);
          stopCurrentChunkRef.current = null;
          resolve();
        };
      }),
    []
  );

  const drainQueue = useCallback(async () => {
    const result = await queueRef.current.drain();
    if (!result.ok) {
      isRecordingRef.current = false;
      stopCurrentChunkRef.current?.();
      registerChunkError(result.task.chunkIndex, result.error);
      if (mountedRef.current) {
        setIsRecording(false);
        setIsQueueBlocked(true);
        setStatusText('La captura se detuvo; hay bloques pendientes para reintentar.');
        setUploadStatusText(`Error en bloque ${result.task.chunkIndex + 1}`);
      }
      return false;
    }

    if (mountedRef.current) setIsQueueBlocked(false);
    return true;
  }, [registerChunkError]);

  const recordLoop = useCallback(async () => {
    try {
      while (isRecordingRef.current) {
        const chunk = currentChunkRef.current;
        if (!chunk || !recorderActiveRef.current) break;
        if (mountedRef.current) setStatusText(`Grabando bloque ${chunk.index + 1}...`);
        await waitForChunkEnd();

        const { audioUri, durationSeconds } = await stopRecorderChunk(recorder, CHUNK_SECONDS);
        recorderActiveRef.current = false;
        currentChunkRef.current = null;

        if (durationSeconds >= 0.1) {
          const task = {
            sessionId: sessionIdRef.current,
            audioUri,
            chunkIndex: chunk.index,
            startTime: chunk.startTime,
            endTime: chunk.startTime + durationSeconds,
          };
          if (!queueRef.current.enqueue(task)) {
            throw new Error('La cola se llenó antes de conservar el bloque de audio.');
          }
          elapsedSecondsRef.current = task.endTime;
          chunkIndexRef.current = chunk.index + 1;
          void drainQueue();
        } else {
          releaseRecordingUri(audioUri);
          chunkIndexRef.current = chunk.index + 1;
        }

        if (queueRef.current.size() >= MAX_PENDING_CHUNKS) {
          isRecordingRef.current = false;
          if (mountedRef.current) {
            setIsRecording(false);
            setStatusText('Cola completa. La captura se detuvo con los bloques pendientes conservados.');
          }
        }
        if (!isRecordingRef.current) break;

        const recorderStarted = await prepareAndStartRecorder(
          recorder,
          () => isRecordingRef.current && mountedRef.current
        );
        if (!recorderStarted) break;
        currentChunkRef.current = { index: chunkIndexRef.current, startTime: elapsedSecondsRef.current };
        recorderActiveRef.current = true;
      }
    } catch (error) {
      isRecordingRef.current = false;
      stopCurrentChunkRef.current?.();
      if (recorderActiveRef.current) await recorder.stop().catch(() => null);
      recorderActiveRef.current = false;
      currentChunkRef.current = null;
      registerChunkError(chunkIndexRef.current, error);
      if (mountedRef.current) setIsRecording(false);
    } finally {
      recorderActiveRef.current = false;
      if (mountedRef.current) setIsRecording(false);
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => null);
    }
  }, [drainQueue, recorder, registerChunkError, waitForChunkEnd]);

  const handleStart = useCallback(async () => {
    if (isRecordingRef.current || isStartingRef.current || sessionIdRef.current) {
      return;
    }

    isStartingRef.current = true;
    startCancelledRef.current = false;
    let createdSessionId = null;
    try {
      if (!auth?.currentUser) {
        throw new Error('Tenés que iniciar sesión para usar la transcripción');
      }

      setIsStarting(true);
      setStatusText('Preparando...');
      setUploadStatusText('Sin bloques pendientes');
      setChunks([]);
      setFinalText('');
      setErrors([]);
      setPendingCount(0);
      setIsQueueBlocked(false);
      chunkIndexRef.current = 0;
      elapsedSecondsRef.current = 0;
      queueRef.current.clear((task) => releaseRecordingUri(task.audioUri));

      const permission = await requestRecordingPermissionsAsync();

      if (!permission.granted) {
        throw new Error('No hay permisos de microfono. Habilitalos para iniciar la transcripcion.');
      }
      if (startCancelledRef.current || !mountedRef.current) return;

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        interruptionMode: 'doNotMix',
        shouldPlayInBackground: false,
        shouldRouteThroughEarpiece: false,
      });
      if (startCancelledRef.current || !mountedRef.current) return;

      console.log('[LiveTranscription] starting session');
      const nextSessionId = await startLiveTranscription({
        title: routeParams.title || 'Transcripción en vivo',
        caseId: routeParams.caseId,
        hearingId: routeParams.hearingId,
      });
      console.log('[LiveTranscription] session created', nextSessionId);
      createdSessionId = nextSessionId;
      sessionIdRef.current = nextSessionId;

      if (startCancelledRef.current || !mountedRef.current) {
        await finishLiveTranscription(nextSessionId).catch(() => null);
        sessionIdRef.current = null;
        return;
      }

      const recorderStarted = await prepareAndStartRecorder(
        recorder,
        () => !startCancelledRef.current && mountedRef.current
      );
      if (!recorderStarted) {
        await finishLiveTranscription(nextSessionId).catch(() => null);
        sessionIdRef.current = null;
        return;
      }

      setSessionId(nextSessionId);
      currentChunkRef.current = { index: 0, startTime: 0 };
      recorderActiveRef.current = true;
      isRecordingRef.current = true;
      setIsRecording(true);
      setStatusText('Grabando...');
      loopPromiseRef.current = recordLoop();
    } catch (error) {
      const message = getApiErrorMessage(error);
      console.error('[LiveTranscription] No se pudo iniciar la transcripcion.');
      isRecordingRef.current = false;
      if (recorderActiveRef.current) await recorder.stop().catch(() => null);
      recorderActiveRef.current = false;
      if (createdSessionId) await finishLiveTranscription(createdSessionId).catch(() => null);
      sessionIdRef.current = null;
      if (mountedRef.current) {
        setIsRecording(false);
        setStatusText(startCancelledRef.current ? 'Inicio cancelado.' : message);
        if (!startCancelledRef.current) {
          setErrors((current) => [
            ...current,
            { id: `start-${Date.now()}`, chunkIndex: null, message },
          ]);
        }
      }
      if (!startCancelledRef.current) Alert.alert('No se pudo iniciar', message);
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => null);
    } finally {
      isStartingRef.current = false;
      if (mountedRef.current) setIsStarting(false);
    }
  }, [recordLoop, recorder, routeParams.caseId, routeParams.hearingId, routeParams.title]);

  const handleFinish = useCallback(async () => {
    if (isStartingRef.current) {
      startCancelledRef.current = true;
      setStatusText('Cancelando inicio...');
      return;
    }

    if (!sessionIdRef.current || isFinishingRef.current) {
      return;
    }

    isFinishingRef.current = true;
    isRecordingRef.current = false;
    try {
      console.log('[LiveTranscription] finishing session');
      setIsFinishing(true);
      setStatusText('Transcribiendo...');
      stopCurrentChunkRef.current?.();

      if (loopPromiseRef.current) {
        await loopPromiseRef.current;
      }

      const queueSaved = await drainQueue();
      if (!queueSaved) throw new Error('Hay bloques pendientes. Reintentá el envío antes de finalizar.');

      const activeSessionId = sessionIdRef.current;
      const finished = await finishLiveTranscription(activeSessionId);

      if (Array.isArray(finished?.chunks) && finished.chunks.length) {
        setChunks(sortChunks(finished.chunks));
      }

      if (finished?.fullText) {
        setFinalText(finished.fullText);
      }

      setIsRecording(false);
      setStatusText('Finalizado');
      setUploadStatusText('Guardado');
      sessionIdRef.current = null;
      setSessionId(null);
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => null);
      console.log('[LiveTranscription] finished');
    } catch (error) {
      const message = getApiErrorMessage(error);
      console.error('[LiveTranscription] No se pudo finalizar la transcripcion.');
      if (mountedRef.current) {
        setStatusText(message);
        setErrors((current) => [
          ...current,
          { id: `finish-${Date.now()}`, chunkIndex: null, message },
        ]);
      }
      Alert.alert('No se pudo finalizar', message);
    } finally {
      isFinishingRef.current = false;
      if (mountedRef.current) setIsFinishing(false);
    }
  }, [drainQueue]);

  useEffect(
    () => {
      mountedRef.current = true;
      return () => {
        mountedRef.current = false;
        startCancelledRef.current = true;
        isRecordingRef.current = false;
        stopCurrentChunkRef.current?.();
        void (async () => {
          if (loopPromiseRef.current) await loopPromiseRef.current.catch(() => null);
          if (recorderActiveRef.current) await recorder.stop().catch(() => null);
          recorderActiveRef.current = false;
          const activeSessionId = sessionIdRef.current;
          if (activeSessionId) {
            const result = await queueRef.current.drain();
            if (result.ok) await finishLiveTranscription(activeSessionId).catch(() => null);
            else queueRef.current.clear((task) => releaseRecordingUri(task.audioUri));
          } else {
            queueRef.current.clear((task) => releaseRecordingUri(task.audioUri));
          }
          await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => null);
        })();
      };
    },
    [recorder]
  );

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} style={styles.screen}>
      <View style={styles.header}>
        <View style={[styles.recordingDot, isRecording && styles.recordingDotActive]} />
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Transcripcion en vivo</Text>
          <Text style={styles.subtitle}>
            {sessionId ? `Sesion ${sessionId}` : 'Lista para crear una sesion en el backend.'}
          </Text>
        </View>
      </View>

      <View style={styles.controls}>
        <ActionButton
          colors={colors}
          disabled={isStarting || isRecording || isFinishing || Boolean(sessionId)}
          icon="record-circle-outline"
          label={isStarting ? 'Preparando...' : 'Iniciar transcripción'}
          onPress={() => void handleStart()}
          styles={styles}
          variant="primary"
        />
        <ActionButton
          colors={colors}
          disabled={(!sessionId && !isStarting) || isFinishing}
          icon="stop-circle-outline"
          label={
            isStarting
              ? 'Cancelar inicio'
              : isFinishing
                ? 'Finalizando...'
                : isRecording
                  ? 'Detener'
                  : 'Finalizar'
          }
          onPress={() => void handleFinish()}
          styles={styles}
          variant="secondary"
        />
      </View>

      {isQueueBlocked && pendingCount > 0 ? (
        <View style={styles.controls}>
          <ActionButton
            colors={colors}
            disabled={isFinishing}
            icon="refresh"
            label={`Reintentar envío (${pendingCount})`}
            onPress={() => void drainQueue()}
            styles={styles}
            variant="secondary"
          />
        </View>
      ) : null}

      <View style={styles.statusGrid}>
        <StatusBlock label="Estado" styles={styles} value={statusText} />
        <StatusBlock label="Bloque actual" styles={styles} value={`Bloque ${activeChunkNumber}`} />
        <StatusBlock label="Subida" styles={styles} value={uploadStatusText} />
      </View>

      {isRecording ? (
        <View style={styles.liveStrip}>
          <MaterialCommunityIcons color={colors.danger} name="microphone" size={18} />
          <Text style={styles.liveStripText}>
            Grabando bloque {activeChunkNumber} - {Math.min(CHUNK_SECONDS, Math.floor((recorderState.durationMillis || 0) / 1000))}s / 5s
          </Text>
        </View>
      ) : null}

      {errors.length ? (
        <View style={styles.errorPanel}>
          <View style={styles.errorHeader}>
            <MaterialCommunityIcons color={colors.danger} name="alert-outline" size={18} />
            <Text style={styles.errorTitle}>Errores de la sesion</Text>
          </View>
          {errors.slice(-4).map((item) => (
            <Text key={item.id} style={styles.errorText}>
              {item.chunkIndex === null ? item.message : `Bloque ${item.chunkIndex}: ${item.message}`}
            </Text>
          ))}
        </View>
      ) : null}

      <View style={styles.transcriptPanel}>
        <Text style={styles.sectionTitle}>Texto completo acumulado</Text>
        <Text style={styles.transcriptText}>
          {visibleText || 'El texto transcripto aparecera aca sin esperar al final de la audiencia.'}
        </Text>
      </View>

      <View style={styles.blockList}>
        <Text style={styles.sectionTitle}>Bloques transcritos</Text>
        {chunks.length ? (
          sortChunks(chunks).map((chunk) => (
            <View key={chunk.chunkIndex} style={styles.chunkRow}>
              <Text style={styles.chunkTitle}>
                Bloque {chunk.chunkIndex} [{formatSeconds(chunk.startTime)} - {formatSeconds(chunk.endTime)}]
              </Text>
              <Text style={styles.chunkText}>
                {chunk.text ? `"${chunk.text}"` : 'Sin texto devuelto para este bloque.'}
              </Text>
            </View>
          ))
        ) : (
          <Text style={styles.emptyText}>Todavia no se recibieron bloques.</Text>
        )}
      </View>
    </ScrollView>
  );
}

function StatusBlock({ label, styles, value }) {
  return (
    <View style={styles.statusBlock}>
      <Text style={styles.statusLabel}>{label}</Text>
      <Text style={styles.statusValue}>{value}</Text>
    </View>
  );
}

function ActionButton({ colors, disabled, icon, label, onPress, styles, variant }) {
  const isPrimary = variant === 'primary';

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={[isPrimary ? styles.primaryButton : styles.secondaryButton, disabled && styles.buttonDisabled]}
    >
      <MaterialCommunityIcons color={isPrimary ? colors.textOnPrimary : colors.text} name={icon} size={19} />
      <Text style={isPrimary ? styles.primaryButtonText : styles.secondaryButtonText}>{label}</Text>
    </Pressable>
  );
}

const createStyles = (colors, layout) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    width: '100%',
    maxWidth: layout.formMaxWidth,
    alignSelf: 'center',
    padding: layout.gutter,
    paddingBottom: 34,
    gap: 16,
  },
  header: {
    backgroundColor: colors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: 16,
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
  },
  recordingDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.textMuted,
  },
  recordingDotActive: {
    backgroundColor: colors.danger,
  },
  headerCopy: {
    flex: 1,
  },
  title: {
    color: colors.text,
    fontSize: 21,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 5,
  },
  controls: {
    flexDirection: layout.isCompact ? 'column' : 'row',
    gap: 10,
  },
  primaryButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  primaryButtonText: {
    color: colors.textOnPrimary,
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
  },
  secondaryButtonText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
  },
  statusGrid: {
    gap: 10,
  },
  statusBlock: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    gap: 5,
  },
  statusLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  statusValue: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  liveStrip: {
    backgroundColor: colors.dangerSoft,
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  liveStripText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '800',
    flex: 1,
  },
  errorPanel: {
    backgroundColor: colors.dangerSoft,
    borderRadius: 16,
    padding: 14,
    gap: 8,
  },
  errorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  errorTitle: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: '800',
  },
  errorText: {
    color: colors.danger,
    fontSize: 13,
    lineHeight: 19,
  },
  transcriptPanel: {
    backgroundColor: colors.accentSoft,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    gap: 10,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  transcriptText: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 22,
  },
  blockList: {
    gap: 10,
  },
  chunkRow: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: 14,
    gap: 7,
  },
  chunkTitle: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '800',
  },
  chunkText: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
});
