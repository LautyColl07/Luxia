import "react-native-gesture-handler";

import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { onIdTokenChanged, User } from "firebase/auth";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import ForgotPasswordScreen from "./src/screens/ForgotPasswordScreen";
import HelpAccessScreen from "./src/screens/HelpAccessScreen";
import LoginScreen from "./src/screens/LoginScreen";
import MainAppScreen from "./src/screens/MainAppScreen";
import RegisterScreen from "./src/screens/RegisterScreen";
import { auth } from "./src/config/firebase";
import { AuthProvider } from "./src/context/AuthContext";
import { ThemeProvider, useAppTheme } from "./src/context/ThemeContext";
import { preloadDashboardBootstrap, setAuthToken } from "./src/services/api";
import { RootStackParamList } from "./src/types/navigation";

const Stack = createNativeStackNavigator<RootStackParamList>();

const AppContent = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(auth?.currentUser ?? null);
  const [isAuthReady, setIsAuthReady] = useState(!auth || Boolean(auth?.currentUser));
  const { colors, isDark, navigationTheme } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  useEffect(() => {
    if (!auth) {
      setAuthToken(null);
      setIsAuthReady(true);
      return;
    }

    const unsubscribe = onIdTokenChanged(auth, async (nextUser) => {
      setCurrentUser(nextUser);
      setIsAuthReady(true);

      if (!nextUser) {
        setAuthToken(null);
        return;
      }

      nextUser
        .getIdToken()
        .then((token) => {
          setAuthToken(token);
          void preloadDashboardBootstrap();
        })
        .catch(() => {
          setAuthToken(null);
        });
    });

    return unsubscribe;
  }, []);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <AuthProvider currentUser={currentUser} isAuthReady={isAuthReady}>
          <StatusBar style={isDark ? "light" : "dark"} />
          <NavigationContainer theme={navigationTheme}>
            {!isAuthReady && !currentUser ? (
              <View style={styles.loadingScreen}>
                <ActivityIndicator color={colors.primary} size="large" />
              </View>
            ) : (
              <Stack.Navigator
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: colors.background },
                }}
              >
                {currentUser ? (
                  <Stack.Screen name="MainApp" component={MainAppScreen} />
                ) : (
                  <>
                    <Stack.Screen name="Login" component={LoginScreen} />
                    <Stack.Screen name="Register" component={RegisterScreen} />
                    <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
                    <Stack.Screen name="HelpAccess" component={HelpAccessScreen} />
                  </>
                )}
              </Stack.Navigator>
            )}
          </NavigationContainer>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
};

const App = () => {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
};

export default App;

const createStyles = (colors: { background: string }) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.background,
    },
    loadingScreen: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.background,
    },
  });
