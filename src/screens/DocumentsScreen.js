import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import {
  Alert,
  FlatList,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import LoadingState from '../components/LoadingState';
import { API_ROOT_URL } from '../config/api';
import { useAppTheme } from '../context/ThemeContext';
import { getDocuments } from '../services/api';
import { formatDate } from '../utils/date';

export default function DocumentsScreen({ navigation }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloadingId, setDownloadingId] = useState(null);

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState('');

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

  const filteredDocuments = useMemo(() => {
    const query = searchText.trim().toLowerCase();

    if (!query) return documents;

    return documents.filter((item) => {
      const fileName = String(item?.fileName || '').toLowerCase();
      const documentType = String(item?.documentType || '').toLowerCase();
      const caseTitle = String(item?.caseTitle || '').toLowerCase();
      const hearingTitle = String(item?.hearingTitle || '').toLowerCase();

      return (
        fileName.includes(query) ||
        documentType.includes(query) ||
        caseTitle.includes(query) ||
        hearingTitle.includes(query)
      );
    });
  }, [documents, searchText]);

  const getFileUrl = useCallback((document) => {
    if (!document?.path) {
      return null;
    }

    return `${API_ROOT_URL}${document.path}`;
  }, []);

  const openDocument = useCallback(
    async (document) => {
      const fileUrl = getFileUrl(document);

      if (!fileUrl) {
        Alert.alert(
          'Archivo no disponible.',
          'El documento seleccionado no tiene un archivo asociado.'
        );
        return;
      }

      try {
        await Linking.openURL(fileUrl);
      } catch (openError) {
        console.error('[DocumentsScreen] Error abriendo documento:', openError);
        Alert.alert('No se pudo abrir el documento.', 'Intenta nuevamente.');
      }
    },
    [getFileUrl]
  );

  const downloadDocument = useCallback(
    async (document) => {
      const fileUrl = getFileUrl(document);

      if (!fileUrl) {
        Alert.alert(
          'Archivo no disponible.',
          'El documento seleccionado no tiene un archivo asociado.'
        );
        return;
      }

      try {
        setDownloadingId(document?.id ?? null);

        const fallbackName = `documento-${document?.id || Date.now()}.pdf`;
        const safeFileName = String(document?.fileName || fallbackName).replace(
          /[\\/:*?"<>|]/g,
          '_'
        );

        const localUri = `${FileSystem.documentDirectory}${safeFileName}`;
        const result = await FileSystem.downloadAsync(fileUrl, localUri);

        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(result.uri);
        }

        Alert.alert(
          'Documento listo para abrir o compartir.',
          'La descarga se completó correctamente.'
        );
      } catch (downloadError) {
        console.error('[DocumentsScreen] Error descargando documento:', downloadError);
        Alert.alert('No se pudo descargar el documento.', 'Intenta nuevamente.');
      } finally {
        setDownloadingId(null);
      }
    },
    [getFileUrl]
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
        <View style={styles.headerTopRow}>
          <View style={styles.titleContent}>
            <Text style={styles.title}>Documentos</Text>
            <Text style={styles.subtitle}>
              Accede al repositorio documental vinculado a tus causas y audiencias.
            </Text>
          </View>

          <View style={styles.searchWrapper}>
            {searchOpen && (
              <TextInput
                style={styles.searchInput}
                placeholder="Buscar..."
                placeholderTextColor={colors.textMuted}
                value={searchText}
                onChangeText={setSearchText}
                autoFocus
                onBlur={() => {
                  if (searchText.trim() === '') {
                    setSearchOpen(false);
                  }
                }}
              />
            )}

            <Pressable
              onPress={() => setSearchOpen(true)}
              style={styles.searchButton}
            >
              <MaterialCommunityIcons
                color={searchOpen ? colors.primary : colors.text}
                name="magnify"
                size={26}
              />
            </Pressable>
          </View>
        </View>

        <Pressable
          onPress={() => navigation.navigate('UploadDocument')}
          style={styles.primaryButton}
        >
          <MaterialCommunityIcons
            color={colors.textOnPrimary}
            name="tray-arrow-up"
            size={18}
          />
          <Text style={styles.primaryButtonText}>Subir documento</Text>
        </Pressable>
      </View>

      <FlatList
        contentContainerStyle={styles.listContent}
        data={filteredDocuments}
        keyExtractor={(item) => String(item?.id)}
        renderItem={({ item }) => {
          const hasFile = Boolean(item?.path);
          const isDownloading = downloadingId === item?.id;

          return (
            <View style={styles.card}>
              <View style={styles.cardTopRow}>
                <View style={styles.iconWrapper}>
                  <MaterialCommunityIcons
                    color={colors.primary}
                    name="file-document-outline"
                    size={22}
                  />
                </View>

                <View style={styles.cardTextContent}>
                  <Text style={styles.cardTitle}>
                    {item?.fileName || 'Documento sin nombre'}
                  </Text>
                  <Text style={styles.cardSubtitle}>
                    {item?.documentType || 'Documento'}
                  </Text>
                </View>
              </View>

              <View style={styles.metaRow}>
                <MaterialCommunityIcons
                  color={colors.textSecondary}
                  name="briefcase-outline"
                  size={16}
                />
                <Text style={styles.metaText}>
                  {item?.caseTitle || 'Causa sin referencia'}
                </Text>
              </View>

              <View style={styles.metaRow}>
                <MaterialCommunityIcons
                  color={colors.textSecondary}
                  name="calendar-clock"
                  size={16}
                />
                <Text style={styles.metaText}>
                  {item?.hearingTitle || 'Audiencia sin referencia'}
                </Text>
              </View>

              <View style={styles.metaRow}>
                <MaterialCommunityIcons
                  color={colors.textSecondary}
                  name="clock-outline"
                  size={16}
                />
                <Text style={styles.metaText}>
                  Fecha de carga: {formatDate(item?.uploadedAt)}
                </Text>
              </View>

              {!hasFile && (
                <Text style={styles.fileUnavailableText}>
                  Archivo no disponible.
                </Text>
              )}

              <View style={styles.actionsRow}>
                <Pressable
                  disabled={!hasFile}
                  onPress={() => void openDocument(item)}
                  style={[
                    styles.secondaryActionButton,
                    !hasFile && styles.actionButtonDisabled,
                  ]}
                >
                  <MaterialCommunityIcons
                    color={hasFile ? colors.primary : colors.textMuted}
                    name="eye-outline"
                    size={18}
                  />
                  <Text
                    style={[
                      styles.secondaryActionText,
                      !hasFile && styles.actionTextDisabled,
                    ]}
                  >
                    Ver
                  </Text>
                </Pressable>

                <Pressable
                  disabled={!hasFile || isDownloading}
                  onPress={() => void downloadDocument(item)}
                  style={[
                    styles.primaryActionButton,
                    (!hasFile || isDownloading) && styles.actionButtonDisabled,
                  ]}
                >
                  <MaterialCommunityIcons
                    color={colors.textOnPrimary}
                    name={isDownloading ? 'loading' : 'download-outline'}
                    size={18}
                  />
                  <Text style={styles.primaryActionText}>
                    {isDownloading ? 'Descargando...' : 'Descargar'}
                  </Text>
                </Pressable>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <EmptyState
            actionLabel="Subir documento"
            icon="file-remove-outline"
            message={
              searchText.trim()
                ? 'No encontramos documentos con esa búsqueda.'
                : 'Todavia no se cargaron documentos.'
            }
            onAction={() => navigation.navigate('UploadDocument')}
            title={searchText.trim() ? 'Sin resultados' : 'Sin documentos registrados'}
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
    headerTopRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
    },
    titleContent: {
      flex: 1,
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
      maxWidth: '92%',
    },
    searchWrapper: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      marginTop: 2,
    },
    searchInput: {
      width: 210,
      height: 44,
      backgroundColor: colors.card,
      borderRadius: 16,
      paddingLeft: 16,
      paddingRight: 48,
      color: colors.text,
      borderWidth: 1,
      borderColor: colors.borderSoft,
      marginRight: -44,
      fontSize: 14,
    },
    searchButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.borderSoft,
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
    fileUnavailableText: {
      color: colors.danger,
      fontSize: 13,
      fontWeight: '600',
      marginTop: 12,
    },
    actionsRow: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 16,
    },
    secondaryActionButton: {
      flex: 1,
      minHeight: 46,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.primary,
      backgroundColor: colors.card,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    primaryActionButton: {
      flex: 1,
      minHeight: 46,
      borderRadius: 16,
      backgroundColor: colors.primary,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    actionButtonDisabled: {
      opacity: 0.55,
    },
    secondaryActionText: {
      color: colors.primary,
      fontSize: 14,
      fontWeight: '700',
    },
    primaryActionText: {
      color: colors.textOnPrimary,
      fontSize: 14,
      fontWeight: '700',
    },
    actionTextDisabled: {
      color: colors.textMuted,
    },
  });