import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AI_BASE_URL, SERVER_IP } from '../config/api';
import { useAppTheme } from '../context/ThemeContext';
import {
  exportTranscriptionAsPdf,
  exportTranscriptionAsWordCompatible,
} from '../utils/exportTranscription';

const DEFAULT_AUDIO_MIME_TYPE = 'audio/m4a';
const TRANSCRIPTION_TIMEOUT_MS = 120000;

function formatDuration(durationMillis) {
  const totalSeconds = Math.max(0, Math.floor((Number(durationMillis) || 0) / 1000));
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

async function parseApiResponse(response) {
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    return response.json();
  }

  const text = await response.text();
  return text ? { raw: text } : {};
}

async function fetchWithTimeout(url, options = {}, timeoutMs = TRANSCRIPTION_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

function getTranscriptText(payload = {}) {
  return (
    payload.texto ||
    payload.text ||
    payload.transcript ||
    payload.transcripcion ||
    payload.result?.texto ||
    payload.result?.text ||
    payload.result?.transcript ||
    payload.data?.texto ||
    payload.data?.text ||
    payload.data?.transcript ||
    ''
  );
}

function getNetworkErrorMessage(error) {
  const message = error instanceof Error ? error.message.toLowerCase() : '';

  if (message.includes('aborted') || message.includes('timeout')) {
    return 'La transcripcion tardo demasiado. Verifica el servidor e intenta nuevamente.';
  }

  if (message.includes('network request failed')) {
    return `No se pudo conectar con el servidor de transcripcion (${SERVER_IP}).`;
  }

  return error instanceof Error ? error.message : 'Ocurrio un error inesperado.';
}

export default function TranscriptionTestScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 250);
  const [status, setStatus] = useState('Lista para iniciar.');
  const [transcriptText, setTranscriptText] = useState('');
  const [lastAudio, setLastAudio] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const isBusy = isRecording || isTranscribing || isExporting;
  const hasTranscript = Boolean(transcriptText.trim());

  useEffect(
    () => () => {
      void recorder.stop().catch(() => null);
      void setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
        interruptionMode: 'doNotMix',
        shouldPlayInBackground: false,
        shouldRouteThroughEarpiece: false,
      }).catch(() => null);
    },
    [recorder]
  );

  const transcribeAudio = useCallback(async (audio) => {
    if (!audio?.uri) {
      throw new Error('No se encontro un audio valido para transcribir.');
    }

    setIsTranscribing(true);
    setStatus('Transcribiendo en tiempo real...');

    const formData = new FormData();
    formData.append('audio', {
      uri: audio.uri,
      name: audio.fileName || `audiencia-${Date.now()}.m4a`,
      type: audio.mimeType || DEFAULT_AUDIO_MIME_TYPE,
    });

    const response = await fetchWithTimeout(`${AI_BASE_URL}/api/transcribir`, {
      body: formData,
      method: 'POST',
    });
    const payload = await parseApiResponse(response);

    if (!response.ok || payload?.ok === false) {
      throw new Error(
        payload?.details ||
          payload?.message ||
          payload?.error ||
          `El servidor respondio con estado ${response.status}.`
      );
    }

    const text = String(getTranscriptText(payload) || '').trim();

    if (!text) {
      throw new Error('El backend respondio, pero no devolvio texto transcripto.');
    }

    setTranscriptText((current) => [current.trim(), text].filter(Boolean).join('\n\n'));
    setStatus('Transcripcion lista.');
    return text;
  }, []);

  const handleStart = useCallback(async () => {
    if (isBusy) {
      return;
    }

    try {
      const permission = await requestRecordingPermissionsAsync();

      if (!permission.granted) {
        throw new Error('Necesitamos permiso de microfono para grabar la audiencia.');
      }

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        interruptionMode: 'doNotMix',
        shouldPlayInBackground: false,
        shouldRouteThroughEarpiece: false,
      });

      await recorder.prepareToRecordAsync();
      recorder.record();
      setIsRecording(true);
      setLastAudio(null);
      setTranscriptText('');
      setStatus('Grabando audiencia...');
    } catch (error) {
      const message = getNetworkErrorMessage(error);
      console.error('[TranscriptionScreen] Error iniciando grabacion:', error);
      setStatus('Error');
      Alert.alert('No se pudo iniciar la grabacion', message);
    }
  }, [isBusy, recorder]);

  const askToSaveTranscript = useCallback((text) => {
    const exportText = String(text || '').trim();

    if (!exportText) {
      return;
    }

    Alert.alert('¿Querés guardar esta transcripción?', 'Elegí el formato para exportar el documento.', [
      {
        text: 'Guardar como PDF',
        onPress: () => {
          void (async () => {
            try {
              setIsExporting(true);
              await exportTranscriptionAsPdf(exportText);
            } catch (error) {
              const message = error instanceof Error ? error.message : 'No se pudo generar el PDF.';
              console.error('[TranscriptionScreen] Error exportando PDF:', error);
              Alert.alert('No se pudo guardar el PDF', message);
            } finally {
              setIsExporting(false);
            }
          })();
        },
      },
      {
        text: 'Guardar como Word',
        onPress: () => {
          void (async () => {
            try {
              setIsExporting(true);
              await exportTranscriptionAsWordCompatible(exportText);
            } catch (error) {
              const message = error instanceof Error ? error.message : 'No se pudo generar el archivo compatible con Word.';
              console.error('[TranscriptionScreen] Error exportando Word:', error);
              Alert.alert('No se pudo guardar el archivo', message);
            } finally {
              setIsExporting(false);
            }
          })();
        },
      },
      {
        text: 'Cancelar',
        style: 'cancel',
      },
    ]);
  }, []);

  const handleStop = useCallback(async () => {
    if (!isRecording || isTranscribing) {
      return;
    }

    try {
      setStatus('Deteniendo grabacion...');
      await recorder.stop();
      setIsRecording(false);

      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
        interruptionMode: 'doNotMix',
        shouldPlayInBackground: false,
        shouldRouteThroughEarpiece: false,
      });

      const recorderSnapshot = recorder.getStatus();
      const recordingUri = recorder.uri || recorderSnapshot?.url || recorderState.url;

      if (!recordingUri) {
        throw new Error('No se encontro el archivo de audio grabado.');
      }

      const audio = {
        uri: recordingUri,
        fileName: `transcripcion-audiencia-${Date.now()}.m4a`,
        mimeType: DEFAULT_AUDIO_MIME_TYPE,
        durationMillis: recorderState.durationMillis || 0,
      };
      setLastAudio(audio);

      const text = await transcribeAudio(audio);
      askToSaveTranscript([transcriptText.trim(), text].filter(Boolean).join('\n\n'));
    } catch (error) {
      const message = getNetworkErrorMessage(error);
      console.error('[TranscriptionScreen] Error deteniendo/transcribiendo:', error);
      setStatus('Error');
      Alert.alert('No se pudo completar la transcripcion', message);
    } finally {
      setIsRecording(false);
      setIsTranscribing(false);
    }
  }, [
    askToSaveTranscript,
    isRecording,
    isTranscribing,
    recorder,
    recorderState.durationMillis,
    recorderState.url,
    transcriptText,
    transcribeAudio,
  ]);

  const primaryAction = isRecording ? handleStop : handleStart;
  const primaryLabel = isRecording ? 'Detener transcripción' : 'Iniciar transcripción';
  const statusLabel = isRecording
    ? 'Grabando audiencia...'
    : isTranscribing
      ? 'Transcribiendo en tiempo real...'
      : status;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.heroCard}>
          <View style={styles.heroHeader}>
            <View style={styles.heroIcon}>
              <MaterialCommunityIcons color={colors.primary} name="microphone-message" size={26} />
            </View>
            <View style={styles.heroCopy}>
              <Text style={styles.heroTitle}>Transcripción de audiencia</Text>
              <Text style={styles.heroSubtitle}>
                Grabá la audiencia y generá un texto listo para revisar, compartir o guardar.
              </Text>
            </View>
          </View>

          <View style={styles.statusPanel}>
            <View style={[styles.statusDot, isRecording && styles.statusDotRecording]} />
            <View style={styles.statusCopy}>
              <Text style={styles.statusText}>{statusLabel}</Text>
              <Text style={styles.statusMeta}>
                {isRecording
                  ? `Duracion: ${formatDuration(recorderState.durationMillis)}`
                  : lastAudio?.durationMillis
                    ? `Ultima grabacion: ${formatDuration(lastAudio.durationMillis)}`
                    : 'Servidor configurado desde Luxia.'}
              </Text>
            </View>
            {isRecording || isTranscribing ? (
              <View style={styles.activityBars}>
                <View style={[styles.activityBar, styles.activityBarOne]} />
                <View style={[styles.activityBar, styles.activityBarTwo]} />
                <View style={[styles.activityBar, styles.activityBarThree]} />
              </View>
            ) : null}
          </View>

          <Pressable
            disabled={isTranscribing || isExporting}
            onPress={() => void primaryAction()}
            style={[
              styles.primaryButton,
              isRecording && styles.stopButton,
              (isTranscribing || isExporting) && styles.primaryButtonDisabled,
            ]}
          >
            <MaterialCommunityIcons
              color={colors.textOnPrimary}
              name={isRecording ? 'stop-circle-outline' : 'record-circle-outline'}
              size={20}
            />
            <Text style={styles.primaryButtonText}>
              {isTranscribing ? 'Transcribiendo...' : primaryLabel}
            </Text>
          </Pressable>
        </View>

        <View style={styles.documentCard}>
          <View style={styles.documentHeader}>
            <Text style={styles.documentTitle}>Transcripción</Text>
            <Text style={styles.documentMeta}>
              {hasTranscript ? 'Texto generado por el backend de transcripcion.' : 'El texto aparecera aca al detener la grabacion.'}
            </Text>
          </View>

          <ScrollView nestedScrollEnabled style={styles.documentScroll}>
            <Text style={[styles.transcriptText, !hasTranscript && styles.placeholderText]}>
              {transcriptText || 'Todavía no hay texto transcripto.'}
            </Text>
          </ScrollView>
        </View>
      </ScrollView>
    </View>
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
  heroCard: {
    backgroundColor: colors.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: 18,
    gap: 16,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 4,
  },
  heroHeader: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
  },
  heroIcon: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCopy: {
    flex: 1,
  },
  heroTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
  },
  heroSubtitle: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
  },
  statusPanel: {
    minHeight: 72,
    borderRadius: 18,
    backgroundColor: colors.backgroundAlt,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.success,
  },
  statusDotRecording: {
    backgroundColor: colors.danger,
  },
  statusCopy: {
    flex: 1,
  },
  statusText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  statusMeta: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 3,
  },
  activityBars: {
    height: 32,
    width: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  activityBar: {
    width: 5,
    borderRadius: 999,
    backgroundColor: colors.primary,
  },
  activityBarOne: {
    height: 14,
  },
  activityBarTwo: {
    height: 26,
  },
  activityBarThree: {
    height: 18,
  },
  primaryButton: {
    minHeight: 54,
    borderRadius: 18,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    paddingHorizontal: 16,
  },
  stopButton: {
    backgroundColor: colors.danger,
  },
  primaryButtonDisabled: {
    opacity: 0.62,
  },
  primaryButtonText: {
    color: colors.textOnPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
  documentCard: {
    minHeight: 430,
    backgroundColor: colors.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: 18,
    gap: 14,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 18,
    elevation: 3,
  },
  documentHeader: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
    paddingBottom: 12,
  },
  documentTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  documentMeta: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
  documentScroll: {
    maxHeight: 470,
  },
  transcriptText: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 24,
  },
  placeholderText: {
    color: colors.textMuted,
    fontStyle: 'italic',
  },
});
