import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import LoadingState from '../components/LoadingState';
import { useAppTheme } from '../context/ThemeContext';
import { getDocuments } from '../services/api';
import { formatDate } from '../utils/date';

export default function DocumentsScreen({ navigation }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadDocuments = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const items = await getDocuments();
      setDocuments(Array.isArray(items) ? items : []);
    } catch (loadError) {
      console.error('[DocumentsScreen] Error cargando documentos:', loadError);
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'No pudimos cargar los documentos.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadDocuments();
    }, [loadDocuments])
  );

  if (loading && !documents.length) {
    return (
      <LoadingState
        title="Cargando documentos"
        message="Estamos reuniendo escritos, anexos y prueba documental."
      />
    );
  }

  if (error && !documents.length) {
    return (
      <ErrorState
        title="No pudimos cargar los documentos"
        message={error}
        onRetry={loadDocuments}
      />
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Documentos</Text>
          <Text style={styles.subtitle}>
            Accede al repositorio documental vinculado a tus causas y audiencias.
          </Text>
        </View>

        <Pressable onPress={() => navigation.navigate('UploadDocument')} style={styles.primaryButton}>
          <MaterialCommunityIcons color={colors.textOnPrimary} name="tray-arrow-up" size={18} />
          <Text style={styles.primaryButtonText}>Subir documento</Text>
        </Pressable>
      </View>

      <FlatList
        contentContainerStyle={styles.listContent}
        data={documents}
        keyExtractor={(item) => String(item?.id)}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardTopRow}>
              <View style={styles.iconWrapper}>
                <MaterialCommunityIcons color={colors.primary} name="file-document-outline" size={22} />
              </View>
              <View style={styles.cardTextContent}>
                <Text style={styles.cardTitle}>{item?.fileName || 'Documento sin nombre'}</Text>
                <Text style={styles.cardSubtitle}>{item?.documentType || 'Documento'}</Text>
              </View>
            </View>

            <View style={styles.metaRow}>
              <MaterialCommunityIcons color={colors.textSecondary} name="briefcase-outline" size={16} />
              <Text style={styles.metaText}>{item?.caseTitle || 'Causa sin referencia'}</Text>
            </View>

            <View style={styles.metaRow}>
              <MaterialCommunityIcons color={colors.textSecondary} name="calendar-clock" size={16} />
              <Text style={styles.metaText}>{item?.hearingTitle || 'Audiencia sin referencia'}</Text>
            </View>

            <View style={styles.metaRow}>
              <MaterialCommunityIcons color={colors.textSecondary} name="clock-outline" size={16} />
              <Text style={styles.metaText}>Fecha de carga: {formatDate(item?.uploadedAt)}</Text>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <EmptyState
            actionLabel="Subir documento"
            icon="file-remove-outline"
            message="Todavia no se cargaron documentos."
            onAction={() => navigation.navigate('UploadDocument')}
            title="Sin documentos registrados"
          />
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
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
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
    maxWidth: '82%',
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
  },
  cardTopRow: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
    marginBottom: 14,
  },
  iconWrapper: {
    width: 48,
    height: 48,
    borderRadius: 18,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTextContent: {
    flex: 1,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  cardSubtitle: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
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
});
