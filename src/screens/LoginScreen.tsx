import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  Alert,
} from "react-native";
import { User, Lock, Eye, EyeOff, HelpCircle } from "lucide-react-native";

import { authClient } from "../services/authClient";

export default function LoginScreen({ navigation }: any) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const validateForm = () => {
    let isValid = true;

    setEmailError("");
    setPasswordError("");

    if (!identifier.trim()) {
      setEmailError("Este campo es obligatorio");
      isValid = false;
    }

    if (!password.trim()) {
      setPasswordError("Este campo es obligatorio");
      isValid = false;
    }

    return isValid;
  };

  const handleLogin = async () => {
    if (!validateForm()) {
      return;
    }

    try {
      setIsLoading(true);

      await authClient.login({
        identifier,
        password,
        rememberMe,
      });
    } catch (error) {
      Alert.alert(
        "No pudimos iniciar sesion",
        error instanceof Error
          ? error.message
          : "Verifica tus datos e intenta nuevamente.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.keyboardView}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.container}>
          <View style={styles.card}>
            <View style={styles.header}>
              <Text style={styles.title}>Iniciar sesion</Text>
              <Text style={styles.subtitle}>
                Accede a tu cuenta para continuar en Luxia.
              </Text>
            </View>

            <View style={styles.form}>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Correo electronico o usuario</Text>

                <View
                  style={[
                    styles.inputWrapper,
                    emailError ? styles.inputError : null,
                  ]}
                >
                  <User size={20} color="#5B6776" style={styles.icon} />

                  <TextInput
                    value={identifier}
                    onChangeText={setIdentifier}
                    placeholder="tu.email@estudio.com o tuusuario"
                    placeholderTextColor="#5B6776"
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={styles.input}
                  />
                </View>

                {emailError ? (
                  <Text style={styles.errorText}>{emailError}</Text>
                ) : null}
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Contrasena</Text>

                <View
                  style={[
                    styles.inputWrapper,
                    passwordError ? styles.inputError : null,
                  ]}
                >
                  <Lock size={20} color="#5B6776" style={styles.icon} />

                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Ingresa tu contrasena"
                    placeholderTextColor="#5B6776"
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={styles.input}
                  />

                  <TouchableOpacity
                    onPress={() => setShowPassword(!showPassword)}
                    style={styles.eyeButton}
                  >
                    {showPassword ? (
                      <EyeOff size={20} color="#5B6776" />
                    ) : (
                      <Eye size={20} color="#5B6776" />
                    )}
                  </TouchableOpacity>
                </View>

                {passwordError ? (
                  <Text style={styles.errorText}>{passwordError}</Text>
                ) : null}
              </View>

              <TouchableOpacity
                style={styles.rememberRow}
                onPress={() => setRememberMe(!rememberMe)}
              >
                <View
                  style={[
                    styles.checkbox,
                    rememberMe ? styles.checkboxActive : null,
                  ]}
                >
                  {rememberMe ? <Text style={styles.checkText}>X</Text> : null}
                </View>

                <Text style={styles.rememberText}>Recordarme</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.loginButton,
                  isLoading ? styles.buttonDisabled : null,
                ]}
                onPress={handleLogin}
                disabled={isLoading}
              >
                {isLoading ? (
                  <View style={styles.loadingRow}>
                    <ActivityIndicator color="#FFFFFF" size="small" />
                    <Text style={styles.loginButtonText}>Ingresando...</Text>
                  </View>
                ) : (
                  <Text style={styles.loginButtonText}>Ingresar</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => navigation.navigate("ForgotPassword")}
              >
                <Text style={styles.forgotText}>Olvide mi contrasena</Text>
              </TouchableOpacity>

              <View style={styles.divider} />

              <TouchableOpacity
                onPress={() => navigation.navigate("HelpAccess")}
                style={styles.helpButton}
              >
                <HelpCircle size={16} color="#5B6776" />
                <Text style={styles.helpText}>
                  Necesitas ayuda para acceder?
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.registerContainer}>
            <Text style={styles.registerText}>No tenes cuenta? </Text>
            <TouchableOpacity onPress={() => navigation.navigate("Register")}>
              <Text style={styles.registerLink}>Crear cuenta</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardView: {
    flex: 1,
    backgroundColor: "#F3F5F7",
  },
  scrollContainer: {
    flexGrow: 1,
  },
  container: {
    flex: 1,
    backgroundColor: "#F3F5F7",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 48,
  },
  card: {
    width: "100%",
    backgroundColor: "#FBFBFC",
    borderRadius: 20,
    borderWidth: 2,
    borderColor: "#C4A77D",
    padding: 28,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 6,
    },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
  },
  header: {
    alignItems: "center",
    marginBottom: 30,
  },
  title: {
    color: "#1E2A36",
    fontSize: 30,
    fontWeight: "700",
    marginBottom: 8,
  },
  subtitle: {
    color: "#5B6776",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  form: {
    gap: 18,
  },
  inputGroup: {
    gap: 8,
  },
  label: {
    color: "#1E2A36",
    fontSize: 14,
    fontWeight: "700",
  },
  inputWrapper: {
    height: 52,
    backgroundColor: "#FFFFFF",
    borderWidth: 2,
    borderColor: "#C4A77D",
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
  },
  inputError: {
    borderColor: "#EF4444",
  },
  icon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    color: "#1E2A36",
    fontSize: 15,
  },
  eyeButton: {
    padding: 4,
  },
  errorText: {
    color: "#EF4444",
    fontSize: 12,
  },
  rememberRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: "#C4A77D",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  checkboxActive: {
    backgroundColor: "#123A67",
    borderColor: "#123A67",
  },
  checkText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  rememberText: {
    marginLeft: 8,
    color: "#5B6776",
    fontSize: 14,
  },
  loginButton: {
    height: 54,
    backgroundColor: "#123A67",
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.18,
    shadowRadius: 5,
    elevation: 4,
  },
  buttonDisabled: {
    backgroundColor: "#5B6776",
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  loginButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  forgotText: {
    color: "#1E4F88",
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
  },
  divider: {
    height: 1,
    backgroundColor: "#D6DCE5",
    marginTop: 2,
  },
  helpButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  helpText: {
    color: "#5B6776",
    fontSize: 12,
  },
  registerContainer: {
    marginTop: 24,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  registerText: {
    color: "#5B6776",
    fontSize: 14,
  },
  registerLink: {
    color: "#1E4F88",
    fontSize: 14,
    fontWeight: "700",
  },
});
