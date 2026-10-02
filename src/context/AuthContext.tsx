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

import { auth } from "../config/firebase";
import { IS_CAPTURE_MODE } from "../config/captureMode";
import { resetRegisterSyncCache, syncRegisterOnce } from "../services/authClient";
import { setAuthState, setAuthToken } from "../services/api";

export type AuthStatus =
  | "initializing"
  | "authenticated"
  | "unauthenticated"
  | "temporarilyOffline";

type AuthContextValue = {
  currentUser: User | null;
  isAuthReady: boolean;
  authStatus: AuthStatus;
};

const AuthContext = createContext<AuthContextValue>({
  currentUser: null,
  isAuthReady: false,
  authStatus: "initializing",
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
  const syncedLoginUidRef = useRef<string | null>(null);
  const registerSyncPromiseRef = useRef<Promise<unknown> | null>(null);

  useEffect(() => {
    if (IS_CAPTURE_MODE) {
      setAuthToken(null);
      setAuthState("authenticated");
      setCurrentUser(CAPTURE_USER);
      setAuthStatus("authenticated");
      setIsAuthReady(true);
      return undefined;
    }

    if (!auth) {
      setAuthToken(null);
      setAuthState("unauthenticated");
      setCurrentUser(null);
      setAuthStatus("unauthenticated");
      setIsAuthReady(true);
      return undefined;
    }

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

    const unsubscribe = onIdTokenChanged(auth, async (nextUser) => {
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
        setIsAuthReady((previous) => (previous ? previous : true));
        return;
      }

      try {
        const token = await nextUser.getIdToken();

        if (!isMounted) {
          return;
        }

        setAuthToken(token);
        setAuthState("authenticated");
        setCurrentUser((previous) =>
          isSameFirebaseUser(previous, nextUser) ? previous : nextUser
        );
        setAuthStatus("authenticated");
        setIsAuthReady((previous) => (previous ? previous : true));

        if (syncedLoginUidRef.current !== nextUser.uid) {
          syncedLoginUidRef.current = nextUser.uid;
          const syncPromise = syncRegisterOnce(nextUser, syncAbortController.signal);
          registerSyncPromiseRef.current = syncPromise;

          void syncPromise
            .catch(() => {
              if (!syncAbortController.signal.aborted) {
                syncedLoginUidRef.current = null;
              }

              if (__DEV__ && isMounted) {
                console.warn("[AuthContext] Sincronizacion de registro pendiente.");
              }
            })
            .finally(() => {
              if (registerSyncPromiseRef.current === syncPromise) {
                registerSyncPromiseRef.current = null;
              }
            });
        }
      } catch (error) {
        setAuthToken(null);
        setAuthState("temporarilyOffline");
        setCurrentUser((previous) =>
          isSameFirebaseUser(previous, nextUser) ? previous : nextUser
        );
        setAuthStatus("temporarilyOffline");
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
    () => ({ currentUser, isAuthReady, authStatus }),
    [authStatus, currentUser, isAuthReady]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
