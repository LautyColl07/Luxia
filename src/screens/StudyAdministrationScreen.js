import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import LoadingState from '../components/LoadingState';
import { useAuth } from '../context/AuthContext';
import { useStudyContext } from '../context/StudyContext';
import { useAppTheme } from '../context/ThemeContext';
import {
  createLegalStudy,
  createStudyInvitation,
  getMe,
  getStudyInvitations,
  getStudyMembers,
  getStudySummary,
  removeStudyMember,
  resendStudyInvitation,
  revokeStudyInvitation,
  updateStudyMemberRole,
} from '../services/api';
import { useResponsiveLayout } from '../theme/layout';

const ROLES = [
  { key: 'ADMIN', label: 'Administrador', summary: 'Gestiona integrantes, roles y causas del estudio.' },
  { key: 'LAWYER', label: 'Abogado', summary: 'Trabaja en causas asignadas y puede gestionarlas.' },
  { key: 'COLLABORATOR', label: 'Colaborador', summary: 'Puede consultar causas asignadas y cargar documentos.' },
];
const ACCESS_STATUS = {
  PENDING: 'Pendiente', ACCEPTED: 'Aceptada', DECLINED: 'Rechazada', EXPIRED: 'Vencida', REVOKED: 'Revocada',
};

export default function StudyAdministrationScreen({ navigation, route }) {
  const { authStatus, currentUser } = useAuth();
  const { legalStudies, refreshLegalStudies } = useStudyContext();
  const { colors } = useAppTheme();
  const layout = useResponsiveLayout();
  const styles = useMemo(() => createStyles(colors, layout), [colors, layout]);
  const isFocused = useIsFocused();
  const adminStudies = legalStudies.filter((study) => study.role === 'ADMIN');
  const adminStudiesRef = useRef(adminStudies);
  adminStudiesRef.current = adminStudies;
  const [studyId, setStudyId] = useState(route?.params?.studyId || adminStudies[0]?.id || null);
  const [profile, setProfile] = useState(null);
  const [summary, setSummary] = useState(null);
  const [members, setMembers] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [inviteVisible, setInviteVisible] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('LAWYER');
  const [inviteError, setInviteError] = useState('');
  const [newStudyName, setNewStudyName] = useState('');

  const selectedStudy = adminStudies.find((study) => String(study.id) === String(studyId)) || adminStudies[0] || null;

  useEffect(() => {
    if (!studyId && (route?.params?.studyId || adminStudies[0]?.id)) setStudyId(route?.params?.studyId || adminStudies[0].id);
  }, [adminStudies, route?.params?.studyId, studyId]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const [user] = await Promise.all([getMe().catch(() => null), refreshLegalStudies()]);
      setProfile(user);
      const latestStudies = adminStudiesRef.current;
      const targetId = route?.params?.studyId || studyId || latestStudies[0]?.id;
      if (!targetId) { setSummary(null); setMembers([]); setInvitations([]); return; }
      const [nextSummary, nextMembers, nextInvitations] = await Promise.all([
        getStudySummary(targetId), getStudyMembers(targetId), getStudyInvitations(targetId),
      ]);
      setStudyId(String(targetId));
      setSummary(nextSummary);
      setMembers(nextMembers);
      setInvitations(nextInvitations);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No pudimos cargar la administración del estudio.');
    } finally {
      setLoading(false);
    }
  }, [refreshLegalStudies, route?.params?.studyId, studyId]);

  useFocusEffect(useCallback(() => { if (authStatus === 'authenticated' && currentUser) void load(); return undefined; }, [authStatus, currentUser?.uid, load]));

  const hasDeliveryInProgress = invitations.some((item) => item.status === 'PENDING' && ['QUEUED', 'SENDING'].includes(item.deliveryStatus));
  useEffect(() => {
    if (!isFocused || !selectedStudy?.id || !hasDeliveryInProgress) return undefined;
    let cancelled = false;
    const timer = setInterval(() => {
      void getStudyInvitations(selectedStudy.id).then((latest) => {
        if (!cancelled) setInvitations(latest);
      }).catch(() => undefined);
    }, 5000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [hasDeliveryInProgress, isFocused, selectedStudy?.id]);

  const reloadSelected = useCallback(async () => {
    if (!selectedStudy) return;
    const [nextSummary, nextMembers, nextInvitations] = await Promise.all([
      getStudySummary(selectedStudy.id), getStudyMembers(selectedStudy.id), getStudyInvitations(selectedStudy.id),
    ]);
    setSummary(nextSummary); setMembers(nextMembers); setInvitations(nextInvitations);
  }, [selectedStudy]);

  const visibleMembers = members.filter((member) => `${member.name} ${member.email} ${member.role}`.toLowerCase().includes(query.trim().toLowerCase()));
  const pendingCount = invitations.filter((item) => item.status === 'PENDING').length;
  const metrics = summary?.metrics || {};
  const mayCreateStudy = Boolean(profile?.canCreateLegalStudies || adminStudies.length);

  const handleCreateStudy = async () => {
    if (!newStudyName.trim() || busy) return;
    try {
      setBusy(true); setError('');
      const created = await createLegalStudy(newStudyName.trim());
      setNewStudyName('');
      await refreshLegalStudies();
      setStudyId(created.id);
      await load();
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'No se pudo crear el estudio.'); }
    finally { setBusy(false); }
  };

  const handleInvite = async () => {
    if (!selectedStudy || busy) return;
    try {
      setBusy(true); setInviteError('');
      const result = await createStudyInvitation(selectedStudy.id, inviteEmail, inviteRole);
      setInviteVisible(false); setInviteEmail(''); setInviteRole('LAWYER');
      await reloadSelected();
      const message = result.deliveryStatus === 'WAITING_CONFIGURATION'
        ? 'La invitación quedó pendiente. Configurá el envío de correo para que la persona reciba el enlace.'
        : 'La invitación quedó pendiente. La persona debe verificar su correo y aceptarla para incorporarse.';
      if (Platform.OS === 'web') globalThis.alert(message); else Alert.alert('Invitación pendiente', message);
    } catch (failure) { setInviteError(failure instanceof Error ? failure.message : 'No se pudo enviar la invitación.'); }
    finally { setBusy(false); }
  };

  const confirm = (title, message, action) => {
    if (Platform.OS === 'web') { if (globalThis.confirm(`${title}\n\n${message}`)) void action(); return; }
    Alert.alert(title, message, [{ text: 'Cancelar', style: 'cancel' }, { text: 'Confirmar', onPress: () => void action() }]);
  };

  const changeRole = (member, role) => {
    if (!selectedStudy || role === member.role) return;
    const proceed = async () => {
      try { setBusy(true); await updateStudyMemberRole(selectedStudy.id, member.id, role); await reloadSelected(); }
      catch (failure) { setError(failure instanceof Error ? failure.message : 'No se pudo actualizar el rol.'); }
      finally { setBusy(false); }
    };
    confirm('Cambiar rol', role === 'ADMIN' ? `${member.name} tendrá acceso completo y podrá administrar integrantes y causas.` : `El nuevo rol de ${member.name} se aplicará en este estudio.` , proceed);
  };

  const removeMember = (member) => confirm('Quitar integrante', `¿Querés revocar el acceso de ${member.name}? Las causas deberán conservar al menos un abogado responsable.`, async () => {
    try { setBusy(true); await removeStudyMember(selectedStudy.id, member.id); await reloadSelected(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'No se pudo quitar al integrante.'); }
    finally { setBusy(false); }
  });

  const invitationAction = (item, action) => confirm(action === 'resend' ? 'Reenviar invitación' : 'Revocar invitación', action === 'resend' ? `Se generará un enlace nuevo para ${item.email}; el anterior dejará de servir.` : `La persona ya no podrá usar la invitación enviada a ${item.email}.`, async () => {
    try { setBusy(true); if (action === 'resend') await resendStudyInvitation(selectedStudy.id, item.id); else await revokeStudyInvitation(selectedStudy.id, item.id); await reloadSelected(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'No se pudo completar la acción.'); }
    finally { setBusy(false); }
  });

  if (loading && !summary && !adminStudies.length) return <LoadingState title="Cargando administración" message="Estamos comprobando tus permisos y estudios." />;
  if (error && !summary && adminStudies.length) return <ErrorState title="No pudimos abrir Administración del estudio" message={error} onRetry={load} />;

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} style={styles.screen}>
      <View style={styles.headingRow}>
        <View style={styles.headingCopy}>
          <Text style={styles.title}>Administración del estudio</Text>
          <Text style={styles.subtitle}>Gestioná integrantes, roles y el acceso a las causas de tu equipo.</Text>
        </View>
        {selectedStudy ? <Pressable onPress={() => { setInviteError(''); setInviteVisible(true); }} style={styles.primaryButton}><MaterialCommunityIcons color={colors.textOnPrimary} name="account-plus-outline" size={18} /><Text style={styles.primaryButtonText}>Invitar integrante</Text></Pressable> : null}
      </View>

      {adminStudies.length > 1 ? <View style={styles.studyChoices}>{adminStudies.map((study) => <Pressable key={study.id} onPress={() => setStudyId(study.id)} style={[styles.studyChip, String(selectedStudy?.id) === String(study.id) && styles.studyChipActive]}><Text style={[styles.studyChipText, String(selectedStudy?.id) === String(study.id) && styles.studyChipTextActive]}>{study.name}</Text></Pressable>)}</View> : null}

      {!selectedStudy ? (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Todavía no administrás un estudio</Text>
          <Text style={styles.bodyText}>La creación inicial está habilitada por el administrador de la plataforma. Unirte requiere una invitación aceptada.</Text>
          {mayCreateStudy ? <><TextInput onChangeText={setNewStudyName} placeholder="Nombre del estudio jurídico" placeholderTextColor={colors.textMuted} style={styles.input} value={newStudyName} /><Pressable disabled={busy || !newStudyName.trim()} onPress={handleCreateStudy} style={styles.primaryButton}>{busy ? <ActivityIndicator color={colors.textOnPrimary} /> : <Text style={styles.primaryButtonText}>Crear estudio</Text>}</Pressable></> : <Text style={styles.infoBanner}>Si necesitás crear el primer estudio, solicitá que habiliten tu cuenta.</Text>}
        </View>
      ) : <>
        <View style={styles.searchRow}><TextInput onChangeText={setQuery} placeholder="Buscar integrante por nombre, rol o correo" placeholderTextColor={colors.textMuted} style={styles.searchInput} value={query} /><Pressable onPress={load} style={styles.iconButton}><MaterialCommunityIcons color={colors.textSecondary} name="refresh" size={20} /></Pressable></View>
        <View style={styles.metricsRow}>
          <Metric colors={colors} label="Integrantes" value={metrics.members ?? members.length} styles={styles} />
          <Metric colors={colors} label="Abogados activos" value={metrics.lawyers ?? members.filter((item) => item.role === 'LAWYER').length} styles={styles} />
          <Metric colors={colors} label="Invitaciones pendientes" value={metrics.pendingInvitations ?? pendingCount} styles={styles} />
          <Metric colors={colors} label="Causas del estudio" value={metrics.cases ?? 0} styles={styles} />
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Integrantes · {selectedStudy.name}</Text>
          <Text style={styles.bodyText}>Un integrante obtiene acceso al estudio después de aceptar su invitación. Abogados y colaboradores solo ven las causas asignadas.</Text>
          {visibleMembers.length ? visibleMembers.map((member) => <View key={member.id} style={styles.memberCard}>
            <View style={styles.memberCopy}><Text style={styles.memberName}>{member.name}</Text><Text style={styles.memberEmail}>{member.email}</Text><Text style={styles.memberMeta}>{member.status === 'ACTIVE' ? 'Activo' : 'Inactivo'} · {member.assignments?.length || 0} causas asignadas</Text></View>
            <View style={styles.memberActions}><RolePill colors={colors} role={member.role} styles={styles} />{member.status === 'ACTIVE' ? <><View style={styles.roleChoices}>{ROLES.map((role) => <Pressable disabled={busy} key={role.key} onPress={() => changeRole(member, role.key)} style={[styles.roleChoice, member.role === role.key && styles.roleChoiceActive]}><Text style={[styles.roleChoiceText, member.role === role.key && styles.roleChoiceTextActive]}>{role.label}</Text></Pressable>)}</View><Pressable disabled={busy} onPress={() => removeMember(member)} style={styles.removeButton}><MaterialCommunityIcons color={colors.danger} name="account-remove-outline" size={18} /><Text style={styles.removeText}>Quitar</Text></Pressable></> : null}</View>
          </View>) : <EmptyState icon="account-group-outline" title="Sin integrantes para mostrar" message={query ? 'Probá con otro nombre o correo.' : 'Cuando una persona acepte una invitación aparecerá en esta lista.'} />}
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Invitaciones · {pendingCount} pendientes</Text>
          {invitations.length ? invitations.map((item) => <View key={item.id} style={styles.invitationRow}><View style={styles.memberCopy}><Text style={styles.memberName}>{item.email}</Text><Text style={styles.memberEmail}>{roleLabel(item.role)} · vence {new Date(item.expiresAt).toLocaleDateString()}</Text><Text style={styles.memberMeta}>Correo: {deliveryLabel(item.deliveryStatus)}</Text>{item.deliveryStatus === 'FAILED' ? <Text accessibilityRole="alert" style={styles.memberMeta}>{deliveryErrorMessage(item.deliveryErrorCode)}</Text> : null}</View><View style={styles.inviteRight}><Text style={[styles.statusText, item.status !== 'PENDING' && styles.statusTextMuted]}>{ACCESS_STATUS[item.status] || item.status}</Text>{item.status === 'PENDING' ? <View style={styles.inviteActions}><Pressable disabled={busy} onPress={() => invitationAction(item, 'resend')} style={styles.smallButton}><Text style={styles.smallButtonText}>Reenviar</Text></Pressable><Pressable disabled={busy} onPress={() => invitationAction(item, 'revoke')} style={styles.smallButton}><Text style={[styles.smallButtonText, { color: colors.danger }]}>Revocar</Text></Pressable></View> : null}</View></View>) : <EmptyState icon="email-check-outline" title="Sin invitaciones" message="Las invitaciones pendientes y sus estados aparecerán aquí." />}
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Roles y permisos</Text>
          {ROLES.map((role) => <View key={role.key} style={styles.roleInfo}><RolePill colors={colors} role={role.key} styles={styles} /><Text style={styles.bodyText}>{role.summary}</Text></View>)}
          <Text style={styles.infoBanner}>Los cambios de rol se aplican en este estudio. La autorización de cada acción se valida en el servidor.</Text>
        </View>
      </>}

      {error ? <Text accessibilityRole="alert" style={styles.errorText}>{error}</Text> : null}
      <Modal animationType="fade" transparent visible={inviteVisible} onRequestClose={() => setInviteVisible(false)}>
        <View style={styles.backdrop}><View style={styles.modal}>
          <Text style={styles.modalTitle}>Invitar integrante</Text><Text style={styles.bodyText}>La invitación no da acceso automáticamente. La persona debe verificar su correo y aceptarla.</Text>
          <TextInput autoCapitalize="none" autoCorrect={false} keyboardType="email-address" onChangeText={setInviteEmail} placeholder="correo@estudio.com" placeholderTextColor={colors.textMuted} style={styles.input} value={inviteEmail} />
          <Text style={styles.fieldLabel}>Rol dentro del estudio</Text><View style={styles.roleChoices}>{ROLES.map((role) => <Pressable key={role.key} onPress={() => setInviteRole(role.key)} style={[styles.roleChoice, inviteRole === role.key && styles.roleChoiceActive]}><Text style={[styles.roleChoiceText, inviteRole === role.key && styles.roleChoiceTextActive]}>{role.label}</Text></Pressable>)}</View>
          {inviteError ? <Text accessibilityRole="alert" style={styles.errorText}>{inviteError}</Text> : null}
          <View style={styles.modalActions}><Pressable disabled={busy} onPress={() => setInviteVisible(false)} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>Cancelar</Text></Pressable><Pressable disabled={busy || !inviteEmail.trim()} onPress={handleInvite} style={styles.primaryButton}>{busy ? <ActivityIndicator color={colors.textOnPrimary} /> : <Text style={styles.primaryButtonText}>Enviar invitación</Text>}</Pressable></View>
        </View></View>
      </Modal>
    </ScrollView>
  );
}

