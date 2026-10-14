import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useRef, useState } from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import {
  Alert,
  Animated,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import EmptyState from '../components/EmptyState';
import ActionFeedbackModal from '../components/ActionFeedbackModal';
import DocumentItem from '../components/documents/DocumentItem';
import DocumentsToolbar, { CreateWritingButton } from '../components/documents/DocumentsToolbar';
import ErrorState from '../components/ErrorState';
import LoadingState from '../components/LoadingState';
import { API_ROOT_URL } from '../config/api';
import { useAuth } from '../context/AuthContext';
import { useStudyContext } from '../context/StudyContext';
import { useAppTheme } from '../context/ThemeContext';
import useDocumentViewMode from '../hooks/useDocumentViewMode';
import { deleteDocument, getCurrentIdToken, getDocuments } from '../services/api';
import { useResponsiveLayout } from '../theme/layout';
import { getDocumentDownloadUrl, getDocumentName } from '../utils/documentPresentation';

export default function DocumentsScreen({ navigation }) {
  const { colors } = useAppTheme();
  const { authStatus, currentUser, isAuthReady } = useAuth();
  const insets = useSafeAreaInsets();
  const layout = useResponsiveLayout();
  const { activeContext, activeContextKey, isHydrated } = useStudyContext();
  const requestSequenceRef = useRef(0);
  const downloadInProgress = useRef(false);
  const deleteInProgress = useRef(false);
  const currentContextKey = useRef(activeContextKey);
  currentContextKey.current = activeContextKey;
  const reloadDocuments = useRef(null);
  const styles = useMemo(
    () => createStyles(colors, layout, insets.top),
    [colors, insets.top, layout]
  );
  const { viewMode, changeViewMode, opacity } = useDocumentViewMode();
  const [contentWidth, setContentWidth] = useState(0);
  const [writingNoticeVisible, setWritingNoticeVisible] = useState(false);
  const [fileErrorVisible, setFileErrorVisible] = useState(false);
  const listRef = useRef(null);
  const scrollOffset = useRef(0);
  const restoreScroll = useRef(false);
  const availableWidth = Math.max(0, contentWidth - layout.gutter * 2);
  const minimumCardWidth = layout.isWebDesktop ? 220 : layout.isTablet ? 200 : 164;
  const listColumns = viewMode === 'grid' ? Math.max(1, Math.floor((availableWidth + 12) / (minimumCardWidth + 12))) : 1;
  const cardWidth = Math.max(0, (availableWidth - (listColumns - 1) * 12) / listColumns);

  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloadingId, setDownloadingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleteError, setDeleteError] = useState('');

  const [searchText, setSearchText] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [sortBy, setSortBy] = useState('newest');
  const [selectedCategories, setSelectedCategories] = useState([]);

  const loadDocuments = useCallback(async () => {
    if (!isAuthReady || !isHydrated || authStatus !== 'authenticated' || !currentUser) {
      return;
    }
    const requestId = ++requestSequenceRef.current;

    try {
      setLoading(true);
      setDocuments([]);
      setError('');
      scrollOffset.current = 0;
      restoreScroll.current = false;
      // No pagination here: the existing local search covers the full result set.
      const items = await getDocuments({ categories: selectedCategories, sortBy });
      if (requestSequenceRef.current !== requestId) return;
      setDocuments(Array.isArray(items) ? items : []);
    } catch (loadError) {
      if (requestSequenceRef.current !== requestId) return;
      console.error('[DocumentsScreen] No se pudieron cargar los documentos.');
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'No pudimos cargar los documentos.'
      );
    } finally {
      if (requestSequenceRef.current === requestId) setLoading(false);
    }
  }, [activeContextKey, authStatus, currentUser?.uid, isAuthReady, isHydrated, selectedCategories, sortBy]);
  reloadDocuments.current = loadDocuments;

  useFocusEffect(
    useCallback(() => {
      if (!isAuthReady || !isHydrated || authStatus !== 'authenticated' || !currentUser) {
        return undefined;
      }

      void loadDocuments();
      return () => { requestSequenceRef.current += 1; };
    }, [authStatus, currentUser?.uid, isAuthReady, isHydrated, loadDocuments])
  );

  const filteredDocuments = useMemo(() => {
    const query = searchText.trim().toLowerCase();

    if (!query) return documents;

    return documents.filter((item) => {
      const fileName = String(item?.fileName || '').toLowerCase();
      const originalName = String(getDocumentName(item)).toLowerCase();
      const documentType = String(item?.documentType || '').toLowerCase();
      const caseTitle = String(item?.caseTitle || '').toLowerCase();
      const hearingTitle = String(item?.hearingTitle || '').toLowerCase();

      return (
        fileName.includes(query) ||
        originalName.includes(query) ||
        documentType.includes(query) ||
        caseTitle.includes(query) ||
        hearingTitle.includes(query)
      );
    });
  }, [documents, searchText]);

  const getFileUrl = useCallback(
    (document) => getDocumentDownloadUrl(document, API_ROOT_URL, activeContext),
    [activeContext]
  );

  const downloadDocument = useCallback(
    async (document, { preview = false } = {}) => {
      if (downloadInProgress.current || deleteInProgress.current) return;
      const fileUrl = getFileUrl(document);

      if (!fileUrl) {
        Alert.alert(
          'Archivo no disponible.',
          'El documento seleccionado no tiene un archivo asociado.'
        );
        return;
      }

      // Reserve the preview window during the click so browsers do not block it
      // after the authenticated request. Never navigate to a private URL directly.
      let previewWindow = null;
      downloadInProgress.current = true;
      try {
        if (Platform.OS === 'web' && preview) {
          previewWindow = window.open('about:blank', '_blank');
          if (previewWindow) previewWindow.opener = null;
        }
        setDownloadingId(document?.id ?? null);

        const fallbackName = `documento-${document?.id || Date.now()}.pdf`;
        const safeFileName = String(document?.originalName || document?.filename || document?.fileName || fallbackName).replace(
          /[\\/:*?"<>|]/g,
          '_'
        );

        const token = await getCurrentIdToken();
        if (Platform.OS === 'web') {
          // Same handler, URL and Bearer credentials as native; FileSystem's
          // legacy downloader is unavailable in browsers.
          const response = await fetch(fileUrl, { headers: { Authorization: `Bearer ${token}` } });
          if (!response.ok) throw new Error('La descarga fue rechazada por el servidor.');
          const blob = await response.blob();
          const objectUrl = URL.createObjectURL(blob);
          setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
          if (previewWindow && (blob.type === 'application/pdf' || blob.type.startsWith('image/'))) {
            previewWindow.location.replace(objectUrl);
          } else {
            previewWindow?.close();
            const link = window.document.createElement('a');
            link.href = objectUrl;
            link.download = safeFileName;
            window.document.body.appendChild(link);
            link.click();
            link.remove();
          }
          return;
        }
        const localUri = `${FileSystem.documentDirectory}${safeFileName}`;
        const result = await FileSystem.downloadAsync(fileUrl, localUri, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (result.status < 200 || result.status >= 300) {
          await FileSystem.deleteAsync(localUri, { idempotent: true }).catch(() => undefined);
          throw new Error('La descarga fue rechazada por el servidor.');
        }

        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(result.uri);
        }

        Alert.alert(
          'Documento listo para abrir o compartir.',
          'La descarga se completó correctamente.'
        );
      } catch (downloadError) {
        previewWindow?.close();
        console.error('[DocumentsScreen] No se pudo descargar el documento.');
        if (Platform.OS === 'web') {
          setFileErrorVisible(true);
        } else {
          Alert.alert('No se pudo descargar el documento.', 'Intenta nuevamente.');
        }
      } finally {
        downloadInProgress.current = false;
        setDownloadingId(null);
      }
    },
    [getFileUrl]
  );

  const openDocument = useCallback(
    (document) => downloadDocument(document, { preview: true }),
    [downloadDocument]
  );

  const handleViewChange = useCallback((nextMode) => {
    if (nextMode !== viewMode) restoreScroll.current = true;
    changeViewMode(nextMode);
  }, [changeViewMode, viewMode]);

  const confirmDelete = async () => {
    if (!pendingDelete || pendingDelete.contextKey !== activeContextKey || deleteInProgress.current || downloadInProgress.current) return;
    const { document, contextKey } = pendingDelete;
    deleteInProgress.current = true;
    setDeletingId(document.id);
    setPendingDelete(null);
    setDeleteError('');
    try {
      await deleteDocument(document.id);
      if (currentContextKey.current !== contextKey) return;
      setDocuments((items) => items.filter((item) => String(item.id) !== String(document.id)));
      // Refresh with the current filters and invalidate any older list request.
      await reloadDocuments.current();
    } catch (failure) {
      if (currentContextKey.current === contextKey) {
        setDeleteError(failure instanceof Error ? failure.message : 'No pudimos eliminar el documento. Intentá nuevamente.');
      }
    } finally {
      deleteInProgress.current = false;
      setDeletingId(null);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={styles.title}>Documentos</Text>
        {layout.isWebDesktop ? <Text style={styles.subtitle}>
          Accede al repositorio documental vinculado a tus causas y audiencias.
        </Text> : null}
        <View style={styles.searchAndActions}>
          <View style={[styles.searchWrapper, searchFocused && styles.searchFocused]}>
            <TextInput accessibilityLabel="Buscar documentos" style={styles.searchInput}
              placeholder="Buscar documentos..." placeholderTextColor={colors.textSecondary}
              value={searchText} onChangeText={setSearchText}
              onFocus={() => setSearchFocused(true)} onBlur={() => setSearchFocused(false)}
              autoCorrect={false} returnKeyType="search" />
            {searchText ? <Pressable accessibilityRole="button" accessibilityLabel="Limpiar búsqueda"
              onPress={() => setSearchText('')} style={styles.searchIcon}>
              <MaterialCommunityIcons color={colors.textSecondary} name="close" size={20} />
            </Pressable> : <View pointerEvents="none" style={styles.searchIcon}>
              <MaterialCommunityIcons color={colors.textSecondary} name="magnify" size={23} />
            </View>}
          </View>
          <View style={styles.primaryActions}>
            <Pressable accessibilityRole="button" onPress={() => navigation.navigate('UploadDocument')}
              style={({ pressed, focused, hovered }) => [styles.primaryButton,
                hovered && styles.buttonHovered, focused && styles.buttonFocused, pressed && styles.buttonPressed]}>
              <MaterialCommunityIcons color={colors.textOnPrimary} name="tray-arrow-up" size={18} />
              <Text style={styles.primaryButtonText}>Subir documento</Text>
            </Pressable>
            <CreateWritingButton onCreateWriting={() => setWritingNoticeVisible(true)}
              style={styles.primaryButton} textStyle={styles.primaryButtonText} />
          </View>
        </View>
        <DocumentsToolbar viewMode={viewMode} onViewModeChange={handleViewChange}
          sortBy={sortBy} onSortChange={setSortBy} sortingEnabled
          selectedCategories={selectedCategories} onCategoriesChange={setSelectedCategories} filtersEnabled />
      </View>
      <Animated.View style={[styles.results, { opacity }]}
        onLayout={(event) => setContentWidth(event.nativeEvent.layout.width)}>
        {loading ? <LoadingState title="Cargando documentos" message="Estamos reuniendo tus documentos." />
          : error ? <ErrorState title="No pudimos cargar los documentos" message={error} onRetry={loadDocuments} />
          : <FlatList
            ref={listRef}
            key={'documents-' + viewMode + '-' + listColumns}
            numColumns={listColumns}
            columnWrapperStyle={listColumns > 1 ? styles.columnRow : undefined}
            contentContainerStyle={[styles.listContent, viewMode === 'grid' && styles.gridContent]}
            keyboardShouldPersistTaps="handled"
            data={filteredDocuments}
            keyExtractor={(item) => String(item?.id)}
            extraData={`${downloadingId}:${deletingId}`}
            onScroll={(event) => { if (!restoreScroll.current) scrollOffset.current = event.nativeEvent.contentOffset.y; }}
            scrollEventThrottle={32}
            onContentSizeChange={() => {
              if (restoreScroll.current) {
                listRef.current?.scrollToOffset({ offset: scrollOffset.current, animated: false });
                restoreScroll.current = false;
              }
            }}
            renderItem={({ item }) => <DocumentItem document={item} viewMode={viewMode} width={cardWidth}
              showDirectActions={layout.isWebDesktop && contentWidth >= 700}
              hasFile={Boolean(getFileUrl(item))} isDownloading={downloadingId === item?.id}
              isDeleting={deletingId === item?.id} isBusy={downloadingId !== null || deletingId !== null}
              onView={() => void openDocument(item)} onDownload={() => void downloadDocument(item)}
              onDelete={() => setPendingDelete({ document: item, contextKey: activeContextKey })} />}
            ListEmptyComponent={<EmptyState actionLabel={selectedCategories.length ? 'Limpiar filtros' : 'Subir documento'} icon="file-remove-outline"
              message={selectedCategories.length ? 'Probá con otras categorías o limpiá los filtros.'
                : searchText.trim() ? 'Probá con otro nombre, causa o audiencia.' : 'Subí un archivo para agregarlo a tus causas.'}
              onAction={() => selectedCategories.length ? setSelectedCategories([]) : navigation.navigate('UploadDocument')}
              title={searchText.trim() || selectedCategories.length ? 'No se encontraron documentos' : 'Todavía no hay documentos registrados'} />}
            showsVerticalScrollIndicator={false}
          />}
      </Animated.View>
      <Modal transparent animationType="fade" visible={Boolean(pendingDelete && pendingDelete.contextKey === activeContextKey)}
        onRequestClose={() => setPendingDelete(null)}>
        <View style={styles.dialogOverlay}>
          <Pressable accessibilityRole="button" accessibilityLabel="Cancelar eliminación"
            onPress={() => setPendingDelete(null)} style={StyleSheet.absoluteFill} />
          <View accessibilityViewIsModal style={styles.dialog}>
            <Text accessibilityRole="header" style={styles.dialogTitle}>Eliminar documento</Text>
            <Text style={styles.dialogMessage}>¿Querés eliminar «{getDocumentName(pendingDelete?.document)}»? Esta acción no se puede deshacer.</Text>
            <View style={styles.dialogActions}>
              <Pressable accessibilityRole="button" onPress={() => setPendingDelete(null)} style={styles.cancelButton}>
                <Text style={styles.cancelButtonText}>Cancelar</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => void confirmDelete()} style={styles.deleteButton}>
                <Text style={styles.primaryButtonText}>Eliminar</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <ActionFeedbackModal visible={Boolean(deleteError)} title="No se pudo eliminar el documento" icon="alert-circle-outline" tone="danger"
        message={deleteError} actionLabel="Entendido" onClose={() => setDeleteError('')} />
      <ActionFeedbackModal visible={writingNoticeVisible} title="Próximamente" icon="clock-outline" tone="info"
        message="La creación de escritos estará disponible en una próxima etapa."
        actionLabel="Entendido" onClose={() => setWritingNoticeVisible(false)} />
      <ActionFeedbackModal visible={fileErrorVisible} title="No se pudo descargar el documento" icon="alert-circle-outline" tone="danger"
        message="Revisá tu conexión e intentá nuevamente." actionLabel="Entendido"
        onClose={() => setFileErrorVisible(false)} />
    </View>
  );
}

