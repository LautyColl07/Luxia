import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '../../context/ThemeContext';
import { formatDate } from '../../utils/date';
import { formatDocumentSize, getDocumentAssociation, getDocumentFileKind, getDocumentName } from '../../utils/documentPresentation';
import DocumentPopover from './DocumentPopover';

const FILE_ICONS = { pdf: 'file-pdf-box', doc: 'file-word-outline', docx: 'file-word-outline', image: 'file-image-outline', txt: 'file-document-outline', other: 'file-outline' };

export default function DocumentItem({ document, viewMode, width, showDirectActions, hasFile, isDownloading, isDeleting, isBusy, onView, onDownload, onDelete }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isGrid = viewMode === 'grid';
  const name = getDocumentName(document);
  const kind = getDocumentFileKind(document);
  const caseTitle = getDocumentAssociation(document.caseTitle, 'Causa sin referencia');
  const hearingTitle = getDocumentAssociation(document.hearingTitle, 'Audiencia sin referencia');
  const date = document.uploadedAt && !Number.isNaN(new Date(document.uploadedAt).getTime()) ? formatDate(document.uploadedAt) : null;
  const metadata = [date, formatDocumentSize(document.sizeBytes)].filter(Boolean).join(' · ');
  const disabled = !hasFile || isDownloading || isBusy;
  const menu = (
    <DocumentPopover label={`Acciones de ${name}`} icon="dots-horizontal" triggerStyle={styles.menuTrigger}
      message={!hasFile ? 'Archivo no disponible.' : undefined}
      options={[
        { value: 'view', label: 'Ver', icon: 'eye-outline', disabled, onPress: onView },
        { value: 'download', label: isDownloading ? 'Descargando…' : 'Descargar', icon: 'download-outline', disabled, onPress: onDownload },
        { value: 'delete', label: isDeleting ? 'Eliminando…' : 'Eliminar', icon: 'trash-can-outline', destructive: true, disabled: isBusy || isDeleting, onPress: onDelete },
      ]} />
  );
  return (
    <View style={[styles.item, isGrid ? styles.card : styles.row, isGrid && { width }]}>
      <View style={isGrid ? styles.cardTop : styles.fileIcon}>
        <View style={[styles.iconBox, kind === 'pdf' && styles.pdfIconBox]}>
          <MaterialCommunityIcons name={FILE_ICONS[kind]} color={kind === 'pdf' ? colors.danger : colors.primary} size={28} />
        </View>
        {isGrid ? menu : null}
      </View>
      <View style={styles.information}>
        <Text accessibilityLabel={name} numberOfLines={2} ellipsizeMode="middle" style={styles.name}>{name}</Text>
        {caseTitle ? <Text numberOfLines={1} style={styles.association}>• {caseTitle}</Text> : null}
        {hearingTitle ? <Text numberOfLines={1} style={styles.association}>{hearingTitle}</Text> : null}
        {metadata ? <Text numberOfLines={1} style={styles.metadata}>{metadata}</Text> : null}
        {!hasFile ? <Text style={styles.unavailable}>Archivo no disponible.</Text> : null}
        {isDownloading ? <View accessibilityLiveRegion="polite" style={styles.progress}>
          <ActivityIndicator color={colors.primary} size="small" />
          <Text style={styles.metadata}>Descargando…</Text>
        </View> : null}
      </View>
      {!isGrid && showDirectActions ? <View style={styles.directActions}>
        {[{ label: 'Ver', onPress: onView }, { label: 'Descargar', onPress: onDownload }].map((action) => (
          <Pressable key={action.label} accessibilityRole="button" accessibilityLabel={`${action.label} ${name}`}
            accessibilityState={{ disabled }} disabled={disabled} onPress={action.onPress}
            style={({ pressed, focused, hovered }) => [styles.action, disabled && styles.disabled,
              focused && styles.focused, hovered && styles.hovered, pressed && styles.pressed]}>
            <Text style={styles.actionText}>{action.label}</Text>
          </Pressable>
        ))}
      </View> : null}
      {!isGrid ? menu : null}
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  item: { minWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderSoft, gap: 10 },
  card: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.borderSoft, borderRadius: 14, padding: 12, minHeight: 168, gap: 10 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  fileIcon: { paddingTop: 1 },
  iconBox: { width: 32, height: 32, backgroundColor: colors.accentSoft, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  pdfIconBox: { backgroundColor: colors.dangerSoft },
  menuTrigger: { marginTop: -6, marginRight: -6 },
  information: { flex: 1, minWidth: 0 },
  name: { color: colors.text, fontSize: 14, lineHeight: 18, fontWeight: '700' },
  association: { color: colors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 3 },
  metadata: { color: colors.textSecondary, fontSize: 12, lineHeight: 17 },
  unavailable: { color: colors.danger, fontSize: 12, lineHeight: 17, marginTop: 3 },
  progress: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  directActions: { flexDirection: 'row', alignSelf: 'center', gap: 6, marginHorizontal: 8 },
  action: { minHeight: 40, justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, backgroundColor: colors.card },
  actionText: { color: colors.text, fontSize: 12, fontWeight: '600' },
  disabled: { opacity: 0.5 },
  focused: { borderColor: colors.focusRing },
  hovered: { backgroundColor: colors.accentSoft },
  pressed: { opacity: 0.72 },
});
