import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Google from "expo-auth-session/providers/google";
import { GoogleAuthProvider, signInWithCredential } from "firebase/auth";
import { Eye, EyeOff, HelpCircle, Lock, User } from "lucide-react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";

import { auth, isFirebaseConfigured } from "../config/firebase";
import { authClient } from "../services/authClient";
import { CARD_SHADOW, COLORS, TYPOGRAPHY } from "../theme/luxiaTheme";
import { RootStackParamList } from "../types/navigation";

type LoginScreenProps = NativeStackScreenProps<RootStackParamList, "Login">;

type LoginErrors = {
  email?: string;
  password?: string;
  general?: string;
};

WebBrowser.maybeCompleteAuthSession();

const LoginScreen = ({ navigation }: LoginScreenProps) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [errors, setErrors] = useState<LoginErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);
  const [request, response, promptAsync] = Google.useAuthRequest({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    responseType: "id_token",
  });

  const clearError = (field: keyof LoginErrors) => {
    setErrors((current) => ({
      ...current,
      [field]: undefined,
      general: undefined,
    }));
  };

  useEffect(() => {
    const loginWithGoogle = async () => {
      if (response?.type !== "success") {
        return;
      }

      if (!isFirebaseConfigured || !auth) {
        setErrors({
          general:
            "Firebase no está configurado correctamente para iniciar sesión con Google.",
        });
        setIsGoogleSubmitting(false);
        return;
      }

      try {
        const idToken = response.params.id_token;

        if (!idToken) {
          throw new Error("Google no devolvió un token válido.");
        }

        const credential = GoogleAuthProvider.credential(idToken);
        await signInWithCredential(auth, credential);
        navigation.replace("MainApp");
      } catch (error) {
        setErrors({
          general:
            error instanceof Error
              ? error.message
              : "No se pudo iniciar sesión con Google. Intentá nuevamente.",
        });
      } finally {
        setIsGoogleSubmitting(false);
      }
    };

    void loginWithGoogle();
  }, [navigation, response]);

  const validateForm = () => {
    const nextErrors: LoginErrors = {};
    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      nextErrors.email = "Ingresá tu usuario o email";
    } else if (trimmedEmail.includes("@") && !/\S+@\S+\.\S+/.test(trimmedEmail)) {
      nextErrors.email = "Ingresá un email válido";
    }

    if (!password.trim()) {
      nextErrors.password = "Ingresá tu contraseña";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleLogin = async () => {
    if (isSubmitting || isGoogleSubmitting || !validateForm()) {
      return;
    }

    setIsSubmitting(true);
    setErrors({});

    try {
      await authClient.login({
        email: email.trim(),
        password,
        rememberMe,
      });

      navigation.replace("MainApp");
    } catch (error) {
      setErrors({
        general:
          error instanceof Error
            ? error.message
            : "No se pudo iniciar sesión. Intentá nuevamente.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (isSubmitting || isGoogleSubmitting) {
      return;
    }

    if (!process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID) {
      setErrors({
        general:
          "Falta configurar EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID para usar el acceso con Google.",
      });
      return;
    }

    setErrors({});
    setIsGoogleSubmitting(true);

    const result = await promptAsync();

    if (result.type !== "success") {
      setIsGoogleSubmitting(false);
      if (result.type !== "dismiss" && result.type !== "cancel") {
        setErrors({ general: "No se pudo completar el acceso con Google." });
      }
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.keyboardAvoidingView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.container}>
            <View style={styles.card}>
              <Text style={styles.title}>Iniciar sesión</Text>
              <Text style={styles.subtitle}>
                Accedé a tu cuenta para continuar en la plataforma judicial
              </Text>

              <View style={styles.googleSection}>
                <TouchableOpacity
                  activeOpacity={0.9}
                  disabled={!request || isSubmitting || isGoogleSubmitting}
                  onPress={handleGoogleLogin}
                  style={[
                    styles.googleButton,
                    !request || isSubmitting || isGoogleSubmitting
                      ? styles.googleButtonDisabled
                      : undefined,
                  ]}
                >
                  {isGoogleSubmitting ? (
                    <View style={styles.googleButtonContent}>
                      <ActivityIndicator color={COLORS.primary} size="small" />
                      <Text style={styles.googleButtonText}>Conectando...</Text>
                    </View>
                  ) : (
                    <View style={styles.googleButtonContent}>
                      <View style={styles.googleBadge}>
                        <Text style={styles.googleBadgeText}>G</Text>
                      </View>
                      <Text style={styles.googleButtonText}>Iniciar sesión con Google</Text>
                    </View>
                  )}
                </TouchableOpacity>
                <Text style={styles.googleHint}>
                  Acceso rápido con tu cuenta de Google
                </Text>
              </View>

              <View style={styles.form}>
                <View style={styles.fieldBlock}>
                  <Text style={styles.label}>Usuario</Text>
                  <View
                    style={[
                      styles.inputWrapper,
                      errors.email ? styles.inputWrapperError : undefined,
                    ]}
                  >
                    <User size={18} color={COLORS.textSecondary} />
                    <TextInput
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="email-address"
                      onChangeText={(value: string) => {
                        setEmail(value);
                        clearError("email");
                      }}
                      placeholder="Ingresá tu usuario"
                      placeholderTextColor={COLORS.textMuted}
                      returnKeyType="next"
                      style={styles.input}
                      textContentType="username"
                      value={email}
                    />
                  </View>
                  {errors.email ? (
                    <Text style={styles.errorText}>{errors.email}</Text>
                  ) : null}
                </View>

                <View style={styles.fieldBlock}>
                  <Text style={styles.label}>Contraseña</Text>
                  <View
                    style={[
                      styles.inputWrapper,
                      errors.password ? styles.inputWrapperError : undefined,
                    ]}
                  >
                    <Lock size={18} color={COLORS.textSecondary} />
                    <TextInput
                      autoCapitalize="none"
                      autoCorrect={false}
                      onChangeText={(value: string) => {
                        setPassword(value);
                        clearError("password");
                      }}
                      onSubmitEditing={handleLogin}
                      placeholder="Ingresá tu contraseña"
                      placeholderTextColor={COLORS.textMuted}
                      returnKeyType="done"
                      secureTextEntry={!showPassword}
                      style={styles.input}
                      textContentType="password"
                      value={password}
                    />
                    <Pressable
                      accessibilityRole="button"
                      hitSlop={8}
                      onPress={() => setShowPassword((current: boolean) => !current)}
                      style={styles.trailingButton}
                    >
                      {showPassword ? (
                        <EyeOff size={18} color={COLORS.textSecondary} />
                      ) : (
                        <Eye size={18} color={COLORS.textSecondary} />
                      )}
                    </Pressable>
                  </View>
                  {errors.password ? (
                    <Text style={styles.errorText}>{errors.password}</Text>
                  ) : null}
                </View>

                <Pressable
                  accessibilityRole="checkbox"
                  onPress={() => setRememberMe((current: boolean) => !current)}
                  style={styles.checkboxRow}
                >
                  <View
                    style={[
                      styles.checkboxBox,
                      rememberMe ? styles.checkboxBoxActive : undefined,
                    ]}
                  >
                    {rememberMe ? <Text style={styles.checkboxMark}>✓</Text> : null}
                  </View>
                  <Text style={styles.checkboxText}>Recordarme</Text>
                </Pressable>

                {errors.general ? (
                  <View style={styles.messageBox}>
                    <Text style={styles.errorText}>{errors.general}</Text>
                  </View>
                ) : null}

                <TouchableOpacity
                  activeOpacity={0.9}
                  disabled={isSubmitting || isGoogleSubmitting}
                  onPress={handleLogin}
                  style={[
                    styles.primaryButton,
                    isSubmitting ? styles.primaryButtonDisabled : undefined,
                  ]}
                >
                  {isSubmitting ? (
                    <View style={styles.loadingRow}>
                      <ActivityIndicator color={COLORS.white} size="small" />
                      <Text style={styles.primaryButtonText}>INGRESANDO...</Text>
                    </View>
                  ) : (
                    <Text style={styles.primaryButtonText}>INGRESAR</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => navigation.navigate("ForgotPassword")}
                  style={styles.centerLink}
                >
                  <Text style={styles.linkText}>Olvidé la contraseña</Text>
                </TouchableOpacity>

                <View style={styles.divider} />

                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => navigation.navigate("HelpAccess")}
                  style={styles.helpLinkButton}
                >
                  <HelpCircle size={16} color={COLORS.textSecondary} />
                  <Text style={styles.helpLinkText}>¿Necesitás ayuda para acceder?</Text>
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => navigation.navigate("Register")}
              style={styles.footerLink}
            >
              <Text style={styles.footerText}>
                ¿No tenés cuenta?{" "}
                <Text style={styles.footerLinkText}>Registrate aquí</Text>
              </Text>
            </TouchableOpacity>
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
    alignItems: "center",
    justifyContent: "center",
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
    marginBottom: 18,
    color: COLORS.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },
  googleSection: {
    marginBottom: 18,
    gap: 8,
  },
  form: {
    gap: 16,
  },
  fieldBlock: {
    gap: 8,
  },
  label: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "700",
  },
  inputWrapper: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: COLORS.gold,
    borderRadius: 14,
    backgroundColor: COLORS.card,
    paddingHorizontal: 14,
    gap: 10,
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
  trailingButton: {
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 2,
  },
  checkboxBox: {
    width: 18,
    height: 18,
    borderWidth: 1.4,
    borderColor: COLORS.textSecondary,
    borderRadius: 3,
    backgroundColor: COLORS.card,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxBoxActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary,
  },
  checkboxMark: {
    color: COLORS.white,
    fontSize: 11,
    fontWeight: "700",
  },
  checkboxText: {
    color: COLORS.textSecondary,
    fontSize: 14,
  },
  messageBox: {
    borderWidth: 1,
    borderColor: "#F0C6C0",
    borderRadius: 14,
    backgroundColor: "#FFF5F4",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  errorText: {
    color: COLORS.error,
    fontSize: 13,
    lineHeight: 18,
  },
  primaryButton: {
    minHeight: 54,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary,
    ...CARD_SHADOW,
  },
  primaryButtonDisabled: {
    opacity: 0.82,
    backgroundColor: COLORS.primaryHover,
  },
  primaryButtonText: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: "700",
  },
  googleButton: {
    minHeight: 54,
    width: "100%",
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.white,
    borderWidth: 1.5,
    borderColor: COLORS.gold,
  },
  googleButtonDisabled: {
    opacity: 0.7,
  },
  googleButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  googleBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#F3F5F7",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.divider,
  },
  googleBadgeText: {
    color: COLORS.primary,
    fontSize: 16,
    fontWeight: "700",
  },
  googleButtonText: {
    color: COLORS.primary,
    fontSize: 15,
    fontWeight: "700",
  },
  googleHint: {
    color: COLORS.textSecondary,
    fontSize: 13,
    textAlign: "center",
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  centerLink: {
    alignItems: "center",
    marginTop: 4,
  },
  linkText: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: "500",
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.divider,
    marginTop: 4,
  },
  helpLinkButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  helpLinkText: {
    color: COLORS.textSecondary,
    fontSize: 14,
  },
  footerLink: {
    marginTop: 24,
  },
  footerText: {
    color: COLORS.textSecondary,
    fontSize: 15,
    textAlign: "center",
  },
  footerLinkText: {
    color: COLORS.primary,
    fontWeight: "700",
  },
});

export default LoginScreen;
