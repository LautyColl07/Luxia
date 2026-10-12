import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { onIdTokenChanged, User } from "firebase/auth";
import { signOut } from "firebase/auth";

import { auth } from "../config/firebase";
import { IS_CAPTURE_MODE } from "../config/captureMode";
import { resetRegisterSyncCache, syncRegisterOnce } from "../services/authClient";
import { setAuthState, setAuthToken } from "../services/api";

export type AuthStatus =
  | "initializing"
  | "synchronizing"
  | "authenticated"
  | "unauthenticated"
  | "temporarilyOffline";

type AuthContextValue = {
  currentUser: User | null;
  isAuthReady: boolean;
  authStatus: AuthStatus;
  syncStatus: "idle" | "syncing" | "synced" | "warning" | "failed";
  authError: string | null;
  clearAuthError: () => void;
};

const AuthContext = createContext<AuthContextValue>({
  currentUser: null,
  isAuthReady: false,
  authStatus: "initializing",
  syncStatus: "idle",
  authError: null,
  clearAuthError: () => undefined,
});

type AuthProviderProps = {
  children: ReactNode;
};

// This object only lives in memory and is never sent to Firebase or the backend.
const CAPTURE_USER = {
  uid: "capture-user-local",
  email: "capturas@luxia.invalid",
  displayName: "Valentina Demo",
  emailVerified: true,
  isAnonymous: false,
  phoneNumber: null,
  photoURL: null,
  providerData: [],
} as unknown as User;

const AUTH_READY_TIMEOUT_MS = 8000;
const REGISTER_SYNC_GATE_MS = 4000;

const limitRegisterSyncWait = (operation: Promise<unknown>) =>
  new Promise<unknown>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      const error = new Error("Register synchronization timed out") as Error & {
        status?: number;
        code?: string;
      };
      error.status = 408;
      error.code = "REGISTER_SYNC_TIMEOUT";
      reject(error);
    }, REGISTER_SYNC_GATE_MS);

    operation.then(
      (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeoutId);
        reject(error);
      }
    );
  });

