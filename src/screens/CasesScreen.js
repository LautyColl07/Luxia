import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import CaseScopeBadge from '../components/CaseScopeBadge';
import CaseScopeFilter from '../components/CaseScopeFilter';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import LegalStudySelector from '../components/LegalStudySelector';
import LoadingState from '../components/LoadingState';
import StatusBadge from '../components/StatusBadge';
import { useWorkContext, getCaseScopeFromWorkContext } from '../context/WorkContextContext';
import { useAppTheme } from '../context/ThemeContext';
import {
  deleteCase,
  getCases,
  getLegalStudies,
  WORK_CONTEXT_TYPES,
} from '../services/api';
import { formatDate } from '../utils/date';

export default function CasesScreen({ navigation }) {
  const { colors } = useAppTheme();
  const { activeContext, isReady: isWorkContextReady, setActiveContext } = useWorkContext();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [legalStudies, setLegalStudies] = useState([]);
  const [selectedScope, setSelectedScope] = useState('all');
  const [selectedLegalStudyId, setSelectedLegalStudyId] = useState(null);
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isWorkContextReady) {
      return;
    }

    const nextScope = getCaseScopeFromWorkContext(activeContext);
    setSelectedScope(nextScope);
    setSelectedLegalStudyId(activeContext?.type === WORK_CONTEXT_TYPES.LEGAL_STUDY ? activeContext?.legalStudyId || null : null);
  }, [activeContext, isWorkContextReady]);

  const loadCases = useCallback(
    async (isRefresh = false, overrides = {}) => {
      try {
        if (isRefresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        setError('');
        const studies = await getLegalStudies();
        const nextScope = overrides.scope || selectedScope;
        const nextContext = overrides.activeContextOverride || activeContext;
        const fallbackStudyId =
          overrides.legalStudyId ||
          selectedLegalStudyId ||
          nextContext?.legalStudyId ||
          studies[0]?.id ||
          null;
        const effectiveLegalStudyId = nextScope === 'legal_study' ? fallbackStudyId : null;
        const items = await getCases({
          scope: nextScope,
          legalStudyId: effectiveLegalStudyId,
        });

        setLegalStudies(Array.isArray(studies) ? studies : []);
        setSelectedLegalStudyId(effectiveLegalStudyId);
        setCases(Array.isArray(items) ? items : []);
      } catch (loadError) {
        console.error('[CasesScreen] Error cargando causas juridicas:', loadError);
        setError(
          loadError instanceof Error
            ? loadError.message
            : 'No pudimos cargar las causas registradas.'
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [activeContext, selectedLegalStudyId, selectedScope]
  );

  useFocusEffect(
    useCallback(() => {
      if (!isWorkContextReady) {
        return undefined;
      }

      void loadCases();
      return undefined;
    }, [isWorkContextReady, loadCases])
  );

  const handleScopeChange = useCallback(
    async (nextScope) => {
      setSelectedScope(nextScope);

      if (nextScope === 'private') {
        const nextContext = { type: WORK_CONTEXT_TYPES.PERSONAL };
        await setActiveContext(nextContext);
        await loadCases(false, { scope: nextScope, legalStudyId: null, activeContextOverride: nextContext });
      } else if (nextScope === 'all') {
        const nextContext = { type: WORK_CONTEXT_TYPES.ALL };
        await setActiveContext(nextContext);
        await loadCases(false, { scope: nextScope, legalStudyId: null, activeContextOverride: nextContext });
      } else {
        const nextLegalStudyId = selectedLegalStudyId || legalStudies[0]?.id || null;
        setSelectedLegalStudyId(nextLegalStudyId);
        if (nextLegalStudyId) {
          const nextContext = {
            type: WORK_CONTEXT_TYPES.LEGAL_STUDY,
            legalStudyId: nextLegalStudyId,
          };
          await setActiveContext(nextContext);
          await loadCases(false, {
            scope: nextScope,
            legalStudyId: nextLegalStudyId,
            activeContextOverride: nextContext,
          });
        }
      }
    },
    [legalStudies, loadCases, selectedLegalStudyId, setActiveContext]
  );

  const handleStudyChange = useCallback(
    async (nextLegalStudyId) => {
      setSelectedLegalStudyId(nextLegalStudyId);
      setSelectedScope('legal_study');
      const nextContext = {
        type: WORK_CONTEXT_TYPES.LEGAL_STUDY,
        legalStudyId: nextLegalStudyId,
      };
      await setActiveContext(nextContext);
      await loadCases(false, {
        scope: 'legal_study',
        legalStudyId: nextLegalStudyId,
        activeContextOverride: nextContext,
      });
    },
    [loadCases, setActiveContext]
  );

  const handleDeleteCase = useCallback(
    (caseItem) => {
      Alert.alert(
        'Eliminar causa',
        `Vas a eliminar ${caseItem?.title || 'esta causa'}. Quieres continuar?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Eliminar',
            style: 'destructive',
            onPress: async () => {
              try {
                await deleteCase(caseItem?.id);
                await loadCases();
              } catch (deleteError) {
                setError(
                  deleteError instanceof Error
                    ? deleteError.message
                    : 'No pudimos eliminar la causa.'
                );
              }
            },
          },
        ]
      );
    },
    [loadCases]
  );

  if ((loading && !cases.length) || !isWorkContextReady) {
    return (
      <LoadingState
        title="Cargando causas"
        message="Estamos reuniendo las causas privadas y compartidas disponibles para vos."
      />
    );
  }

  if (error && !cases.length) {
    return (
      <ErrorState
        title="No pudimos cargar las causas"
        message={error}
        onRetry={loadCases}
      />
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Causas</Text>
          <Text style={styles.subtitle}>
            Alterna entre tus causas particulares, las del Estudio Juridico o toda tu cartera disponible.
          </Text>
        </View>

        <Pressable onPress={() => navigation.navigate('NewCase')} style={styles.primaryButton}>
          <MaterialCommunityIcons color={colors.textOnPrimary} name="plus" size={18} />
          <Text style={styles.primaryButtonText}>Nueva causa</Text>
        </Pressable>
      </View>

      <View style={styles.filtersCard}>
        <CaseScopeFilter onChange={handleScopeChange} value={selectedScope} />
        {selectedScope === 'legal_study' && legalStudies.length ? (
          <LegalStudySelector
            onChange={handleStudyChange}
            selectedLegalStudyId={selectedLegalStudyId}
            studies={legalStudies}
          />
        ) : null}
      </View>

      <FlatList
        contentContainerStyle={styles.listContent}
        data={cases}
        keyExtractor={(item) => String(item?.id)}
        refreshControl={
          <RefreshControl
            onRefresh={() => void loadCases(true)}
            refreshing={refreshing}
            tintColor={colors.primary}
          />
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Pressable
              onPress={() => navigation.navigate('CaseDetail', { caseId: item?.id })}
              style={styles.cardBody}
            >
              <View style={styles.cardTopRow}>
                <Text style={styles.cardTitle}>{item?.title || 'Causa sin titulo'}</Text>
                <StatusBadge status={item?.status} />
              </View>

              <Text style={styles.description}>
                {item?.description || 'Sin informacion adicional registrada.'}
              </Text>

              <CaseScopeBadge
                isReadOnly={item?.permissions?.isReadOnly}
                legalStudyName={item?.legalStudyName}
                scope={item?.scope}
              />

              <View style={styles.metaRow}>
                <MaterialCommunityIcons color={colors.textSecondary} name="scale-balance" size={16} />
                <Text style={styles.metaText}>{item?.court || 'Juzgado a confirmar'}</Text>
              </View>

              <View style={styles.metaRow}>
                <MaterialCommunityIcons color={colors.textSecondary} name="calendar-outline" size={16} />
                <Text style={styles.metaText}>
                  Ultima actualizacion: {formatDate(item?.updatedAt || item?.createdAt)}
                </Text>
              </View>
            </Pressable>

            <View style={styles.actionsRow}>
              <Pressable
                onPress={() => navigation.navigate('CaseDetail', { caseId: item?.id })}
                style={styles.secondaryAction}
              >
                <Text style={styles.secondaryActionText}>Abrir</Text>
              </Pressable>

              {item?.permissions?.canEdit ? (
                <Pressable
                  onPress={() => navigation.navigate('NewCase', { caseId: item?.id })}
                  style={styles.secondaryAction}
                >
                  <Text style={styles.secondaryActionText}>Editar</Text>
                </Pressable>
              ) : null}

              {item?.permissions?.canDelete ? (
                <Pressable onPress={() => handleDeleteCase(item)} style={styles.dangerAction}>
                  <Text style={styles.dangerActionText}>Eliminar</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        )}
        ListEmptyComponent={
          <EmptyState
            actionLabel="Nueva causa"
            icon="briefcase-search-outline"
            message="No hay causas disponibles con los filtros actuales."
            onAction={() => navigation.navigate('NewCase')}
            title="Sin causas registradas"
          />
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      paddingTop: 62,
      paddingHorizontal: 22,
      paddingBottom: 18,
      gap: 16,
    },
    headerCopy: {
      gap: 6,
    },
    title: {
      color: colors.text,
      fontSize: 28,
      fontWeight: '700',
    },
    subtitle: {
      color: colors.textSecondary,
      fontSize: 14,
      lineHeight: 20,
      maxWidth: '92%',
    },
    primaryButton: {
      alignSelf: 'flex-start',
      backgroundColor: colors.primary,
      borderRadius: 18,
      paddingHorizontal: 16,
      paddingVertical: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    primaryButtonText: {
      color: colors.textOnPrimary,
      fontSize: 14,
      fontWeight: '700',
    },
    filtersCard: {
      marginHorizontal: 18,
      marginBottom: 16,
      backgroundColor: colors.card,
      borderRadius: 24,
      padding: 16,
      gap: 14,
      borderWidth: 1,
      borderColor: colors.borderSoft,
    },
    listContent: {
      paddingHorizontal: 18,
      paddingBottom: 28,
      gap: 12,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: 24,
      padding: 18,
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.14,
      shadowRadius: 18,
      elevation: 4,
      borderWidth: 1,
      borderColor: colors.borderSoft,
      gap: 16,
    },
    cardBody: {
      gap: 6,
    },
    cardTopRow: {
      flexDirection: 'row',
      gap: 12,
      alignItems: 'flex-start',
      justifyContent: 'space-between',
    },
    cardTitle: {
      flex: 1,
      color: colors.text,
      fontSize: 18,
      fontWeight: '700',
    },
    description: {
      color: colors.textSecondary,
      fontSize: 14,
      lineHeight: 20,
      marginTop: 6,
    },
    metaRow: {
      flexDirection: 'row',
      gap: 8,
      alignItems: 'center',
      marginTop: 6,
    },
    metaText: {
      color: colors.textSecondary,
      fontSize: 13,
      flex: 1,
    },
    actionsRow: {
      flexDirection: 'row',
      gap: 10,
      flexWrap: 'wrap',
    },
    secondaryAction: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 14,
      backgroundColor: colors.backgroundAlt,
      borderWidth: 1,
      borderColor: colors.borderSoft,
    },
    secondaryActionText: {
      color: colors.text,
      fontSize: 13,
      fontWeight: '700',
    },
    dangerAction: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 14,
      backgroundColor: colors.dangerSoft,
      borderWidth: 1,
      borderColor: colors.danger,
    },
    dangerActionText: {
      color: colors.danger,
      fontSize: 13,
      fontWeight: '700',
    },
  });
