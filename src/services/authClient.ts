import { FirebaseError } from "firebase/app";
import {
  browserLocalPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  updateProfile,
  User,
} from "firebase/auth";
import { Platform } from "react-native";
import { doc, getDocFromCache, serverTimestamp, setDoc } from "firebase/firestore";

import { auth, db, isFirebaseConfigured, missingFirebaseKeys } from "../config/firebase";
import { setAuthToken, syncRegister } from "./api";
import {
  getUsernameValidationError,
  normalizeLoginIdentifier,
  resolveRegisterUsername,
} from "../utils/auth";

const GENERIC_LOGIN_ERROR_MESSAGE =
  "El usuario o la contrasena son incorrectos.";
const GENERIC_PASSWORD_RESET_MESSAGE =
  "Si existe una cuenta con ese email, vas a recibir un enlace para restablecer tu contrasena.";
const GENERIC_PASSWORD_RESET_ERROR_MESSAGE =
  "No pudimos enviar el email de restablecimiento. Intenta nuevamente.";

export type LoginPayload = {
  identifier: string;
  password: string;
  rememberMe: boolean;
};

export type RegisterPayload = {
  firstName: string;
  lastName: string;
  email: string;
  matricula?: string;
  estudioJuridico?: string;
  enrollment?: string;
  lawFirm?: string;
  username: string;
  password: string;
};

type BackendRegisterPayload = {
  firstName: string;
  lastName: string;
  name: string;
  displayName: string;
  username: string;
  matricula: string;
  estudioJuridico: string;
};

type StoredUserProfile = Partial<RegisterPayload> & {
  displayName?: string | null;
  fullName?: string | null;
  name?: string | null;
};

const registerSyncInFlight = new Map<string, Promise<unknown>>();
const registerSyncCompleted = new Set<string>();

const getFirebaseSetupMessage = () =>
  `El cliente de Firebase no esta configurado. Completa EXPO_PUBLIC_FIREBASE_* en tu .env. Faltan: ${missingFirebaseKeys.join(", ")}.`;

const mapFirebaseAuthError = (code: string) => {
  switch (code) {
    case "auth/invalid-email":
      return "El email ingresado no es valido.";
    case "auth/wrong-password":
    case "auth/user-not-found":
    case "auth/invalid-credential":
      return GENERIC_LOGIN_ERROR_MESSAGE;
    case "auth/email-already-in-use":
      return "Ya existe una cuenta registrada con este email.";
    case "auth/weak-password":
      return "La contrasena es demasiado debil.";
    case "auth/too-many-requests":
      return "Detectamos demasiados intentos. Espera unos minutos e intenta nuevamente.";
    case "auth/user-disabled":
      return "Esta cuenta esta deshabilitada. Contacta al administrador de Luxia.";
    case "auth/network-request-failed":
      return "No pudimos conectarnos con Firebase. Revisa tu conexion e intenta nuevamente.";
    case "auth/internal-error":
      return "Firebase no pudo procesar el inicio de sesion. Intenta nuevamente mas tarde.";
    default:
      return "No pudimos completar la operacion. Intenta nuevamente.";
  }
};

const createAbortError = () => {
  const error = new Error("Operation aborted");
  error.name = "AbortError";
  return error;
};

const cleanString = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const splitDisplayName = (displayName: string) => {
  const parts = displayName.split(/\s+/).filter(Boolean);
  const firstName = parts[0] || "";
  const lastName = parts.slice(1).join(" ");

  return { firstName, lastName };
};

async function getStoredUserProfile(
  uid: string,
  signal?: AbortSignal
): Promise<StoredUserProfile> {
  if (!db) {
    return {};
  }

  if (signal?.aborted) {
    throw createAbortError();
  }

  // Login must not wait on a Firestore network read. The backend contract only
  // needs the Firebase identity/name, so use the local cache when available and
  // fall back to Auth metadata. Firestore remains the source for profile screens.
  try {
    const cachedSnapshot = await getDocFromCache(doc(db, "users", uid));
    return cachedSnapshot.exists()
      ? cachedSnapshot.data() as StoredUserProfile
      : {};
  } catch {
    if (__DEV__) {
      console.warn("[authClient] Perfil de Firestore no disponible; se usara el perfil de Auth.");
    }
    return {};
  }
}

function buildBackendRegisterPayload(
  user: User,
  storedProfile: StoredUserProfile = {}
): BackendRegisterPayload {
  const emailUsername = cleanString(user.email).split("@")[0];
  const displayName =
    cleanString(storedProfile.displayName) ||
    cleanString(storedProfile.fullName) ||
    cleanString(storedProfile.name) ||
    cleanString(user.displayName);
  const fallbackName = splitDisplayName(displayName);
  const firstName = cleanString(storedProfile.firstName) || fallbackName.firstName;
  const lastName = cleanString(storedProfile.lastName) || fallbackName.lastName;
  const name = [firstName, lastName].filter(Boolean).join(" ") || displayName || emailUsername || user.uid;

  return {
    firstName,
    lastName,
    name,
    displayName: displayName || name,
    username: cleanString(storedProfile.username) || emailUsername || user.uid,
    matricula: cleanString(storedProfile.matricula ?? storedProfile.enrollment),
    estudioJuridico: cleanString(storedProfile.estudioJuridico ?? storedProfile.lawFirm),
  };
}

