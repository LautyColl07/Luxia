import "react-native-gesture-handler";

import React, { useEffect, useState } from "react";
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
import { preloadDashboardBootstrap, setAuthToken } from "./src/services/api";
import { COLORS } from "./src/theme/luxiaTheme";
import { RootStackParamList } from "./src/types/navigation";

const Stack = createNativeStackNavigator<RootStackParamList>();

const App = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(auth?.currentUser ?? null);
  const [isAuthReady, setIsAuthReady] = useState(!auth || Boolean(auth?.currentUser));

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
        <StatusBar style="dark" />
        <NavigationContainer>
          {!isAuthReady && !currentUser ? (
            <View style={styles.loadingScreen}>
              <ActivityIndicator color={COLORS.primary} size="large" />
            </View>
          ) : (
            <Stack.Navigator
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: COLORS.background },
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
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
};

export default App;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.background,
  },
});
