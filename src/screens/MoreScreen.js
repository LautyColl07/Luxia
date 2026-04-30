import Constants from 'expo-constants';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { signOut } from 'firebase/auth';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { auth } from '../config/firebase';
import ErrorState from '../components/ErrorState';
import LoadingState from '../components/LoadingState';
import colors from '../constants/colors';
import { getMe, getNotifications } from '../services/api';

const MENU_ITEMS = [
  { key: 'settings', label: 'Configuracion', icon: 'cog-outline' },
  { key: 'notifications', label: 'Notificaciones', icon: 'bell-outline' },
  { key: 'help', label: 'Ayuda', icon: 'lifebuoy' },
];

export default function MoreScreen() {
  const [profile, setProfile] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadProfile = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const [user, items] = await Promise.all([getMe(), getNotifications().catch(() => [])]);
      setProfile(user);
      setNotifications(items);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadProfile();
    }, [loadProfile])
  );

  const handleLogout = useCallback(() => {
    if (!auth) {
      Alert.alert('Sesion', 'No encontramos la configuracion de autenticacion en esta sesion.');
      return;
    }

    Alert.alert('Cerrar sesion', 'Quieres salir de tu cuenta?', [
      { style: 'cancel', text: 'Cancelar' },
      {
        style: 'destructive',
        text: 'Cerrar sesion',
        onPress: async () => {
          try {
            await signOut(auth);
          } catch (logoutError) {
            Alert.alert(
              'Error',
              logoutError instanceof Error ? logoutError.message : 'No pudimos cerrar la sesion.'
            );
          }
        },
      },
    ]);
  }, []);

  if (loading && !profile) {
    return <LoadingState message="Estamos preparando el perfil del modulo y sus opciones auxiliares." title="Cargando perfil" />;
  }

  if (error && !profile) {
    return <ErrorState message={error} onRetry={loadProfile} title="No pudimos cargar el perfil" />;
  }

  const unreadCount = notifications.filter((item) => !item.read).length;

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} style={styles.screen}>
      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{profile.name.slice(0, 2).toUpperCase()}</Text>
        </View>
        <Text style={styles.profileName}>{profile.name}</Text>
        <Text style={styles.profileEmail}>{profile.email}</Text>
        <View style={styles.roleBadge}>
          <Text style={styles.roleText}>{profile.role}</Text>
        </View>
      </View>

      <View style={styles.menuCard}>
        {MENU_ITEMS.map((item) => (
          <Pressable
            key={item.key}
            onPress={() => Alert.alert(item.label, 'Esta opcion visual queda lista para integrarse mas adelante.')}
            style={styles.menuRow}
          >
            <View style={styles.menuIcon}>
              <MaterialCommunityIcons color={colors.primary} name={item.icon} size={20} />
            </View>
            <Text style={styles.menuLabel}>{item.label}</Text>
            {item.key === 'notifications' && unreadCount > 0 ? (
              <View style={styles.menuBadge}>
                <Text style={styles.menuBadgeText}>{unreadCount}</Text>
              </View>
            ) : (
              <MaterialCommunityIcons color={colors.textSecondary} name="chevron-right" size={20} />
            )}
          </Pressable>
        ))}
      </View>

      <Pressable onPress={handleLogout} style={styles.logoutButton}>
        <MaterialCommunityIcons color={colors.danger} name="logout" size={20} />
        <Text style={styles.logoutText}>Cerrar sesion</Text>
      </Pressable>

      <View style={styles.footerCard}>
        <Text style={styles.footerTitle}>Modulo Dashboard</Text>
        <Text style={styles.footerMeta}>Version {Constants.expoConfig?.version || '1.0.0'}</Text>
        <Text style={styles.footerMeta}>Conectado con el usuario real y el servidor del panel.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingTop: 62,
    paddingHorizontal: 20,
    paddingBottom: 34,
    gap: 18,
  },
  profileCard: {
    backgroundColor: colors.primary,
    borderRadius: 30,
    padding: 24,
    alignItems: 'center',
  },
  avatar: {
    width: 74,
    height: 74,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.card,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 1,
  },
  profileName: {
    color: colors.card,
    fontSize: 24,
    fontWeight: '700',
    marginTop: 16,
  },
  profileEmail: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 14,
    marginTop: 6,
  },
  roleBadge: {
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  roleText: {
    color: colors.card,
    fontSize: 12,
    fontWeight: '700',
  },
  menuCard: {
    backgroundColor: colors.card,
    borderRadius: 28,
    paddingHorizontal: 16,
    paddingVertical: 10,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 4,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  menuIcon: {
    width: 42,
    height: 42,
    borderRadius: 16,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  menuLabel: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  menuBadge: {
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  menuBadgeText: {
    color: colors.card,
    fontSize: 12,
    fontWeight: '700',
  },
  logoutButton: {
    backgroundColor: colors.card,
    borderRadius: 22,
    padding: 18,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 4,
  },
  logoutText: {
    color: colors.danger,
    fontSize: 15,
    fontWeight: '700',
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