function roleLabel(role) { return ROLES.find((item) => item.key === role)?.label || 'Abogado'; }
function deliveryLabel(status) { return ({ WAITING_CONFIGURATION: 'pendiente de configuración', QUEUED: 'en cola', SENDING: 'enviando', SENT: 'aceptado por Resend', FAILED: 'falló el envío' })[status] || 'sin estado'; }
function deliveryErrorMessage(code) { return code === 'RESEND_HTTP_403' ? 'Resend rechazó el remitente o destinatario (403). Revisá el dominio y el remitente configurados en Resend.' : code === 'INVITATION_SUPERSEDED' ? 'Entrega cancelada porque se generó un enlace nuevo.' : code === 'INVITATION_REVOKED' ? 'Entrega cancelada porque se revocó la invitación.' : code ? `No se pudo enviar el correo (${code}). La invitación sigue disponible en la bandeja de la persona destinataria.` : 'No se pudo enviar el correo. La invitación sigue disponible en la bandeja de la persona destinataria.'; }

function Metric({ colors, label, value, styles }) { return <View style={styles.metricCard}><Text style={styles.metricLabel}>{label}</Text><Text style={[styles.metricValue, { color: colors.text }]}>{value}</Text></View>; }
function RolePill({ colors, role, styles }) { return <View style={[styles.rolePill, role === 'ADMIN' && styles.roleAdmin, role === 'LAWYER' && styles.roleLawyer, role === 'COLLABORATOR' && styles.roleCollaborator]}><Text style={[styles.rolePillText, { color: role === 'ADMIN' ? colors.primary : colors.text }]}>{roleLabel(role)}</Text></View>; }

