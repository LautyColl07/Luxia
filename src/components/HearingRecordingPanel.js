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

import { useAppTheme } from '../context/ThemeContext';
import {
  finishHearingLiveTranscription,
  getHearingTranscription,
  startHearingLiveTranscription,
  transcribeHearingAudio,
  uploadHearingAudio,
  uploadHearingLiveTranscriptionChunk,
  uploadPdfDocumentFromHearing,
} from '../services/api';
import { buildTranscriptionHtml } from '../utils/exportTranscription';

const CHUNK_SECONDS = 5;
const CHUNK_MILLIS = CHUNK_SECONDS * 1000;
const PDF_MIME_TYPE = 'application/pdf';

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
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const recordingRef = useRef(false);
  const sessionIdRef = useRef(null);
  const chunkIndexRef = useRef(0);
  const loopPromiseRef = useRef(null);
  const stopChunkRef = useRef(null);

  const hearingId = hearing?.id ?? hearing?.audienciaId ?? hearing?.hearingId;
  const hasTranscript = Boolean(transcriptText.trim());
  const showProgress = isStarting || isFinishing || isUploadingAudio || isTranscribing || isGeneratingPdf;
  const canDownloadPdf = Boolean(transcriptInfo?.pdfAvailable);

  const refreshTranscript = useCallback(async () => {
    if (!hearingId) {
      return;
    }

    try {
      setLoadingTranscript(true);
      const result = await getHearingTranscription(hearingId);
      setTranscriptInfo(result);
      setTranscriptText(result?.text || '');
      setStatusText(
        result?.text
          ? 'Transcripción cargada.'
          : 'Lista para grabar la audiencia.'
      );
    } catch (error) {
      console.error('[HearingRecordingPanel] Error cargando transcripcion:', error);
      setStatusText('No pudimos cargar la transcripción guardada.');
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
        const timeoutId = setTimeout(resolve, CHUNK_MILLIS);
        stopChunkRef.current = () => {
          clearTimeout(timeoutId);
          resolve();
        };
      }),
    []
  );

  const recordLoop = useCallback(async () => {
    while (recordingRef.current) {
      const chunkIndex = chunkIndexRef.current;
      const startTime = chunkIndex * CHUNK_SECONDS;
      const endTime = startTime + CHUNK_SECONDS;

      try {
        setStatusText(`Grabando bloque ${chunkIndex + 1}...`);
        await recorder.prepareToRecordAsync();
        recorder.record();
        await waitForChunkEnd();

        setStatusText('Transcribiendo audiencia...');
        setIsTranscribing(true);
        await recorder.stop();

        const recorderSnapshot = recorder.getStatus();
        const audioUri = recorder.uri || recorderSnapshot?.url || recorderState.url;
        stopChunkRef.current = null;

        if (!audioUri) {
          throw new Error('No se encontró el archivo temporal de audio.');
        }

        const sessionId = sessionIdRef.current;

        if (!sessionId) {
          throw new Error('No hay una sesion activa para enviar el bloque.');
        }

        const response = await uploadHearingLiveTranscriptionChunk({
          audioUri,
          chunkIndex,
          endTime,
          hearingId,
          sessionId,
          startTime,
        });
        console.log('[HearingRecordingPanel] chunk enviado', {
          chunkIndex,
          endpoint: `POST /audiencias/${sessionId}/chunk`,
        });
        const nextText = response?.fullText || [transcriptText.trim(), response?.text].filter(Boolean).join('\n');

        if (nextText) {
          setTranscriptText(nextText);
        }

        setTranscriptInfo((current) => ({
          ...(current || {}),
          audioAvailable: true,
          status: response?.status || 'transcribing',
          text: nextText,
        }));
      } catch (error) {
        console.error('[HearingRecordingPanel] Error procesando bloque:', error);
        setStatusText(getErrorMessage(error, 'No se pudo transcribir un bloque de audio.'));
      } finally {
        setIsTranscribing(false);
        chunkIndexRef.current = chunkIndex + 1;
      }
    }
  }, [hearingId, recorder, recorderState.url, transcriptText, waitForChunkEnd]);

  const handleStartRecording = useCallback(async () => {
    if (recordingRef.current || isStarting || !hearingId) {
      return;
    }

    try {
      setIsStarting(true);
      const permission = await requestRecordingPermissionsAsync();

      if (!permission.granted) {
        Alert.alert('Permiso requerido', 'Necesitamos acceso al micrófono para grabar la audiencia.');
        return;
      }

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        interruptionMode: 'doNotMix',
        shouldPlayInBackground: false,
        shouldRouteThroughEarpiece: false,
      });

      console.log('[HearingRecordingPanel] start endpoint', 'POST /audiencias/start');
      const started = await startHearingLiveTranscription({ caseDetail, hearing });
      sessionIdRef.current = started?.sessionId || null;
      console.log('[HearingRecordingPanel] sessionId creado', sessionIdRef.current);
      setTranscriptInfo(started);
      setTranscriptText('');
      setStatusText('Grabando audiencia...');
      chunkIndexRef.current = 0;
      recordingRef.current = true;
      setIsRecording(true);
      loopPromiseRef.current = recordLoop();
    } catch (error) {
      const message = getErrorMessage(error, 'No se pudo iniciar la grabacion.');
      console.error('[HearingRecordingPanel] Error iniciando grabacion:', error);
      Alert.alert('No se pudo iniciar la grabación', message);
      recordingRef.current = false;
      sessionIdRef.current = null;
      setIsRecording(false);
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => null);
    } finally {
      setIsStarting(false);
    }
  }, [caseDetail, hearing, hearingId, isStarting, recordLoop]);

  const handleStopRecording = useCallback(async () => {
    const sessionId = sessionIdRef.current;

    if (!recordingRef.current || isFinishing || !hearingId || !sessionId) {
      return;
    }

    try {
      setIsFinishing(true);
      setStatusText('Transcribiendo audiencia...');
      recordingRef.current = false;
      stopChunkRef.current?.();

      if (loopPromiseRef.current) {
        await loopPromiseRef.current;
      }

      const finished = await finishHearingLiveTranscription({ hearingId, sessionId });
      console.log('[HearingRecordingPanel] finish enviado', `POST /audiencias/${sessionId}/finish`);
      setTranscriptInfo(finished);

      if (finished?.text) {
        setTranscriptText(finished.text);
      }

      setStatusText('Transcripción guardada.');
      await onDocumentsChanged?.();
    } catch (error) {
      const message = getErrorMessage(error, 'No se pudo detener la grabación.');
      console.error('[HearingRecordingPanel] Error deteniendo grabacion:', error);
      Alert.alert('No se pudo detener la grabación', message);
    } finally {
      setIsRecording(false);
      setIsFinishing(false);
      sessionIdRef.current = null;
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => null);
    }
  }, [hearingId, isFinishing, onDocumentsChanged]);

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
        return;
      }

      const asset = pickerResult.assets?.[0] || null;

      if (!asset?.uri) {
        Alert.alert('Audio invalido', 'No pudimos leer el archivo seleccionado.');
        return;
      }

      setIsUploadingAudio(true);
      setIsTranscribing(true);
      setStatusText('Subiendo audio...');
      await uploadHearingAudio({ asset, caseDetail, hearing });
      setStatusText('Transcribiendo audiencia...');
      const transcript = await transcribeHearingAudio({ hearingId });
      setTranscriptInfo(transcript);
      setTranscriptText(transcript?.text || '');
      setStatusText('Transcripción guardada.');
      await onDocumentsChanged?.();
    } catch (error) {
      const message = getErrorMessage(error, 'No se pudo subir o transcribir el audio.');
      console.error('[HearingRecordingPanel] Error subiendo audio:', error);
      Alert.alert('No se pudo procesar el audio', message);
    } finally {
      setIsUploadingAudio(false);
      setIsTranscribing(false);
    }
  }, [caseDetail, hearing, hearingId, isRecording, onDocumentsChanged]);

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

      console.log('[PDF URI]', pdfUri);

      const info = await FileSystem.getInfoAsync(pdfUri);

      console.log('[PDF INFO]', info);

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
        console.error('[HearingRecordingPanel] Error subiendo PDF a Documentos:', uploadError);
        Alert.alert(
          'PDF generado',
          'El PDF se generó, pero no se pudo guardar en Documentos.'
        );
      }
    } catch (error) {
      const message = getErrorMessage(error, 'No se pudo generar el PDF.');
      console.error('[HearingRecordingPanel] Error generando PDF:', error);
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
      console.error('[HearingRecordingPanel] Error descargando PDF:', error);
      Alert.alert('No se pudo descargar el PDF', message);
    } finally {
      setIsDownloadingPdf(false);
    }
  }, [canDownloadPdf, hasTranscript, transcriptText]);

  useEffect(
    () => () => {
      recordingRef.current = false;
      sessionIdRef.current = null;
      stopChunkRef.current?.();
      void setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => null);
    },
    []
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
          disabled={isRecording || isStarting || isFinishing}
          label={isStarting ? 'Iniciando...' : 'Iniciar grabación'}
          onPress={() => void handleStartRecording()}
          styles={styles}
          variant="primary"
        />
        <ActionButton
          disabled={!isRecording || isFinishing}
          label={isFinishing ? 'Deteniendo...' : 'Detener grabación'}
          onPress={() => void handleStopRecording()}
          styles={styles}
          variant="secondary"
        />
        <ActionButton
          disabled={isRecording || isUploadingAudio || isTranscribing}
          label={isUploadingAudio ? 'Subiendo...' : 'Subir audio'}
          onPress={() => void handleUploadAudio()}
          styles={styles}
          variant="secondary"
        />
      </View>

      {showProgress ? (
        <View style={styles.progressBlock}>
          <Text style={styles.progressText}>Transcribiendo audiencia...</Text>
          <View style={styles.progressTrack}>
            <View style={styles.progressFill} />
          </View>
        </View>
      ) : (
        <Text style={styles.panelStatus}>
          {loadingTranscript ? 'Cargando transcripción...' : statusText}
        </Text>
      )}

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
