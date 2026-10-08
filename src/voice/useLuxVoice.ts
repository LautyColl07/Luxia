import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { luxVoiceTransport } from '../services/luxVoice';
import { VoiceController } from './VoiceController';
import { createPlayback } from './createPlayback';
import { useVoiceRecorder } from './useVoiceRecorder';
import type { LuxMessage, Speech, VoiceScope, VoiceTurn } from './types';

type Options = {
  visible: boolean;
  userKey: string;
  contextKey: string;
  scope: VoiceScope | null;
  onPending(id: string, scope: VoiceScope): void;
  onSettled(id: string, scope: VoiceScope): void;
  onTurn(turn: VoiceTurn, id: string, scope: VoiceScope): void;
  onSpeech(message: LuxMessage, speech: Speech, scope: VoiceScope): void;
};
export function useLuxVoice(options: Options) {
  const callbacks = useRef(options);
  callbacks.current = options;
  const [autoRead, setAutoRead] = useState(false);
  const recorder = useVoiceRecorder();
  const mounted = useRef(true);
  const [state, setState] = useState<VoiceController['state'] | null>(null);
  const controller = useMemo(() => new VoiceController(recorder, createPlayback(), luxVoiceTransport, randomUUID, {
    changed: (next) => { if (mounted.current) setState(next); },
    pending: (id, scope) => callbacks.current.onPending(id, scope),
    settled: (id, scope) => callbacks.current.onSettled(id, scope),
    turn: (turn, id, scope) => callbacks.current.onTurn(turn, id, scope),
    speech: (message, speech, scope) => callbacks.current.onSpeech(message, speech, scope),
  }), [recorder]);
  const identity = `${options.userKey}.${options.contextKey}`;
  const previousIdentity = useRef(identity);
  const scopeId = options.scope?.localConversationId;
  const caseId = options.scope?.caseId;
  useEffect(() => {
    const changedIdentity = previousIdentity.current !== identity;
    previousIdentity.current = identity;
    const changedScope = controller.scope && (controller.scope.localConversationId !== scopeId || controller.scope.caseId !== caseId);
    if (!options.visible || changedIdentity || changedScope) void controller.close();
    if (options.visible && options.scope && !controller.busy) controller.scope = { ...options.scope };
  }, [controller, identity, options.visible, scopeId, caseId, options.scope]);
  useEffect(() => {
    if (options.visible) void controller.loadCapabilities();
  }, [controller, identity, options.visible]);
  useEffect(() => {
    let active = true;
    setAutoRead(false);
    controller.autoRead = false;
    void AsyncStorage.getItem(`luxia.lux.voice.autoRead.${options.userKey}`).then((value) => {
      if (active) { controller.autoRead = value === 'true'; setAutoRead(value === 'true'); }
    }).catch(() => undefined);
    return () => { active = false; };
  }, [controller, options.userKey]);
  useEffect(() => {
    mounted.current = true;
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') void controller.close();
    });
    const hidden = () => { if (document.visibilityState !== 'visible') void controller.close(); };
    const leaving = () => { void controller.close(); };
    if (Platform.OS === 'web') {
      document.addEventListener('visibilitychange', hidden);
      window.addEventListener('pagehide', leaving);
    }
    return () => {
      mounted.current = false;
      subscription.remove();
      if (Platform.OS === 'web') { document.removeEventListener('visibilitychange', hidden); window.removeEventListener('pagehide', leaving); }
      void controller.close();
    };
  }, [controller]);
  const toggleAutoRead = () => {
    const next = !controller.autoRead;
    controller.autoRead = next;
    setAutoRead(next);
    void AsyncStorage.setItem(`luxia.lux.voice.autoRead.${options.userKey}`, String(next)).catch(() => undefined);
  };
  return { controller, state: state || controller.state, autoRead, toggleAutoRead };
}
