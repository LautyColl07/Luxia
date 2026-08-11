import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '../context/ThemeContext';

const NAV_ITEMS = [
  { label: 'Inicio', route: 'Inicio', icon: 'view-dashboard-outline' },
  { label: 'Causas', route: 'Causas', icon: 'briefcase-outline' },
  { label: 'Calendario', route: 'Calendario', icon: 'calendar-month-outline' },
  { label: 'Documentos', route: 'Documentos', icon: 'file-document-outline' },
  { label: 'Más', route: 'Mas', icon: 'dots-horizontal-circle-outline' },
];

export default function WebSidebar({ activeRoute = 'Inicio', currentUser, onNavigate, collapsed = false, onToggle }) {
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  const userName = currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Usuario';
  const userInitial = userName.slice(0, 1).toUpperCase();

  return (
    <View style={[styles.sidebar, collapsed && styles.sidebarCollapsed]}>
      <View>
        <View style={[styles.brandRow, collapsed && styles.brandRowCollapsed]}>
          <View style={styles.logoCircle}>
            <Image
              accessibilityLabel="Logo LuxIA"
              source={require('../../assets/luxia-logo.png')}
              style={styles.logo}
            />
          </View>
          {!collapsed ? (
            <View style={styles.brandCopy}>
              <Text style={styles.brand}>LuxIA</Text>
              <Text style={styles.brandCaption}>Gestión jurídica</Text>
            </View>
          ) : null}
          <Pressable
            accessibilityLabel={collapsed ? 'Abrir barra lateral' : 'Cerrar barra lateral'}
            accessibilityRole="button"
            onPress={onToggle}
            style={({ hovered, pressed }) => [
              styles.toggleButton,
              hovered && styles.toggleButtonHovered,
              pressed && styles.navItemPressed,
            ]}
          >
            <MaterialCommunityIcons
              color={colors.sidebarTextMuted}
              name={collapsed ? 'chevron-right' : 'chevron-left'}
              size={18}
            />
          </Pressable>
        </View>

        {!collapsed ? <Text style={styles.sectionLabel}>ESPACIO DE TRABAJO</Text> : null}
        <View style={styles.navList}>
          {NAV_ITEMS.map((item) => {
            const isActive = activeRoute === item.route;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
                key={item.route}
                onPress={() => onNavigate(item.route)}
                style={({ hovered, pressed }) => [
                  styles.navItem,
                  collapsed && styles.navItemCollapsed,
                  isActive && styles.navItemActive,
                  hovered && !isActive && styles.navItemHovered,
                  pressed && styles.navItemPressed,
                ]}
              >
                <MaterialCommunityIcons
                  color={isActive ? colors.gold : colors.sidebarTextMuted}
                  name={item.icon}
                  size={21}
                />
                {!collapsed ? <Text style={[styles.navLabel, isActive && styles.navLabelActive]}>{item.label}</Text> : null}
                {isActive ? <View style={styles.activeRail} /> : null}
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.sidebarFooter}>
        <Pressable
          accessibilityRole="button"
          onPress={() => onNavigate('Mas')}
          style={({ hovered }) => [styles.profileCard, hovered && styles.profileCardHovered]}
        >
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{userInitial}</Text>
          </View>
          {!collapsed ? (
            <View style={styles.profileCopy}>
              <Text numberOfLines={1} style={styles.profileName}>{userName}</Text>
              <Text numberOfLines={1} style={styles.profileMeta}>Perfil y configuración</Text>
            </View>
          ) : null}
          {!collapsed ? <MaterialCommunityIcons color={colors.sidebarTextMuted} name="chevron-right" size={18} /> : null}
        </Pressable>
        {!collapsed ? <Text style={styles.version}>LuxIA · espacio profesional</Text> : null}
      </View>
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  sidebar: {
    position: 'absolute',
    zIndex: 10,
    left: 0,
    top: 0,
    bottom: 0,
    width: 256,
    backgroundColor: colors.sidebarBackground,
    paddingHorizontal: 18,
    paddingTop: 26,
    paddingBottom: 18,
    justifyContent: 'space-between',
    borderRightWidth: 1,
    borderRightColor: colors.sidebarBorder,
  },
  sidebarCollapsed: {
    width: 78,
    paddingHorizontal: 10,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 8,
    marginBottom: 40,
  },
  brandRowCollapsed: {
    paddingHorizontal: 0,
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  logo: {
    width: 46,
    height: 46,
    resizeMode: 'contain',
  },
  logoCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  brandCopy: {
    flex: 1,
    minWidth: 0,
  },
  brand: {
    color: colors.sidebarText,
    fontSize: 21,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  brandCaption: {
    color: colors.sidebarTextMuted,
    fontSize: 11,
    marginTop: 1,
  },
  sectionLabel: {
    color: colors.sidebarTextMuted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  navList: {
    gap: 5,
  },
  navItem: {
    minHeight: 50,
    borderRadius: 14,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    position: 'relative',
  },
  navItemCollapsed: {
    justifyContent: 'center',
    paddingHorizontal: 0,
  },
  navItemActive: {
    backgroundColor: colors.sidebarActive,
  },
  navItemHovered: {
    backgroundColor: colors.sidebarHover,
  },
  navItemPressed: {
    opacity: 0.78,
  },
  navLabel: {
    color: colors.sidebarTextMuted,
    fontSize: 14,
    fontWeight: '600',
  },
  navLabelActive: {
    color: colors.sidebarText,
    fontWeight: '800',
  },
  activeRail: {
    position: 'absolute',
    left: 0,
    top: 11,
    bottom: 11,
    width: 3,
    borderRadius: 2,
    backgroundColor: colors.gold,
  },
  toggleButton: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.sidebarMark,
  },
  toggleButtonHovered: {
    backgroundColor: colors.sidebarHover,
  },
  sidebarFooter: {
    gap: 12,
  },
  profileCard: {
    minHeight: 62,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  profileCardHovered: {
    backgroundColor: colors.sidebarHover,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.primaryDeep,
    fontSize: 14,
    fontWeight: '800',
  },
  profileCopy: {
    flex: 1,
    minWidth: 0,
  },
  profileName: {
    color: colors.sidebarText,
    fontSize: 13,
    fontWeight: '700',
  },
  profileMeta: {
    color: colors.sidebarTextMuted,
    fontSize: 11,
    marginTop: 3,
  },
  version: {
    color: colors.sidebarTextMuted,
    fontSize: 10,
    paddingHorizontal: 12,
  },
});
