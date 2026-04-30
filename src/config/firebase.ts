import { FirebaseOptions, getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

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

const app = firebaseConfig ? (getApps().length > 0 ? getApp() : initializeApp(firebaseConfig)) : null;

export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;

export default app;
