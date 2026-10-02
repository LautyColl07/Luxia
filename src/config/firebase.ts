import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { FirebaseOptions, getApp, getApps, initializeApp } from "firebase/app";
import {
  browserSessionPersistence,
  getAuth,
  inMemoryPersistence,
  initializeAuth,
} from "firebase/auth";
// TypeScript resolves Firebase's generic declaration, while Metro resolves the React Native entrypoint.
// @ts-expect-error getReactNativePersistence is declared only in Firebase Auth's React Native condition.
import { getReactNativePersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

import { IS_CAPTURE_MODE } from "./captureMode";

const firebaseFallbackConfig = {
  apiKey: "AIzaSyDwGuMIFRLXNvrFRHdfwRPhcb7g9TlRt_g",
  authDomain: "luxia-app.firebaseapp.com",
  projectId: "luxia-app",
  storageBucket: "luxia-app.firebasestorage.app",
  messagingSenderId: "62290555991",
  appId: "1:62290555991:web:5ac53e46ee9168a1125f12",
  measurementId: "G-6MH5MWNKVS",
};

const firebaseEnv = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || firebaseFallbackConfig.apiKey,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || firebaseFallbackConfig.authDomain,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || firebaseFallbackConfig.projectId,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || firebaseFallbackConfig.storageBucket,
  messagingSenderId:
    process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || firebaseFallbackConfig.messagingSenderId,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || firebaseFallbackConfig.appId,
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID || firebaseFallbackConfig.measurementId,
};

export const missingFirebaseKeys = Object.entries(firebaseEnv)
  .filter(([key, value]) => key !== "measurementId" && !value)
  .map(([key]) => key);

export const isFirebaseConfigured = missingFirebaseKeys.length === 0;

export const firebaseConfig: FirebaseOptions | null = isFirebaseConfigured
  ? {
      apiKey: firebaseEnv.apiKey!,
      authDomain: firebaseEnv.authDomain!,
      projectId: firebaseEnv.projectId!,
      storageBucket: firebaseEnv.storageBucket!,
      messagingSenderId: firebaseEnv.messagingSenderId!,
      appId: firebaseEnv.appId!,
      measurementId: firebaseEnv.measurementId,
    }
  : null;

const app = !IS_CAPTURE_MODE && firebaseConfig
  ? (getApps().length > 0 ? getApp() : initializeApp(firebaseConfig))
  : null;

const isAuthAlreadyInitializedError = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  (error as { code?: unknown }).code === "auth/already-initialized";

const initializePersistentAuth = () => {
  if (!app) {
    return null;
  }

  // Firebase's React Native persistence adapter is not supported by the web
  // build. Use session storage on web so a broken IndexedDB instance cannot
  // leave the app waiting forever while restoring auth state.
  if (Platform.OS === "web") {
    try {
      return initializeAuth(app, { persistence: browserSessionPersistence });
    } catch (error) {
      if (isAuthAlreadyInitializedError(error)) {
        return getAuth(app);
      }

      // A restricted browser storage environment must still be able to show
      // the login screen and recover without an infinite loading state.
      return initializeAuth(app, { persistence: inMemoryPersistence });
    }
  }

  try {
    return initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch (error) {
    if (isAuthAlreadyInitializedError(error)) {
      return getAuth(app);
    }

    throw error;
  }
};

export const auth = initializePersistentAuth();
export const db = app ? getFirestore(app) : null;

export default app;
