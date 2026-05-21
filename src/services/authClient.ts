import { FirebaseError } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  updateProfile,
} from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";

import { API_BASE_URL } from "../config/api";
import { auth, db, isFirebaseConfigured, missingFirebaseKeys } from "../config/firebase";
import {
  getUsernameValidationError,
  normalizeLoginIdentifier,
  resolveRegisterUsername,
} from "../utils/auth";

export type LoginPayload = {
  identifier: string;
  password: string;
  rememberMe: boolean;
};

export type RegisterPayload = {
  firstName: string;
  lastName: string;
  email: string;
  enrollment: string;
  lawFirm: string;
  username: string;
  password: string;
};

const GENERIC_LOGIN_ERROR_MESSAGE = "Las credenciales ingresadas no son validas.";
const GENERIC_PASSWORD_RESET_MESSAGE =
  "Si el correo existe, te enviamos instrucciones para recuperar tu contraseña.";
const GENERIC_PASSWORD_RESET_ERROR_MESSAGE =
  "No pudimos procesar tu solicitud en este momento. Intenta nuevamente.";

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
        await setDoc(doc(db, "users", credential.user.uid), {
          uid: credential.user.uid,
          email: normalizedEmail,
          firstName: payload.firstName.trim(),
          lastName: payload.lastName.trim(),
          fullName,
          username: resolvedUsername,
          usernameLowercase: resolvedUsername,
          enrollment: payload.enrollment.trim() || null,
          lawFirm: payload.lawFirm.trim() || null,
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
