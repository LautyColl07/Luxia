import React from "react";
import {
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { HelpCircle, Mail, ShieldCheck } from "lucide-react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";

import { CARD_SHADOW, COLORS, TYPOGRAPHY } from "../theme/luxiaTheme";
import { RootStackParamList } from "../types/navigation";

type HelpAccessScreenProps = NativeStackScreenProps<RootStackParamList, "HelpAccess">;

const HelpAccessScreen = ({ navigation }: HelpAccessScreenProps) => {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.card}>
          <HelpCircle size={26} color={COLORS.primary} />
          <Text style={styles.title}>Ayuda para acceder</Text>
          <Text style={styles.description}>
            Esta pantalla ya está lista para sumar soporte real, preguntas frecuentes o validaciones
            de identidad cuando conectemos el back.
          </Text>

          <View style={styles.tipRow}>
            <Mail size={18} color={COLORS.primary} />
            <Text style={styles.tipText}>Verificá que tu email esté bien escrito.</Text>
          </View>
          <View style={styles.tipRow}>
            <ShieldCheck size={18} color={COLORS.primary} />
            <Text style={styles.tipText}>Si olvidaste tu contraseña, usá el flujo de recuperación.</Text>
          </View>

          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => navigation.navigate("ForgotPassword")}
            style={styles.primaryButton}
          >
            <Text style={styles.primaryButtonText}>RECUPERAR CONTRASEÑA</Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => navigation.goBack()}
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryButtonText}>Volver</Text>
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
    alignItems: "center",
    ...CARD_SHADOW,
  },
  title: {
    marginTop: 12,
    color: COLORS.primary,
    fontSize: 26,
    fontFamily: TYPOGRAPHY.serif,
    fontWeight: "700",
    textAlign: "center",
  },
  description: {
    marginTop: 10,
    marginBottom: 22,
    color: COLORS.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },
  tipRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 12,
  },
  tipText: {
    flex: 1,
    color: COLORS.text,
    fontSize: 14,
    lineHeight: 20,
  },
  primaryButton: {
    width: "100%",
    minHeight: 54,
    marginTop: 10,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    ...CARD_SHADOW,
  },
  primaryButtonText: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: "700",
  },
  secondaryButton: {
    marginTop: 14,
  },
  secondaryButtonText: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: "700",
  },
});

export default HelpAccessScreen;