const createStyles = (colors, layout, topInset) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, minWidth: 0 },
  header: { width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center',
    paddingTop: layout.isWebDesktop ? 26 : Math.max(topInset + 14, 20),
    paddingHorizontal: layout.gutter, paddingBottom: 16, gap: 14 },
  title: { color: colors.text, fontSize: layout.isWebDesktop ? 30 : 26, fontWeight: '700', letterSpacing: -0.5 },
  subtitle: { color: colors.textSecondary, fontSize: 14, lineHeight: 20, marginTop: -8 },
  searchAndActions: { flexDirection: layout.isWebDesktop ? 'row' : 'column', alignItems: 'stretch', gap: layout.isWebDesktop ? 16 : 20 },
  searchWrapper: { flex: layout.isWebDesktop ? 1 : undefined, minWidth: 0, flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.borderSoft, borderRadius: 8, minHeight: 44 },
  searchFocused: { borderColor: colors.focusRing },
  searchInput: { flex: 1, minWidth: 0, paddingLeft: 16, paddingVertical: 10, color: colors.text, fontSize: 13,
    ...(layout.isWebDesktop ? { outlineStyle: 'none' } : {}) },
  searchIcon: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  primaryActions: { flexDirection: layout.width < 300 ? 'column' : 'row', gap: 12 },
  primaryButton: { flex: layout.isWebDesktop ? undefined : 1, minHeight: 44, backgroundColor: colors.primary,
    borderRadius: 12, paddingHorizontal: layout.isCompact ? 8 : 14, paddingVertical: 10,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: 'transparent' },
  primaryButtonText: { color: colors.textOnPrimary, fontSize: layout.isCompact ? 12 : 13, fontWeight: '700', flexShrink: 1 },
  buttonHovered: { backgroundColor: colors.primaryHover },
  buttonFocused: { borderColor: colors.focusRing },
  buttonPressed: { opacity: 0.78 },
  results: { flex: 1, width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center', minHeight: 0 },
  listContent: { paddingHorizontal: layout.gutter, paddingBottom: 24 },
  gridContent: { gap: 12, paddingTop: 4 },
  columnRow: { gap: 12 },
  dialogOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(7, 21, 37, 0.48)', padding: 24 },
  dialog: { width: '100%', maxWidth: 420, padding: 24, borderRadius: 20, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.borderSoft },
  dialogTitle: { color: colors.text, fontSize: 20, fontWeight: '700' },
  dialogMessage: { color: colors.textSecondary, fontSize: 14, lineHeight: 21, marginTop: 12 },
  dialogActions: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 12, marginTop: 24 },
  cancelButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 10, borderWidth: 1, borderColor: colors.border },
  cancelButtonText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  deleteButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 10, backgroundColor: colors.danger },
});
