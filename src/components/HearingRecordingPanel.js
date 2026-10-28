import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import ActionFeedbackModal from './ActionFeedbackModal';
import { useAppTheme } from '../context/ThemeContext';
import {
  finishHearingLiveTranscription,
  getHearingTranscription,
  startHearingLiveTranscription,
  uploadHearingAudio,
  uploadHearingLiveTranscriptionChunk,
  uploadPdfDocumentFromHearing,
} from '../services/api';
import { buildTranscriptionHtml } from '../utils/exportTranscription';
import { createTranscriptionChunkQueue } from '../utils/transcriptionChunkQueue';
import { prepareAndStartRecorder, stopRecorderChunk } from '../utils/recorderLifecycle';

const CHUNK_SECONDS = 5;
const CHUNK_MILLIS = CHUNK_SECONDS * 1000;
const MAX_PENDING_CHUNKS = 3;
const PDF_MIME_TYPE = 'application/pdf';

function releaseRecordingUri(uri) {
  if (typeof uri !== 'string' || !uri.startsWith('blob:')) return;
  if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
    URL.revokeObjectURL(uri);
  }
}

function getErrorMessage(error, fallback) {
  return (
    error?.data?.error ||
    error?.data?.message ||
    error?.message ||
    fallback
  );
}

export default function HearingRecordingPanel({ caseDetail, hearing, onDocumentsChanged }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 250);
  const [transcriptText, setTranscriptText] = useState('');
  const [transcriptInfo, setTranscriptInfo] = useState(null);
  const [statusText, setStatusText] = useState('Lista para grabar la audiencia.');
  const [loadingTranscript, setLoadingTranscript] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const [pendingChunkCount, setPendingChunkCount] = useState(0);
  const [isQueueBlocked, setIsQueueBlocked] = useState(false);
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [selectedAudio, setSelectedAudio] = useState(null);
  const [actionFeedback, setActionFeedback] = useState(null);
  const recordingRef = useRef(false);
  const startingRef = useRef(false);
  const finishingRef = useRef(false);
  const startCancelledRef = useRef(false);
  const mountedRef = useRef(true);
  const recorderActiveRef = useRef(false);
  const sessionIdRef = useRef(null);
  const chunkIndexRef = useRef(0);
  const currentChunkRef = useRef(null);
  const elapsedSecondsRef = useRef(0);
  const transcriptChunksRef = useRef(new Map());
  const loopPromiseRef = useRef(null);
  const stopChunkRef = useRef(null);
  const retryQueueRef = useRef(null);
  const chunkQueueRef = useRef(null);

  if (!chunkQueueRef.current) {
    chunkQueueRef.current = createTranscriptionChunkQueue({
      limit: MAX_PENDING_CHUNKS,
      onSizeChange: (size) => {
        if (mountedRef.current) setPendingChunkCount(size);
      },
      processTask: async (task) => {
        if (mountedRef.current) {
          setIsTranscribing(true);
          setStatusText(`Transcribiendo bloque ${task.chunkIndex + 1}...`);
        }
        try {
          const response = await uploadHearingLiveTranscriptionChunk(task);
          transcriptChunksRef.current.set(task.chunkIndex, response?.text || '');
          const nextText = [...transcriptChunksRef.current.entries()]
            .sort(([first], [second]) => first - second)
            .map(([, text]) => text)
            .filter(Boolean)
            .join('\n');

          if (mountedRef.current) {
            setTranscriptText(nextText);
            setTranscriptInfo((current) => ({
              ...(current || {}),
              audioAvailable: true,
              fullText: nextText,
              status: 'recording',
              text: nextText,
            }));
            setStatusText(`Bloque ${task.chunkIndex + 1} guardado.`);
          }
          releaseRecordingUri(task.audioUri);
        } finally {
          if (mountedRef.current) setIsTranscribing(false);
        }
      },
    });
  }

  const hearingId = hearing?.id ?? hearing?.audienciaId ?? hearing?.hearingId;
  const hasTranscript = Boolean(transcriptText.trim());
  const hasActiveSession = transcriptInfo?.status === 'recording' && Boolean(transcriptInfo?.sessionId);
  const showProgress = isStarting || isFinishing || isUploadingAudio || isTranscribing || isGeneratingPdf;
  const canDownloadPdf = Boolean(transcriptInfo?.pdfAvailable);

  const refreshTranscript = useCallback(async ({ preserveEmptyStatus = false, throwOnError = false } = {}) => {
    if (!hearingId) {
      return null;
    }

    try {
      setLoadingTranscript(true);
      const result = await getHearingTranscription(hearingId);
      const nextText = result?.text || '';
      sessionIdRef.current = result?.status === 'recording' && result?.sessionId
        ? String(result.sessionId)
        : null;
      transcriptChunksRef.current = new Map(
        (result?.chunks || []).map((chunk) => [Number(chunk.chunkIndex), chunk.text || ''])
      );
      setTranscriptInfo(result);
      setTranscriptText(nextText);
      if (nextText) {
        setStatusText('Transcripción cargada.');
      } else if (!preserveEmptyStatus) {
        setStatusText('Lista para grabar la audiencia.');
      }

      return result;
    } catch (error) {
      console.error('[HearingRecordingPanel] No se pudo cargar la transcripcion.');
      if (!preserveEmptyStatus) {
        setStatusText('No pudimos cargar la transcripción guardada.');
      }

      if (throwOnError) {
        throw error;
      }

      return null;
    } finally {
      setLoadingTranscript(false);
    }
  }, [hearingId]);

  useEffect(() => {
    void refreshTranscript();
  }, [refreshTranscript]);

  const waitForChunkEnd = useCallback(
    () =>
      new Promise((resolve) => {
        const timeoutId = setTimeout(() => {
          stopChunkRef.current = null;
          resolve();
        }, CHUNK_MILLIS);
        stopChunkRef.current = () => {
          clearTimeout(timeoutId);
          stopChunkRef.current = null;
          resolve();
        };
      }),
    []
  );

  const drainChunkQueue = useCallback(async () => {
    const result = await chunkQueueRef.current.drain();
    if (!result.ok) {
      recordingRef.current = false;
      stopChunkRef.current?.();
      if (mountedRef.current) {
        setIsRecording(false);
        setIsQueueBlocked(true);
        setStatusText(
          `No se guardó el bloque ${result.task.chunkIndex + 1}. La captura se detuvo; ` +
            `${result.remaining} bloque(s) siguen pendientes. Reintentá el envío.`
        );
      }
      return false;
    }

    if (mountedRef.current) setIsQueueBlocked(false);
    return true;
  }, []);

  retryQueueRef.current = drainChunkQueue;

  const recordLoop = useCallback(async () => {
    try {
      while (recordingRef.current) {
        const chunk = currentChunkRef.current;
        if (!chunk || !recorderActiveRef.current) break;
        if (mountedRef.current) setStatusText(`Grabando bloque ${chunk.index + 1}...`);
        await waitForChunkEnd();

        const { audioUri, durationSeconds } = await stopRecorderChunk(recorder, CHUNK_SECONDS);
        recorderActiveRef.current = false;
        currentChunkRef.current = null;

        if (durationSeconds >= 0.1) {
          const task = {
            audioUri,
            chunkIndex: chunk.index,
            endTime: chunk.startTime + durationSeconds,
            hearingId,
            sessionId: sessionIdRef.current,
            startTime: chunk.startTime,
          };
          if (!chunkQueueRef.current.enqueue(task)) {
            throw new Error('La cola se llenó antes de conservar el bloque de audio.');
          }
          elapsedSecondsRef.current = task.endTime;
          chunkIndexRef.current = chunk.index + 1;
          void drainChunkQueue();
        } else {
          releaseRecordingUri(audioUri);
          chunkIndexRef.current = chunk.index + 1;
        }

        if (chunkQueueRef.current.size() >= MAX_PENDING_CHUNKS) {
          recordingRef.current = false;
          if (mountedRef.current) {
            setIsRecording(false);
            setStatusText('Cola de transcripción completa. La captura se detuvo con los bloques pendientes conservados.');
          }
        }
        if (!recordingRef.current) break;

        const recorderStarted = await prepareAndStartRecorder(
          recorder,
          () => recordingRef.current && mountedRef.current
        );
        if (!recorderStarted) break;
        const nextChunk = {
          index: chunkIndexRef.current,
          startTime: elapsedSecondsRef.current,
        };
        currentChunkRef.current = nextChunk;
        recorderActiveRef.current = true;
      }
    } catch (error) {
      console.error('[HearingRecordingPanel] Falló la captura de un bloque de audio.');
      recordingRef.current = false;
      stopChunkRef.current?.();
      if (recorderActiveRef.current) {
        await recorder.stop().catch(() => null);
      }
      recorderActiveRef.current = false;
      currentChunkRef.current = null;
      if (mountedRef.current) {
        setIsRecording(false);
        setStatusText(getErrorMessage(error, 'Se detuvo la captura por un error de audio.'));
      }
    } finally {
      recorderActiveRef.current = false;
      if (mountedRef.current) setIsRecording(false);
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => null);
    }
  }, [drainChunkQueue, hearingId, recorder, waitForChunkEnd]);

  const handleStartRecording = useCallback(async () => {
    if (recordingRef.current || startingRef.current || sessionIdRef.current || !hearingId) {
      return;
    }

    startingRef.current = true;
    startCancelledRef.current = false;
    let createdSessionId = null;
    try {
      setIsStarting(true);
      setStatusText('Solicitando acceso al micrófono...');
      const permission = await requestRecordingPermissionsAsync();

      if (!permission.granted) {
        throw new Error('Necesitamos acceso al micrófono para grabar la audiencia.');
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
      const started = await startHearingLiveTranscription({ caseDetail, hearing });
      createdSessionId = started?.sessionId || null;
      if (!createdSessionId) throw new Error('El servidor no creó una sesión de transcripción.');
      sessionIdRef.current = createdSessionId;

      if (startCancelledRef.current || !mountedRef.current) {
        await finishHearingLiveTranscription({ hearingId, sessionId: createdSessionId }).catch(() => null);
        sessionIdRef.current = null;
        return;
      }

      const recorderStarted = await prepareAndStartRecorder(
        recorder,
        () => !startCancelledRef.current && mountedRef.current
      );
      if (!recorderStarted) {
        await finishHearingLiveTranscription({ hearingId, sessionId: createdSessionId }).catch(() => null);
        sessionIdRef.current = null;
        return;
      }

      setTranscriptInfo({ ...started, hearingId, sessionId: createdSessionId });
      setTranscriptText('');
      transcriptChunksRef.current = new Map();
      chunkQueueRef.current.clear((task) => releaseRecordingUri(task.audioUri));
      setPendingChunkCount(0);
      setIsQueueBlocked(false);
      elapsedSecondsRef.current = 0;
      chunkIndexRef.current = 0;
      currentChunkRef.current = { index: 0, startTime: 0 };
      recorderActiveRef.current = true;
      recordingRef.current = true;
      setIsRecording(true);
      setStatusText('Grabando audiencia...');
      loopPromiseRef.current = recordLoop();
    } catch (error) {
      const message = getErrorMessage(error, 'No se pudo iniciar la grabacion.');
      console.error('[HearingRecordingPanel] No se pudo iniciar la grabacion.');
      recordingRef.current = false;
      if (recorderActiveRef.current) await recorder.stop().catch(() => null);
      recorderActiveRef.current = false;
      if (createdSessionId) {
        await finishHearingLiveTranscription({ hearingId, sessionId: createdSessionId }).catch(() => null);
      }
      sessionIdRef.current = null;
      if (mountedRef.current) {
        setIsRecording(false);
        setStatusText(startCancelledRef.current ? 'Inicio cancelado.' : message);
      }
      if (!startCancelledRef.current) Alert.alert('No se pudo iniciar la grabación', message);
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => null);
    } finally {
      startingRef.current = false;
      if (mountedRef.current) setIsStarting(false);
    }
  }, [caseDetail, hearing, hearingId, recordLoop, recorder]);

  const handleStopRecording = useCallback(async () => {
    const sessionId = sessionIdRef.current;

    if (startingRef.current) {
      startCancelledRef.current = true;
      setStatusText('Cancelando inicio...');
      return;
    }

    if (finishingRef.current || !hearingId || !sessionId) {
      return;
    }

    finishingRef.current = true;
    recordingRef.current = false;
    try {
      setIsFinishing(true);
      setStatusText('Transcribiendo audiencia...');
      stopChunkRef.current?.();

      if (loopPromiseRef.current) {
        await loopPromiseRef.current;
      }

      const queueSaved = await drainChunkQueue();
      if (!queueSaved) throw new Error('Hay bloques pendientes. Reintentá el envío antes de finalizar.');

      const finished = await finishHearingLiveTranscription({ hearingId, sessionId });
      setTranscriptInfo(finished);

      if (finished?.fullText || finished?.text) {
        setTranscriptText(finished.fullText || finished.text);
      }

      setStatusText('Transcripción guardada.');
      sessionIdRef.current = null;
      await onDocumentsChanged?.();
    } catch (error) {
      const message = getErrorMessage(error, 'No se pudo detener la grabación.');
      console.error('[HearingRecordingPanel] No se pudo detener la grabacion.');
      if (mountedRef.current) setStatusText(message);
      Alert.alert('No se pudo detener la grabación', message);
    } finally {
      finishingRef.current = false;
      if (mountedRef.current) {
        setIsRecording(false);
        setIsFinishing(false);
      }
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => null);
    }
  }, [drainChunkQueue, hearingId, onDocumentsChanged]);

  const handleUploadAudio = useCallback(async () => {
    if (!hearingId || isRecording) {
      return;
    }

    try {
      const pickerResult = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
        type: ['audio/*', 'video/mp4'],
      });

      if (pickerResult.canceled) {
        setStatusText('Carga de audio cancelada.');
        return;
      }

      const asset = pickerResult.assets?.[0] || null;

      if (!asset?.uri) {
        Alert.alert('Audio invalido', 'No pudimos leer el archivo seleccionado.');
        return;
      }

      setSelectedAudio({
        name: asset.name || 'Audio de audiencia',
        size: asset.size,
        mimeType: asset.mimeType || 'audio/m4a',
      });
      setIsUploadingAudio(true);
      setStatusText('Subiendo audio...');
      const uploadResponse = await uploadHearingAudio({ asset, caseDetail, hearing });

      if (!uploadResponse?.success) {
        throw new Error(uploadResponse?.error || uploadResponse?.message || 'No se pudo subir el audio');
      }

      setTranscriptInfo((current) => ({
        ...(current || {}),
        ...(uploadResponse || {}),
        audioAvailable: true,
        status: uploadResponse?.status || 'uploaded',
      }));
      setStatusText('Audio subido correctamente.');
      setActionFeedback({
        title: 'Audio subido',
        message: 'El audio quedó asociado a esta audiencia y ya está disponible para transcribir.',
      });
      await onDocumentsChanged?.();

      try {
        const transcript = await refreshTranscript({
          preserveEmptyStatus: true,
          throwOnError: true,
        });

        if (!transcript?.text) {
          console.log('[HearingRecordingPanel] Transcripción no disponible todavía');
        }
      } catch (transcriptionError) {
        console.log(
          '[HearingRecordingPanel] Transcripción no disponible todavía:',
          transcriptionError?.message
        );
      }
    } catch (error) {
      const message = getErrorMessage(error, 'No se pudo subir el audio.');
      console.error('[HearingRecordingPanel] No se pudo subir el audio.');
      Alert.alert('No se pudo subir el audio', message);
    } finally {
      setIsUploadingAudio(false);
    }
  }, [caseDetail, hearing, hearingId, isRecording, onDocumentsChanged, refreshTranscript]);

  const handleGeneratePdf = useCallback(async () => {
    if (!hasTranscript) {
      Alert.alert('No hay transcripción para guardar.');
      return;
    }

    if (!hearingId) {
      Alert.alert('Error', 'No se encontró el ID de la audiencia.');
      return;
    }

    const fileName = `transcripcion-audiencia-${hearingId}.pdf`;

    try {
      setIsGeneratingPdf(true);
      setStatusText('Generando PDF...');
      const htmlContent = buildTranscriptionHtml(transcriptText);
      const pdf = await Print.printToFileAsync({
        html: htmlContent,
      });
      const pdfUri = pdf.uri;

      const info = await FileSystem.getInfoAsync(pdfUri);

      if (!info.exists || !info.size || info.size <= 0) {
        throw new Error('El PDF generado está vacío o no existe');
      }

      setStatusText('Guardando PDF en Documentos...');

      try {
        await uploadPdfDocumentFromHearing({
          fileUri: pdfUri,
          hearingId,
          fileName,
        });

        setTranscriptInfo((current) => ({
          ...(current || {}),
          pdfAvailable: true,
        }));
        setStatusText('PDF guardado en Documentos.');
        Alert.alert('Listo', 'El PDF se guardó correctamente en Documentos.');
        await onDocumentsChanged?.();
      } catch (uploadError) {
        setStatusText('PDF generado, pero no se pudo guardar en Documentos.');
        console.error('[HearingRecordingPanel] No se pudo subir el PDF a documentos.');
        Alert.alert(
          'PDF generado',
          'El PDF se generó, pero no se pudo guardar en Documentos.'
        );
      }
    } catch (error) {
      const message = getErrorMessage(error, 'No se pudo generar el PDF.');
      console.error('[HearingRecordingPanel] No se pudo generar el PDF.');
      Alert.alert('No se pudo guardar el PDF', message);
    } finally {
      setIsGeneratingPdf(false);
    }
  }, [hasTranscript, hearingId, onDocumentsChanged, transcriptText]);

  const handleDownloadPdf = useCallback(async () => {
    if (!canDownloadPdf || !hasTranscript) {
      Alert.alert('No hay PDF disponible para descargar.');
      return;
    }

    try {
      setIsDownloadingPdf(true);
      const htmlContent = buildTranscriptionHtml(transcriptText);
      const result = await Print.printToFileAsync({
        html: htmlContent,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(result.uri, {
          dialogTitle: 'Descargar transcripción',
          mimeType: PDF_MIME_TYPE,
          UTI: 'com.adobe.pdf',
        });
      }
    } catch (error) {
      const message = getErrorMessage(error, 'No se pudo descargar el PDF.');
      console.error('[HearingRecordingPanel] No se pudo descargar el PDF.');
      Alert.alert('No se pudo descargar el PDF', message);
    } finally {
      setIsDownloadingPdf(false);
    }
  }, [canDownloadPdf, hasTranscript, transcriptText]);

  useEffect(
    () => {
      mountedRef.current = true;
      return () => {
        mountedRef.current = false;
        startCancelledRef.current = true;
        recordingRef.current = false;
        stopChunkRef.current?.();

        void (async () => {
          if (loopPromiseRef.current) await loopPromiseRef.current.catch(() => null);
          if (recorderActiveRef.current) await recorder.stop().catch(() => null);
          recorderActiveRef.current = false;

          const sessionId = sessionIdRef.current;
          if (sessionId) {
            const result = await chunkQueueRef.current.drain();
            if (result.ok) {
              await finishHearingLiveTranscription({ hearingId, sessionId }).catch(() => null);
            } else {
              chunkQueueRef.current.clear((task) => releaseRecordingUri(task.audioUri));
            }
          } else {
            chunkQueueRef.current.clear((task) => releaseRecordingUri(task.audioUri));
          }

          await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => null);
        })();
      };
    },
    [hearingId, recorder]
  );

  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <View style={[styles.recordingIndicator, isRecording && styles.recordingIndicatorActive]} />
        <View style={styles.headerCopy}>
          <Text style={styles.panelTitle}>Transcripción de audiencia</Text>
          <Text style={styles.panelDescription}>
            Grabá la audiencia y visualizá la transcripción en tiempo real.
          </Text>
        </View>
      </View>

      <View style={styles.buttonGrid}>
        <ActionButton
          disabled={isRecording || isStarting || isFinishing || hasActiveSession || pendingChunkCount > 0}
          label={isStarting ? 'Iniciando...' : 'Iniciar grabación'}
          onPress={() => void handleStartRecording()}
          styles={styles}
          variant="primary"
        />
        <ActionButton
          disabled={(!isRecording && !isStarting && !hasActiveSession) || isFinishing}
          label={
            isStarting
              ? 'Cancelar inicio'
              : isFinishing
                ? 'Deteniendo...'
                : isRecording
                  ? 'Detener grabación'
                  : 'Finalizar y guardar'
          }
          onPress={() => void handleStopRecording()}
          styles={styles}
          variant="secondary"
        />
        <ActionButton
          disabled={isRecording || isStarting || isFinishing || isUploadingAudio || isTranscribing || isGeneratingPdf}
          label={isUploadingAudio ? 'Subiendo...' : 'Subir audio'}
          onPress={() => void handleUploadAudio()}
          styles={styles}
          variant="secondary"
        />
      </View>

      {isQueueBlocked && pendingChunkCount > 0 ? (
        <View style={styles.buttonGrid}>
          <ActionButton
            disabled={isTranscribing || isFinishing}
            label={`Reintentar envío (${pendingChunkCount})`}
            onPress={() => void retryQueueRef.current?.()}
            styles={styles}
            variant="secondary"
          />
        </View>
      ) : null}

      {showProgress ? (
        <View style={styles.progressBlock}>
          <Text style={styles.progressText}>{statusText}</Text>
          <View style={styles.progressTrack}>
            <View style={styles.progressFill} />
          </View>
        </View>
      ) : (
        <Text style={styles.panelStatus}>
          {loadingTranscript ? 'Cargando transcripción...' : statusText}
        </Text>
      )}

      {pendingChunkCount > 0 ? (
        <Text style={styles.panelStatus}>
          {pendingChunkCount} bloque(s) en cola de transcripción.
        </Text>
      ) : null}

      {selectedAudio ? (
        <View style={styles.selectedAudio}>
          <View style={styles.selectedAudioIcon}>
            <Text style={styles.selectedAudioIconText}>♫</Text>
          </View>
          <View style={styles.selectedAudioCopy}>
            <Text numberOfLines={1} style={styles.selectedAudioName}>{selectedAudio.name}</Text>
            <Text style={styles.selectedAudioMeta}>
              {selectedAudio.mimeType} · {selectedAudio.size ? `${Math.ceil(selectedAudio.size / 1024 / 1024)} MB` : 'archivo seleccionado'}
            </Text>
          </View>
        </View>
      ) : null}

      <View style={styles.transcriptPreview}>
        <Text style={styles.previewTitle}>Vista previa de la transcripción</Text>
        <View style={styles.documentBox}>
          <Text style={[styles.transcriptText, !hasTranscript && styles.placeholderText]}>
            {hasTranscript ? transcriptText : 'Todavía no hay transcripción disponible.'}
          </Text>
        </View>
      </View>

      {hasTranscript ? (
        <View style={styles.pdfActions}>
          <ActionButton
            disabled={isGeneratingPdf}
            label={isGeneratingPdf ? 'Guardando PDF...' : 'Guardar transcripción en PDF'}
            onPress={() => void handleGeneratePdf()}
            styles={styles}
            variant="primary"
          />
          {canDownloadPdf ? (
            <ActionButton
              disabled={isDownloadingPdf}
              label={isDownloadingPdf ? 'Descargando...' : 'Descargar PDF'}
              onPress={() => void handleDownloadPdf()}
              styles={styles}
              variant="secondary"
            />
          ) : null}
        </View>
      ) : null}

      <ActionFeedbackModal
        actionLabel="Continuar"
        message={actionFeedback?.message}
        onClose={() => setActionFeedback(null)}
        title={actionFeedback?.title}
        visible={Boolean(actionFeedback)}
      />
    </View>
  );
}