const isSameFirebaseUser = (first: User | null, second: User | null) => {
  if (!first || !second) {
    return first === second;
  }

  return (
    first.uid === second.uid &&
    first.email === second.email &&
    first.displayName === second.displayName
  );
};

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [currentUser, setCurrentUser] = useState<User | null>(
    IS_CAPTURE_MODE ? CAPTURE_USER : auth?.currentUser ?? null
  );
  const [isAuthReady, setIsAuthReady] = useState(IS_CAPTURE_MODE || !auth);
  const [authStatus, setAuthStatus] = useState<AuthStatus>(
    IS_CAPTURE_MODE ? "authenticated" : auth ? "initializing" : "unauthenticated"
  );
  const [syncStatus, setSyncStatus] = useState<AuthContextValue["syncStatus"]>("idle");
  const [authError, setAuthError] = useState<string | null>(null);
  const syncedLoginUidRef = useRef<string | null>(null);
  const registerSyncPromiseRef = useRef<Promise<unknown> | null>(null);
  const authEventRef = useRef(0);

  useEffect(() => {
    if (IS_CAPTURE_MODE) {
      setAuthToken(null);
      setAuthState("authenticated");
      setCurrentUser(CAPTURE_USER);
      setAuthStatus("authenticated");
      setSyncStatus("synced");
      setIsAuthReady(true);
      return undefined;
    }

    if (!auth) {
      setAuthToken(null);
      setAuthState("unauthenticated");
      setCurrentUser(null);
      setAuthStatus("unauthenticated");
      setSyncStatus("idle");
      setIsAuthReady(true);
      return undefined;
    }

    const configuredAuth = auth;

    let isMounted = true;
    const syncAbortController = new AbortController();
    let authReadyTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      if (!isMounted) {
        return;
      }

      setAuthToken(null);
      setAuthState("unauthenticated");
      setCurrentUser(null);
      setAuthStatus("unauthenticated");
      setIsAuthReady(true);

      if (__DEV__) {
        console.warn("[AuthContext] Firebase no respondio a tiempo; se muestra el inicio de sesion.");
      }
    }, AUTH_READY_TIMEOUT_MS);

    const unsubscribe = onIdTokenChanged(configuredAuth, async (nextUser) => {
      const authEvent = ++authEventRef.current;
      if (!isMounted) {
        return;
      }

      if (authReadyTimer) {
        clearTimeout(authReadyTimer);
        authReadyTimer = null;
      }

      if (!nextUser) {
        syncedLoginUidRef.current = null;
        registerSyncPromiseRef.current = null;
        resetRegisterSyncCache();
        setAuthToken(null);
        setAuthState("unauthenticated");
        setCurrentUser((previous) => (previous ? null : previous));
        setAuthStatus("unauthenticated");
        setSyncStatus("idle");
        setIsAuthReady((previous) => (previous ? previous : true));
        return;
      }

      try {
        const token = await nextUser.getIdToken();

        if (!isMounted) {
          return;
        }

        setAuthToken(token);
        setAuthState("synchronizing");
        setCurrentUser((previous) =>
          isSameFirebaseUser(previous, nextUser) ? previous : nextUser
        );
        setAuthStatus("synchronizing");
        setSyncStatus("syncing");
        setAuthError(null);
        setIsAuthReady((previous) => (previous ? previous : true));

        if (syncedLoginUidRef.current !== nextUser.uid) {
          syncedLoginUidRef.current = nextUser.uid;
          const syncPromise = limitRegisterSyncWait(
            syncRegisterOnce(nextUser, syncAbortController.signal)
          );
          registerSyncPromiseRef.current = syncPromise;

          void syncPromise
            .then(() => {
              if (!isMounted || authEventRef.current !== authEvent) {
                return;
              }

              setAuthState("authenticated");
              setAuthStatus("authenticated");
              setSyncStatus("synced");
            })
            .catch((error) => {
              if (!syncAbortController.signal.aborted) {
                syncedLoginUidRef.current = null;
              }

              if (!isMounted || authEventRef.current !== authEvent || error?.name === "AbortError") {
                return;
              }

              const status = Number(error?.status || 0);
              if (status === 401 || status === 403) {
                setAuthToken(null);
                setAuthState("unauthenticated");
                setAuthStatus("unauthenticated");
                setSyncStatus("failed");
                setAuthError(
                  status === 403
                    ? "Tu cuenta no tiene autorizacion para acceder a Luxia. Contacta al administrador."
                    : "Firebase valido tus credenciales, pero el servidor rechazo la sesion. Verifica la configuracion del servidor e intenta nuevamente."
                );
                void signOut(configuredAuth).catch(() => undefined);
                return;
              }

              // Register synchronization is idempotent and secondary. A
              // network/5xx failure must not leave an authenticated user in an
              // endless login loop; every protected API still verifies Firebase.
              setAuthState("authenticated");
              setAuthStatus("authenticated");
              setSyncStatus("warning");
              setAuthError(
                status === 0
                  ? "Iniciaste sesion, pero no pudimos sincronizar tu perfil porque el servidor no esta disponible."
                  : "Iniciaste sesion, pero la sincronizacion de tu perfil quedo pendiente."
              );

              if (__DEV__ && isMounted) {
                console.warn("[AuthContext] Sincronizacion de registro pendiente.", {
                  stage: "register-sync",
                  status,
                  code: typeof error?.code === "string" ? error.code : null,
                });
              }
            })
            .finally(() => {
              if (registerSyncPromiseRef.current === syncPromise) {
                registerSyncPromiseRef.current = null;
              }
            });
        } else {
          setAuthState("authenticated");
          setAuthStatus("authenticated");
          setSyncStatus("synced");
        }
      } catch (error) {
        setAuthToken(null);
        setAuthState("temporarilyOffline");
        setCurrentUser((previous) =>
          isSameFirebaseUser(previous, nextUser) ? previous : nextUser
        );
        setAuthStatus("temporarilyOffline");
        setSyncStatus("warning");
        setAuthError("Firebase no pudo renovar la sesion. Revisa tu conexion e intenta nuevamente.");
        setIsAuthReady((previous) => (previous ? previous : true));

        if (__DEV__) {
          console.warn("[AuthContext] Firebase esta temporalmente sin token disponible.");
        }
      }
    });

    return () => {
      isMounted = false;
      syncAbortController.abort();
      if (authReadyTimer) {
        clearTimeout(authReadyTimer);
      }
      unsubscribe();
    };
  }, []);

  const value = useMemo(
    () => ({
      currentUser,
      isAuthReady,
      authStatus,
      syncStatus,
      authError,
      clearAuthError: () => setAuthError(null),
    }),
    [authError, authStatus, currentUser, isAuthReady, syncStatus]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
