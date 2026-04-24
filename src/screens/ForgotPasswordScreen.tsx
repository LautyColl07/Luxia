import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Mail, ArrowLeft } from "lucide-react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";

import { CARD_SHADOW, COLORS, TYPOGRAPHY } from "../theme/luxiaTheme";
import { RootStackParamList } from "../types/navigation";

type ForgotPasswordScreenProps = NativeStackScreenProps<
  RootStackParamList,
  "ForgotPassword"
>;

const ForgotPasswordScreen = ({ navigation }: ForgotPasswordScreenProps) => {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = () => {
    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      setError("Ingresá tu email para continuar");
      setMessage("");
      return;
    }

    if (!/\S+@\S+\.\S+/.test(trimmedEmail)) {
      setError("Ingresá un email válido");
      setMessage("");
      return;
    }

    setError("");
    setMessage(
      "La pantalla ya quedó lista. Cuando conectemos Firebase, desde acá se enviará el email de recuperación.",
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.keyboardAvoidingView}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.container}>
            <View style={styles.card}>
              <Text style={styles.title}>Recuperar acceso</Text>
              <Text style={styles.subtitle}>
                Ingresá tu email y dejá preparado el flujo para recuperar tu contraseña.
              </Text>

              <Text style={styles.label}>Email</Text>
              <View style={[styles.inputWrapper, error ? styles.inputWrapperError : undefined]}>
                <Mail size={18} color={COLORS.textSecondary} />
                <TextInput
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  onChangeText={(value) => {
                    setEmail(value);
                    setError("");
                    setMessage("");
                  }}
                  placeholder="tu.email@ejemplo.com"
                  placeholderTextColor={COLORS.textMuted}
                  style={styles.input}
                  value={email}
                />
              </View>

              {error ? <Text style={styles.errorText}>{error}</Text> : null}
              {message ? <Text style={styles.successText}>{message}</Text> : null}

              <TouchableOpacity activeOpacity={0.9} onPress={handleSubmit} style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>CONTINUAR</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => navigation.goBack()}
                style={styles.secondaryButton}
              >
                <ArrowLeft size={16} color={COLORS.primary} />
                <Text style={styles.secondaryButtonText}>Volver</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  container: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 24,
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
    fontSize: 26,
    fontFamily: TYPOGRAPHY.serif,
    fontWeight: "700",
    textAlign: "center",
  },
  subtitle: {
    marginTop: 10,
    marginBottom: 24,
    color: COLORS.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },
  label: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 8,
  },
  inputWrapper: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1.5,
    borderColor: COLORS.gold,
    borderRadius: 14,
    paddingHorizontal: 14,
    backgroundColor: COLORS.card,
  },
  inputWrapperError: {
    borderColor: COLORS.error,
  },
  input: {
    flex: 1,
    color: COLORS.text,
    fontSize: 15,
    paddingVertical: Platform.OS === "ios" ? 14 : 10,
  },
  errorText: {
    color: COLORS.error,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 10,
  },
  successText: {
    color: COLORS.primary,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 10,
  },
  primaryButton: {
    minHeight: 54,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
    ...CARD_SHADOW,
  },
  primaryButtonText: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: "700",
  },
  secondaryButton: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  secondaryButtonText: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: "700",
  },
});

export default ForgotPasswordScreen;
