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
import { setAuthToken } from "../services/api";

type AuthContextValue = {
  currentUser: User | null;
  isAuthReady: boolean;
};

const AuthContext = createContext<AuthContextValue>({
  currentUser: null,
  isAuthReady: false,
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
  const syncedLoginUidRef = useRef<string | null>(null);
  const registerSyncPromiseRef = useRef<Promise<unknown> | null>(null);

  useEffect(() => {
    if (!auth) {
      setAuthToken(null);
      setCurrentUser(null);
      setIsAuthReady(true);
      return undefined;
    }

    let isMounted = true;

    const unsubscribe = onIdTokenChanged(auth, async (nextUser) => {
      if (!isMounted) {
        return;
      }

      if (!nextUser) {
        syncedLoginUidRef.current = null;
        registerSyncPromiseRef.current = null;
        resetRegisterSyncCache();
        setAuthToken(null);
        setCurrentUser((previous) => (previous ? null : previous));
        setIsAuthReady((previous) => (previous ? previous : true));
        return;
      }

      try {
        const token = await nextUser.getIdToken();

        if (!isMounted) {
          return;
        }

        setAuthToken(token);
        setCurrentUser((previous) =>
          isSameFirebaseUser(previous, nextUser) ? previous : nextUser
        );

        if (syncedLoginUidRef.current !== nextUser.uid) {
          syncedLoginUidRef.current = nextUser.uid;
          registerSyncPromiseRef.current = syncRegisterOnce(nextUser).catch((error) => {
            console.error("[AuthContext] Error sincronizando /auth/register:", error);
          });
        }

        await registerSyncPromiseRef.current;

        if (!isMounted || syncedLoginUidRef.current !== nextUser.uid) {
          return;
        }

        registerSyncPromiseRef.current = null;
        setIsAuthReady((previous) => (previous ? previous : true));
      } catch (error) {
        console.error("[AuthContext] Error obteniendo token Firebase:", error);
        setAuthToken(null);
        setCurrentUser((previous) =>
          isSameFirebaseUser(previous, nextUser) ? previous : nextUser
        );
        setIsAuthReady((previous) => (previous ? previous : true));
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  const value = useMemo(
    () => ({ currentUser, isAuthReady }),
    [currentUser, isAuthReady]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
