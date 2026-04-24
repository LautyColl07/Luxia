import React from "react";
import {
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";

import { CARD_SHADOW, COLORS, TYPOGRAPHY } from "../theme/luxiaTheme";
import { RootStackParamList } from "../types/navigation";

type MainAppScreenProps = NativeStackScreenProps<RootStackParamList, "MainApp">;

const MainAppScreen = ({ navigation }: MainAppScreenProps) => {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.card}>
          <Text style={styles.title}>Luxia</Text>
          <Text style={styles.description}>
            Entraste al flujo principal. Esta pantalla queda lista para conectar el estado real de
            sesión cuando integres Firebase.
          </Text>

          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => navigation.replace("Login")}
            style={styles.primaryButton}
          >
            <Text style={styles.primaryButtonText}>CERRAR SESIÓN</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 18,
    backgroundColor: COLORS.background,
  },
  card: {
    width: "100%",
    maxWidth: 520,
    backgroundColor: COLORS.card,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: COLORS.gold,
    paddingHorizontal: 22,
    paddingVertical: 28,
    ...CARD_SHADOW,
  },
  title: {
    color: COLORS.primary,
    fontSize: 28,
    fontFamily: TYPOGRAPHY.serif,
    fontWeight: "700",
    textAlign: "center",
  },
  description: {
    marginTop: 12,
    color: COLORS.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },
  primaryButton: {
    minHeight: 54,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 24,
    ...CARD_SHADOW,
  },
  primaryButtonText: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: "700",
  },
});

export default MainAppScreen;
