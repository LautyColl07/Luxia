import { FirebaseError } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  updateProfile,
} from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";

import { auth, db, isFirebaseConfigured, missingFirebaseKeys } from "../config/firebase";
import { API_BASE_URL } from "../config/api";

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
  `El cliente de Firebase no está configurado. Completa EXPO_PUBLIC_FIREBASE_* en tu .env. Faltan: ${missingFirebaseKeys.join(", ")}.`;

const mapFirebaseAuthError = (code: string) => {
  console.log("🔥 Código de error de Firebase:", code);
  switch (code) {
    case "auth/invalid-email":
      return "El email ingresado no es válido.";
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
      //return "No pudimos completar la operación. Intenta nuevamente.";
      return `Error de Firebase: ${code}`;
  }
};

export const authClient = {
  async login(payload: LoginPayload) {
    if (!payload.email || !payload.password) {
      throw new Error("Completa el email y la contraseña para continuar.");
    }

    if (!isFirebaseConfigured || !auth) {
      throw new Error(getFirebaseSetupMessage());
    }

    try {
      const credential = await signInWithEmailAndPassword(
        auth,
        payload.email.trim(),
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
      throw new Error("Completa los datos obligatorios para crear la cuenta.");
    }

    if (!isFirebaseConfigured || !auth) {
      throw new Error(getFirebaseSetupMessage());
    }

    try {
      // 1. Crear usuario en Firebase
      const credential = await createUserWithEmailAndPassword(
        auth,
        payload.email.trim(),
        payload.password,
      );

      const fullName = `${payload.firstName} ${payload.lastName}`.trim();

      await updateProfile(credential.user, {
        displayName: fullName,
      });

      // 2. Obtener token de Firebase
      const token = await credential.user.getIdToken();

      // 3. Enviar datos a MySQL vía backend
      if (API_BASE_URL) {
        try {
          console.log("[AuthClient] Registrando usuario en backend...");
          // Si tu API_BASE_URL no incluye "/api/v1", deberías cambiar esta ruta a `${API_BASE_URL}/api/v1/auth/register`
          const backendResponse = await fetch(`${API_BASE_URL}/auth/register`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              firebaseUid: credential.user.uid,
              email: payload.email.trim(),
              firstName: payload.firstName.trim(),
              lastName: payload.lastName.trim(),
              username: payload.username?.trim() || null,
              matricula: payload.enrollment?.trim() || null,
              estudioJuridico: payload.lawFirm?.trim() || null,
            }),
          });

          if (!backendResponse.ok) {
            const errorData = await backendResponse.json().catch(() => ({}));
            console.error("[AuthClient] Error del backend:", errorData);
            throw new Error(errorData.error || "No se pudo registrar en la base de datos");
          }

          const backendData = await backendResponse.json();
          console.log("[AuthClient] Usuario registrado en backend:", backendData);
        } catch (backendError) {
          console.error("[AuthClient] Error al registrar en backend:", backendError);
          // Opcional: Puedes decidir hacer un `throw backendError` si quieres que falle el registro completo
          if (backendError instanceof Error) {
            console.warn("[AuthClient] Continuando sin datos del backend:", backendError.message);
          }
        }
      }

      // 4. Guardar también en Firestore (para compatibilidad)
      if (db) {
        try {
          await setDoc(doc(db, "users", credential.user.uid), {
            uid: credential.user.uid,
            email: payload.email.trim(),
            firstName: payload.firstName,
            lastName: payload.lastName,
            fullName,
            username: payload.username?.trim() || null,
            enrollment: payload.enrollment?.trim() || null,
            lawFirm: payload.lawFirm?.trim() || null,
            createdAt: serverTimestamp(),
          });
        } catch (firestoreError) {
          console.error("[AuthClient] Error al guardar en Firestore:", firestoreError);
        }
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

  async resetPassword(email: string) {
    if (!email) {
      throw new Error("Ingresa tu email para restablecer la contraseña.");
    }

    if (!isFirebaseConfigured || !auth) {
      throw new Error(getFirebaseSetupMessage());
    }

    try {
      await sendPasswordResetEmail(auth, email.trim());
      return { ok: true };
    } catch (error) {
      if (error instanceof FirebaseError) {
        throw new Error(mapFirebaseAuthError(error.code));
      }
      throw error;
    }
  }
};