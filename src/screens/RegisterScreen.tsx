import React, { useState } from "react";
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
import {
  Briefcase,
  Eye,
  EyeOff,
  Lock,
  Mail,
  User,
} from "lucide-react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";

import { authClient } from "../services/authClient";
import { CARD_SHADOW, COLORS, TYPOGRAPHY } from "../theme/luxiaTheme";
import { RootStackParamList } from "../types/navigation";

type RegisterScreenProps = NativeStackScreenProps<RootStackParamList, "Register">;

type RegisterForm = {
  firstName: string;
  lastName: string;
  email: string;
  enrollment: string;
  lawFirm: string;
  username: string;
  password: string;
  confirmPassword: string;
  acceptedTerms: boolean;
};

type RegisterErrors = Partial<Record<keyof RegisterForm, string>> & {
  general?: string;
};

const initialForm: RegisterForm = {
  firstName: "",
  lastName: "",
  email: "",
  enrollment: "",
  lawFirm: "",
  username: "",
  password: "",
  confirmPassword: "",
  acceptedTerms: false,
};

const RegisterScreen = ({ navigation }: RegisterScreenProps) => {
  const [form, setForm] = useState<RegisterForm>(initialForm);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errors, setErrors] = useState<RegisterErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const setField = <K extends keyof RegisterForm>(field: K, value: RegisterForm[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined, general: undefined }));
  };

  const validateForm = () => {
    const nextErrors: RegisterErrors = {};

    if (!form.firstName.trim()) {
      nextErrors.firstName = "Ingresá tu nombre";
    }

    if (!form.lastName.trim()) {
      nextErrors.lastName = "Ingresá tu apellido";
    }

    if (!form.email.trim()) {
      nextErrors.email = "Ingresá tu email";
    } else if (!/\S+@\S+\.\S+/.test(form.email.trim())) {
      nextErrors.email = "Ingresá un email válido";
    }

    if (!form.username.trim()) {
      nextErrors.username = "Elegí un nombre de usuario";
    }

    if (!form.password.trim()) {
      nextErrors.password = "Ingresá una contraseña";
    } else if (form.password.length < 8) {
      nextErrors.password = "La contraseña debe tener al menos 8 caracteres";
    }

    if (!form.confirmPassword.trim()) {
      nextErrors.confirmPassword = "Repetí tu contraseña";
    } else if (form.confirmPassword !== form.password) {
      nextErrors.confirmPassword = "Las contraseñas no coinciden";
    }

    if (!form.acceptedTerms) {
      nextErrors.acceptedTerms = "Necesitás aceptar los términos para continuar";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleRegister = async () => {
    if (isSubmitting || !validateForm()) {
      return;
    }

    setIsSubmitting(true);
    setErrors({});

    try {
      await authClient.register({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        enrollment: form.enrollment.trim(),
        lawFirm: form.lawFirm.trim(),
        username: form.username.trim(),
        password: form.password,
      });
    } catch (error) {
      console.error("[RegisterScreen] Error registrando usuario:", error);
      const message =
        error instanceof Error
          ? error.message
          : "No se pudo crear la cuenta. Intentá nuevamente.";

      setErrors({ general: message });
    } finally {
      setIsSubmitting(false);
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
              <Text style={styles.title}>Crear cuenta</Text>
              <Text style={styles.subtitle}>
                Completa tus datos para acceder a la plataforma de gestion judicial.
              </Text>

              <View style={styles.row}>
                <View style={styles.halfWidth}>
                  <Field
                    error={errors.firstName}
                    icon={<User size={18} color={COLORS.textSecondary} />}
                    label="Nombre *"
                    onChangeText={(value) => setField("firstName", value)}
                    placeholder="Tu nombre"
                    value={form.firstName}
                  />
                </View>
                <View style={styles.halfWidth}>
                  <Field
                    error={errors.lastName}
                    icon={<User size={18} color={COLORS.textSecondary} />}
                    label="Apellido *"
                    onChangeText={(value) => setField("lastName", value)}
                    placeholder="Tu apellido"
                    value={form.lastName}
                  />
                </View>
              </View>

              <Field
                error={errors.email}
                icon={<Mail size={18} color={COLORS.textSecondary} />}
                keyboardType="email-address"
                label="Email *"
                onChangeText={(value) => setField("email", value)}
                placeholder="tu.email@estudio.com"
                value={form.email}
              />

              <View style={styles.row}>
                <View style={styles.halfWidth}>
                  <Field
                    error={errors.enrollment}
                    icon={<Briefcase size={18} color={COLORS.textSecondary} />}
                    label="Matrícula"
                    onChangeText={(value) => setField("enrollment", value)}
                    placeholder="Número de matrícula"
                    value={form.enrollment}
                  />
                </View>
                <View style={styles.halfWidth}>
                  <Field
                    error={errors.lawFirm}
                    icon={<Briefcase size={18} color={COLORS.textSecondary} />}
                    label="Estudio jurídico"
                    onChangeText={(value) => setField("lawFirm", value)}
                    placeholder="Nombre del estudio"
                    value={form.lawFirm}
                  />
                </View>
              </View>

              <Field
                error={errors.username}
                icon={<User size={18} color={COLORS.textSecondary} />}
                label="Usuario *"
                onChangeText={(value) => setField("username", value)}
                placeholder="Elegí un nombre de usuario"
                value={form.username}
              />

              <View style={styles.row}>
                <View style={styles.halfWidth}>
                  <PasswordField
                    error={errors.password}
                    isVisible={showPassword}
                    label="Contraseña *"
                    onChangeText={(value) => setField("password", value)}
                    onToggleVisibility={() => setShowPassword((current) => !current)}
                    placeholder="Mínimo 8 caracteres"
                    value={form.password}
                  />
                </View>
                <View style={styles.halfWidth}>
                  <PasswordField
                    error={errors.confirmPassword}
                    isVisible={showConfirmPassword}
                    label="Confirmar contraseña *"
                    onChangeText={(value) => setField("confirmPassword", value)}
                    onToggleVisibility={() =>
                      setShowConfirmPassword((current) => !current)
                    }
                    placeholder="Repetí tu contraseña"
                    value={form.confirmPassword}
                  />
                </View>
              </View>

              <Pressable
                accessibilityRole="checkbox"
                onPress={() => setField("acceptedTerms", !form.acceptedTerms)}
                style={styles.checkboxRow}
              >
                <View
                  style={[
                    styles.checkboxBox,
                    form.acceptedTerms ? styles.checkboxBoxActive : undefined,
                  ]}
                >
                  {form.acceptedTerms ? <Text style={styles.checkboxMark}>✓</Text> : null}
                </View>
                <Text style={styles.checkboxText}>
                  Acepto los <Text style={styles.checkboxLink}>términos y condiciones</Text> y la{" "}
                  <Text style={styles.checkboxLink}>política de privacidad</Text>
                </Text>
              </Pressable>
              {errors.acceptedTerms ? (
                <Text style={styles.errorText}>{errors.acceptedTerms}</Text>
              ) : null}

              {errors.general ? (
                <View style={styles.messageBox}>
                  <Text style={styles.errorText}>{errors.general}</Text>
                </View>
              ) : null}

              <TouchableOpacity
                activeOpacity={0.9}
                disabled={isSubmitting}
                onPress={handleRegister}
                style={[styles.primaryButton, isSubmitting ? styles.primaryButtonDisabled : undefined]}
              >
                {isSubmitting ? (
                  <View style={styles.loadingRow}>
                    <ActivityIndicator color={COLORS.white} size="small" />
                    <Text style={styles.primaryButtonText}>Creando cuenta...</Text>
                  </View>
                ) : (
                  <Text style={styles.primaryButtonText}>Crear cuenta</Text>
                )}
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => navigation.navigate("Login")}
              style={styles.footerLink}
            >
              <Text style={styles.footerText}>
                ¿Ya tenés cuenta? <Text style={styles.footerLinkText}>Iniciá sesión</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

type FieldProps = {
  error?: string;
  icon: React.ReactNode;
  keyboardType?: "default" | "email-address";
  label: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  value: string;
};

const Field = ({
  error,
  icon,
  keyboardType = "default",
  label,
  onChangeText,
  placeholder,
  value,
}: FieldProps) => {
  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.inputWrapper, error ? styles.inputWrapperError : undefined]}>
        {icon}
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType={keyboardType}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={COLORS.textMuted}
          style={styles.input}
          value={value}
        />
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
};

type PasswordFieldProps = {
  error?: string;
  isVisible: boolean;
  label: string;
  onChangeText: (value: string) => void;
  onToggleVisibility: () => void;
  placeholder: string;
  value: string;
};

const PasswordField = ({
  error,
  isVisible,
  label,
  onChangeText,
  onToggleVisibility,
  placeholder,
  value,
}: PasswordFieldProps) => {
  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.inputWrapper, error ? styles.inputWrapperError : undefined]}>
        <Lock size={18} color={COLORS.textSecondary} />
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={COLORS.textMuted}
          secureTextEntry={!isVisible}
          style={styles.input}
          value={value}
        />
        <Pressable accessibilityRole="button" hitSlop={8} onPress={onToggleVisibility}>
          {isVisible ? (
            <EyeOff size={18} color={COLORS.textSecondary} />
          ) : (
            <Eye size={18} color={COLORS.textSecondary} />
          )}
        </Pressable>
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
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
    maxWidth: 720,
    backgroundColor: COLORS.card,
    borderWidth: 1.5,
    borderColor: COLORS.gold,
    borderRadius: 22,
    paddingHorizontal: 22,
    paddingVertical: 28,
    gap: 16,
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
    marginTop: -4,
    marginBottom: 10,
    color: COLORS.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },
  row: {
    flexDirection: "row",
    gap: 16,
    flexWrap: "wrap",
  },
  halfWidth: {
    flex: 1,
    minWidth: 260,
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
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1.5,
    borderColor: COLORS.gold,
    borderRadius: 14,
    backgroundColor: COLORS.card,
    paddingHorizontal: 12,
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
  checkboxRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
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
    marginTop: 1,
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
    flex: 1,
    color: COLORS.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  checkboxLink: {
    color: COLORS.primary,
    fontWeight: "700",
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
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
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
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
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

export default RegisterScreen;
