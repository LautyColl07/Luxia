import { FirebaseError } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  updateProfile,
  User,
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";

import { API_BASE_URL } from "../config/api";
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

const resolveEmailForLogin = async (identifier: string) => {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/resolve-login`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ identifier }),
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok || !payload?.success || typeof payload?.email !== "string") {
      throw new Error(GENERIC_LOGIN_ERROR_MESSAGE);
    }

    return payload.email;
  } catch (error) {
    if (error instanceof Error && error.message === GENERIC_LOGIN_ERROR_MESSAGE) {
      throw error;
    }

    throw new Error("No pudimos iniciar sesion. Intenta nuevamente.");
  }
};

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
    default:
      return "No pudimos completar la operacion. Intenta nuevamente.";
  }
};

const delay = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const cleanString = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const splitDisplayName = (displayName: string) => {
  const parts = displayName.split(/\s+/).filter(Boolean);
  const firstName = parts[0] || "";
  const lastName = parts.slice(1).join(" ");

  return { firstName, lastName };
};

async function getStoredUserProfile(uid: string): Promise<StoredUserProfile> {
  if (!db) {
    return {};
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const snapshot = await getDoc(doc(db, "users", uid));

    if (snapshot.exists()) {
      return snapshot.data() as StoredUserProfile;
    }

    await delay(250);
  }

  return {};
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

export async function syncRegisterOnce(user: User) {
  if (registerSyncCompleted.has(user.uid)) {
    return null;
  }

  const currentSync = registerSyncInFlight.get(user.uid);

  if (currentSync) {
    return currentSync;
  }

  const syncPromise = (async () => {
    const [token, storedProfile] = await Promise.all([
      user.getIdToken(),
      getStoredUserProfile(user.uid),
    ]);

    setAuthToken(token);
    const payload = buildBackendRegisterPayload(user, storedProfile);

    await syncRegister(payload, token);
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
      const normalizedIdentifier = normalizeLoginIdentifier(payload.identifier);
      const emailForLogin = normalizedIdentifier.includes("@")
        ? normalizedIdentifier
        : await resolveEmailForLogin(normalizedIdentifier);

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
