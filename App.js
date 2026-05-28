export { default } from "./App.tsx";
import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
} from "react-native";
import { Ionicons, Feather } from "@expo/vector-icons";

export default function DocumentosScreen() {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState("");

  const carpetas = [
    { nombre: "Causas Civiles", archivos: 8, color: "#3b82f6" },
    { nombre: "Familia / Sucesiones", archivos: 5, color: "#8b5cf6" },
    { nombre: "Laboral", archivos: 3, color: "#10b981" },
    { nombre: "Penal", archivos: 2, color: "#ef4444" },
    { nombre: "Seguros", archivos: 4, color: "#f59e0b" },
  ];

  const documentos = [
    { nombre: "Demanda inicial.pdf", tipo: "PDF", carpeta: "Causas Civiles" },
    { nombre: "Contrato laboral.pdf", tipo: "PDF", carpeta: "Laboral" },
    { nombre: "Prueba documental.jpg", tipo: "JPG", carpeta: "Penal" },
    { nombre: "Seguro automotor.pdf", tipo: "PDF", carpeta: "Seguros" },
    { nombre: "Sucesión familiar.png", tipo: "PNG", carpeta: "Familia / Sucesiones" },
  ];

  const documentosFiltrados = useMemo(() => {
    const texto = searchText.toLowerCase().trim();

    if (!texto) return documentos;

    return documentos.filter(
      (doc) =>
        doc.nombre.toLowerCase().includes(texto) ||
        doc.tipo.toLowerCase().includes(texto) ||
        doc.carpeta.toLowerCase().includes(texto)
    );
  }, [searchText]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.titleBox}>
          <View style={styles.iconBox}>
            <Ionicons name="document-text-outline" size={27} color="#fff" />
          </View>

          <Text style={styles.title}>DOCUMENTOS</Text>
        </View>

        <View style={styles.searchWrapper}>
          {searchOpen && (
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar documento..."
              placeholderTextColor="#7c8798"
              value={searchText}
              onChangeText={setSearchText}
              autoFocus
              onBlur={() => {
                if (searchText.trim() === "") {
                  setSearchOpen(false);
                }
              }}
            />
          )}

          <Pressable
            onPress={() => setSearchOpen(true)}
            style={styles.searchButton}
          >
            <Ionicons name="search-outline" size={28} color="#fff" />
          </Pressable>
        </View>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.uploadBox}>
          <View style={styles.uploadIcon}>
            <Feather name="upload" size={28} color="#16375c" />
          </View>

          <Text style={styles.uploadTitle}>Subir documento nuevo</Text>
          <Text style={styles.uploadSubtitle}>PDF, JPG, PNG • Max. 25 MB</Text>

          <Pressable style={styles.uploadButton}>
            <Text style={styles.uploadButtonText}>+ Elegir archivo</Text>
          </Pressable>
        </View>

        <View style={styles.actionsRow}>
          <View style={styles.leftActions}>
            <View style={styles.actionItem}>
              <Ionicons name="folder-outline" size={21} color="#16375c" />
              <Text style={styles.actionText}>Organizar</Text>
            </View>

            <Text style={styles.dot}>•</Text>

            <Text style={styles.actionText}>Crear carpeta</Text>
          </View>

          <View style={styles.rightActions}>
            <Ionicons name="filter-outline" size={22} color="#5c6b7a" />
            <Ionicons name="swap-vertical-outline" size={22} color="#5c6b7a" />
            <View style={styles.gridActive}>
              <Ionicons name="grid-outline" size={21} color="#fff" />
            </View>
            <Ionicons name="list-outline" size={25} color="#5c6b7a" />
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleBox}>
            <Ionicons name="folder-outline" size={27} color="#0d2f53" />
            <Text style={styles.sectionTitle}>CARPETAS</Text>
          </View>

          <Text style={styles.seeAll}>Ver todas →</Text>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.foldersRow}
        >
          {carpetas.map((carpeta, index) => (
            <View key={index} style={styles.folderCard}>
              <View style={styles.folderTitleRow}>
                <Ionicons name="folder-outline" size={25} color={carpeta.color} />
                <Text style={styles.folderName}>{carpeta.nombre}</Text>
              </View>

              <Text style={styles.folderFiles}>{carpeta.archivos} archivos</Text>
            </View>
          ))}

          <View style={styles.newFolderCard}>
            <Text style={styles.plus}>+</Text>
            <Text style={styles.newFolderText}>Nueva carpeta</Text>
          </View>
        </ScrollView>

        <View style={styles.documentsTitleRow}>
          <Ionicons name="document-text-outline" size={25} color="#0d2f53" />
          <Text style={styles.sectionTitle}>DOCUMENTOS</Text>
          <Text style={styles.countText}>{documentosFiltrados.length} archivos</Text>
        </View>

        {documentosFiltrados.map((doc, index) => (
          <View key={index} style={styles.documentCard}>
            <View style={styles.documentIcon}>
              <Ionicons name="document-outline" size={26} color="#16375c" />
            </View>

            <View style={styles.documentInfo}>
              <Text style={styles.documentName}>{doc.nombre}</Text>
              <Text style={styles.documentMeta}>
                {doc.tipo} • {doc.carpeta}
              </Text>
            </View>

            <Ionicons name="ellipsis-vertical" size={22} color="#6b7280" />
          </View>
        ))}
      </ScrollView>

      <View style={styles.bottomBar}>
        <View style={styles.navItem}>
          <Ionicons name="home-outline" size={24} color="#6b7280" />
          <Text style={styles.navText}>Inicio</Text>
        </View>

        <View style={styles.navItem}>
          <Ionicons name="folder-open-outline" size={24} color="#6b7280" />
          <Text style={styles.navText}>Causas</Text>
        </View>

        <View style={styles.navItem}>
          <Ionicons name="calendar-outline" size={24} color="#6b7280" />
          <Text style={styles.navText}>Calendario</Text>
        </View>

        <View style={styles.navItemActive}>
          <View style={styles.navIconActive}>
            <Ionicons name="document-text-outline" size={25} color="#fff" />
          </View>
          <Text style={styles.navTextActive}>Documentos</Text>
        </View>

        <View style={styles.navItem}>
          <Ionicons name="ellipsis-horizontal" size={25} color="#6b7280" />
          <Text style={styles.navText}>Más</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f3f6fa",
  },

  header: {
    height: 138,
    backgroundColor: "#12365a",
    paddingHorizontal: 30,
    paddingTop: 58,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },

  titleBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },

  iconBox: {
    width: 50,
    height: 50,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },

  title: {
    color: "#fff",
    fontSize: 31,
    fontWeight: "800",
    fontFamily: "serif",
  },

  searchWrapper: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    minWidth: 48,
  },

  searchInput: {
    width: 260,
    height: 45,
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingLeft: 16,
    paddingRight: 50,
    fontSize: 15,
    color: "#102f50",
    marginRight: -45,
    borderWidth: 1,
    borderColor: "#d9e3ef",
  },

  searchButton: {
    width: 45,
    height: 45,
    borderRadius: 22.5,
    alignItems: "center",
    justifyContent: "center",
  },

  content: {
    flex: 1,
    marginTop: -15,
  },

  uploadBox: {
    marginHorizontal: 30,
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "#d7e1ef",
    borderStyle: "dashed",
    minHeight: 278,
    alignItems: "center",
    justifyContent: "center",
  },

  uploadIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#dce4f2",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },

  uploadTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#071525",
  },

  uploadSubtitle: {
    fontSize: 15,
    color: "#49566a",
    marginTop: 8,
  },

  uploadButton: {
    marginTop: 22,
    backgroundColor: "#12365a",
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 10,
  },

  uploadButtonText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "800",
  },

  actionsRow: {
    marginHorizontal: 30,
    marginTop: 30,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  leftActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },

  actionItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  actionText: {
    color: "#07335d",
    fontSize: 18,
    fontWeight: "600",
  },

  dot: {
    color: "#5b6472",
    fontSize: 22,
  },

  rightActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 22,
  },

  gridActive: {
    width: 41,
    height: 41,
    borderRadius: 11,
    backgroundColor: "#12365a",
    alignItems: "center",
    justifyContent: "center",
  },

  sectionHeader: {
    marginHorizontal: 30,
    marginTop: 34,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  sectionTitleBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  sectionTitle: {
    fontSize: 26,
    fontWeight: "900",
    color: "#071525",
  },

  seeAll: {
    color: "#003b73",
    fontSize: 17,
    fontWeight: "600",
  },

  foldersRow: {
    paddingHorizontal: 30,
    paddingTop: 22,
    gap: 16,
  },

  folderCard: {
    width: 200,
    height: 90,
    backgroundColor: "#fff",
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#d8e2ef",
    padding: 18,
    justifyContent: "center",
  },

  folderTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  folderName: {
    fontSize: 17,
    fontWeight: "800",
    color: "#061524",
  },

  folderFiles: {
    marginTop: 10,
    fontSize: 15,
    color: "#435167",
  },

  newFolderCard: {
    width: 200,
    height: 90,
    backgroundColor: "#fff",
    borderRadius: 15,
    borderWidth: 1.5,
    borderColor: "#d8e2ef",
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },

  plus: {
    fontSize: 30,
    color: "#4e5c6d",
  },

  newFolderText: {
    fontSize: 17,
    color: "#4e5c6d",
  },

  documentsTitleRow: {
    marginHorizontal: 30,
    marginTop: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  countText: {
    marginLeft: 8,
    fontSize: 15,
    color: "#6b7280",
  },

  documentCard: {
    marginHorizontal: 30,
    marginTop: 14,
    backgroundColor: "#fff",
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#d8e2ef",
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
  },

  documentIcon: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: "#eef3f9",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },

  documentInfo: {
    flex: 1,
  },

  documentName: {
    fontSize: 17,
    fontWeight: "800",
    color: "#071525",
  },

  documentMeta: {
    fontSize: 14,
    color: "#596579",
    marginTop: 4,
  },

  bottomBar: {
    height: 100,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#d9dde5",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingBottom: 8,
  },

  navItem: {
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },

  navItemActive: {
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },

  navIconActive: {
    width: 50,
    height: 50,
    borderRadius: 15,
    backgroundColor: "#12365a",
    alignItems: "center",
    justifyContent: "center",
  },

  navText: {
    fontSize: 13,
    color: "#6b7280",
  },

  navTextActive: {
    fontSize: 13,
    color: "#12365a",
    fontWeight: "800",
  },
});