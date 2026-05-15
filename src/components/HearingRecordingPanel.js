import * as FileSystem from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useAppTheme } from '../context/ThemeContext';
import { transcribeDocument, uploadDocument } from '../services/api';
import { formatDateTime } from '../utils/date';

const AUDIO_MIME_TYPE = 'audio/mp4';
const PDF_MIME_TYPE = 'application/pdf';
const TRANSCRIPT_PLACEHOLDER =
  'La transcripcion aparecera aca mientras avanza la audiencia.';
const AUDIO_EXTENSION_TO_MIME_TYPE = {
  '.aac': 'audio/aac',
  '.m4a': 'audio/m4a',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.webm': 'audio/webm',
};

function slugify(value) {
  return String(value ?? 'audiencia')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_')
    .toLowerCase() || 'audiencia';
}

function normalizeText(value) {
  return String(value ?? '')
    .replace(/\r/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function getFileExtension(fileName = '') {
  const lastDotIndex = fileName.lastIndexOf('.');

  if (lastDotIndex < 0) {
    return '';
  }

  return fileName.slice(lastDotIndex).toLowerCase();
}

function getMimeTypeFromFileName(fileName = '') {
  return AUDIO_EXTENSION_TO_MIME_TYPE[getFileExtension(fileName)] || null;
}

function getFileNameFromUri(uri = '') {
  if (!uri) {
    return '';
  }

  const uriWithoutQuery = uri.split('?')[0];
  const segments = uriWithoutQuery.split('/');
  return segments[segments.length - 1] || '';
}

function isSupportedAudioSelection({ fileName, mimeType }) {
  if (mimeType?.toLowerCase().startsWith('audio/')) {
    return true;
  }

  return Boolean(getMimeTypeFromFileName(fileName));
}

function toCandidateText(value) {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return normalizeText(value);
  }

  return '';
}

function getLongestText(values = []) {
  return values
    .map(toCandidateText)
    .filter(Boolean)
    .sort((first, second) => second.length - first.length)[0] || '';
}

function collectSegmentText(items = []) {
  if (!Array.isArray(items)) {
    return '';
  }

  return items
    .map((item) =>
      toCandidateText(
        item?.text ??
          item?.texto ??
          item?.transcript ??
          item?.transcripcion ??
          item?.content ??
          item?.message ??
          ''
      )
    )
    .filter(Boolean)
    .join(' ');
}

function extractTranscriptText(payload) {
  if (!payload) {
    return '';
  }

  if (typeof payload === 'string') {
    return normalizeText(payload);
  }

  const directCandidates = [
    payload?.transcript,
    payload?.transcripcion,
    payload?.text,
    payload?.texto,
    payload?.partialTranscript,
    payload?.partial,
    payload?.finalTranscript,
    payload?.result?.transcript,
    payload?.result?.transcripcion,
    payload?.result?.text,
    payload?.result?.texto,
    payload?.data?.transcript,
    payload?.data?.transcripcion,
    payload?.data?.text,
    payload?.data?.texto,
  ];

  const segmentedCandidates = [
    collectSegmentText(payload?.segments),
    collectSegmentText(payload?.chunks),
    collectSegmentText(payload?.partials),
    collectSegmentText(payload?.partiales),
    collectSegmentText(payload?.items),
    collectSegmentText(payload?.result?.segments),
    collectSegmentText(payload?.result?.chunks),
    collectSegmentText(payload?.data?.segments),
    collectSegmentText(payload?.data?.chunks),
  ];

  return getLongestText([...directCandidates, ...segmentedCandidates]);
}

function getOverlapLength(existingText, incomingText) {
  const maxLength = Math.min(existingText.length, incomingText.length);

  for (let size = maxLength; size > 0; size -= 1) {
    if (existingText.slice(-size) === incomingText.slice(0, size)) {
      return size;
    }
  }

  return 0;
}

function mergeTranscriptText(existingText, incomingText) {
  const current = normalizeText(existingText);
  const next = normalizeText(incomingText);

  if (!current) {
    return next;
  }

  if (!next) {
    return current;
  }

  if (current.includes(next)) {
    return current;
  }

  if (next.includes(current)) {
    return next;
  }

  const overlapLength = getOverlapLength(current, next);

  if (overlapLength > 24) {
    return normalizeText(`${current}${next.slice(overlapLength)}`);
  }

  return `${current}\n\n${next}`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildPdfHtml({ hearingDateLabel, hearingTitle, transcriptText }) {
  const safeTitle = escapeHtml(hearingTitle || 'Audiencia');
  const safeDate = escapeHtml(hearingDateLabel || 'Sin fecha registrada');
  const safeTranscript = escapeHtml(transcriptText).replace(/\n/g, '<br />');

  return `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <style>
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        margin: 36px;
        color: #102741;
        background: #ffffff;
      }
      .header {
        border-bottom: 1px solid #d7e0ed;
        padding-bottom: 16px;
        margin-bottom: 24px;
      }
      .title {
        font-size: 24px;
        font-weight: 700;
        margin: 0 0 8px;
      }
      .meta {
        font-size: 13px;
        color: #5f6f83;
        margin: 4px 0;
      }
      .content-title {
        font-size: 15px;
        font-weight: 700;
        margin: 0 0 12px;
      }
      .content {
        font-size: 13px;
        line-height: 1.7;
        white-space: normal;
      }
    </style>
  </head>
  <body>
    <div class="header">
      <p class="title">Transcripcion de audiencia</p>
      <p class="meta">Audiencia: ${safeTitle}</p>
      <p class="meta">Fecha: ${safeDate}</p>
    </div>
    <section>
      <p class="content-title">Texto completo transcripto</p>
      <div class="content">${safeTranscript}</div>
    </section>
  </body>
</html>`;
}

function buildFriendlyErrorMessage(type) {
  switch (type) {
    case 'microphone':
      return 'Necesitamos acceso al microfono para iniciar la grabacion.';
    case 'recording-start':
      return 'No pudimos iniciar la grabacion. Intenta nuevamente.';
    case 'recording-stop':
      return 'No pudimos detener la grabacion. Intenta nuevamente.';
    case 'audio-file':
      return 'No pudimos cargar el archivo de audio. Usa un archivo .m4a, .mp3, .wav, .aac, .ogg o .webm.';
    case 'save-audio':
      return 'No pudimos registrar el audio de la audiencia. Intenta nuevamente en unos instantes.';
    case 'transcription':
      return 'No pudimos generar la transcripcion en este momento. Intenta nuevamente en unos instantes.';
    case 'empty-transcription':
      return 'Todavia no hay texto transcripto para guardar en PDF.';
    case 'pdf':
      return 'No pudimos generar el PDF de la transcripcion. Intenta nuevamente.';
    default:
      return 'No pudimos completar la accion solicitada.';
  }
}

export default function HearingRecordingPanel({ hearing, onDocumentsChanged }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 250);
  const pulseAnimation = useRef(new Animated.Value(0)).current;
  const [isProcessingRecording, setIsProcessingRecording] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [selectedAudioName, setSelectedAudioName] = useState('');
  const [transcriptText, setTranscriptText] = useState('');

  useEffect(() => {
    if (!recorderState.isRecording) {
      pulseAnimation.stopAnimation();
      pulseAnimation.setValue(0);
      return undefined;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnimation, {
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnimation, {
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          toValue: 0,
          useNativeDriver: true,
        }),
      ])
    );

    animation.start();

    return () => {
      animation.stop();
      pulseAnimation.setValue(0);
    };
  }, [pulseAnimation, recorderState.isRecording]);

  useEffect(
    () => () => {
      pulseAnimation.stopAnimation();
      void setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
        interruptionMode: 'doNotMix',
        shouldPlayInBackground: false,
        shouldRouteThroughEarpiece: false,
      }).catch(() => null);
    },
    [pulseAnimation]
  );

  const persistAndTranscribeRecording = useCallback(
    async (recording) => {
      let uploadedDocument = null;

      try {
        setIsProcessingRecording(true);

        uploadedDocument = await uploadDocument({
          hearingId: hearing?.id,
          asset: {
            uri: recording.uri,
            name: recording.fileName,
            mimeType: recording.mimeType || AUDIO_MIME_TYPE,
          },
          documentType: 'audio',
          baseName: hearing?.title || 'audiencia',
        });

        if (!uploadedDocument?.id) {
          throw new Error('audio-not-saved');
        }

        const response = await transcribeDocument(uploadedDocument.id);
        const nextTranscript = extractTranscriptText(response);

        if (!nextTranscript) {
          throw new Error('empty-transcript');
        }

        setTranscriptText((currentValue) => mergeTranscriptText(currentValue, nextTranscript));
      } catch (error) {
        console.error('[HearingRecordingPanel] Error procesando grabacion:', error);
        const errorCode = error instanceof Error ? error.message : '';
        const alertMessage =
          errorCode === 'audio-not-saved'
            ? buildFriendlyErrorMessage('save-audio')
            : buildFriendlyErrorMessage('transcription');

        Alert.alert(
          'No pudimos procesar la grabacion',
          alertMessage
        );
      } finally {
        if (uploadedDocument?.id && onDocumentsChanged) {
          await onDocumentsChanged().catch(() => null);
        }

        setIsProcessingRecording(false);
      }
    },
    [hearing?.id, hearing?.title, onDocumentsChanged]
  );

  const handleStartRecording = useCallback(async () => {
    try {
      const permission = await requestRecordingPermissionsAsync();

      if (!permission.granted) {
        Alert.alert('Permiso requerido', buildFriendlyErrorMessage('microphone'));
        return;
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
      setSelectedAudioName('');
    } catch (error) {
      console.error('[HearingRecordingPanel] Error iniciando grabacion:', error);
      Alert.alert('No se pudo iniciar la grabacion', buildFriendlyErrorMessage('recording-start'));
    }
  }, [recorder]);

  const handleStopRecording = useCallback(async () => {
    try {
      await recorder.stop();
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
        throw new Error('missing-recording-uri');
      }

      const nextRecording = {
        uri: recordingUri,
        fileName: `${slugify(hearing?.title)}_audio_${Date.now()}.m4a`,
        mimeType: AUDIO_MIME_TYPE,
      };

      await persistAndTranscribeRecording(nextRecording);
    } catch (error) {
      console.error('[HearingRecordingPanel] Error deteniendo grabacion:', error);
      Alert.alert('No se pudo detener la grabacion', buildFriendlyErrorMessage('recording-stop'));
    }
  }, [hearing?.title, persistAndTranscribeRecording, recorder, recorderState.url]);

  const handlePickAudioFile = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
        type: 'audio/*',
      });

      if (result.canceled) {
        return;
      }

      const asset = result.assets?.[0];

      if (!asset?.uri) {
        throw new Error('missing-audio-file');
      }

      const resolvedFileName =
        asset.name || getFileNameFromUri(asset.uri) || `audio-${Date.now()}.m4a`;
      const resolvedMimeType = asset.mimeType || getMimeTypeFromFileName(resolvedFileName);

      if (!isSupportedAudioSelection({ fileName: resolvedFileName, mimeType: resolvedMimeType })) {
        throw new Error('unsupported-audio-file');
      }

      setSelectedAudioName(resolvedFileName);

      await persistAndTranscribeRecording({
        uri: asset.uri,
        fileName: resolvedFileName,
        mimeType: resolvedMimeType || AUDIO_MIME_TYPE,
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'Different document picking in progress') {
        return;
      }

      console.error('[HearingRecordingPanel] Error cargando archivo de audio:', error);
      Alert.alert('No se pudo cargar el audio', buildFriendlyErrorMessage('audio-file'));
    }
  }, [persistAndTranscribeRecording]);

  const handleSavePdf = useCallback(async () => {
    const normalizedTranscript = normalizeText(transcriptText);

    if (!normalizedTranscript) {
      Alert.alert('Sin transcripcion', buildFriendlyErrorMessage('empty-transcription'));
      return;
    }

    try {
      setIsGeneratingPdf(true);

      const printResult = await Print.printToFileAsync({
        html: buildPdfHtml({
          hearingDateLabel: hearing?.date ? formatDateTime(hearing.date) : 'Sin fecha registrada',
          hearingTitle: hearing?.title || 'Audiencia',
          transcriptText: normalizedTranscript,
        }),
      });

      const outputFileName = `${slugify(hearing?.title)}_transcripcion_${Date.now()}.pdf`;
      const destinationUri = `${FileSystem.documentDirectory}${outputFileName}`;
      let shareUri = printResult.uri;

      await FileSystem.copyAsync({
        from: printResult.uri,
        to: destinationUri,
      })
        .then(() => {
          shareUri = destinationUri;
        })
        .catch(() => null);

      const isSharingAvailable = await Sharing.isAvailableAsync();

      if (isSharingAvailable) {
        await Sharing.shareAsync(shareUri, {
          dialogTitle: 'Compartir transcripcion',
          mimeType: PDF_MIME_TYPE,
          UTI: '.pdf',
        });
      }

      Alert.alert(
        'PDF listo',
        isSharingAvailable
          ? 'La transcripcion en PDF quedo lista para abrir o compartir.'
          : 'La transcripcion en PDF se genero correctamente en el dispositivo.'
      );
    } catch (error) {
      console.error('[HearingRecordingPanel] Error generando PDF:', error);
      Alert.alert('No se pudo guardar el PDF', buildFriendlyErrorMessage('pdf'));
    } finally {
      setIsGeneratingPdf(false);
    }
  }, [hearing?.date, hearing?.title, transcriptText]);

  const dotAnimatedStyle = useMemo(
    () => ({
      opacity: pulseAnimation.interpolate({
        inputRange: [0, 1],
        outputRange: [0.35, 1],
      }),
      transform: [
        {
          scale: pulseAnimation.interpolate({
            inputRange: [0, 1],
            outputRange: [0.9, 1.15],
          }),
        },
      ],
    }),
    [pulseAnimation]
  );

  const transcriptPlaceholder = isProcessingRecording
    ? 'Estamos procesando la grabacion para actualizar la transcripcion.'
    : TRANSCRIPT_PLACEHOLDER;

  return (
    <View style={styles.panel}>
      <Text style={styles.panelTitle}>Grabacion de audiencia</Text>
      <Text style={styles.panelSubtitle}>Registra y transcribi la audiencia en tiempo real.</Text>

      <View style={styles.actionsRow}>
        <ActionButton
          disabled={recorderState.isRecording || isProcessingRecording}
          label="Comenzar grabacion"
          onPress={() => void handleStartRecording()}
          styles={styles}
          variant="primary"
        />
        <ActionButton
          disabled={!recorderState.isRecording}
          label="Detener grabacion"
          onPress={() => void handleStopRecording()}
          styles={styles}
          variant="secondary"
        />
      </View>

      <ActionButton
        disabled={recorderState.isRecording || isProcessingRecording}
        label={isProcessingRecording ? 'Procesando audio...' : 'Subir archivo de audio'}
        onPress={() => void handlePickAudioFile()}
        styles={styles}
        variant="secondary"
      />

      {selectedAudioName && !recorderState.isRecording ? (
        <Text style={styles.supportText}>Audio seleccionado: {selectedAudioName}</Text>
      ) : null}

      {recorderState.isRecording ? (
        <View style={styles.liveStatus}>
          <Animated.View style={[styles.liveDot, dotAnimatedStyle]} />
          <Text style={styles.liveStatusText}>Escuchando y transcribiendo...</Text>
        </View>
      ) : null}

      <View style={styles.transcriptCard}>
        <Text style={styles.transcriptLabel}>Transcripcion</Text>
        <ScrollView
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
          style={styles.transcriptScroll}
          contentContainerStyle={styles.transcriptScrollContent}
        >
          <Text style={transcriptText ? styles.transcriptText : styles.transcriptPlaceholder}>
            {transcriptText || transcriptPlaceholder}
          </Text>
        </ScrollView>
      </View>

      <ActionButton
        disabled={!normalizeText(transcriptText) || recorderState.isRecording || isGeneratingPdf}
        label={isGeneratingPdf ? 'Generando PDF...' : 'Guardar transcripcion en PDF'}
        onPress={() => void handleSavePdf()}
        styles={styles}
        variant="secondary"
      />
    </View>
  );
}

