import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import LoadingState from '../components/LoadingState';
import { useAuth } from '../context/AuthContext';
import { useStudyContext } from '../context/StudyContext';
import { useAppTheme } from '../context/ThemeContext';
import { getMyStudyInvitations, getStudyInvitations, resolveStudyInvitation, respondToStudyInvitation } from '../services/api';
import { useResponsiveLayout } from '../theme/layout';

const ROLE_NAMES = { ADMIN: 'Administrador', LAWYER: 'Abogado', COLLABORATOR: 'Colaborador' };

export default function StudyInvitationsScreen({ route }) {
  const { authStatus, currentUser } = useAuth();
  const { legalStudies, refreshLegalStudies } = useStudyContext();
  const { colors } = useAppTheme();
  const layout = useResponsiveLayout();
  const styles = useMemo(() => createStyles(colors, layout), [colors, layout]);
  const [items, setItems] = useState([]);
  const [invitation, setInvitation] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const invitationId = route?.params?.invitationId;
  const linkedToken = route?.params?.token;

  const load = useCallback(async () => {
    try {
      setLoading(true); setError(''); setMessage('');
      if (linkedToken) {
        const resolved = await resolveStudyInvitation(linkedToken);
        if (invitationId && String(resolved.id) !== String(invitationId)) throw new Error('No pudimos validar esta invitación.');
        setInvitation(resolved); setToken(linkedToken);
      } else {
        setInvitation(null); setToken(null);
        setItems(await getMyStudyInvitations());
      }
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'No pudimos validar esta invitación.'); }
    finally { setLoading(false); }
  }, [invitationId, linkedToken]);

  useFocusEffect(useCallback(() => { if (authStatus === 'authenticated' && currentUser) void load(); return undefined; }, [authStatus, currentUser?.uid, load]));

  useEffect(() => {
    if (!invitationId || linkedToken) return;
    const found = items.find((item) => String(item.id) === String(invitationId));
    if (found) setInvitation(found);
  }, [invitationId, items, linkedToken]);

  const respond = async (decision) => {
    if (!invitation || busy) return;
    try {
      setBusy(true); setError(''); setMessage('');
      const result = await respondToStudyInvitation(invitation.id, decision, token);
      if (decision === 'ACCEPTED') {
        await refreshLegalStudies();
        setMessage('Aceptaste la invitación. Ya pertenecés al estudio; un administrador debe asignarte causas para comenzar.');
      } else setMessage('Rechazaste la invitación. No se agregó ningún acceso al estudio.');
      setInvitation({ ...invitation, status: result.status });
      setItems((current) => current.filter((item) => String(item.id) !== String(invitation.id)));
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'No pudimos completar la respuesta.'); }
    finally { setBusy(false); }
  };

  if (loading) return <LoadingState title="Revisando invitaciones" message="Estamos comprobando la vigencia y el correo destinatario." />;
  if (error && invitationId && !invitation) return <ErrorState title="No pudimos validar la invitación" message={error} onRetry={load} />;

  return (
    <ScrollView contentContainerStyle={styles.content} style={styles.screen} showsVerticalScrollIndicator={false}>
      <Text style={styles.title}>Invitaciones al estudio</Text>
      <Text style={styles.subtitle}>Recibir una invitación no da acceso automáticamente. Revisá el estudio y aceptá para incorporarte.</Text>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {message ? <View style={styles.successBox}><MaterialCommunityIcons color={colors.success} name="check-circle-outline" size={20} /><Text style={styles.successText}>{message}</Text></View> : null}

      {invitation ? (
        <View style={styles.card}>
          <Text style={styles.eyebrow}>INVITACIÓN PENDIENTE</Text>
          <Text style={styles.studyName}>{invitation.studyName}</Text>
          <Text style={styles.detail}>Te invitó {invitation.invitedBy || 'un administrador'} con el rol {ROLE_NAMES[invitation.role] || invitation.role}.</Text>
          <Text style={styles.notice}>Todavía no tenés acceso a este estudio. Si aceptás, tu membresía se activa y podrás ver únicamente lo permitido por tu rol y las asignaciones de causas.</Text>
          <Text style={styles.expiry}>Vence: {new Date(invitation.expiresAt).toLocaleString()}</Text>
          {invitation.status === 'PENDING' ? <View style={styles.actions}><Pressable disabled={busy} onPress={() => respond('DECLINED')} style={styles.secondaryButton}><Text style={styles.secondaryText}>Rechazar</Text></Pressable><Pressable disabled={busy} onPress={() => respond('ACCEPTED')} style={styles.primaryButton}>{busy ? <ActivityIndicator color={colors.textOnPrimary} /> : <Text style={styles.primaryText}>Aceptar invitación</Text>}</Pressable></View> : <Text style={styles.expiry}>{invitation.status === 'ACCEPTED' ? 'Esta invitación ya fue aceptada.' : 'Esta invitación ya no está disponible.'}</Text>}
        </View>
      ) : (
        <View style={styles.card}>
          {items.length ? items.map((item) => <Pressable key={item.id} onPress={() => setInvitation(item)} style={styles.item}>
            <View style={styles.icon}><MaterialCommunityIcons color={colors.primary} name="email-outline" size={20} /></View>
            <View style={styles.itemCopy}><Text style={styles.itemTitle}>{item.studyName}</Text><Text style={styles.detail}>{ROLE_NAMES[item.role] || item.role} · invitó {item.invitedBy}</Text><Text style={styles.expiry}>Vence: {new Date(item.expiresAt).toLocaleDateString()}</Text></View>
            <MaterialCommunityIcons color={colors.textMuted} name="chevron-right" size={21} />
          </Pressable>) : <EmptyState icon="email-check-outline" title="No tenés invitaciones pendientes" message="Cuando un administrador te invite, vas a poder revisarla desde esta pantalla." />}
        </View>
      )}
    </ScrollView>
  );
}

