import { FirebaseError } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
} from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";

import { auth, db, isFirebaseConfigured, missingFirebaseKeys } from "../config/firebase";

export type LoginPayload = {
  email: string;
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

const getFirebaseSetupMessage = () =>
  `Firebase cliente no está configurado. Completá EXPO_PUBLIC_FIREBASE_* en tu .env. Faltan: ${missingFirebaseKeys.join(", ")}.`;

const mapFirebaseAuthError = (code: string) => {
  switch (code) {
    case "auth/invalid-email":
      return "El email no es válido.";
    case "auth/user-not-found":
      return "No existe una cuenta con este email.";
    case "auth/wrong-password":
      return "La contraseña es incorrecta.";
    case "auth/email-already-in-use":
      return "Ya existe una cuenta registrada con este email.";
    case "auth/weak-password":
      return "La contraseña es demasiado débil.";
    case "auth/invalid-credential":
      return "Las credenciales ingresadas no son válidas.";
    default:
      return "No se pudo completar la operación con Firebase. Intentá nuevamente.";
  }
};

export const authClient = {
  async login(payload: LoginPayload) {
    if (!payload.email || !payload.password) {
      throw new Error("Completá usuario y contraseña para continuar.");
    }

    if (!isFirebaseConfigured || !auth) {
      throw new Error(getFirebaseSetupMessage());
    }

    try {
      const credential = await signInWithEmailAndPassword(
        auth,
        payload.email,
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

      throw error;
    }
  },

  async register(payload: RegisterPayload) {
    if (!payload.firstName || !payload.lastName || !payload.email) {
      throw new Error("Completá los datos obligatorios para crear la cuenta.");
    }

    if (!isFirebaseConfigured || !auth) {
      throw new Error(getFirebaseSetupMessage());
    }

    try {
      const credential = await createUserWithEmailAndPassword(
        auth,
        payload.email,
        payload.password,
      );

      const fullName = `${payload.firstName} ${payload.lastName}`.trim();

      await updateProfile(credential.user, {
        displayName: fullName,
      });

      if (db) {
        await setDoc(doc(db, "users", credential.user.uid), {
          uid: credential.user.uid,
          email: payload.email,
          firstName: payload.firstName,
          lastName: payload.lastName,
          fullName,
          username: payload.username,
          enrollment: payload.enrollment || null,
          lawFirm: payload.lawFirm || null,
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

      throw error;
    }
  },
};
