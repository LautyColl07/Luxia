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
import {
  finishLiveTranscription,
  startLiveTranscription,
  uploadLiveTranscriptionChunk,
} from '../services/api';

const CHUNK_SECONDS = 5;
const CHUNK_MILLIS = CHUNK_SECONDS * 1000;

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
  const styles = useMemo(() => createStyles(colors), [colors]);
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
  const isRecordingRef = useRef(false);
  const sessionIdRef = useRef(null);
  const chunkIndexRef = useRef(0);
  const currentRecordingRef = useRef(null);
  const loopPromiseRef = useRef(null);
  const pendingUploadsRef = useRef([]);
  const stopCurrentChunkRef = useRef(null);

  const accumulatedText = useMemo(
    () => sortChunks(chunks).map((chunk) => chunk.text).filter(Boolean).join('\n'),
    [chunks]
  );
  const visibleText = finalText || accumulatedText;
  const activeChunkNumber = chunkIndexRef.current + 1;

  const upsertChunk = useCallback((chunk) => {
    setChunks((current) => {
      const withoutDuplicate = current.filter((item) => item.chunkIndex !== chunk.chunkIndex);
      return sortChunks([...withoutDuplicate, chunk]);
    });
  }, []);

  const registerChunkError = useCallback((chunkIndex, error) => {
    console.log('[LiveTranscription] chunk error', chunkIndex, error?.message || error);
    setErrors((current) => [
      ...current,
      {
        id: `${chunkIndex}-${Date.now()}`,
        chunkIndex,
        message: getApiErrorMessage(error),
      },
    ]);
    setStatusText('Error');
  }, []);

  const trackUpload = useCallback((promise) => {
    pendingUploadsRef.current = [...pendingUploadsRef.current, promise];
    promise.finally(() => {
      pendingUploadsRef.current = pendingUploadsRef.current.filter((item) => item !== promise);
    });
  }, []);

  const uploadChunk = useCallback(
    async ({ audioUri, chunkIndex, startTime, endTime }) => {
      try {
        console.log('[LiveTranscription] uploading chunk', chunkIndex);
        setUploadStatusText(`Enviando bloque ${chunkIndex + 1}...`);
        const uploadPromise = uploadLiveTranscriptionChunk({
          sessionId: sessionIdRef.current,
          audioUri,
          chunkIndex,
          startTime,
          endTime,
        });
        setUploadStatusText('Transcribiendo...');
        const response = await uploadPromise;

        console.log('[LiveTranscription] received text', chunkIndex);
        upsertChunk({
          chunkIndex: response?.chunkIndex ?? chunkIndex,
          startTime: response?.startTime ?? startTime,
          endTime: response?.endTime ?? endTime,
          text: response?.text || '',
        });
        setStatusText('Guardado');
        setUploadStatusText(`Guardado bloque ${chunkIndex + 1}`);
      } catch (error) {
        registerChunkError(chunkIndex, error);
        setUploadStatusText(`Error en bloque ${chunkIndex + 1}`);
      }
    },
    [registerChunkError, upsertChunk]
  );

  const waitForChunkEnd = useCallback(
    () =>
      new Promise((resolve) => {
        const timeoutId = setTimeout(resolve, CHUNK_MILLIS);
        stopCurrentChunkRef.current = () => {
          clearTimeout(timeoutId);
          resolve();
        };
      }),
    []
  );

  const recordLoop = useCallback(async () => {
    while (isRecordingRef.current) {
      const chunkIndex = chunkIndexRef.current;
      const startTime = chunkIndex * CHUNK_SECONDS;
      const endTime = startTime + CHUNK_SECONDS;

      try {
        console.log('[LiveTranscription] recording chunk', chunkIndex);
        setStatusText(`Grabando bloque ${chunkIndex + 1}...`);
        currentRecordingRef.current = recorder;
        await recorder.prepareToRecordAsync();
        recorder.record();

        await waitForChunkEnd();

        console.log('[LiveTranscription] stopping chunk', chunkIndex);
        setStatusText(`Enviando bloque ${chunkIndex + 1}...`);
        await recorder.stop();

        const recorderSnapshot = recorder.getStatus();
        const audioUri = recorder.uri || recorderSnapshot?.url || recorderState.url;
        currentRecordingRef.current = null;
        stopCurrentChunkRef.current = null;

        if (!audioUri) {
          throw new Error('No se encontro el archivo temporal del bloque.');
        }

        const uploadPromise = uploadChunk({
          audioUri,
          chunkIndex,
          startTime,
          endTime,
        });
        trackUpload(uploadPromise);
        chunkIndexRef.current = chunkIndex + 1;
      } catch (error) {
        currentRecordingRef.current = null;
        stopCurrentChunkRef.current = null;
        registerChunkError(chunkIndex, error);
        chunkIndexRef.current = chunkIndex + 1;
      }
    }
  }, [recorder, recorderState.url, registerChunkError, trackUpload, uploadChunk, waitForChunkEnd]);

  const stopOpenRecording = useCallback(async () => {
    stopCurrentChunkRef.current?.();

    if (currentRecordingRef.current) {
      await currentRecordingRef.current.stop().catch(() => null);
      currentRecordingRef.current = null;
    }
  }, []);

  const handleStart = useCallback(async () => {
    if (isRecordingRef.current || isStarting) {
      return;
    }

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
      chunkIndexRef.current = 0;
      pendingUploadsRef.current = [];

      const permission = await requestRecordingPermissionsAsync();

      if (!permission.granted) {
        throw new Error('No hay permisos de microfono. Habilitalos para iniciar la transcripcion.');
      }

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        interruptionMode: 'doNotMix',
        shouldPlayInBackground: false,
        shouldRouteThroughEarpiece: false,
      });

      console.log('[LiveTranscription] starting session');
      const nextSessionId = await startLiveTranscription({
        title: routeParams.title || 'Transcripción en vivo',
        caseId: routeParams.caseId,
        hearingId: routeParams.hearingId,
      });
      console.log('[LiveTranscription] session created', nextSessionId);

      setSessionId(nextSessionId);
      sessionIdRef.current = nextSessionId;
      isRecordingRef.current = true;
      setIsRecording(true);
      setStatusText('Grabando...');
      loopPromiseRef.current = recordLoop();
    } catch (error) {
      const message = getApiErrorMessage(error);
      console.error('[LiveTranscription] Error iniciando transcripcion:', error);
      isRecordingRef.current = false;
      setIsRecording(false);
      setStatusText('Error');
      setErrors((current) => [
        ...current,
        {
          id: `start-${Date.now()}`,
          chunkIndex: null,
          message,
        },
      ]);
      Alert.alert('No se pudo iniciar', message);
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => null);
    } finally {
      setIsStarting(false);
    }
  }, [isStarting, recordLoop, routeParams.caseId, routeParams.hearingId, routeParams.title]);

  const handleFinish = useCallback(async () => {
    if (!sessionIdRef.current || isFinishing) {
      return;
    }

    try {
      console.log('[LiveTranscription] finishing session');
      setIsFinishing(true);
      setStatusText('Transcribiendo...');
      isRecordingRef.current = false;
      stopCurrentChunkRef.current?.();

      if (loopPromiseRef.current) {
        await loopPromiseRef.current;
      }

      const pendingUploads = [...pendingUploadsRef.current];
      if (pendingUploads.length) {
        await Promise.allSettled(pendingUploads);
      }

      const finished = await finishLiveTranscription(sessionIdRef.current);

      if (Array.isArray(finished?.chunks) && finished.chunks.length) {
        setChunks(sortChunks(finished.chunks));
      }

      if (finished?.fullText) {
        setFinalText(finished.fullText);
      }

      setIsRecording(false);
      setStatusText('Finalizado');
      setUploadStatusText('Guardado');
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => null);
      console.log('[LiveTranscription] finished');
    } catch (error) {
      const message = getApiErrorMessage(error);
      console.error('[LiveTranscription] Error finalizando transcripcion:', error);
      setStatusText('Error');
      setErrors((current) => [
        ...current,
        {
          id: `finish-${Date.now()}`,
          chunkIndex: null,
          message,
        },
      ]);
      Alert.alert('No se pudo finalizar', message);
    } finally {
      setIsFinishing(false);
    }
  }, [isFinishing, stopOpenRecording]);

  useEffect(
    () => () => {
      isRecordingRef.current = false;
      stopCurrentChunkRef.current?.();
      void stopOpenRecording();
      void setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => null);
    },
    [stopOpenRecording]
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
          disabled={isStarting || isRecording || isFinishing}
          icon="record-circle-outline"
          label={isStarting ? 'Preparando...' : 'Iniciar transcripción'}
          onPress={() => void handleStart()}
          styles={styles}
          variant="primary"
        />
        <ActionButton
          colors={colors}
          disabled={!sessionId || !isRecording || isFinishing}
          icon="stop-circle-outline"
          label={isFinishing ? 'Finalizando...' : 'Finalizar'}
          onPress={() => void handleFinish()}
          styles={styles}
          variant="secondary"
        />
      </View>

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

const createStyles = (colors) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 20,
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
    flexDirection: 'row',
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
