import "react-native-gesture-handler";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { createNavigationContainerRef, NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import ForgotPasswordScreen from "./src/screens/ForgotPasswordScreen";
import HelpAccessScreen from "./src/screens/HelpAccessScreen";
import IntroScreen from "./src/screens/IntroScreen";
import LoginScreen from "./src/screens/LoginScreen";
import MainAppScreen from "./src/screens/MainAppScreen";
import RegisterScreen from "./src/screens/RegisterScreen";
import { AuthProvider, useAuth } from "./src/context/AuthContext";
import { StudyContextProvider } from "./src/context/StudyContext";
import { ThemeProvider, useAppTheme } from "./src/context/ThemeContext";
import { RootStackParamList } from "./src/types/navigation";
import WebHeader from "./src/components/WebHeader";
import WebSidebar from "./src/components/WebSidebar";
import CaptureModeBadge from "./src/components/CaptureModeBadge";
import { useResponsiveLayout } from "./src/theme/layout";
import { readPendingStudyInvitation, savePendingStudyInvitation } from "./src/utils/pendingStudyInvitation";

const Stack = createNativeStackNavigator<RootStackParamList>();
const navigationRef = createNavigationContainerRef<any>();

const AppNavigator = () => {
  const { authError, authStatus, clearAuthError, currentUser, isAuthReady } = useAuth();
  const { colors, isDark, navigationTheme } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [navigationState, setNavigationState] = useState<any>(null);
  const [pendingInvitation, setPendingInvitation] = useState<{ invitationId: string; token: string } | null>(null);
  const invitationOpenedRef = useRef(false);

  useEffect(() => {
    const readInvitationUrl = (url?: string | null) => {
      if (!url) return false;
      try {
        const parsed = new URL(url);
        const invitationId = parsed.searchParams.get("invitation");
        const token = new URLSearchParams(parsed.hash.replace(/^#/, "")).get("token");
        if (!invitationId || !token) return false;
        const invitation = { invitationId, token };
        savePendingStudyInvitation(invitation);
        setPendingInvitation(invitation);
        const browserWindow = (globalThis as any).window;
        if (Platform.OS === "web" && browserWindow) {
          parsed.searchParams.delete("invitation");
          const remainingHash = new URLSearchParams(parsed.hash.replace(/^#/, ""));
          remainingHash.delete("token");
          const remainingSearchText = parsed.searchParams.toString();
          const remainingHashText = remainingHash.toString();
          const safeUrl = `${parsed.pathname}${remainingSearchText ? `?${remainingSearchText}` : ""}${remainingHashText ? `#${remainingHashText}` : ""}`;
          browserWindow.history.replaceState(null, browserWindow.document?.title || "", safeUrl);
        }
        return true;
      } catch { return false; /* Ignore unrelated links. */ }
    };
    let foundInCurrentUrl = false;
    const browserWindow = (globalThis as any).window;
    if (Platform.OS === "web" && browserWindow) foundInCurrentUrl = readInvitationUrl(browserWindow.location.href);
    void Linking.getInitialURL().then((url) => {
      const foundInInitialUrl = readInvitationUrl(url);
      if (!foundInCurrentUrl && !foundInInitialUrl) {
        const saved = readPendingStudyInvitation();
        if (saved) setPendingInvitation(saved);
      }
    }).catch(() => {
      if (!foundInCurrentUrl) {
        const saved = readPendingStudyInvitation();
        if (saved) setPendingInvitation(saved);
      }
    });
    const subscription = Linking.addEventListener("url", ({ url }) => readInvitationUrl(url));
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (authStatus === "unauthenticated") {
      invitationOpenedRef.current = false;
      const saved = readPendingStudyInvitation();
      if (saved) setPendingInvitation(saved);
    }
  }, [authStatus]);

  useEffect(() => {
    if (!pendingInvitation || authStatus !== "authenticated" || !navigationRef.isReady() || invitationOpenedRef.current) return;
    invitationOpenedRef.current = true;
    navigationRef.navigate("MainApp", { screen: "InvitacionesEstudio", params: pendingInvitation });
    setPendingInvitation(null);
  }, [authStatus, pendingInvitation, navigationState]);

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
        {!isAuthReady || (currentUser && authStatus === "synchronizing") ? (
          <View style={styles.loadingScreen}>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text style={styles.loadingText}>
              {authStatus === "synchronizing"
                ? "Validando tu acceso con Luxia..."
                : "Restaurando tu sesion..."}
            </Text>
          </View>
        ) : (
          currentUser && authStatus === "authenticated" ? (
            <AuthenticatedApp
              authWarning={authError}
              clearAuthWarning={clearAuthError}
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

const AuthenticatedApp = ({ authWarning, clearAuthWarning, currentUser, colors, navigationState }: { authWarning: string | null; clearAuthWarning: () => void; currentUser: any; colors: ReturnType<typeof import("./src/constants/colors").getColorsForScheme>; navigationState: any }) => {
  const layout = useResponsiveLayout();
  const shellStyles = createStyles(colors);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const activeRoute = getActiveRouteName(navigationState);
  const isWebDesktop = Platform.OS === "web" && layout.isWebDesktop;

  const handleNavigate = (route: string) => {
    if (navigationRef.isReady()) {
      if (route === "AdministracionEstudio" || route === "InvitacionesEstudio") {
        navigationRef.navigate("MainApp", { screen: route });
        return;
      }
      navigationRef.navigate("MainApp", {
        screen: "MainTabs",
        params: { screen: route },
      });
    }
  };

  const stack = (
    <View style={shellStyles.authenticatedContent}>
      {authWarning ? (
        <View accessibilityLiveRegion="polite" accessibilityRole="alert" style={shellStyles.authWarning}>
          <Text style={shellStyles.authWarningText}>{authWarning}</Text>
          <Pressable accessibilityRole="button" onPress={clearAuthWarning}>
            <Text style={shellStyles.authWarningAction}>Cerrar</Text>
          </Pressable>
        </View>
      ) : null}
      <View style={shellStyles.authenticatedNavigator}>
        <Stack.Navigator
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="MainApp" component={MainAppScreen} />
        </Stack.Navigator>
      </View>
    </View>
  );

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
          <CaptureModeBadge />
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
};

const App = () => {
  const [fontsLoaded] = useFonts({
    ...Feather.font,
    ...Ionicons.font,
    ...MaterialCommunityIcons.font,
  });
  const [showIntro, setShowIntro] = useState(Platform.OS !== "web");

  if (!fontsLoaded) {
    return (
      <View style={iconFontLoadingStyles.iconFontLoading}>
        <ActivityIndicator color="#C9B38C" size="large" />
      </View>
    );
  }

  if (Platform.OS !== "web" && showIntro) {
    return <IntroScreen onFinish={() => setShowIntro(false)} />;
  }

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
    loadingText: {
      marginTop: 14,
      color: "#5B6776",
      fontSize: 14,
    },
    authenticatedContent: {
      flex: 1,
      minHeight: 0,
    },
    authenticatedNavigator: {
      flex: 1,
      minHeight: 0,
    },
    authWarning: {
      minHeight: 44,
      paddingHorizontal: 16,
      paddingVertical: 10,
      backgroundColor: "#FFF7ED",
      borderBottomWidth: 1,
      borderBottomColor: "#FDBA74",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
    },
    authWarningText: {
      flex: 1,
      color: "#9A3412",
      fontSize: 13,
      lineHeight: 18,
    },
    authWarningAction: {
      color: "#9A3412",
      fontSize: 13,
      fontWeight: "700",
      padding: 4,
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

const iconFontLoadingStyles = StyleSheet.create({
  iconFontLoading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#07111E",
  },
});