function ActionButton({ disabled, label, onPress, styles, variant }) {
  const buttonStyle = variant === 'primary' ? styles.primaryButton : styles.secondaryButton;
  const textStyle = variant === 'primary' ? styles.primaryButtonText : styles.secondaryButtonText;

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={[buttonStyle, disabled && styles.buttonDisabled]}
    >
      <Text style={[textStyle, disabled && styles.buttonTextDisabled]}>{label}</Text>
    </Pressable>
  );
}

const createStyles = (colors) => StyleSheet.create({
  panel: {
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    paddingTop: 14,
    gap: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  recordingIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.textMuted,
    marginTop: 6,
  },
  recordingIndicatorActive: {
    backgroundColor: colors.danger,
  },
  headerCopy: {
    flex: 1,
  },
  panelTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  panelDescription: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 5,
  },
  panelStatus: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 20,
  },
  buttonGrid: {
    gap: 10,
  },
  selectedAudio: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.backgroundAlt,
    padding: 12,
  },
  selectedAudioIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
  },
  selectedAudioIconText: {
    color: colors.primary,
    fontSize: 20,
    fontWeight: '800',
  },
  selectedAudioCopy: {
    flex: 1,
    minWidth: 0,
  },
  selectedAudioName: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  selectedAudioMeta: {
    color: colors.textSecondary,
    fontSize: 11,
    marginTop: 3,
  },
  primaryButton: {
    minHeight: 50,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  secondaryButton: {
    minHeight: 50,
    borderRadius: 18,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  primaryButtonText: {
    color: colors.textOnPrimary,
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
  },
  secondaryButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
  },
  buttonTextDisabled: {
    color: colors.textMuted,
  },
  progressBlock: {
    backgroundColor: colors.accentSoft,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: 14,
    gap: 10,
  },
  progressText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  progressTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: colors.borderSoft,
    overflow: 'hidden',
  },
  progressFill: {
    width: '48%',
    height: '100%',
    borderRadius: 999,
    backgroundColor: colors.primary,
  },
  transcriptPreview: {
    gap: 10,
  },
  previewTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  documentBox: {
    minHeight: 220,
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  transcriptText: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 23,
  },
  placeholderText: {
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  pdfActions: {
    gap: 10,
  },
});
