import "react-native-gesture-handler";

import React, { useMemo, useState } from "react";
import { ActivityIndicator, Platform, StyleSheet, View } from "react-native";
import { createNavigationContainerRef, NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import ForgotPasswordScreen from "./src/screens/ForgotPasswordScreen";
import HelpAccessScreen from "./src/screens/HelpAccessScreen";
import LoginScreen from "./src/screens/LoginScreen";
import MainAppScreen from "./src/screens/MainAppScreen";
import RegisterScreen from "./src/screens/RegisterScreen";
import { AuthProvider, useAuth } from "./src/context/AuthContext";
import { StudyContextProvider } from "./src/context/StudyContext";
import { ThemeProvider, useAppTheme } from "./src/context/ThemeContext";
import { RootStackParamList } from "./src/types/navigation";
import WebHeader from "./src/components/WebHeader";
import WebSidebar from "./src/components/WebSidebar";
import { useResponsiveLayout } from "./src/theme/layout";

const Stack = createNativeStackNavigator<RootStackParamList>();
const navigationRef = createNavigationContainerRef<any>();

const AppNavigator = () => {
  const { currentUser, isAuthReady } = useAuth();
  const { colors, isDark, navigationTheme } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [navigationState, setNavigationState] = useState<any>(null);

  return (
    <>
      <StatusBar
        style={!isAuthReady ? (isDark ? "light" : "dark") : currentUser && isDark ? "light" : "dark"}
      />
      <NavigationContainer
        ref={navigationRef}
        onStateChange={setNavigationState}
        theme={navigationTheme}
      >
        {!isAuthReady ? (
          <View style={styles.loadingScreen}>
            <ActivityIndicator color={colors.primary} size="large" />
          </View>
        ) : (
          currentUser ? (
            <AuthenticatedApp
              currentUser={currentUser}
              colors={colors}
              navigationState={navigationState}
            />
          ) : <AuthStack colors={colors} />
        )}
      </NavigationContainer>
    </>
  );
};

const AuthStack = ({ colors }: { colors: ReturnType<typeof import("./src/constants/colors").getColorsForScheme> }) => (
  <Stack.Navigator
    screenOptions={{
      headerShown: false,
      contentStyle: { backgroundColor: colors.background },
    }}
  >
    <Stack.Screen name="Login" component={LoginScreen} />
    <Stack.Screen name="Register" component={RegisterScreen} />
    <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
    <Stack.Screen name="HelpAccess" component={HelpAccessScreen} />
  </Stack.Navigator>
);

const getActiveRouteName = (state: any): string => {
  let current = state;
  while (current?.routes?.length) {
    current = current.routes[current.index ?? 0];
  }
  const route = current?.name || "Inicio";
  if (["CaseDetail", "NewCase"].includes(route)) return "Causas";
  if (["NewHearing", "LiveTranscription", "TranscriptionTest"].includes(route)) return "Calendario";
  if (["UploadDocument"].includes(route)) return "Documentos";
  if (["ActivityHistory"].includes(route)) return "Inicio";
  return route;
};

const AuthenticatedApp = ({ currentUser, colors, navigationState }: { currentUser: any; colors: ReturnType<typeof import("./src/constants/colors").getColorsForScheme>; navigationState: any }) => {
  const layout = useResponsiveLayout();
  const shellStyles = createStyles(colors);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const activeRoute = getActiveRouteName(navigationState);
  const isWebDesktop = Platform.OS === "web" && layout.isWebDesktop;

  const handleNavigate = (route: string) => {
    if (navigationRef.isReady()) {
      navigationRef.navigate("MainApp", {
        screen: "MainTabs",
        params: { screen: route },
      });
    }
  };

  const stack = <Stack.Navigator
    screenOptions={{
      headerShown: false,
      contentStyle: { backgroundColor: colors.background },
    }}
  >
    <Stack.Screen name="MainApp" component={MainAppScreen} />
  </Stack.Navigator>;

  if (!isWebDesktop) {
    return stack;
  }

  return (
    <View style={shellStyles.webShell}>
      <WebSidebar
        activeRoute={activeRoute}
        collapsed={sidebarCollapsed}
        currentUser={currentUser}
        onNavigate={handleNavigate}
        onToggle={() => setSidebarCollapsed((current) => !current)}
      />
      <View style={[shellStyles.webMain, sidebarCollapsed && shellStyles.webMainCollapsed]}>
        <WebHeader activeRoute={activeRoute} />
        <View style={shellStyles.webNavigator}>{stack}</View>
      </View>
    </View>
  );
};

const AppContent = () => {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <AuthProvider>
          <StudyContextProvider>
            <AppNavigator />
          </StudyContextProvider>
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
    webShell: {
      flex: 1,
      flexDirection: "row",
      backgroundColor: colors.background,
    },
    webMain: {
      flex: 1,
      marginLeft: 256,
      minWidth: 0,
    },
    webMainCollapsed: {
      marginLeft: 78,
    },
    webNavigator: {
      flex: 1,
      minHeight: 0,
    },
  });
