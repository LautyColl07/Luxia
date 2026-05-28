import Constants from 'expo-constants';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { signOut } from 'firebase/auth';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import ErrorState from '../components/ErrorState';
import LoadingState from '../components/LoadingState';
import { auth } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { useAppTheme } from '../context/ThemeContext';
import { getMe, getNotifications } from '../services/api';
import { authClient } from '../services/authClient';
import { buildDisplayUser } from '../utils/userDisplay';

const APPEARANCE_OPTIONS = [
  { key: 'system', label: 'Sistema', description: 'Sigue la apariencia del dispositivo.' },
  { key: 'light', label: 'Claro', description: 'Interfaz luminosa y limpia.' },
  { key: 'dark', label: 'Oscuro', description: 'Ideal para trabajar de noche.' },
];

export default function MoreScreen({ navigation }) {
  const { currentUser } = useAuth();
  const { colors, isDark, resolvedTheme, setThemePreference, themePreference } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [profile, setProfile] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [settings, setSettings] = useState({
    hearingReminders: true,
    caseActivity: true,
    dailySummary: false,
  });
  const [loading, setLoading] = useState(true);
  const [sendingReset, setSendingReset] = useState(false);
  const [error, setError] = useState('');

  const loadProfile = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const [user, items] = await Promise.all([getMe(), getNotifications().catch(() => [])]);
      setProfile(user);
      setNotifications(Array.isArray(items) ? items : []);
    } catch (loadError) {
      console.error('[MoreScreen] Error cargando perfil:', loadError);
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'No pudimos cargar la informacion del perfil.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadProfile();
    }, [loadProfile])
  );

  const displayProfile = useMemo(
    () => buildDisplayUser(profile, currentUser),
    [profile, currentUser]
  );
  const unreadCount = notifications.filter((item) => !item?.read).length;
  const accountEmail = displayProfile.email || currentUser?.email || 'Sin email registrado';
  const accountId = currentUser?.uid ? `${currentUser.uid.slice(0, 8)}...` : 'No disponible';

  useEffect(() => {
    if (!notifications.length) {
      return;
    }

    setSettings((current) => ({
      ...current,
      hearingReminders: current.hearingReminders || notifications.some((item) => !item?.read),
      caseActivity: true,
      dailySummary: notifications.length >= 3 ? current.dailySummary : false,
    }));
  }, [notifications]);

  const handleLogout = useCallback(() => {
    if (!auth) {
      Alert.alert(
        'Sesion no disponible',
        'No encontramos la configuracion de autenticacion para cerrar la sesion.'
      );
      return;
    }

    Alert.alert('Cerrar sesion', 'Vas a salir de tu cuenta actual. Quieres continuar?', [
      { style: 'cancel', text: 'Cancelar' },
      {
        style: 'destructive',
        text: 'Cerrar sesion',
        onPress: async () => {
          try {
            await signOut(auth);
          } catch (logoutError) {
            console.error('[MoreScreen] Error cerrando sesion:', logoutError);
            Alert.alert(
              'No pudimos cerrar la sesion',
              logoutError instanceof Error
                ? logoutError.message
                : 'Intenta nuevamente en unos instantes.'
            );
          }
        },
      },
    ]);
  }, []);

  const handlePasswordReset = useCallback(async () => {
    const email = displayProfile.email?.trim();

    if (!email) {
      Alert.alert('Sin email disponible', 'La cuenta actual no tiene un email asociado para recuperar acceso.');
      return;
    }

    try {
      setSendingReset(true);
      await authClient.resetPassword(email);
      Alert.alert('Correo enviado', `Te enviamos las instrucciones de recuperacion a ${email}.`);
    } catch (resetError) {
      console.error('[MoreScreen] Error enviando recuperacion:', resetError);
      Alert.alert(
        'No pudimos enviar el correo',
        resetError instanceof Error ? resetError.message : 'Intenta nuevamente en unos instantes.'
      );
    } finally {
      setSendingReset(false);
    }
  }, [displayProfile.email]);

  const updateSetting = useCallback((key, value) => {
    setSettings((current) => ({ ...current, [key]: value }));
  }, []);

  if (loading && !profile && !currentUser) {
    return (
      <LoadingState
        title="Cargando perfil"
        message="Estamos actualizando tu informacion personal y las opciones disponibles."
      />
    );
  }

  if (error && !profile && !currentUser) {
    return (
      <ErrorState
        title="No pudimos cargar el perfil"
        message={error}
        onRetry={loadProfile}
      />
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} style={styles.screen}>
      <View style={styles.heroCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{displayProfile.initials}</Text>
        </View>
        <Text style={styles.profileName}>{displayProfile.name}</Text>
        <Text style={styles.profileEmail}>{accountEmail}</Text>

        <View style={styles.heroMetaRow}>
          <View style={styles.heroBadge}>
            <MaterialCommunityIcons color={colors.textOnPrimary} name="shield-check-outline" size={16} />
            <Text style={styles.heroBadgeText}>{displayProfile.role}</Text>
          </View>
          <View style={styles.heroBadge}>
            <MaterialCommunityIcons color={colors.textOnPrimary} name="theme-light-dark" size={16} />
            <Text style={styles.heroBadgeText}>
              {resolvedTheme === 'dark' ? 'Modo oscuro' : 'Modo claro'}
            </Text>
          </View>
        </View>
      </View>

      <CardSection
        colors={colors}
        icon="account-circle-outline"
        styles={styles}
        subtitle="Datos vinculados a la sesion actual."
        title="Cuenta"
      >
        <InfoRow label="Email de la cuenta" styles={styles} value={accountEmail} />
        <InfoRow label="Metodo de acceso" styles={styles} value="Firebase Auth" />
        <InfoRow label="Identificador" styles={styles} value={accountId} />
      </CardSection>

      <CardSection
        colors={colors}
        icon="theme-light-dark"
        styles={styles}
        subtitle="Cambia la apariencia de toda la app."
        title="Apariencia"
      >
        <View style={styles.appearanceOptions}>
          {APPEARANCE_OPTIONS.map((option) => {
            const selected = themePreference === option.key;
            return (
              <Pressable
                key={option.key}
                onPress={() => setThemePreference(option.key)}
                style={[styles.appearanceOption, selected && styles.appearanceOptionActive]}
              >
                <View style={styles.appearanceTopRow}>
                  <Text style={[styles.appearanceLabel, selected && styles.appearanceLabelActive]}>
                    {option.label}
                  </Text>
                  {selected ? (
                    <MaterialCommunityIcons color={colors.textOnPrimary} name="check-circle" size={18} />
                  ) : null}
                </View>
                <Text style={[styles.appearanceDescription, selected && styles.appearanceDescriptionActive]}>
                  {option.description}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </CardSection>

      <CardSection
        colors={colors}
        icon="bell-outline"
        styles={styles}
        subtitle="Preferencias basicas para mantenerte al dia."
        title="Notificaciones"
      >
        <PreferenceRow
          colors={colors}
          description="Avisos utiles antes de cada audiencia programada."
          onValueChange={(value) => updateSetting('hearingReminders', value)}
          styles={styles}
          title="Recordatorios de audiencias"
          value={settings.hearingReminders}
        />
        <PreferenceRow
          colors={colors}
          description="Novedades y cambios relevantes en tus expedientes."
          onValueChange={(value) => updateSetting('caseActivity', value)}
          styles={styles}
          title="Actividad de causas"
          value={settings.caseActivity}
        />
        <PreferenceRow
          colors={colors}
          description="Un resumen rapido al comienzo de la jornada."
          onValueChange={(value) => updateSetting('dailySummary', value)}
          styles={styles}
          title="Resumen diario"
          value={settings.dailySummary}
        />
      </CardSection>

      <CardSection
        colors={colors}
        icon="history"
        styles={styles}
        subtitle="Accesos de consulta para revisar lo que paso en la app."
        title="Actividad"
      >
        <ActionRow
          colors={colors}
          description="Ver movimientos recientes del estudio."
          icon="history"
          onPress={() => navigation.navigate('ActivityHistory')}
          styles={styles}
          title="Historial de actividad"
        />
      </CardSection>

      <CardSection
        colors={colors}
        icon="lock-outline"
        styles={styles}
        subtitle="Acciones rapidas para proteger tu acceso."
        title="Seguridad"
      >
        <ActionRow
          colors={colors}
          description={sendingReset ? 'Enviando correo...' : 'Se envia al email principal de la cuenta.'}
          icon="email-fast-outline"
          onPress={handlePasswordReset}
          styles={styles}
          title="Recuperar contrasena"
        />
        <ActionRow
          colors={colors}
          description="Consejos rapidos para volver a entrar a tu cuenta."
          icon="lifebuoy"
          onPress={() => navigation.navigate('HelpAccess')}
          styles={styles}
          title="Ayuda de acceso"
        />
      </CardSection>

      <CardSection
        colors={colors}
        icon="flask-outline"
        styles={styles}
        subtitle="Utilidades visibles para validar integraciones de Luxia."
        title="Herramientas"
      >
        <ActionRow
          colors={colors}
          description="Graba y envia bloques de 5 segundos al backend real mientras la audiencia sigue."
          icon="waveform"
          onPress={() => navigation.navigate('LiveTranscription')}
          styles={styles}
          title="Transcripción en vivo"
        />
        <ActionRow
          colors={colors}
          description="Graba una audiencia, transcribila y exportala como documento."
          icon="microphone-message"
          onPress={() => navigation.navigate('TranscriptionTest')}
          styles={styles}
          title="Transcripción de audiencia"
        />
      </CardSection>

      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{unreadCount}</Text>
          <Text style={styles.summaryLabel}>Alertas sin leer</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{settings.dailySummary ? 'ON' : 'OFF'}</Text>
          <Text style={styles.summaryLabel}>Resumen diario</Text>
        </View>
      </View>

      <Pressable onPress={handleLogout} style={styles.logoutButton}>
        <MaterialCommunityIcons color={colors.danger} name="logout" size={20} />
        <Text style={styles.logoutText}>Cerrar sesion</Text>
      </Pressable>

      {error ? (
        <View style={styles.inlineAlert}>
          <MaterialCommunityIcons color={colors.danger} name="alert-outline" size={18} />
          <Text style={styles.inlineAlertText}>{error}</Text>
        </View>
      ) : null}

      <View style={styles.footerCard}>
        <Text style={styles.footerTitle}>Luxia</Text>
        <Text style={styles.footerMeta}>Version {Constants.expoConfig?.version || '1.0.0'}</Text>
        <Text style={styles.footerMeta}>
          Cuenta conectada con email real y configuracion visual {isDark ? 'oscura' : 'clara'}.
        </Text>
      </View>
    </ScrollView>
  );
}

function CardSection({ children, colors, icon, styles, subtitle, title }) {
  return (
    <View style={styles.sectionCard}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionIcon}>
          <MaterialCommunityIcons color={colors.primary} name={icon} size={18} />
        </View>
        <View style={styles.sectionCopy}>
          <Text style={styles.sectionTitle}>{title}</Text>
          <Text style={styles.sectionSubtitle}>{subtitle}</Text>
        </View>
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function InfoRow({ label, styles, value }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function PreferenceRow({ colors, description, onValueChange, styles, title, value }) {
  return (
    <View style={styles.preferenceRow}>
      <View style={styles.preferenceCopy}>
        <Text style={styles.preferenceTitle}>{title}</Text>
        <Text style={styles.preferenceDescription}>{description}</Text>
      </View>
      <Switch
        onValueChange={onValueChange}
        thumbColor={value ? colors.textOnPrimary : colors.white}
        trackColor={{ false: colors.mutedIcon, true: colors.primary }}
        value={value}
      />
    </View>
  );
}

function ActionRow({ colors, description, icon, onPress, styles, title }) {
  return (
    <Pressable onPress={onPress} style={styles.actionRow}>
      <View style={styles.actionIcon}>
        <MaterialCommunityIcons color={colors.primary} name={icon} size={18} />
      </View>
      <View style={styles.actionCopy}>
        <Text style={styles.actionTitle}>{title}</Text>
        <Text style={styles.actionDescription}>{description}</Text>
      </View>
      <MaterialCommunityIcons color={colors.textMuted} name="chevron-right" size={20} />
    </Pressable>
  );
}

const createStyles = (colors) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingTop: 32,
    paddingHorizontal: 20,
    paddingBottom: 34,
    gap: 18,
  },
  heroCard: {
    backgroundColor: colors.primaryDeep,
    borderRadius: 30,
    padding: 24,
    alignItems: 'center',
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.26,
    shadowRadius: 24,
    elevation: 8,
  },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.textOnPrimary,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 1,
  },
  profileName: {
    color: colors.textOnPrimary,
    fontSize: 24,
    fontWeight: '700',
    marginTop: 16,
    textAlign: 'center',
  },
  profileEmail: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    marginTop: 6,
    textAlign: 'center',
  },
  heroMetaRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: 16,
  },
  heroBadge: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  heroBadgeText: {
    color: colors.textOnPrimary,
    fontSize: 12,
    fontWeight: '700',
  },
  sectionCard: {
    backgroundColor: colors.card,
    borderRadius: 26,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.14,
    shadowRadius: 20,
    elevation: 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  sectionIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionCopy: {
    flex: 1,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
  sectionSubtitle: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },
  sectionBody: {
    marginTop: 18,
    gap: 12,
  },
  infoRow: {
    gap: 5,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  infoLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  infoValue: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  appearanceOptions: {
    gap: 10,
  },
  appearanceOption: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    backgroundColor: colors.backgroundAlt,
  },
  appearanceOptionActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  appearanceTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  appearanceLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  appearanceLabelActive: {
    color: colors.textOnPrimary,
  },
  appearanceDescription: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
  },
  appearanceDescriptionActive: {
    color: 'rgba(255,255,255,0.82)',
  },
  preferenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    justifyContent: 'space-between',
  },
  preferenceCopy: {
    flex: 1,
  },
  preferenceTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  preferenceDescription: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 4,
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionCopy: {
    flex: 1,
  },
  actionTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  actionDescription: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 12,
  },
  summaryCard: {
    flex: 1,
    borderRadius: 22,
    backgroundColor: colors.cardElevated,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    paddingVertical: 18,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  summaryValue: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
  },
  summaryLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 6,
  },
  logoutButton: {
    backgroundColor: colors.card,
    borderRadius: 22,
    padding: 18,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  logoutText: {
    color: colors.danger,
    fontSize: 15,
    fontWeight: '700',
  },
  inlineAlert: {
    backgroundColor: colors.dangerSoft,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  inlineAlertText: {
    color: colors.danger,
    fontSize: 13,
    flex: 1,
  },
  footerCard: {
    paddingHorizontal: 6,
  },
  footerTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  footerMeta: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 6,
  },
});
