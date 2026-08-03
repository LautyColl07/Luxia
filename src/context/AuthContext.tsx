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
  const [currentUser, setCurrentUser] = useState<User | null>(auth?.currentUser ?? null);
  const [isAuthReady, setIsAuthReady] = useState(!auth);
  const [authStatus, setAuthStatus] = useState<AuthStatus>(
    auth ? "initializing" : "unauthenticated"
  );
  const syncedLoginUidRef = useRef<string | null>(null);
  const registerSyncPromiseRef = useRef<Promise<unknown> | null>(null);

  useEffect(() => {
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

    const unsubscribe = onIdTokenChanged(auth, async (nextUser) => {
      if (!isMounted) {
        return;
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