const createStyles = (colors, layout) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { width: '100%', maxWidth: 900, alignSelf: 'center', padding: layout.gutter, paddingBottom: 36, gap: 14 },
  title: { color: colors.text, fontSize: layout.isPhone ? 25 : 32, fontWeight: '800' },
  subtitle: { color: colors.textSecondary, fontSize: 14, lineHeight: 21 },
  card: { backgroundColor: colors.card, borderColor: colors.borderSoft, borderWidth: 1, borderRadius: 20, padding: layout.isPhone ? 17 : 24, gap: 13 },
  eyebrow: { color: colors.primary, fontSize: 11, letterSpacing: 1, fontWeight: '800' },
  studyName: { color: colors.text, fontSize: 23, fontWeight: '800' },
  detail: { color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
  notice: { color: colors.textSecondary, fontSize: 13, lineHeight: 20, backgroundColor: colors.accentSoft, borderRadius: 13, padding: 13 },
  expiry: { color: colors.textMuted, fontSize: 12 },
  actions: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end', marginTop: 5 },
  primaryButton: { minHeight: 45, minWidth: 150, paddingHorizontal: 17, borderRadius: 13, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: colors.textOnPrimary, fontSize: 13, fontWeight: '700' },
  secondaryButton: { minHeight: 45, minWidth: 110, paddingHorizontal: 16, borderRadius: 13, backgroundColor: colors.backgroundAlt, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: colors.textSecondary, fontSize: 13, fontWeight: '700' },
  item: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: colors.borderSoft, paddingVertical: 10 },
  icon: { width: 42, height: 42, borderRadius: 13, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  itemCopy: { flex: 1, gap: 3 },
  itemTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  error: { color: colors.danger, fontSize: 13, lineHeight: 19 },
  successBox: { flexDirection: 'row', gap: 8, backgroundColor: colors.accentSoft, padding: 13, borderRadius: 13, alignItems: 'flex-start' },
  successText: { flex: 1, color: colors.text, fontSize: 13, lineHeight: 19 },
});