const createStyles = (colors, layout) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { width: '100%', maxWidth: 1320, alignSelf: 'center', padding: layout.gutter, gap: 18, paddingBottom: 36 },
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 18, flexWrap: 'wrap' },
  headingCopy: { flex: 1, minWidth: 220 },
  title: { color: colors.text, fontSize: layout.isPhone ? 25 : 32, fontWeight: '800' },
  subtitle: { color: colors.textSecondary, fontSize: 14, marginTop: 5, lineHeight: 21 },
  primaryButton: { minHeight: 46, paddingHorizontal: 17, borderRadius: 14, backgroundColor: colors.primary, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  primaryButtonText: { color: colors.textOnPrimary, fontWeight: '700', fontSize: 14 },
  studyChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  studyChip: { borderRadius: 99, borderWidth: 1, borderColor: colors.borderSoft, paddingHorizontal: 14, paddingVertical: 9 },
  studyChipActive: { backgroundColor: colors.accentSoft, borderColor: colors.primary },
  studyChipText: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
  studyChipTextActive: { color: colors.primary },
  searchRow: { flexDirection: 'row', gap: 10 },
  searchInput: { flex: 1, minHeight: 46, borderRadius: 14, borderWidth: 1, borderColor: colors.borderSoft, backgroundColor: colors.card, paddingHorizontal: 14, color: colors.text },
  iconButton: { width: 46, height: 46, borderRadius: 14, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.borderSoft, alignItems: 'center', justifyContent: 'center' },
  metricsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metricCard: { flex: 1, minWidth: layout.isPhone ? '46%' : 170, borderRadius: 17, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.borderSoft, padding: 15 },
  metricLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: '600' },
  metricValue: { fontSize: 25, fontWeight: '800', marginTop: 6 },
  panel: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.borderSoft, borderRadius: 20, padding: layout.isPhone ? 15 : 21, gap: 13 },
  panelTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
  bodyText: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, flexShrink: 1 },
  memberCard: { borderTopWidth: 1, borderTopColor: colors.borderSoft, paddingVertical: 13, gap: 12, flexDirection: layout.isPhone ? 'column' : 'row', alignItems: layout.isPhone ? 'stretch' : 'center' },
  memberCopy: { flex: 1, minWidth: 130, gap: 3 },
  memberName: { color: colors.text, fontSize: 14, fontWeight: '700' },
  memberEmail: { color: colors.textSecondary, fontSize: 12 },
  memberMeta: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  memberActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 7 },
  rolePill: { alignSelf: 'flex-start', borderRadius: 99, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: colors.accentSoft },
  roleAdmin: { backgroundColor: 'rgba(55,128,200,0.16)' },
  roleLawyer: { backgroundColor: 'rgba(70,160,100,0.16)' },
  roleCollaborator: { backgroundColor: 'rgba(120,125,140,0.16)' },
  rolePillText: { fontSize: 11, fontWeight: '700' },
  roleChoices: { flexDirection: 'row', gap: 5, flexWrap: 'wrap' },
  roleChoice: { borderWidth: 1, borderColor: colors.borderSoft, borderRadius: 9, paddingHorizontal: 8, paddingVertical: 6 },
  roleChoiceActive: { backgroundColor: colors.accentSoft, borderColor: colors.primary },
  roleChoiceText: { color: colors.textSecondary, fontSize: 10, fontWeight: '600' },
  roleChoiceTextActive: { color: colors.primary },
  removeButton: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 7 },
  removeText: { color: colors.danger, fontSize: 11, fontWeight: '700' },
  invitationRow: { borderTopWidth: 1, borderTopColor: colors.borderSoft, paddingVertical: 12, flexDirection: 'row', gap: 12, alignItems: 'center' },
  inviteRight: { alignItems: 'flex-end', gap: 7 },
  inviteActions: { flexDirection: 'row', gap: 7 },
  statusText: { color: colors.success, fontSize: 12, fontWeight: '700' },
  statusTextMuted: { color: colors.textMuted },
  smallButton: { borderWidth: 1, borderColor: colors.borderSoft, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 7 },
  smallButtonText: { color: colors.primary, fontSize: 11, fontWeight: '700' },
  roleInfo: { borderTopWidth: 1, borderTopColor: colors.borderSoft, paddingTop: 12, gap: 9 },
  infoBanner: { color: colors.textSecondary, backgroundColor: colors.accentSoft, borderRadius: 12, padding: 12, fontSize: 12, lineHeight: 18 },
  input: { minHeight: 46, borderWidth: 1, borderColor: colors.borderSoft, borderRadius: 13, paddingHorizontal: 13, color: colors.text, backgroundColor: colors.background },
  fieldLabel: { color: colors.text, fontSize: 13, fontWeight: '700' },
  errorText: { color: colors.danger, fontSize: 13, lineHeight: 19 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 18 },
  modal: { width: '100%', maxWidth: 520, backgroundColor: colors.card, borderRadius: 20, padding: 22, gap: 14 },
  modalTitle: { color: colors.text, fontWeight: '800', fontSize: 20 },
  modalActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 9 },
  secondaryButton: { minHeight: 44, borderRadius: 12, paddingHorizontal: 16, justifyContent: 'center', backgroundColor: colors.backgroundAlt },
  secondaryButtonText: { color: colors.textSecondary, fontSize: 13, fontWeight: '700' },
});