function ActionButton({ disabled, label, onPress, styles, variant }) {
  const isPrimary = variant === 'primary';
  const buttonStyle = isPrimary ? styles.primaryButton : styles.secondaryButton;
  const textStyle = isPrimary ? styles.primaryButtonText : styles.secondaryButtonText;

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

const createStyles = (colors) =>
  StyleSheet.create({
    panel: {
      marginTop: 16,
      borderTopWidth: 1,
      borderTopColor: colors.borderSoft,
      paddingTop: 18,
      gap: 14,
    },
    panelTitle: {
      color: colors.text,
      fontSize: 18,
      fontWeight: '700',
    },
    panelSubtitle: {
      color: colors.textSecondary,
      fontSize: 14,
      lineHeight: 21,
      marginTop: -4,
    },
    supportText: {
      color: colors.textSecondary,
      fontSize: 12,
      lineHeight: 18,
      marginTop: -6,
    },
    actionsRow: {
      flexDirection: 'row',
      gap: 10,
      flexWrap: 'wrap',
    },
    primaryButton: {
      flex: 1,
      minWidth: 140,
      minHeight: 48,
      borderRadius: 16,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    secondaryButton: {
      flex: 1,
      minWidth: 140,
      minHeight: 48,
      borderRadius: 16,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.borderSoft,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    buttonDisabled: {
      opacity: 0.55,
    },
    primaryButtonText: {
      color: colors.textOnPrimary,
      fontSize: 14,
      fontWeight: '700',
      textAlign: 'center',
    },
    secondaryButtonText: {
      color: colors.text,
      fontSize: 14,
      fontWeight: '700',
      textAlign: 'center',
    },
    buttonTextDisabled: {
      color: colors.textMuted,
    },
    liveStatus: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.accentSoft,
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 10,
      alignSelf: 'flex-start',
    },
    liveDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.primary,
    },
    liveStatusText: {
      color: colors.primaryDeep,
      fontSize: 12,
      fontWeight: '600',
    },
    transcriptCard: {
      backgroundColor: colors.backgroundAlt,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.borderSoft,
      padding: 16,
      gap: 10,
    },
    transcriptLabel: {
      color: colors.text,
      fontSize: 13,
      fontWeight: '700',
    },
    transcriptScroll: {
      maxHeight: 220,
      minHeight: 140,
    },
    transcriptScrollContent: {
      flexGrow: 1,
    },
    transcriptText: {
      color: colors.text,
      fontSize: 14,
      lineHeight: 22,
    },
    transcriptPlaceholder: {
      color: colors.textMuted,
      fontSize: 14,
      lineHeight: 22,
    },
  });
