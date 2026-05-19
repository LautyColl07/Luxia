import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useNavigation } from '@react-navigation/native';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '../context/ThemeContext';
import { API_BASE_URL, getCurrentIdToken, transcribeDocument, uploadDocument } from '../services/api';

const AUDIO_MIME_TYPE = 'audio/mp4';
const WORD_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function slugify(value) {
  return String(value ?? 'audiencia')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_')
    .toLowerCase() || 'audiencia';
}

function formatDuration(durationMillis) {
  const totalSeconds = Math.max(0, Math.floor((Number(durationMillis) || 0) / 1000));
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function isAudioDocument(document) {
  const fileName = String(document?.fileName || '').toLowerCase();
  const documentType = String(document?.documentType || document?.tipo || '').toLowerCase();

  return (
    documentType === 'audio' ||
    /\.(m4a|mp3|wav|aac|webm|ogg)$/i.test(fileName)
  );
}

function getAudioSequence(fileName, fallbackIndex) {
  const match = String(fileName || '').match(/_audio_(\d+)/i);
  return match ? Number(match[1]) : fallbackIndex;
}

function buildTranscriptFileName(hearingTitle, audioDocument, audioDocumentsCount) {
  const slug = slugify(hearingTitle);
  const sequence = getAudioSequence(audioDocument?.fileName, audioDocumentsCount || 1);
  return `${slug}_transcripcion_${sequence}.docx`;
}

export default function HearingRecordingPanel({ hearing, documents = [], onDocumentsChanged }) {
  const navigation = useNavigation();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 250);
  const player = useAudioPlayer(null);
  const playerStatus = useAudioPlayerStatus(player);
  const [localRecording, setLocalRecording] = useState(null);
  const [uploadedAudioDocument, setUploadedAudioDocument] = useState(null);
  const [transcriptState, setTranscriptState] = useState(null);
  const [saving, setSaving] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [downloadingTranscript, setDownloadingTranscript] = useState(false);

  const hearingDocuments = useMemo(
    () => documents.filter((item) => String(item?.hearingId) === String(hearing?.id)),
    [documents, hearing?.id]
  );

  const audioDocuments = useMemo(
    () =>
      [...hearingDocuments]
        .filter(isAudioDocument)
        .sort((first, second) => new Date(second?.uploadedAt || second?.createdAt || 0) - new Date(first?.uploadedAt || first?.createdAt || 0)),
    [hearingDocuments]
  );

  const activeAudioDocument = uploadedAudioDocument || audioDocuments[0] || null;

  const handleStartRecording = useCallback(async () => {
    try {
      const permission = await requestRecordingPermissionsAsync();

      if (!permission.granted) {
        Alert.alert('Permiso requerido', 'Necesitamos acceso al microfono para grabar la audiencia.');
        return;
      }

      if (playerStatus?.playing) {
        player.pause();
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
      setLocalRecording(null);
      setTranscriptState(null);
    } catch (error) {
      console.error('[HearingRecordingPanel] Error iniciando grabacion:', error);
      Alert.alert('No se pudo iniciar la grabacion.', 'Intenta nuevamente.');
    }
  }, [player, playerStatus?.playing, recorder]);

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
        throw new Error('No se encontro el audio grabado.');
      }

      const nextIndex = audioDocuments.length + 1;
      setLocalRecording({
        uri: recordingUri,
        fileName: `${slugify(hearing?.title)}_audio_${nextIndex}.m4a`,
        durationMillis: recorderState.durationMillis || 0,
      });
    } catch (error) {
      console.error('[HearingRecordingPanel] Error deteniendo grabacion:', error);
      Alert.alert('No se pudo detener la grabacion.', 'Intenta nuevamente.');
    }
  }, [audioDocuments.length, hearing?.title, recorder, recorderState.durationMillis, recorderState.url]);

  const handlePlayRecording = useCallback(async () => {
    if (!localRecording?.uri) {
      return;
    }

    try {
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
        interruptionMode: 'doNotMix',
        shouldPlayInBackground: false,
        shouldRouteThroughEarpiece: false,
      });

      if (playerStatus?.playing) {
        player.pause();
      }

      player.replace({ uri: localRecording.uri });
      await player.seekTo(0).catch(() => null);
      player.play();
    } catch (error) {
      console.error('[HearingRecordingPanel] Error reproduciendo grabacion:', error);
      Alert.alert('No se pudo reproducir la grabacion.', 'Intenta nuevamente.');
    }
  }, [localRecording?.uri, player, playerStatus?.playing]);

  const handleSaveAudio = useCallback(async () => {
    if (!localRecording?.uri || !hearing?.id) {
      return;
    }

    try {
      setSaving(true);
      const uploadedDocument = await uploadDocument({
        hearingId: hearing.id,
        asset: {
          uri: localRecording.uri,
          name: localRecording.fileName,
          mimeType: AUDIO_MIME_TYPE,
        },
        documentType: 'audio',
        baseName: hearing?.title || 'audiencia',
      });

      if (uploadedDocument) {
        setUploadedAudioDocument(uploadedDocument);
      }

      await onDocumentsChanged?.();
      Alert.alert('Audio guardado', 'La grabacion se vinculo correctamente con la audiencia.');
    } catch (error) {
      console.error('[HearingRecordingPanel] Error guardando audio:', error);
      Alert.alert(
        'No se pudo guardar el audio.',
        error instanceof Error ? error.message : 'Intenta nuevamente.'
      );
    } finally {
      setSaving(false);
    }
  }, [hearing?.id, hearing?.title, localRecording, onDocumentsChanged]);

  const handleTranscribeAudio = useCallback(async () => {
    if (!activeAudioDocument?.id) {
      return;
    }

    try {
      setTranscribing(true);
      const response = await transcribeDocument(activeAudioDocument.id);
      setTranscriptState({
        documentId: activeAudioDocument.id,
        transcript: response?.transcript || '',
        transcriptFilePath: response?.transcriptFilePath || null,
      });
      await onDocumentsChanged?.();
      Alert.alert('Transcripcion lista', 'El audio se transcribio correctamente.');
    } catch (error) {
      console.error('[HearingRecordingPanel] Error transcribiendo audio:', error);
      Alert.alert(
        'No se pudo transcribir el audio.',
        error instanceof Error ? error.message : 'Intenta nuevamente.'
      );
    } finally {
      setTranscribing(false);
    }
  }, [activeAudioDocument?.id, onDocumentsChanged]);

  const handleDownloadTranscript = useCallback(async () => {
    if (!activeAudioDocument?.id) {
      return;
    }

    try {
      setDownloadingTranscript(true);
      const token = await getCurrentIdToken();
      const fileName = buildTranscriptFileName(hearing?.title, activeAudioDocument, audioDocuments.length);
      const localUri = `${FileSystem.documentDirectory}${fileName}`;
      const result = await FileSystem.downloadAsync(
        `${API_BASE_URL}/documentos/${activeAudioDocument.id}/transcripcion/word`,
        localUri,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          idempotent: true,
        }
      );

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(result.uri, {
          dialogTitle: 'Compartir transcripcion',
          mimeType: WORD_MIME_TYPE,
          UTI: 'org.openxmlformats.wordprocessingml.document',
        });
      }

      Alert.alert('Transcripcion lista', 'El archivo Word quedo listo para abrir o compartir.');
    } catch (error) {
      console.error('[HearingRecordingPanel] Error descargando transcripcion:', error);
      Alert.alert(
        'No se pudo descargar la transcripcion.',
        error instanceof Error ? error.message : 'Intenta nuevamente.'
      );
    } finally {
      setDownloadingTranscript(false);
    }
  }, [activeAudioDocument, audioDocuments.length, hearing?.title]);

  const statusMessage = useMemo(() => {
    if (recorderState.isRecording) {
      return `Grabando... ${formatDuration(recorderState.durationMillis)}`;
    }

    if (saving) {
      return 'Subiendo audio...';
    }

    if (transcribing) {
      return 'Transcribiendo audio...';
    }

    if (localRecording?.uri) {
      return `Grabacion lista (${formatDuration(localRecording.durationMillis)})`;
    }

    return 'Lista para grabar la audiencia.';
  }, [localRecording?.durationMillis, localRecording?.uri, recorderState.durationMillis, recorderState.isRecording, saving, transcribing]);

  const latestTranscript = transcriptState?.transcript || '';

  return (
    <View style={styles.panel}>
      <Text style={styles.panelTitle}>Grabacion de audiencia</Text>
      <Text style={styles.panelStatus}>{statusMessage}</Text>

      <View style={styles.buttonGrid}>
        <ActionButton
          disabled={recorderState.isRecording || saving || transcribing}
          label="Iniciar grabacion"
          onPress={() => void handleStartRecording()}
          styles={styles}
          variant="secondary"
        />
        <ActionButton
          disabled={!recorderState.isRecording}
          label="Detener grabacion"
          onPress={() => void handleStopRecording()}
          styles={styles}
          variant="primary"
        />
        <ActionButton
          disabled={!localRecording?.uri}
          label={playerStatus?.playing ? 'Reproduciendo...' : 'Reproducir grabacion'}
          onPress={() => void handlePlayRecording()}
          styles={styles}
          variant="secondary"
        />
        <ActionButton
          disabled={!localRecording?.uri || saving}
          label={saving ? 'Guardando audio...' : 'Guardar audio'}
          onPress={() => void handleSaveAudio()}
          styles={styles}
          variant="primary"
        />
        <ActionButton
          disabled={!activeAudioDocument?.id || transcribing}
          label={transcribing ? 'Transcribiendo...' : 'Transcribir audio'}
          onPress={() => void handleTranscribeAudio()}
          styles={styles}
          variant="secondary"
        />
        <ActionButton
          disabled={!transcriptState?.documentId || downloadingTranscript}
          label={downloadingTranscript ? 'Descargando...' : 'Descargar transcripcion'}
          onPress={() => void handleDownloadTranscript()}
          styles={styles}
          variant="primary"
        />
        <ActionButton
          disabled={!hearing?.id}
          label="Iniciar transcripción en vivo"
          onPress={() =>
            navigation.navigate('LiveTranscription', {
              caseId: hearing?.caseId,
              hearingId: hearing?.id,
              title: hearing?.title,
            })
          }
          styles={styles}
          variant="secondary"
        />
      </View>

      <View style={styles.infoBlock}>
        <Text style={styles.infoLabel}>Ultimo audio guardado</Text>
        <Text style={styles.infoText}>
          {activeAudioDocument?.fileName || 'Todavia no se guardaron audios para esta audiencia.'}
        </Text>
      </View>

      {latestTranscript ? (
        <View style={styles.transcriptCard}>
          <Text style={styles.infoLabel}>Vista previa de la transcripcion</Text>
          <Text style={styles.transcriptText}>{latestTranscript}</Text>
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
    gap: 12,
  },
  panelTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
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
    minHeight: 46,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  secondaryButton: {
    minHeight: 46,
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
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
  infoBlock: {
    backgroundColor: colors.background,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    gap: 6,
  },
  infoLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  infoText: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 20,
  },
  transcriptCard: {
    backgroundColor: colors.accentSoft,
    borderRadius: 16,
    padding: 14,
    gap: 8,
  },
  transcriptText: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 20,
  },
});
