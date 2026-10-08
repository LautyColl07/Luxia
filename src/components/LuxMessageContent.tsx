import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '../context/ThemeContext';
import type { LuxMessage } from '../voice/types';
import type { VoiceController, VoiceState } from '../voice/VoiceController';

export default function LuxMessageContent({ message, controller, state }: { message: LuxMessage; controller: VoiceController; state: VoiceState }) {
  const { colors } = useAppTheme();
  const [transcriptVisible, setTranscriptVisible] = useState(false);
  const [linkError, setLinkError] = useState('');
  const isAudio = message.role === 'user' && (!!message.audio || controller.hasLocalAudio(message.id));
  const conversationTranscript = state.conversation || message.voiceMode === 'conversation';
  const hasAudio = !!message.audio?.audioId || !!message.speech?.audioId || controller.hasLocalAudio(message.id);
  const isPlaying = state.playingId === message.id;
  const canGenerate = message.role === 'assistant' && !!message.persisted && !!state.capabilities?.synthesisAvailable;
  const isUser = message.role === 'user';
  const disabled = state.microphoneActive || state.starting || state.status === 'processing' || state.conversation || !!state.draft;
  const styles = StyleSheet.create({
    row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginTop: 8 },
    button: { minHeight: 44, borderRadius: 12, backgroundColor: isUser ? colors.primaryHover : colors.accentSoft, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
    label: { color: isUser ? colors.textOnPrimary : colors.primary, fontSize: 13, fontWeight: '700' },
    text: { color: isUser ? colors.textOnPrimary : colors.text, fontSize: 15, lineHeight: 23 },
    link: { color: isUser ? colors.textOnPrimary : colors.primary, fontSize: 13, lineHeight: 21, textDecorationLine: 'underline' },
  });
  const openLink = async (url: unknown) => {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return;
    try { await Linking.openURL(url); } catch { setLinkError('No pudimos abrir este enlace.'); }
  };
  return <>
    {isAudio ? <View style={styles.row}><MaterialCommunityIcons name="waveform" size={23} color={isUser ? colors.textOnPrimary : colors.primary} /><Text style={styles.label}>{conversationTranscript ? 'Mensaje de voz' : 'Nota de voz'}</Text>
      {!conversationTranscript ? <Pressable accessibilityRole="button" accessibilityLabel={transcriptVisible ? 'Ocultar transcripción' : 'Ver transcripción'} onPress={() => setTranscriptVisible(!transcriptVisible)} style={styles.button}><Text style={styles.label}>{transcriptVisible ? 'Ocultar transcripción' : 'Ver transcripción'}</Text></Pressable> : null}</View> : null}
    {!isAudio || conversationTranscript || transcriptVisible ? <Text selectable style={styles.text}>{message.text}</Text> : null}
    {hasAudio || canGenerate ? <View style={styles.row}><Pressable accessibilityRole="button" disabled={disabled} accessibilityState={{ disabled }} accessibilityLabel={isPlaying && !state.paused ? 'Pausar audio' : hasAudio ? 'Reproducir audio' : 'Pedir audio de esta respuesta'} onPress={() => { void controller.playMessage(message); }} style={[styles.button, disabled && { opacity: 0.45 }]}><MaterialCommunityIcons name={isPlaying && !state.paused ? 'pause' : 'play'} size={20} color={isUser ? colors.textOnPrimary : colors.primary} /><Text style={styles.label}>{isPlaying && !state.paused ? 'Pausar' : hasAudio ? 'Reproducir' : 'Pedir audio'}</Text></Pressable>
      {message.role === 'assistant' && hasAudio && canGenerate ? <Pressable accessibilityRole="button" accessibilityLabel="Volver a pedir audio de esta respuesta" disabled={disabled} onPress={() => { void controller.generateSpeech(message); }} style={styles.button}><Text style={styles.label}>Pedir audio otra vez</Text></Pressable> : null}</View> : null}
    {message.citations?.map((citation, index) => { const url = citation.url || citation.sourceUrl; return <View key={`citation-${index}`} style={styles.row}>{typeof url === 'string' && /^https?:\/\//i.test(url) ? <Pressable accessibilityRole="link" onPress={() => { void openLink(url); }}><Text style={styles.link}>{String(citation.title || citation.name || citation.source || `Fuente ${index + 1}`)}</Text></Pressable> : <Text style={styles.text}>{String(citation.title || citation.source || citation.text || `Fuente ${index + 1}`)}</Text>}</View>; })}
    {message.documents?.map((document, index) => { const url = document.url || document.downloadUrl; return <View key={`document-${index}`} style={styles.row}><MaterialCommunityIcons name="file-document-outline" size={18} color={colors.primary} />{typeof url === 'string' && /^https?:\/\//i.test(url) ? <Pressable accessibilityRole="link" onPress={() => { void openLink(url); }}><Text style={styles.link}>{String(document.name || document.title || `Documento ${index + 1}`)}</Text></Pressable> : <Text style={styles.text}>{String(document.name || document.title || `Documento ${index + 1}`)}{document.text ? `: ${document.text}` : ''}</Text>}</View>; })}
    {linkError ? <Text style={{ color: colors.danger }}>{linkError}</Text> : null}
  </>;
}
