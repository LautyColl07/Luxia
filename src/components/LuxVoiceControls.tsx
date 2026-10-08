import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useAppTheme } from '../context/ThemeContext';
import type { VoiceController, VoiceState } from '../voice/VoiceController';

type Props = {
  voice: { controller: VoiceController; state: VoiceState; autoRead: boolean; toggleAutoRead(): void };
  disabled: boolean;
  onStart(conversation: boolean): void;
  onClose(): void;
  maxHeight: number;
  caseName?: string;
};
const duration = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
const statusText: Record<VoiceState['status'], string> = {
  inactive: 'Micrófono apagado', listening: 'Escuchando', processing: 'Procesando',
  speaking: 'Lux está hablando', reviewing: 'Audio listo', error: 'Error recuperable',
};

export default function LuxVoiceControls({ voice, disabled, onStart, onClose, maxHeight, caseName }: Props) {
  const { colors } = useAppTheme();
  const { controller, state, autoRead, toggleAutoRead } = voice;
  const available = !!state.capabilities?.enabled && !!state.capabilities.transcriptionAvailable;
  const working = state.status === 'processing' || state.starting;
  const canCall = available && !working && !state.conversation && !controller.busy && !state.draft;
  const status = state.starting ? 'Activando micrófono…'
    : state.status === 'inactive' && state.conversation && state.microphonePaused ? 'Pausado'
    : state.status === 'listening' && state.conversation && state.speechDetected ? 'Te estoy escuchando'
    : state.paused ? 'Audio en pausa' : statusText[state.status];
  const styles = StyleSheet.create({
    panel: { flexShrink: 0, minHeight: 112, maxHeight, marginBottom: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 16, backgroundColor: colors.card, overflow: 'hidden' },
    content: { padding: maxHeight <= 132 ? 4 : 12, gap: maxHeight <= 132 ? 6 : 10 },
    row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
    header: { flexDirection: 'row', flexShrink: 0, alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6 },
    indicator: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: state.microphoneActive ? colors.dangerSoft : colors.accentSoft },
    heading: { flex: 1, minWidth: 0 },
    title: { color: colors.text, fontWeight: '800', fontSize: 14 },
    status: { color: state.microphoneActive ? colors.danger : colors.primary, fontSize: 12, fontWeight: '700', marginTop: 2 },
    button: { minHeight: 44, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, backgroundColor: colors.accentSoft, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
    primaryButton: { backgroundColor: colors.primary },
    endButton: { backgroundColor: colors.dangerSoft },
    close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
    label: { color: colors.primary, fontWeight: '700', fontSize: 12 },
    hint: { color: colors.textSecondary, fontSize: 12, lineHeight: 17 },
    error: { color: colors.danger, fontSize: 12, lineHeight: 17 },
    preference: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  });
  const button = (label: string, action: () => void, icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'], blocked = false, kind: 'normal' | 'primary' | 'end' = 'normal') => {
    const color = kind === 'primary' ? colors.textOnPrimary : kind === 'end' ? colors.danger : colors.primary;
    return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: blocked }} disabled={blocked} onPress={action}
      style={[styles.button, kind === 'primary' && styles.primaryButton, kind === 'end' && styles.endButton, blocked && { opacity: 0.45 }]}>
      <MaterialCommunityIcons name={icon} size={19} color={color} /><Text style={[styles.label, { color }]}>{label}</Text>
    </Pressable>;
  };
  return <View accessibilityLabel={state.conversation ? 'Conversación de voz en este chat' : 'Controles de grabación'} style={styles.panel}>
      <View style={styles.header}>
        <View style={styles.indicator}>{working ? <ActivityIndicator color={colors.primary} size="small" />
          : <MaterialCommunityIcons name={state.microphoneActive ? 'record-circle' : state.status === 'speaking' ? 'waveform' : 'microphone-outline'} size={22} color={state.microphoneActive ? colors.danger : colors.primary} />}</View>
        <View style={styles.heading}><Text style={styles.title}>{state.conversation ? 'Hablar con Lux' : 'Nota de voz'}</Text>
          <Text accessibilityLiveRegion="polite" style={styles.status}>{status}{state.microphoneActive || state.draft ? ` · ${duration(state.durationMs)}` : ''}</Text></View>
        {state.conversation ? button('Finalizar', onClose, 'phone-hangup-outline', false, 'end')
          : <Pressable accessibilityRole="button" accessibilityLabel="Cerrar controles de voz" onPress={onClose} style={styles.close}><MaterialCommunityIcons name="close" size={20} color={colors.textSecondary} /></Pressable>}
      </View>
    <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled contentContainerStyle={styles.content}>
      <View style={styles.row}>
        {!state.conversation ? button('Hablar con Lux', () => onStart(true), 'phone-in-talk-outline', disabled || !canCall, 'primary') : null}
        {state.status === 'listening' && !state.conversation ? button('Detener grabación', () => { void controller.finishCapture(false); }, 'stop-circle-outline') : null}
        {!state.conversation && ['inactive', 'error'].includes(state.status) && !state.draft ? button('Grabar nota', () => onStart(false), 'microphone', disabled || !available || state.starting) : null}
        {state.conversation ? <>
          {state.status === 'error' && !state.draft && !state.microphonePaused ? button('Reintentar micrófono', () => { void controller.listen(); }, 'refresh', disabled || working) : null}
          {state.status === 'speaking' ? button('Interrumpir a Lux', () => { void controller.interrupt(); }, 'hand-back-right-outline') : null}
          {button(state.microphonePaused ? 'Reanudar micrófono' : 'Pausar micrófono', () => { void controller.toggleMicrophone(); }, state.microphonePaused ? 'microphone' : 'microphone-off', disabled && state.microphonePaused)}
        </> : null}
        {working && controller.requestActive ? button('Cancelar envío', () => controller.cancelRequest(), 'close') : null}
      </View>
      {caseName ? <Text numberOfLines={1} style={styles.hint}>Causa: {caseName}</Text> : null}
      {state.conversation ? <View style={styles.row}>{button(state.muted ? 'Activar voz de Lux' : 'Silenciar Lux', () => { void controller.toggleMute(); }, state.muted ? 'volume-off' : 'volume-high')}</View> : null}
      {state.draft ? <View style={styles.row}>
        {button(state.playingId === 'draft' && !state.paused ? 'Pausar audio' : 'Escuchar audio', () => { void controller.preview(); }, state.playingId === 'draft' && !state.paused ? 'pause' : 'play', working)}
        {button('Descartar', () => { void controller.discard(); }, 'delete-outline', working)}
        {button(state.status === 'error' || state.conversation ? 'Reintentar envío' : 'Enviar audio', () => { void controller.sendDraft(); }, 'send', disabled || working, 'primary')}
      </View> : null}
      {state.status === 'listening' ? <Text style={styles.hint}>{state.conversation
        ? 'Hablá naturalmente: Lux responderá después de una pausa y volverá a escucharte.'
        : 'Detené la grabación para escucharla, descartarla o enviarla.'}</Text> : null}
      {state.conversation && state.microphonePaused ? <Text style={styles.hint}>El micrófono seguirá apagado hasta que lo reanudes. Podés escribir en el chat.</Text> : null}
      {state.monitoring ? <Text style={styles.hint}>Podés hablar para interrumpir a Lux. En el teléfono, escuchá por el auricular.</Text> : null}
      {state.conversation ? <View style={styles.row}>
        <Text style={styles.hint}>Sensibilidad: {state.thresholdDb} dB</Text>
        {button('Más sensible', () => controller.setThreshold(state.thresholdDb - 4), 'microphone-plus', state.thresholdDb <= -60)}
        {button('Menos sensible', () => controller.setThreshold(state.thresholdDb + 4), 'microphone-minus', state.thresholdDb >= -20)}
      </View> : null}
      {!state.conversation ? <View style={styles.preference}><Switch accessibilityLabel="Leer respuestas automáticamente" value={autoRead} onValueChange={toggleAutoRead} trackColor={{ true: colors.primary }} /><Text style={styles.hint}>Leer respuestas</Text></View> : null}
      {state.error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{state.error}</Text> : null}
      {!state.capabilities ? button('Revisar disponibilidad', () => { void controller.loadCapabilities(); }, 'refresh', state.loadingCapabilities) : null}
      {state.capabilities && !state.capabilities.synthesisAvailable ? <Text style={styles.hint}>La síntesis de voz no está disponible. Lux responde por escrito y la llamada sigue escuchando.</Text> : null}
      {state.warnings.map((warning, i) => <Text style={styles.hint} key={`${i}-${warning}`}>{warning}</Text>)}
    </ScrollView>
  </View>;
}