export function resetRegisterSyncCache(uid?: string) {
  if (uid) {
    registerSyncInFlight.delete(uid);
    registerSyncCompleted.delete(uid);
    return;
  }

  registerSyncInFlight.clear();
  registerSyncCompleted.clear();
}

export async function syncRegisterOnce(user: User, signal?: AbortSignal) {
  if (registerSyncCompleted.has(user.uid)) {
    return null;
  }

  const currentSync = registerSyncInFlight.get(user.uid);

  if (currentSync) {
    return currentSync;
  }

  const syncPromise = (async () => {
    const token = await user.getIdToken();

    if (!token) {
      throw new Error("No Firebase token available");
    }

    const storedProfile = await getStoredUserProfile(user.uid, signal);

    if (signal?.aborted) {
      throw createAbortError();
    }

    setAuthToken(token);
    const payload = buildBackendRegisterPayload(user, storedProfile);

    await syncRegister(payload);
    registerSyncCompleted.add(user.uid);
    return payload;
  })().finally(() => {
    registerSyncInFlight.delete(user.uid);
  });

  registerSyncInFlight.set(user.uid, syncPromise);
  return syncPromise;
}

export const authClient = {
  async login(payload: LoginPayload) {
    if (!payload.identifier || !payload.password) {
      throw new Error("Completa tu email o usuario y la contrasena para continuar.");
    }

    if (!isFirebaseConfigured || !auth) {
      throw new Error(getFirebaseSetupMessage());
    }

    try {
      const emailForLogin = normalizeLoginIdentifier(payload.identifier);
      if (!emailForLogin.includes("@")) {
        throw new Error("Ingresa el correo electronico con el que registraste tu cuenta.");
      }

      if (Platform.OS === "web") {
        await setPersistence(
          auth,
          payload.rememberMe ? browserLocalPersistence : browserSessionPersistence,
        );
      }

      const credential = await signInWithEmailAndPassword(
        auth,
        emailForLogin,
        payload.password,
      );

      return {
        ok: true,
        mode: "firebase-auth",
        user: credential.user,
      };
    } catch (error) {
      if (error instanceof FirebaseError) {
        throw new Error(mapFirebaseAuthError(error.code));
      }

      if (error instanceof Error) {
        throw error;
      }

      throw new Error("No pudimos iniciar sesion. Intenta nuevamente.");
    }
  },

  async register(payload: RegisterPayload) {
    if (!payload.firstName || !payload.lastName || !payload.email) {
      throw new Error("Completa los datos obligatorios para crear la cuenta.");
    }

    if (!isFirebaseConfigured || !auth) {
      throw new Error(getFirebaseSetupMessage());
    }

    try {
      const normalizedEmail = payload.email.trim();
      const resolvedUsername = resolveRegisterUsername({
        firstName: payload.firstName,
        lastName: payload.lastName,
        email: normalizedEmail,
        username: payload.username,
      });
      const usernameError = getUsernameValidationError(resolvedUsername);

      if (usernameError) {
        throw new Error(usernameError);
      }

      const credential = await createUserWithEmailAndPassword(
        auth,
        normalizedEmail,
        payload.password,
      );

      const fullName = `${payload.firstName} ${payload.lastName}`.trim();

      await updateProfile(credential.user, {
        displayName: fullName,
      });

      if (db) {
        const matricula = payload.matricula ?? payload.enrollment ?? "";
        const estudioJuridico = payload.estudioJuridico ?? payload.lawFirm ?? "";

        await setDoc(doc(db, "users", credential.user.uid), {
          uid: credential.user.uid,
          email: normalizedEmail,
          firstName: payload.firstName.trim(),
          lastName: payload.lastName.trim(),
          fullName,
          name: fullName,
          displayName: fullName,
          username: payload.username,
          matricula: matricula || null,
          estudioJuridico: estudioJuridico || null,
          enrollment: matricula || null,
          lawFirm: estudioJuridico || null,
          createdAt: serverTimestamp(),
        });
      }

      return {
        ok: true,
        mode: "firebase-auth",
        user: credential.user,
      };
    } catch (error) {
      if (error instanceof FirebaseError) {
        throw new Error(mapFirebaseAuthError(error.code));
      }

      if (error instanceof Error) {
        throw error;
      }

      throw new Error("No se pudo crear la cuenta. Intenta nuevamente.");
    }
  },

  async resetPassword(email: string) {
    const normalizedEmail = email.trim();

    if (!normalizedEmail) {
      throw new Error("Ingresa tu email para continuar.");
    }

    if (!isFirebaseConfigured || !auth) {
      throw new Error(getFirebaseSetupMessage());
    }

    try {
      await sendPasswordResetEmail(auth, normalizedEmail);
      return {
        ok: true,
        mode: "firebase-auth",
        message: GENERIC_PASSWORD_RESET_MESSAGE,
      };
    } catch (error) {
      if (error instanceof FirebaseError) {
        if (error.code === "auth/user-not-found") {
          return {
            ok: true,
            mode: "firebase-auth",
            message: GENERIC_PASSWORD_RESET_MESSAGE,
          };
        }

        throw new Error(GENERIC_PASSWORD_RESET_ERROR_MESSAGE);
      }

      throw new Error(GENERIC_PASSWORD_RESET_ERROR_MESSAGE);
    }
  },
};
