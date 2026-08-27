import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAppTheme } from '../context/ThemeContext';

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
}

function groupConversations(items) {
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startYesterday = startToday - 86400000;
  const startSevenDays = startToday - 86400000 * 7;
  const groups = { Hoy: [], Ayer: [], 'Últimos 7 días': [], Anteriores: [] };

  items.forEach((item) => {
    const timestamp = new Date(item.updatedAt || item.createdAt).getTime();
    const group = timestamp >= startToday
      ? 'Hoy'
      : timestamp >= startYesterday
        ? 'Ayer'
        : timestamp >= startSevenDays
          ? 'Últimos 7 días'
          : 'Anteriores';
    groups[group].push(item);
  });

  return groups;
}

export default function LuxConversationSidebar({
  conversations,
  loading,
  query,
  selectedId,
  onChangeQuery,
  onNewConversation,
  onSelectConversation,
  onOpenAction,
  onClose,
  compact = false,
}) {
  const { colors } = useAppTheme();
  const themedStyles = useMemo(() => createStyles(colors), [colors]);
  const groups = useMemo(() => groupConversations(conversations), [conversations]);

  return (
    <View style={[themedStyles.sidebar, compact && themedStyles.sidebarCompact]}>
      <View style={themedStyles.sidebarHeader}>
        <View>
          <Text style={themedStyles.eyebrow}>LUX</Text>
          <Text style={themedStyles.title}>Conversaciones</Text>
        </View>
        {onClose ? (
          <Pressable accessibilityLabel="Cerrar conversaciones" accessibilityRole="button" onPress={onClose} style={themedStyles.closeButton}>
            <MaterialCommunityIcons color={colors.sidebarTextMuted} name="close" size={21} />
          </Pressable>
        ) : null}
      </View>

      <Pressable accessibilityRole="button" onPress={onNewConversation} style={({ pressed }) => [themedStyles.newButton, pressed && themedStyles.pressed]}>
        <MaterialCommunityIcons color="#FFFFFF" name="plus" size={19} />
        <Text style={themedStyles.newButtonText}>Nueva conversación</Text>
      </Pressable>

      <View style={themedStyles.searchBox}>
        <MaterialCommunityIcons color={colors.sidebarTextMuted} name="magnify" size={19} />
        <TextInput
          accessibilityLabel="Buscar conversaciones"
          onChangeText={onChangeQuery}
          placeholder="Buscar conversaciones"
          placeholderTextColor="#8290A3"
          style={themedStyles.searchInput}
          value={query}
        />
        {loading ? <ActivityIndicator color={colors.gold} size="small" /> : null}
      </View>

      <ScrollView contentContainerStyle={themedStyles.listContent} showsVerticalScrollIndicator={false}>
        {Object.entries(groups).map(([label, items]) => (
          <View key={label} style={themedStyles.group}>
            {items.length ? <Text style={themedStyles.groupLabel}>{label}</Text> : null}
            {items.map((item) => {
              const isSelected = item.id === selectedId;
              return (
                <View key={item.id} style={[themedStyles.conversationRow, isSelected && themedStyles.conversationRowSelected]}>
                  <Pressable accessibilityRole="button" accessibilityState={{ selected: isSelected }} onPress={() => onSelectConversation(item.id)} style={themedStyles.conversationButton}>
                    <Text numberOfLines={1} style={[themedStyles.conversationTitle, isSelected && themedStyles.conversationTitleSelected]}>{item.title}</Text>
                    <Text style={themedStyles.conversationMeta}>{item.pendingSync ? 'Pendiente de sincronizar' : formatTime(item.updatedAt)}</Text>
                  </Pressable>
                  <Pressable accessibilityLabel={`Acciones de ${item.title}`} accessibilityRole="button" onPress={() => onOpenAction(item)} style={themedStyles.moreButton}>
                    <MaterialCommunityIcons color={isSelected ? colors.gold : colors.sidebarTextMuted} name="dots-horizontal" size={19} />
                  </Pressable>
                </View>
              );
            })}
          </View>
        ))}

        {!loading && !conversations.length ? (
          <View style={themedStyles.emptyState}>
            <MaterialCommunityIcons color={colors.gold} name="message-text-outline" size={25} />
            <Text style={themedStyles.emptyTitle}>{query ? 'No encontramos conversaciones' : 'Todavía no hay conversaciones'}</Text>
            <Text style={themedStyles.emptyText}>{query ? 'Probá con otro término.' : 'Tus consultas guardadas van a aparecer acá.'}</Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  sidebar: {
    width: 292,
    backgroundColor: colors.sidebarBackground,
    paddingHorizontal: 18,
    paddingTop: 25,
    paddingBottom: 16,
  },
  sidebarCompact: { width: '100%' },
  sidebarHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22, paddingHorizontal: 4 },
  eyebrow: { color: colors.gold, fontSize: 11, fontWeight: '800', letterSpacing: 1.8 },
  title: { color: colors.sidebarText, fontSize: 19, fontWeight: '800', marginTop: 3 },
  closeButton: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.sidebarMark },
  newButton: { minHeight: 46, borderRadius: 13, backgroundColor: colors.primaryHover, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  newButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  pressed: { opacity: 0.78 },
  searchBox: { minHeight: 44, borderRadius: 12, marginTop: 14, marginBottom: 20, paddingHorizontal: 12, backgroundColor: colors.primaryDeep, flexDirection: 'row', alignItems: 'center', gap: 8 },
  searchInput: { flex: 1, minWidth: 0, color: colors.sidebarText, fontSize: 13, paddingVertical: 0 },
  listContent: { paddingBottom: 18 },
  group: { marginBottom: 17 },
  groupLabel: { color: colors.sidebarTextMuted, fontSize: 10, fontWeight: '800', letterSpacing: 1.1, marginBottom: 7, paddingHorizontal: 7 },
  conversationRow: { minHeight: 57, borderRadius: 12, flexDirection: 'row', alignItems: 'center', marginBottom: 3 },
  conversationRowSelected: { backgroundColor: colors.sidebarActive },
  conversationButton: { flex: 1, minWidth: 0, paddingHorizontal: 11, paddingVertical: 9 },
  conversationTitle: { color: colors.sidebarTextMuted, fontSize: 13, fontWeight: '700' },
  conversationTitleSelected: { color: colors.sidebarText },
  conversationMeta: { color: colors.sidebarTextMuted, fontSize: 11, marginTop: 4 },
  moreButton: { width: 39, height: 43, alignItems: 'center', justifyContent: 'center' },
  emptyState: { borderWidth: 1, borderColor: colors.sidebarBorder, borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 7 },
  emptyTitle: { color: colors.sidebarText, fontSize: 13, fontWeight: '700', textAlign: 'center', marginTop: 10 },
  emptyText: { color: colors.sidebarTextMuted, fontSize: 12, textAlign: 'center', lineHeight: 18, marginTop: 5 },
});
